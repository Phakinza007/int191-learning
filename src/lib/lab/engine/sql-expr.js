// Expression compiler: AST -> { ev(ctx), type, key, kids } closures, with MySQL name resolution, types and NULL logic.
// ctx = { row: [sourceRow…] by slot, group: [row…] (grouped queries), item: [select values], outer: enclosing ctx }
import { AGGREGATES } from './sql-parser.js';
import { E, syntaxError, unsupported } from './sql-errors.js';
import {
  isNull, toNumber, truth, fold, compare, keyOf, roundDecimal, truncateDecimal, formatNumber, likeRegExp,
  parseDateTime, parseTime, fmtDate, fmtDateTime, nowParts, dayNumber, fromDayNumber, daysInMonth,
} from './sql-values.js';

// ---------- types ----------

export const INT = { t: 'int' };
export const DBL = { t: 'dbl' };
export const STR = { t: 'str' };
export const NUL = { t: 'null' };
export const DATE = { t: 'date' };
export const DATETIME = { t: 'datetime' };
export const TIME = { t: 'time' };
export const dec = (s) => ({ t: 'dec', scale: Math.min(30, Math.max(0, s)) });
const exact = (x) => x.t === 'int' || x.t === 'dec';
export const isNumeric = (x) => x.t === 'int' || x.t === 'dec' || x.t === 'dbl';
const isTemporal = (x) => x.t === 'date' || x.t === 'datetime';
export const scaleOf = (x) => (x.t === 'dec' ? x.scale : x.t === 'int' ? 0 : null);
export const family = (x) => (isNumeric(x) ? 'n' : x.t === 'null' ? null : 's');

// common type of IF / CASE / COALESCE branches
export function unify(types) {
  const ts = types.filter((x) => x.t !== 'null');
  if (!ts.length) return NUL;
  if (ts.every((x) => x.t === 'int')) return INT;
  if (ts.every(exact)) return dec(Math.max(...ts.map(scaleOf)));
  if (ts.every(isNumeric)) return DBL;
  if (ts.every((x) => x.t === ts[0].t)) return ts[0];
  return STR;
}

// value -> text, keeping a DECIMAL's scale
export const toStr = (v, type) => (typeof v === 'number' ? formatNumber(v, type && type.t === 'dec' ? type.scale : null) : String(v));
// DECIMAL results are rounded to their scale when they leave the engine (and after exact + - *)
export const finish = (v, type) => (typeof v === 'number' && type.t === 'dec' ? roundDecimal(v, type.scale) : v);

// ---------- scopes ----------

// sources: [{ slot, alias, db, orgTable, columns: [{ name, key, type, col? }], colMap, aliased }]
export class Scope {
  constructor(sources, parent = null, usingCols = new Map()) {
    this.sources = sources;
    this.parent = parent;
    this.usingCols = usingCols; // colKey -> [{ slot, name }] merged by JOIN … USING / NATURAL JOIN
    this.correlated = false;
    this.used = null; // Set of slots referenced while compiling one conjunct
  }
}

export function makeSource(slot, alias, db, orgTable, columns, aliased) {
  return { slot, alias, aliasKey: alias.toLowerCase(), db, orgTable, columns, colMap: new Map(columns.map((c) => [c.key, c])), aliased };
}

function findColumn(scope, ref) {
  const key = ref.name.toLowerCase();
  if (ref.table) {
    const tkey = ref.table.toLowerCase();
    const src = scope.sources.find((s) => s.aliasKey === tkey && (!ref.db || (!s.aliased && s.db && s.db.toLowerCase() === ref.db.toLowerCase())));
    const c = src && src.colMap.get(key);
    return c ? [{ slot: src.slot, name: c.name, column: c, source: src }] : [];
  }
  const merged = scope.usingCols.get(key);
  const out = [];
  if (merged) out.push({ using: merged, name: merged[0].name, column: merged[0].column, source: merged[0].source });
  for (const src of scope.sources) {
    const c = src.colMap.get(key);
    if (c && !(merged && merged.some((m) => m.slot === src.slot))) out.push({ slot: src.slot, name: c.name, column: c, source: src });
  }
  return out;
}

const written = (ref) => [ref.db, ref.table, ref.name].filter(Boolean).join('.');

function resolve(ref, env) {
  let depth = 0;
  for (let s = env.scope; s; s = s.parent, depth++) {
    const found = findColumn(s, ref);
    if (found.length > 1) throw E.ambiguous(written(ref), env.clause);
    if (found.length === 1) {
      for (let x = env.scope, i = 0; i < depth; x = x.parent, i++) x.correlated = true;
      const m = found[0];
      if (s.used) for (const slot of m.using ? m.using.map((u) => u.slot) : [m.slot]) s.used.add(slot);
      return { depth, ...m };
    }
  }
  throw E.badField(written(ref), env.clause);
}

const rowAt = (depth) => {
  if (depth === 0) return (c) => c.row;
  if (depth === 1) return (c) => c.outer.row;
  return (c) => { for (let i = 0; i < depth; i++) c = c.outer; return c.row; };
};

// ---------- aggregate detection ----------

export function hasAggregate(n) {
  if (!n || typeof n !== 'object') return false;
  if (Array.isArray(n)) return n.some(hasAggregate);
  if (n.k === 'fn' && AGGREGATES.has(n.name)) return true;
  if (n.k === 'subquery' || n.k === 'exists') return false;
  for (const [k, v] of Object.entries(n)) if (k !== 'sub' && v && typeof v === 'object' && hasAggregate(v)) return true;
  return false;
}

// ---------- compiler ----------

const lit = (v, type, key) => ({ ev: () => v, type, key, kids: [], constant: true });
const node = (ev, type, key, kids, extra) => ({ ev, type, key, kids, constant: kids.every((k) => k.constant), ...extra });

function litType(n) {
  const v = n.v;
  if (v === null || v === undefined) return NUL;
  if (typeof v === 'number') {
    if (n.dbl) return DBL;
    if (n.scale !== undefined) return n.scale > 0 ? dec(n.scale) : INT;
    if (Number.isInteger(v)) return INT;
    const s = String(v);
    return s.includes('e') ? DBL : dec(s.length - s.indexOf('.') - 1);
  }
  return STR;
}
const pad2 = (n) => String(n).padStart(2, '0');
const paramValue = (v) => {
  if (v instanceof Date) return `${fmtDateTime(nowParts(v))}.${String(v.getMilliseconds()).padStart(3, '0')}`;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined) return null;
  return v;
};

export function compileExpr(n, env) {
  switch (n.k) {
    case 'lit': {
      const v = paramValue(n.v);
      if (v !== null && typeof v === 'object') throw syntaxError(env.rt.sql, n.s);
      return lit(v, litType({ ...n, v }), 'l:' + typeof v + ':' + v);
    }
    case 'col': return compileColumn(n, env);
    case 'var': {
      if (env.checkFn) env.checkFn(n);
      if (n.sys) { const v = env.rt.session.getSysVar(n.name); return node(() => env.rt.session.getSysVar(n.name), typeof v === 'number' ? INT : STR, 'v@@' + n.name, []); }
      const v = env.rt.session.userVars.get(n.name);
      const type = v === undefined || v === null ? NUL : typeof v === 'number' ? (Number.isInteger(v) ? INT : DBL) : STR;
      return { ev: () => env.rt.session.userVars.get(n.name) ?? null, type, key: 'v@' + n.name, kids: [], constant: false };
    }
    case 'neg': {
      const a = compileExpr(n.a, env);
      return node((c) => { const x = a.ev(c); return isNull(x) ? null : -toNumber(x); }, isNumeric(a.type) ? a.type : DBL, `-(${a.key})`, [a]);
    }
    case 'not': {
      const a = compileExpr(n.a, env);
      return node((c) => { const x = truth(a.ev(c)); return x === null ? null : 1 - x; }, INT, `!(${a.key})`, [a]);
    }
    case 'bin': return compileBinary(n, env);
    case 'is': {
      const a = compileExpr(n.a, env);
      const test = n.what === 'null' ? (x) => isNull(x) : n.what === 'true' ? (x) => truth(x) === 1 : (x) => truth(x) === 0;
      return node((c) => (test(a.ev(c)) !== n.neg ? 1 : 0), INT, `is:${n.what}:${n.neg}(${a.key})`, [a]);
    }
    case 'between': {
      const a = compileExpr(n.a, env);
      const lo = compileExpr(n.lo, env);
      const hi = compileExpr(n.hi, env);
      const cmp = comparator(a.type, unify([lo.type, hi.type]));
      return node((c) => {
        const x = a.ev(c);
        const l = cmp(x, lo.ev(c));
        const h = cmp(x, hi.ev(c));
        const r = and3(l === null ? null : l >= 0 ? 1 : 0, h === null ? null : h <= 0 ? 1 : 0);
        return r === null ? null : n.neg ? 1 - r : r;
      }, INT, `between:${n.neg}(${a.key},${lo.key},${hi.key})`, [a, lo, hi]);
    }
    case 'in': return n.sub ? compileInSubquery(n, env) : compileInList(n, env);
    case 'like': {
      const a = compileExpr(n.a, env);
      const b = compileExpr(n.b, env);
      const esc = n.esc ? compileExpr(n.esc, env) : null;
      const toText = (v, t) => fold(toStr(v, t));
      let cached = null;
      const regex = (c) => {
        if (cached) return cached;
        const p = b.ev(c);
        if (isNull(p)) return null;
        const e = esc ? esc.ev(c) : '\\';
        const re = likeRegExp(toStr(p, b.type), isNull(e) || e === '' ? '\\' : String(e)[0]);
        if (b.constant && (!esc || esc.constant)) cached = re;
        return re;
      };
      return node((c) => {
        const x = a.ev(c);
        if (isNull(x)) return null;
        const re = regex(c);
        if (!re) return null;
        return re.test(toText(x, a.type)) !== n.neg ? 1 : 0;
      }, INT, `like:${n.neg}(${a.key},${b.key})`, esc ? [a, b, esc] : [a, b]);
    }
    case 'regexp': {
      const a = compileExpr(n.a, env);
      const b = compileExpr(n.b, env);
      let cached = null;
      return node((c) => {
        const x = a.ev(c);
        const p = b.ev(c);
        if (isNull(x) || isNull(p)) return null;
        const re = cached || new RegExp(String(p), 'iu');
        if (b.constant) cached = re;
        return re.test(toStr(x, a.type)) !== n.neg ? 1 : 0;
      }, INT, `regexp:${n.neg}(${a.key},${b.key})`, [a, b]);
    }
    case 'case': return compileCase(n, env);
    case 'fn': return AGGREGATES.has(n.name) ? compileAggregate(n, env) : compileFunction(n, env);
    case 'subquery': {
      const P = env.rt.sub(n.sub, env);
      if (P.fields.length !== 1) throw E.operandColumns(1);
      const run = cachedRun(P);
      return { ev: (c) => { const rows = run(c); if (rows.length > 1) throw E.subqueryRows(); return rows.length ? rows[0][0] : null; }, type: P.fields[0].type, key: 'sub:' + n.s, kids: [], constant: false, sub: true };
    }
    case 'exists': {
      const P = env.rt.sub(n.sub, env, { first: true });
      const run = cachedRun(P);
      return { ev: (c) => (run(c).length ? 1 : 0), type: INT, key: 'exists:' + n.s, kids: [], constant: false, sub: true };
    }
    case 'quant': return compileQuantified(n, env);
    case 'interval': throw syntaxError(env.rt.sql, n.s);
    case 'default': throw syntaxError(env.rt.sql, n.s);
    default: throw unsupported(env.rt.sql);
  }
}

function cachedRun(P) {
  let cache = null;
  return (c) => {
    if (cache) return cache;
    const rows = P.run(c);
    if (!P.correlated) cache = rows;
    return rows;
  };
}

function compileColumn(n, env) {
  if (!n.table && env.aliases) {
    const hit = env.aliases(n.name);
    if (hit) return hit;
  }
  const m = resolve(n, env);
  const get = rowAt(m.depth);
  let ev;
  if (m.using) {
    const parts = m.using;
    ev = (c) => { const r = get(c); for (const p of parts) { const src = r[p.slot]; const v = src ? src[p.name] : null; if (!isNull(v)) return v; } return null; };
  } else {
    const slot = m.slot;
    const name = m.name;
    ev = (c) => { const src = get(c)[slot]; if (!src) return null; const v = src[name]; return v === undefined ? null : v; };
  }
  const key = m.using ? `c:${m.depth}:u:${m.name.toLowerCase()}` : `c:${m.depth}:${m.slot}.${m.name.toLowerCase()}`;
  const colInfo = { depth: m.depth, slot: m.using ? m.using[0].slot : m.slot, slots: m.using ? m.using.map((u) => u.slot) : [m.slot], name: m.name, source: m.source, column: m.column, using: !!m.using };
  const out = { ev, type: m.column.type, key, kids: [], constant: false, col: colInfo };
  if (env.onColumn) env.onColumn(out);
  return out;
}

// ---------- operators ----------

const and3 = (x, y) => (x === 0 || y === 0 ? 0 : x === null || y === null ? null : 1);
const or3 = (x, y) => (x === 1 || y === 1 ? 1 : x === null || y === null ? null : 0);

// temporal values compare as datetimes, so '2003-01-06' = '2003-01-06 00:00:00'
const temporalKey = (v) => { if (typeof v === 'number') return v; const p = parseDateTime(v); return p ? fmtDateTime(p) : String(v); };
function comparator(ta, tb) {
  if ((isTemporal(ta) && (isTemporal(tb) || tb.t === 'str')) || (isTemporal(tb) && ta.t === 'str')) {
    return (a, b) => (isNull(a) || isNull(b) ? null : compare(temporalKey(a), temporalKey(b)));
  }
  return compare;
}

const CMP = {
  '=': (r) => (r === 0 ? 1 : 0), '<>': (r) => (r !== 0 ? 1 : 0), '<': (r) => (r < 0 ? 1 : 0),
  '<=': (r) => (r <= 0 ? 1 : 0), '>': (r) => (r > 0 ? 1 : 0), '>=': (r) => (r >= 0 ? 1 : 0),
};

export function arithType(op, a, b) {
  if (a.t === 'null') a = b.t === 'null' ? INT : b;
  if (b.t === 'null') b = a;
  if (op === 'div') return INT;
  if (!exact(a) || !exact(b)) return DBL;
  if (op === '/') return dec(scaleOf(a) + 4); // div_precision_increment = 4
  if (a.t === 'int' && b.t === 'int') return INT;
  if (op === '*') return dec(scaleOf(a) + scaleOf(b));
  return dec(Math.max(scaleOf(a), scaleOf(b)));
}

function compileBinary(n, env) {
  const { op } = n;
  if ((op === '+' || op === '-') && (n.b.k === 'interval' || (op === '+' && n.a.k === 'interval'))) {
    const iv = n.b.k === 'interval' ? n.b : n.a;
    const d = compileExpr(n.b.k === 'interval' ? n.a : n.b, env);
    const amount = compileExpr(iv.a, env);
    return dateArith(d, amount, iv.unit, op === '-' ? -1 : 1, `${op}(${d.key},${amount.key} ${iv.unit})`);
  }
  const a = compileExpr(n.a, env);
  const b = compileExpr(n.b, env);
  const key = `(${a.key} ${op} ${b.key})`;
  switch (op) {
    case 'and': return node((c) => { const x = truth(a.ev(c)); if (x === 0) return 0; return and3(x, truth(b.ev(c))); }, INT, key, [a, b]);
    case 'or': return node((c) => { const x = truth(a.ev(c)); if (x === 1) return 1; return or3(x, truth(b.ev(c))); }, INT, key, [a, b]);
    case 'xor': return node((c) => { const x = truth(a.ev(c)); const y = truth(b.ev(c)); return x === null || y === null ? null : x ^ y; }, INT, key, [a, b]);
    case '<=>': { const cmp = comparator(a.type, b.type); return node((c) => { const x = a.ev(c); const y = b.ev(c); if (isNull(x) || isNull(y)) return isNull(x) && isNull(y) ? 1 : 0; return cmp(x, y) === 0 ? 1 : 0; }, INT, key, [a, b]); }
    case '=': case '<>': case '<': case '<=': case '>': case '>=': {
      const cmp = comparator(a.type, b.type);
      const f = CMP[op];
      return node((c) => { const r = cmp(a.ev(c), b.ev(c)); return r === null ? null : f(r); }, INT, key, [a, b], { eq: op === '=' ? [a, b] : null });
    }
    default: {
      const type = arithType(op, a.type, b.type);
      const fix = type.t === 'dec' && op !== '/' ? (v) => roundDecimal(v, type.scale) : (v) => v;
      const rt = env.rt;
      const calc = {
        '+': (x, y) => fix(x + y), '-': (x, y) => fix(x - y), '*': (x, y) => fix(x * y),
        '/': (x, y) => (y === 0 ? rt.divZero() : x / y),
        div: (x, y) => (y === 0 ? rt.divZero() : Math.trunc(x / y)),
        '%': (x, y) => (y === 0 ? rt.divZero() : fix(x % y)),
      }[op];
      return node((c) => {
        const x = a.ev(c);
        if (isNull(x)) return null;
        const y = b.ev(c);
        if (isNull(y)) return null;
        return calc(toNumber(x), toNumber(y));
      }, type, key, [a, b]);
    }
  }
}

function compileInList(n, env) {
  const a = compileExpr(n.a, env);
  const list = n.list.map((x) => compileExpr(x, env));
  const cmp = comparator(a.type, unify(list.map((x) => x.type)));
  return node((c) => {
    const x = a.ev(c);
    if (isNull(x)) return null;
    let sawNull = false;
    for (const item of list) {
      const r = cmp(x, item.ev(c));
      if (r === 0) return n.neg ? 0 : 1;
      if (r === null) sawNull = true;
    }
    return sawNull ? null : n.neg ? 1 : 0;
  }, INT, `in:${n.neg}(${a.key};${list.map((x) => x.key).join(',')})`, [a, ...list]);
}

// membership test over a subquery's single column, consistent with compare()
function memberSet(values) {
  const nums = new Set();
  const realNums = new Set();
  const strs = new Set();
  let hasNull = false;
  for (const v of values) {
    if (isNull(v)) { hasNull = true; continue; }
    nums.add(toNumber(v));
    if (typeof v === 'number') realNums.add(v); else strs.add(fold(String(v)));
  }
  const has = (x) => (typeof x === 'number' ? nums.has(x) : strs.has(fold(String(x))) || (realNums.size > 0 && realNums.has(toNumber(x))));
  return { has, hasNull, empty: values.length === 0 };
}

function compileInSubquery(n, env) {
  const a = compileExpr(n.a, env);
  const P = env.rt.sub(n.sub, env);
  if (P.fields.length !== 1) throw E.operandColumns(1);
  const temporal = isTemporal(a.type) || isTemporal(P.fields[0].type);
  let cache = null;
  const members = (c) => {
    if (cache) return cache;
    const vals = P.run(c).map((r) => (temporal && !isNull(r[0]) ? temporalKey(r[0]) : r[0]));
    const m = memberSet(vals);
    if (!P.correlated) cache = m;
    return m;
  };
  return { ev: (c) => {
    const x = a.ev(c);
    const m = members(c);
    if (m.empty) return n.neg ? 1 : 0;
    if (isNull(x)) return null;
    if (m.has(temporal ? temporalKey(x) : x)) return n.neg ? 0 : 1;
    return m.hasNull ? null : n.neg ? 1 : 0;
  }, type: INT, key: `insub:${n.s}`, kids: [a], constant: false, sub: true };
}

function compileQuantified(n, env) {
  const a = compileExpr(n.a, env);
  const P = env.rt.sub(n.sub, env);
  if (P.fields.length !== 1) throw E.operandColumns(1);
  const run = cachedRun(P);
  const cmp = comparator(a.type, P.fields[0].type);
  const f = n.op === '<=>' ? (r) => (r === 0 ? 1 : 0) : CMP[n.op];
  return { ev: (c) => {
    const x = a.ev(c);
    const rows = run(c);
    let acc = n.all ? 1 : 0;
    for (const r of rows) {
      const cr = cmp(x, r[0]);
      const t = cr === null ? null : f(cr);
      acc = n.all ? and3(acc, t) : or3(acc, t);
      if (n.all ? acc === 0 : acc === 1) break;
    }
    return acc;
  }, type: INT, key: `quant:${n.s}`, kids: [a], constant: false, sub: true };
}

function compileCase(n, env) {
  const base = n.base ? compileExpr(n.base, env) : null;
  const whens = n.whens.map((w) => ({ w: compileExpr(w.w, env), t: compileExpr(w.t, env) }));
  const other = n.otherwise ? compileExpr(n.otherwise, env) : null;
  const type = unify([...whens.map((w) => w.t.type), other ? other.type : NUL]);
  const cmp = base ? comparator(base.type, unify(whens.map((w) => w.w.type))) : null;
  const kids = [...(base ? [base] : []), ...whens.flatMap((w) => [w.w, w.t]), ...(other ? [other] : [])];
  return node((c) => {
    const b = base ? base.ev(c) : null;
    for (const w of whens) {
      const hit = base ? cmp(b, w.w.ev(c)) === 0 : truth(w.w.ev(c)) === 1;
      if (hit) return w.t.ev(c);
    }
    return other ? other.ev(c) : null;
  }, type, `case(${kids.map((k) => k.key).join(',')})`, kids);
}

// ---------- aggregates ----------

function compileAggregate(n, env) {
  if (env.agg !== 'allow') throw E.groupFuncUse();
  const inner = { ...env, agg: 'inside', onColumn: null, aliases: null };
  const args = n.star ? [] : n.args.map((x) => compileExpr(x, inner));
  const order = n.order ? n.order.map((o) => ({ e: compileExpr(o.expr, inner), desc: o.desc })) : [];
  const a = args[0];
  const name = n.name;
  let type;
  switch (name) {
    case 'COUNT': type = INT; break;
    case 'SUM': type = exact(a.type) ? dec(scaleOf(a.type)) : DBL; break;
    case 'AVG': type = exact(a.type) ? dec(scaleOf(a.type) + 4) : DBL; break;
    case 'MIN': case 'MAX': type = a.type.t === 'null' ? STR : a.type; break;
    case 'GROUP_CONCAT': type = STR; break;
    case 'BIT_AND': case 'BIT_OR': case 'BIT_XOR': type = INT; break;
    default: type = DBL; // STD / VARIANCE family
  }
  const values = (c) => {
    const group = c.group || [];
    const sub = { row: null, group: null, item: null, outer: c.outer };
    const out = [];
    const seen = n.distinct ? new Set() : null;
    for (const r of group) {
      sub.row = r;
      const vs = args.map((x) => x.ev(sub));
      if (vs.some(isNull)) continue;
      if (seen) { const k = vs.map(keyOf).join('\u0001'); if (seen.has(k)) continue; seen.add(k); }
      out.push(order.length ? { vs, keys: order.map((o) => o.e.ev(sub)) } : vs);
    }
    return out;
  };
  let ev;
  switch (name) {
    case 'COUNT': ev = n.star ? (c) => (c.group ? c.group.length : 0) : (c) => values(c).length; break;
    case 'SUM': case 'AVG': ev = (c) => {
      const vs = values(c);
      if (!vs.length) return null;
      let s = 0;
      for (const v of vs) s += toNumber(v[0]);
      if (name === 'AVG') return s / vs.length;
      return type.t === 'dec' ? roundDecimal(s, type.scale) : s;
    }; break;
    case 'MIN': case 'MAX': ev = (c) => {
      let best = null;
      for (const [v] of values(c)) {
        if (best === null) best = v;
        else { const r = compare(v, best); if (name === 'MIN' ? r < 0 : r > 0) best = v; }
      }
      return best;
    }; break;
    case 'GROUP_CONCAT': ev = (c) => {
      let vs = values(c);
      if (!vs.length) return null;
      if (order.length) {
        vs = vs.slice().sort((x, y) => { for (let i = 0; i < order.length; i++) { const r = sortKeyCompare(x.keys[i], y.keys[i]); if (r) return order[i].desc ? -r : r; } return 0; }).map((x) => x.vs);
      }
      const s = vs.map((v) => v.map((x, i) => toStr(x, args[i].type)).join('')).join(n.sep);
      return s.length > 1024 ? s.slice(0, 1024) : s; // group_concat_max_len
    }; break;
    case 'BIT_AND': case 'BIT_OR': case 'BIT_XOR': ev = (c) => {
      let acc = name === 'BIT_AND' ? -1 : 0;
      for (const [v] of values(c)) { const x = toNumber(v); acc = name === 'BIT_AND' ? acc & x : name === 'BIT_OR' ? acc | x : acc ^ x; }
      return acc;
    }; break;
    default: ev = (c) => {
      const vs = values(c).map((v) => toNumber(v[0]));
      const sample = name.endsWith('_SAMP');
      if (!vs.length || (sample && vs.length < 2)) return null;
      const mean = vs.reduce((x, y) => x + y, 0) / vs.length;
      const variance = vs.reduce((x, y) => x + (y - mean) ** 2, 0) / (vs.length - (sample ? 1 : 0));
      return name.startsWith('VAR') ? variance : Math.sqrt(variance);
    };
  }
  return { ev, type, key: `a:${name}:${n.distinct ? 'd' : ''}(${n.star ? '*' : args.map((x) => x.key).join(',')})`, kids: args, constant: false, agg: true };
}

const sortKeyCompare = (a, b) => (isNull(a) ? (isNull(b) ? 0 : -1) : isNull(b) ? 1 : compare(a, b));

// ---------- scalar functions ----------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (t) => new Date(Date.UTC(t.y, t.m - 1, t.d)).getUTCDay();
const dayOfYear = (t) => dayNumber(t) - dayNumber({ y: t.y, m: 1, d: 1 }) + 1;
const ordinal = (d) => d + (d % 100 >= 11 && d % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][d % 10] || 'th');
const utf8Length = (s) => { let n = 0; for (const ch of s) { const cp = ch.codePointAt(0); n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; } return n; };

function dateFormat(t, fmt) {
  const h12 = t.h % 12 || 12;
  return String(fmt).replace(/%(.)/g, (_, f) => {
    switch (f) {
      case 'Y': return String(t.y).padStart(4, '0');
      case 'y': return pad2(t.y % 100);
      case 'm': return pad2(t.m);
      case 'c': return String(t.m);
      case 'd': return pad2(t.d);
      case 'e': return String(t.d);
      case 'D': return ordinal(t.d);
      case 'M': return MONTHS[t.m - 1];
      case 'b': return MONTHS[t.m - 1].slice(0, 3);
      case 'W': return DAYS[weekday(t)];
      case 'a': return DAYS[weekday(t)].slice(0, 3);
      case 'w': return String(weekday(t));
      case 'j': return String(dayOfYear(t)).padStart(3, '0');
      case 'H': return pad2(t.h);
      case 'k': return String(t.h);
      case 'h': case 'I': return pad2(h12);
      case 'l': return String(h12);
      case 'i': return pad2(t.i);
      case 's': case 'S': return pad2(t.s);
      case 'f': return '000000';
      case 'p': return t.h < 12 ? 'AM' : 'PM';
      case 'r': return `${pad2(h12)}:${pad2(t.i)}:${pad2(t.s)} ${t.h < 12 ? 'AM' : 'PM'}`;
      case 'T': return `${pad2(t.h)}:${pad2(t.i)}:${pad2(t.s)}`;
      default: return f;
    }
  });
}

function addInterval(t, amount, unit) {
  const n = Math.trunc(toNumber(amount));
  if (unit === 'MONTH' || unit === 'QUARTER' || unit === 'YEAR') {
    const months = t.y * 12 + (t.m - 1) + n * (unit === 'YEAR' ? 12 : unit === 'QUARTER' ? 3 : 1);
    const y = Math.floor(months / 12);
    const m = months - y * 12 + 1;
    return { ...t, y, m, d: Math.min(t.d, daysInMonth(y, m)) };
  }
  const secs = { SECOND: 1, MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800, MICROSECOND: 1e-6 }[unit] * n;
  const total = dayNumber(t) * 86400 + t.h * 3600 + t.i * 60 + t.s + secs;
  const days = Math.floor(total / 86400);
  const rest = total - days * 86400;
  return { ...fromDayNumber(days), h: Math.floor(rest / 3600), i: Math.floor((rest % 3600) / 60), s: Math.floor(rest % 60), time: t.time };
}

function dateArith(d, amount, unit, sign, key) {
  const dateOnly = !['HOUR', 'MINUTE', 'SECOND', 'MICROSECOND'].includes(unit);
  const type = d.type.t === 'date' && dateOnly ? DATE : d.type.t === 'datetime' || !dateOnly ? DATETIME : null;
  return node((c) => {
    const v = d.ev(c);
    const x = amount.ev(c);
    if (isNull(v) || isNull(x)) return null;
    const t = parseDateTime(v);
    if (!t) return null;
    const r = addInterval(t, sign * toNumber(x), unit);
    return (type ? type.t === 'date' : !t.time && dateOnly) ? fmtDate(r) : fmtDateTime(r);
  }, type || STR, key, [d, amount]);
}

const dt = (v) => (isNull(v) ? null : parseDateTime(v));
const timeParts = (v) => {
  const p = parseDateTime(v);
  if (p) return p;
  const s = parseTime(v);
  if (!s) return null;
  const [h, i, sec] = s.replace('-', '').split(':').map(Number);
  return { h, i, s: sec };
};

const DIFF_UNITS = { SECOND: 1, MINUTE: 60, HOUR: 3600, DAY: 86400, WEEK: 604800 };
const compareParts = (x, y) => (x.d - y.d) * 86400 + (x.h - y.h) * 3600 + (x.i - y.i) * 60 + (x.s - y.s);

// name -> [minArgs, maxArgs, type(argTypes, argNodes), impl(args, argTypes, rt)]; impl gets evaluated args
const F = {};
const def = (names, min, max, type, impl, opts = {}) => { for (const nm of names.split(' ')) F[nm] = { min, max, type: typeof type === 'function' ? type : () => type, impl, ...opts }; };
const nullsIn = (impl) => (args, ts, rt) => (args.some(isNull) ? null : impl(args, ts, rt));
const chars = (s) => [...String(s)];

def('CONCAT', 1, Infinity, STR, nullsIn((a, t) => a.map((v, i) => toStr(v, t[i])).join('')));
def('CONCAT_WS', 2, Infinity, STR, (a, t) => (isNull(a[0]) ? null : a.slice(1).map((v, i) => (isNull(v) ? null : toStr(v, t[i + 1]))).filter((v) => v !== null).join(toStr(a[0], t[0]))));
def('UPPER UCASE', 1, 1, STR, nullsIn(([s], t) => toStr(s, t[0]).toUpperCase()));
def('LOWER LCASE', 1, 1, STR, nullsIn(([s], t) => toStr(s, t[0]).toLowerCase()));
def('LENGTH OCTET_LENGTH', 1, 1, INT, nullsIn(([s], t) => utf8Length(toStr(s, t[0]))));
def('CHAR_LENGTH CHARACTER_LENGTH', 1, 1, INT, nullsIn(([s], t) => chars(toStr(s, t[0])).length));
def('SUBSTRING SUBSTR MID', 2, 3, STR, nullsIn(([s, p, l], t) => {
  const cs = chars(toStr(s, t[0]));
  let pos = Math.round(toNumber(p));
  if (pos === 0 || Math.abs(pos) > cs.length) return '';
  if (pos < 0) pos = cs.length + pos + 1;
  const len = l === undefined ? cs.length : Math.round(toNumber(l));
  return len <= 0 ? '' : cs.slice(pos - 1, pos - 1 + len).join('');
}));
def('LEFT', 2, 2, STR, nullsIn(([s, n], t) => chars(toStr(s, t[0])).slice(0, Math.max(0, Math.round(toNumber(n)))).join('')));
def('RIGHT', 2, 2, STR, nullsIn(([s, n], t) => { const cs = chars(toStr(s, t[0])); const k = Math.max(0, Math.round(toNumber(n))); return k ? cs.slice(-k).join('') : ''; }));
def('LTRIM', 1, 1, STR, nullsIn(([s], t) => toStr(s, t[0]).replace(/^ +/, '')));
def('RTRIM', 1, 1, STR, nullsIn(([s], t) => toStr(s, t[0]).replace(/ +$/, '')));
def('TRIM', 1, 2, STR, null); // handled in compileFunction (TRIM([BOTH|LEADING|TRAILING] [x] FROM s))
def('REPLACE', 3, 3, STR, nullsIn(([s, f, r], t) => { const from = toStr(f, t[1]); const str = toStr(s, t[0]); return from === '' ? str : str.split(from).join(toStr(r, t[2])); }));
const padFn = (left) => nullsIn(([s, n, p], t) => {
  const cs = chars(toStr(s, t[0]));
  const len = Math.round(toNumber(n));
  if (len < 0) return null;
  if (cs.length >= len) return cs.slice(0, len).join('');
  const pc = chars(toStr(p, t[2]));
  if (!pc.length) return null;
  let fill = '';
  for (let i = 0; i < len - cs.length; i++) fill += pc[i % pc.length];
  return left ? fill + cs.join('') : cs.join('') + fill;
});
def('LPAD', 3, 3, STR, padFn(true));
def('RPAD', 3, 3, STR, padFn(false));
def('REVERSE', 1, 1, STR, nullsIn(([s], t) => chars(toStr(s, t[0])).reverse().join('')));
def('REPEAT', 2, 2, STR, nullsIn(([s, n], t) => toStr(s, t[0]).repeat(Math.max(0, Math.round(toNumber(n))))));
def('SPACE', 1, 1, STR, nullsIn(([n]) => ' '.repeat(Math.max(0, Math.round(toNumber(n))))));
const locate = (sub, str, from = 1) => { const hay = fold(str); const i = hay.indexOf(fold(sub), Math.max(0, from - 1)); return i === -1 ? 0 : chars(hay.slice(0, i)).length + 1; };
def('INSTR', 2, 2, INT, nullsIn(([s, sub], t) => locate(toStr(sub, t[1]), toStr(s, t[0]))));
def('LOCATE', 2, 3, INT, nullsIn(([sub, s, p], t) => locate(toStr(sub, t[0]), toStr(s, t[1]), p === undefined ? 1 : toNumber(p))));
def('STRCMP', 2, 2, INT, nullsIn(([a, b], t) => compare(toStr(a, t[0]), toStr(b, t[1]))));
def('ASCII', 1, 1, INT, nullsIn(([s], t) => { const x = toStr(s, t[0]); return x ? x.charCodeAt(0) : 0; }));
def('FORMAT', 2, 3, STR, nullsIn(([x, d]) => {
  const places = Math.max(0, Math.min(30, Math.round(toNumber(d))));
  const [i, f] = roundDecimal(toNumber(x), places).toFixed(places).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}));

const roundType = (ts, nodes) => {
  const d = nodes[1] && nodes[1].k === 'lit' ? Math.round(toNumber(nodes[1].v)) : nodes[1] ? null : 0;
  if (ts[0].t === 'int') return INT;
  if (ts[0].t === 'dec') return d === null ? ts[0] : d > 0 ? dec(d) : INT;
  return DBL;
};
const halfEven = (v, d) => { const f = 10 ** d; const x = v * f; const r = Math.round(x); return (Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r) / f; };
def('ROUND', 1, 2, roundType, nullsIn(([x, d], t) => { const p = d === undefined ? 0 : Math.round(toNumber(d)); const v = toNumber(x); return exact(t[0]) ? roundDecimal(v, p) : halfEven(v, p); }));
def('TRUNCATE', 2, 2, roundType, nullsIn(([x, d]) => truncateDecimal(toNumber(x), Math.round(toNumber(d)))));
def('FLOOR', 1, 1, (ts) => (exact(ts[0]) ? INT : DBL), nullsIn(([x]) => Math.floor(toNumber(x))));
def('CEIL CEILING', 1, 1, (ts) => (exact(ts[0]) ? INT : DBL), nullsIn(([x]) => Math.ceil(toNumber(x)) || 0));
def('ABS', 1, 1, (ts) => (isNumeric(ts[0]) ? ts[0] : DBL), nullsIn(([x]) => Math.abs(toNumber(x))));
def('SIGN', 1, 1, INT, nullsIn(([x]) => Math.sign(toNumber(x))));
def('MOD', 2, 2, (ts) => arithType('%', ts[0], ts[1]), nullsIn(([x, y], _t, rt) => (toNumber(y) === 0 ? rt.divZero() : toNumber(x) % toNumber(y))));
def('POW POWER', 2, 2, DBL, nullsIn(([x, y]) => toNumber(x) ** toNumber(y)));
def('SQRT', 1, 1, DBL, nullsIn(([x]) => (toNumber(x) < 0 ? null : Math.sqrt(toNumber(x)))));
def('EXP', 1, 1, DBL, nullsIn(([x]) => Math.exp(toNumber(x))));
def('LN', 1, 1, DBL, nullsIn(([x]) => (toNumber(x) <= 0 ? null : Math.log(toNumber(x)))));
def('LOG', 1, 2, DBL, nullsIn(([b, x]) => (x === undefined ? (toNumber(b) <= 0 ? null : Math.log(toNumber(b))) : toNumber(x) <= 0 || toNumber(b) <= 1 ? null : Math.log(toNumber(x)) / Math.log(toNumber(b)))));
def('LOG10', 1, 1, DBL, nullsIn(([x]) => (toNumber(x) <= 0 ? null : Math.log10(toNumber(x)))));
def('LOG2', 1, 1, DBL, nullsIn(([x]) => (toNumber(x) <= 0 ? null : Math.log2(toNumber(x)))));
def('PI', 0, 0, dec(6), () => Math.PI);
def('RAND', 0, 1, DBL, () => Math.random(), { volatile: true });
const extreme = (sign) => nullsIn((a) => a.reduce((best, v) => (compare(v, best) * sign > 0 ? v : best)));
def('GREATEST', 2, Infinity, (ts) => unify(ts), extreme(1));
def('LEAST', 2, Infinity, (ts) => unify(ts), extreme(-1));

def('IFNULL', 2, 2, (ts) => unify(ts), null, { lazy: (a, c) => { const x = a[0].ev(c); return isNull(x) ? a[1].ev(c) : x; } });
def('COALESCE', 1, Infinity, (ts) => unify(ts), null, { lazy: (a, c) => { for (const x of a) { const v = x.ev(c); if (!isNull(v)) return v; } return null; } });
def('IF', 3, 3, (ts) => unify([ts[1], ts[2]]), null, { lazy: (a, c) => (truth(a[0].ev(c)) === 1 ? a[1].ev(c) : a[2].ev(c)) });
def('NULLIF', 2, 2, (ts) => ts[0], (a) => (compare(a[0], a[1]) === 0 ? null : a[0]));
def('ISNULL', 1, 1, INT, (a) => (isNull(a[0]) ? 1 : 0));

const datePart = (f) => (a) => { const t = dt(a[0]); return t ? f(t) : null; };
def('YEAR', 1, 1, INT, datePart((t) => t.y));
def('MONTH', 1, 1, INT, datePart((t) => t.m));
def('DAY DAYOFMONTH', 1, 1, INT, datePart((t) => t.d));
def('QUARTER', 1, 1, INT, datePart((t) => Math.ceil(t.m / 3)));
def('DAYOFWEEK', 1, 1, INT, datePart((t) => weekday(t) + 1));
def('WEEKDAY', 1, 1, INT, datePart((t) => (weekday(t) + 6) % 7));
def('DAYOFYEAR', 1, 1, INT, datePart(dayOfYear));
def('MONTHNAME', 1, 1, STR, datePart((t) => MONTHS[t.m - 1]));
def('DAYNAME', 1, 1, STR, datePart((t) => DAYS[weekday(t)]));
def('DATE', 1, 1, DATE, datePart(fmtDate));
def('LAST_DAY', 1, 1, DATE, datePart((t) => fmtDate({ ...t, d: daysInMonth(t.y, t.m) })));
const timePart = (f) => (a) => { const t = isNull(a[0]) ? null : timeParts(a[0]); return t ? f(t) : null; };
def('HOUR', 1, 1, INT, timePart((t) => t.h));
def('MINUTE', 1, 1, INT, timePart((t) => t.i));
def('SECOND', 1, 1, INT, timePart((t) => t.s));
def('NOW CURRENT_TIMESTAMP LOCALTIME LOCALTIMESTAMP SYSDATE', 0, 1, DATETIME, (_a, _t, rt) => fmtDateTime(nowParts(rt.now)));
def('CURDATE CURRENT_DATE UTC_DATE', 0, 0, DATE, (_a, _t, rt) => fmtDate(nowParts(rt.now)));
def('CURTIME CURRENT_TIME', 0, 1, TIME, (_a, _t, rt) => fmtDateTime(nowParts(rt.now)).slice(11));
def('DATEDIFF', 2, 2, INT, (a) => { const x = dt(a[0]); const y = dt(a[1]); return x && y ? dayNumber(x) - dayNumber(y) : null; });
def('DATE_FORMAT', 2, 2, STR, (a) => { const t = dt(a[0]); return t && !isNull(a[1]) ? dateFormat(t, a[1]) : null; });
def('DATABASE SCHEMA', 0, 0, STR, (_a, _t, rt) => rt.session.database ?? null);
def('VERSION', 0, 0, STR, () => '8.0.36');
def('USER CURRENT_USER SESSION_USER SYSTEM_USER', 0, 0, STR, () => 'root@localhost');
def('CONNECTION_ID', 0, 0, INT, (_a, _t, rt) => rt.session.id);
def('LAST_INSERT_ID', 0, 0, INT, (_a, _t, rt) => rt.session.lastInsertId);
def('UUID', 0, 0, STR, () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)), { volatile: true });
def('DATE_ADD ADDDATE DATE_SUB SUBDATE', 2, 2, STR, null);
def('TIMESTAMPDIFF', 2, 2, INT, null);
def('TIMESTAMPADD', 2, 2, DATETIME, null);
def('EXTRACT', 1, 1, INT, null);
def('CAST', 1, 1, STR, null);

export const CHECK_FORBIDDEN = new Set(['NOW', 'CURRENT_TIMESTAMP', 'LOCALTIME', 'LOCALTIMESTAMP', 'SYSDATE', 'CURDATE', 'CURRENT_DATE', 'UTC_DATE', 'CURTIME', 'CURRENT_TIME', 'RAND', 'UUID', 'DATABASE', 'SCHEMA', 'USER', 'CURRENT_USER', 'SESSION_USER', 'SYSTEM_USER', 'CONNECTION_ID', 'LAST_INSERT_ID', 'VERSION']);

function compileFunction(n, env) {
  const spec = F[n.name];
  if (!spec) {
    if (!env.rt.session.database) throw E.noDb();
    throw E.noFunction(env.rt.session.database, n.as);
  }
  if (env.checkFn) env.checkFn(n);
  const argc = n.args.length;
  if (argc < spec.min || argc > spec.max) throw E.paramCount(n.as);
  const special = compileSpecial(n, env);
  if (special) return special;
  const args = n.args.map((x) => compileExpr(x, env));
  const types = args.map((x) => x.type);
  const type = spec.type(types, n.args);
  const key = `f:${n.name}(${args.map((x) => x.key).join(',')})`;
  const rt = env.rt;
  if (spec.lazy) return node((c) => spec.lazy(args, c), type, key, args);
  const impl = spec.impl;
  return node((c) => impl(args.map((x) => x.ev(c)), types, rt), type, key, args, spec.volatile ? { constant: false } : undefined);
}

function compileSpecial(n, env) {
  switch (n.name) {
    case 'TRIM': {
      const s = compileExpr(n.args[0], env);
      const rem = n.trim && n.trim.rem ? compileExpr(n.trim.rem, env) : null;
      const mode = n.trim ? n.trim.mode : 'BOTH';
      return node((c) => {
        const v = s.ev(c);
        const r = rem ? rem.ev(c) : ' ';
        if (isNull(v) || isNull(r)) return null;
        let str = toStr(v, s.type);
        const x = toStr(r, rem ? rem.type : STR);
        if (!x) return str;
        if (mode !== 'TRAILING') while (str.startsWith(x)) str = str.slice(x.length);
        if (mode !== 'LEADING') while (str.endsWith(x)) str = str.slice(0, -x.length);
        return str;
      }, STR, `f:TRIM:${mode}(${s.key},${rem ? rem.key : ''})`, rem ? [s, rem] : [s]);
    }
    case 'DATE_ADD': case 'ADDDATE': case 'DATE_SUB': case 'SUBDATE': {
      const d = compileExpr(n.args[0], env);
      const iv = n.args[1];
      const sign = n.name === 'DATE_SUB' || n.name === 'SUBDATE' ? -1 : 1;
      if (iv.k === 'interval') return dateArith(d, compileExpr(iv.a, env), iv.unit, sign, `f:${n.name}(${d.key},${iv.unit})`);
      if (n.name === 'DATE_ADD' || n.name === 'DATE_SUB') throw syntaxError(env.rt.sql, iv.s);
      return dateArith(d, compileExpr(iv, env), 'DAY', sign, `f:${n.name}(${d.key})`);
    }
    case 'TIMESTAMPDIFF': {
      const [a, b] = n.args.map((x) => compileExpr(x, env));
      return node((c) => {
        const x = dt(a.ev(c));
        const y = dt(b.ev(c));
        if (!x || !y) return null;
        if (['MONTH', 'QUARTER', 'YEAR'].includes(n.unit)) {
          let m = (y.y - x.y) * 12 + (y.m - x.m);
          const r = compareParts(y, x);
          if (m > 0 && r < 0) m -= 1; else if (m < 0 && r > 0) m += 1;
          return Math.trunc(m / (n.unit === 'YEAR' ? 12 : n.unit === 'QUARTER' ? 3 : 1));
        }
        const secs = (dayNumber(y) - dayNumber(x)) * 86400 + (y.h - x.h) * 3600 + (y.i - x.i) * 60 + (y.s - x.s);
        return Math.trunc(secs / (DIFF_UNITS[n.unit] || 1));
      }, INT, `f:TIMESTAMPDIFF:${n.unit}(${a.key},${b.key})`, [a, b]);
    }
    case 'TIMESTAMPADD': {
      const [amount, d] = n.args.map((x) => compileExpr(x, env));
      return dateArith(d, amount, n.unit, 1, `f:TIMESTAMPADD:${n.unit}(${amount.key},${d.key})`);
    }
    case 'EXTRACT': {
      const a = compileExpr(n.args[0], env);
      const pick = { YEAR: (t) => t.y, MONTH: (t) => t.m, DAY: (t) => t.d, HOUR: (t) => t.h, MINUTE: (t) => t.i, SECOND: (t) => t.s, QUARTER: (t) => Math.ceil(t.m / 3), WEEK: null, MICROSECOND: () => 0 }[n.unit];
      if (!pick) throw unsupported(env.rt.sql);
      return node((c) => { const v = a.ev(c); const t = isNull(v) ? null : timeParts(v); return t ? pick(t) : null; }, INT, `f:EXTRACT:${n.unit}(${a.key})`, [a]);
    }
    case 'CAST': return compileCast(n, env);
    default: return null;
  }
}

function compileCast(n, env) {
  const a = compileExpr(n.args[0], env);
  const c = n.cast;
  const key = `cast:${c.kind}:${c.scale ?? ''}(${a.key})`;
  const wrap = (f, type) => node((ctx) => { const v = a.ev(ctx); return isNull(v) ? null : f(v); }, type, key, [a]);
  switch (c.kind) {
    case 'signed': case 'unsigned': return wrap((v) => {
      const x = typeof v === 'number' ? roundDecimal(v, 0) : Math.trunc(toNumber(v));
      return c.kind === 'unsigned' && x < 0 ? x + 2 ** 64 : x;
    }, INT);
    case 'decimal': return wrap((v) => {
      const x = roundDecimal(toNumber(v), c.scale);
      const max = 10 ** (c.precision - c.scale) - 10 ** -c.scale;
      return Math.max(-max, Math.min(max, x));
    }, c.scale > 0 ? dec(c.scale) : INT);
    case 'char': return wrap((v) => { const s = toStr(v, a.type); return c.len != null ? chars(s).slice(0, c.len).join('') : s; }, STR);
    case 'date': return wrap((v) => { const t = parseDateTime(v); return t ? fmtDate(t) : null; }, DATE);
    case 'datetime': return wrap((v) => { const t = parseDateTime(v); return t ? fmtDateTime(t) : null; }, DATETIME);
    case 'time': return wrap((v) => { const t = parseDateTime(v); return t && t.time ? fmtDateTime(t).slice(11) : parseTime(v); }, TIME);
    default: return wrap((v) => toNumber(v), DBL);
  }
}

// AND-split of a WHERE / ON tree
export function conjuncts(n) {
  if (!n) return [];
  if (n.k === 'bin' && n.op === 'and') return [...conjuncts(n.a), ...conjuncts(n.b)];
  return [n];
}
