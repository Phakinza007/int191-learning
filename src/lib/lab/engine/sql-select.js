// SELECT: compile once per statement into a prepared query { fields, run(outerCtx) -> rows (arrays of values), correlated }.
import { E, err } from './sql-errors.js';
import { isNull, truth, keyOf, famKey, sortCompare, compare } from './sql-values.js';
import { Scope, makeSource, compileExpr, hasAggregate, conjuncts, family, finish, INT } from './sql-expr.js';

const SEP = '\u0001';

// slots of the current query level a compiled expression reads; null when it contains a subquery
function localSlots(n, acc = new Set()) {
  if (n.sub) return null;
  if (n.col) { if (n.col.depth === 0) for (const s of n.col.slots) acc.add(s); else acc.outer = true; }
  for (const k of n.kids) if (localSlots(k, acc) === null) return null;
  return acc;
}
const subset = (a, b) => { for (const x of a) if (!b.has(x)) return false; return true; };

// ---------- FROM ----------

function buildFrom(refs, ctx) {
  const { rt, sources } = ctx;
  const leaf = (source, extra) => {
    if (sources.some((s) => s.aliasKey === source.aliasKey)) throw E.nonUniqTable(source.alias);
    sources.push(source);
    return { k: 'leaf', slots: new Set([source.slot]), sources: [source], usingCols: new Map(), ...extra };
  };
  const build = (ref) => {
    if (ref.k === 'table') {
      const cte = !ref.db && ctx.ctes.get(ref.name.toLowerCase());
      if (cte) return derivedLeaf(cte.select, ref.alias || ref.name, cte.columns, !!ref.alias);
      const table = rt.table(ref);
      if (rt.dmlTarget === table && !ctx.inDerived) throw E.updateTableUsed(table.name);
      const cols = table.columns.map((c) => ({ name: c.name, key: c.key, type: c.et, col: c }));
      const src = makeSource(sources.length, ref.alias || ref.name, table.db.name, table.name, cols, !!ref.alias);
      src.table = table;
      return leaf(src, { table });
    }
    if (ref.k === 'derived') return derivedLeaf(ref.select, ref.alias, ref.columns, true);
    const left = build(ref.left);
    const right = build(ref.right);
    const node = { k: 'join', kind: ref.kind, left, right, on: ref.on, merges: [], slots: new Set([...left.slots, ...right.slots]), sources: [...left.sources, ...right.sources] };
    node.usingCols = new Map([...left.usingCols, ...right.usingCols]);
    let using = ref.using;
    if (ref.natural) {
      const names = (side) => new Map(visibleColumns(side).map((c) => [c.key, c.name]));
      const r = names(right);
      using = [...names(left)].filter(([k]) => r.has(k)).map(([, name]) => name);
    }
    if (using) {
      for (const name of using) {
        const key = name.toLowerCase();
        const lp = sideParts(left, key, name);
        const rp = sideParts(right, key, name);
        const parts = ref.kind === 'right' ? [...rp, ...lp] : [...lp, ...rp];
        node.usingCols.set(key, parts);
        node.merges.push({ key, lp, rp });
      }
    }
    return node;
  };
  const derivedLeaf = (select, alias, columns, aliased) => {
    const P = compileSelect(select, { scope: null, ctes: ctx.ctes, inDerived: true }, rt);
    const names = columns || P.fields.map((f) => f.name);
    if (columns && columns.length !== P.fields.length) {
      throw err('ER_VIEW_WRONG_LIST', 1353, 'In definition of view, derived table or common table expression, SELECT list and column names list have different column counts');
    }
    const seen = new Set();
    for (const n of names) { if (seen.has(n.toLowerCase())) throw E.dupFieldName(n); seen.add(n.toLowerCase()); }
    const cols = names.map((name, i) => ({ name, key: name.toLowerCase(), type: P.fields[i].type, col: P.fields[i].column }));
    const src = makeSource(sources.length, alias, null, '', cols, aliased);
    return leaf(src, { derived: P, names });
  };
  return refs.map(build);
}

// columns an unqualified name can see in a join subtree (USING-merged columns once)
function visibleColumns(node) {
  const out = [];
  const seen = new Set();
  for (const [key, parts] of node.usingCols) { out.push({ key, name: parts[0].name }); seen.add(key); }
  for (const s of node.sources) for (const c of s.columns) if (!seen.has(c.key) || !node.usingCols.get(c.key).some((p) => p.slot === s.slot)) out.push(c);
  return out;
}

function sideParts(side, key, name) {
  if (side.usingCols.has(key)) return side.usingCols.get(key);
  const hits = side.sources.filter((s) => s.colMap.has(key));
  if (hits.length > 1) throw E.ambiguous(name, 'from clause');
  if (!hits.length) throw E.badField(name, 'from clause');
  const c = hits[0].colMap.get(key);
  return [{ slot: hits[0].slot, name: c.name, column: c, source: hits[0] }];
}

// SELECT * order: USING/NATURAL columns first, then the rest of the left side, then the right side
function starColumns(node) {
  if (node.k === 'leaf') return node.sources[0].columns.map((c) => ({ ref: { k: 'col', name: c.name, table: node.sources[0].alias }, name: c.name }));
  const left = starColumns(node.left);
  const right = starColumns(node.right);
  if (!node.merges.length) return [...left, ...right];
  const merged = new Set(node.merges.map((m) => m.key));
  const lead = node.merges.map((m) => ({ ref: { k: 'col', name: m.lp[0].name }, name: m.lp[0].name, merged: true }));
  const rest = (list) => list.filter((c) => !merged.has(c.name.toLowerCase()));
  return [...lead, ...rest(left), ...rest(right)];
}

// ---------- compile ----------

// outer: { scope, ctes, inDerived } of the enclosing query (scope null for top level / derived tables)
export function compileSelect(ast, outer, rt, opts = {}) {
  const ctes = new Map(outer.ctes || []);
  for (const cte of ast.ctes || []) {
    if (ast.ctes.filter((c) => c.name.toLowerCase() === cte.name.toLowerCase()).length > 1) throw E.nonUniqTable(cte.name);
    ctes.set(cte.name.toLowerCase(), cte);
  }
  const sources = [];
  const trees = ast.from ? buildFrom(ast.from, { rt, sources, ctes, inDerived: outer.inDerived }) : [];
  const usingCols = new Map(trees.flatMap((t) => [...t.usingCols]));
  const scope = new Scope(sources, outer.scope, usingCols);
  const N = sources.length;
  const grouped = ast.groupBy.length > 0 || ast.items.some((i) => hasAggregate(i.expr)) || hasAggregate(ast.having) || ast.orderBy.some((o) => hasAggregate(o.expr));
  const env = (clause, extra = {}) => ({ scope, clause, agg: 'allow', rt, ctes, inDerived: outer.inDerived, ...extra });

  // --- select list ---
  const items = [];
  for (const it of ast.items) {
    if (it.star) {
      let cols;
      if (!it.table) {
        if (!trees.length) throw err('ER_NO_TABLES_USED', 1096, 'No tables used');
        cols = trees.flatMap(starColumns);
      } else {
        const src = sources.find((s) => s.aliasKey === it.table.toLowerCase() && (!it.db || (!s.aliased && s.db && s.db.toLowerCase() === it.db.toLowerCase())));
        if (!src) throw E.badTable(it.table);
        cols = src.columns.map((c) => ({ ref: { k: 'col', name: c.name, table: src.alias }, name: c.name }));
      }
      for (const c of cols) items.push({ c: compileExpr(c.ref, env('field list')), name: c.name });
      continue;
    }
    const c = compileExpr(it.expr, env('field list'));
    let name = it.alias;
    if (name == null) {
      if (it.expr.k === 'col' && !it.expr.paren && c.col) name = c.col.name;
      else if (it.expr.k === 'lit' && (it.expr.param || typeof it.expr.v === 'string')) name = it.expr.v === null ? 'NULL' : String(it.expr.v);
      else name = it.text;
    }
    items.push({ c, name, alias: it.alias });
  }

  // --- WHERE and ON: conjuncts with the slots they read (for join planning) ---
  const compileConds = (expr, clause, sc) => conjuncts(expr).map((x) => {
    sc.used = new Set();
    const c = compileExpr(x, { ...env(clause, { agg: 'forbid' }), scope: sc });
    const slots = sc.used;
    sc.used = null;
    return { c, slots };
  });
  const where = compileConds(ast.where, 'where clause', scope);
  const compileJoins = (node) => {
    if (node.k !== 'join') return;
    compileJoins(node.left);
    compileJoins(node.right);
    const sub = new Scope(node.sources, outer.scope, node.usingCols);
    node.conds = compileConds(node.on, 'on clause', sub);
    if (sub.correlated) scope.correlated = true;
    for (const m of node.merges) node.conds.push(usingEquality(m));
    node.correlated = sub.correlated || node.left.correlated || node.right.correlated;
  };
  trees.forEach(compileJoins);

  // --- GROUP BY (columns first, then select aliases, then positions) ---
  const aliasItem = (name) => items.findIndex((i) => i.alias != null && i.alias.toLowerCase() === name.toLowerCase());
  const itemRef = (i) => ({ ev: (c) => c.item[i], type: items[i].c.type, key: items[i].c.key, kids: [], constant: false, aliasRef: true, item: i });
  const position = (e, clause) => {
    if (e.k !== 'lit' || e.param || typeof e.v !== 'number' || !Number.isInteger(e.v)) return -1;
    if (e.v < 1 || e.v > items.length) throw E.badField(String(e.v), clause);
    return e.v - 1;
  };
  const groupBy = ast.groupBy.map((g) => {
    const pos = position(g, 'group statement');
    let idx = pos;
    if (idx < 0 && g.k === 'col' && !g.table) {
      try { return compileExpr(g, env('group statement', { agg: 'forbid' })); } catch (e) {
        if (e.errno !== 1054 || (idx = aliasItem(g.name)) < 0) throw e;
      }
    }
    if (idx >= 0) {
      if (items[idx].c.agg || hasAggregateNode(items[idx].c)) throw E.cantGroupOn(items[idx].name);
      return items[idx].c;
    }
    return compileExpr(g, env('group statement', { agg: 'forbid' }));
  });
  const groupKeys = new Set(groupBy.map((g) => g.key));

  // --- HAVING: aliases, select-list columns, GROUP BY columns, aggregates ---
  const selectKeys = new Set(items.map((i) => i.c.key));
  const having = ast.having ? compileExpr(ast.having, env('having clause', {
    aliases: (name) => { const i = aliasItem(name); return i >= 0 ? itemRef(i) : null; },
    onColumn: (col) => {
      if (col.col.depth === 0 && !selectKeys.has(col.key) && !groupKeys.has(col.key)) throw E.badField(col.col.name, 'having clause');
    },
  })) : null;

  // --- ORDER BY: positions and select aliases first, then expressions over FROM ---
  const order = ast.orderBy.map((o) => {
    const pos = position(o.expr, 'order clause');
    if (pos >= 0) return { c: itemRef(pos), desc: o.desc };
    if (o.expr.k === 'col' && !o.expr.table) {
      const key = o.expr.name.toLowerCase();
      const hits = items.map((it, i) => ({ it, i })).filter(({ it }) => (it.alias != null ? it.alias.toLowerCase() === key : it.c.col && !it.c.col.using && it.name.toLowerCase() === key));
      const distinctKeys = new Set(hits.map((h) => h.it.c.key));
      if (distinctKeys.size > 1) throw E.ambiguous(o.expr.name, 'order clause');
      if (hits.length) return { c: itemRef(hits[0].i), desc: o.desc };
    }
    return { c: compileExpr(o.expr, env('order clause', { aliases: (name) => { const i = aliasItem(name); return i >= 0 ? itemRef(i) : null; } })), desc: o.desc };
  });

  if (grouped && rt.session.onlyFullGroupBy()) checkFullGroupBy({ items, order, groupBy, groupKeys, where, trees, sources });
  if (ast.distinct && order.length) checkDistinctOrder(items, order);

  const top = flatten(trees, where);
  const limit = ast.limit;
  const fields = items.map((it) => fieldOf(it));
  const prepared = {
    fields,
    get correlated() { return scope.correlated; },
    run(outerCtx) {
      const rows = evalFrom(top, N, outerCtx);
      const out = [];
      const early = opts.first && !grouped && !ast.distinct && !order.length;
      const emit = (ctx) => {
        const vals = items.map((it) => it.c.ev(ctx));
        ctx.item = vals;
        if (having && truth(having.ev(ctx)) !== 1) return;
        out.push({ vals: vals.map((v, i) => finish(v, items[i].c.type)), keys: order.map((o) => o.c.ev(ctx)) });
      };
      if (grouped) {
        const groups = new Map();
        if (!groupBy.length) groups.set('', rows);
        else {
          const ctx = { row: null, group: null, item: null, outer: outerCtx };
          for (const r of rows) {
            ctx.row = r;
            const k = groupBy.map((g) => keyOf(g.ev(ctx))).join(SEP);
            const g = groups.get(k);
            if (g) g.push(r); else groups.set(k, [r]);
          }
        }
        for (const g of groups.values()) emit({ row: g[0] || new Array(N), group: g, item: null, outer: outerCtx });
      } else {
        for (const r of rows) {
          emit({ row: r, group: null, item: null, outer: outerCtx });
          if (early && out.length) break;
        }
      }
      let result = out;
      if (ast.distinct) {
        const seen = new Set();
        result = result.filter((x) => { const k = x.vals.map(keyOf).join(SEP); if (seen.has(k)) return false; seen.add(k); return true; });
      }
      if (order.length) {
        result = result.slice().sort((x, y) => {
          for (let i = 0; i < order.length; i++) {
            const r = sortCompare(x.keys[i], y.keys[i]);
            if (r) return order[i].desc ? -r : r;
          }
          return 0;
        });
      }
      if (limit) result = result.slice(limit.offset, limit.offset + limit.count);
      return result.map((x) => x.vals);
    },
  };
  return prepared;
}

const hasAggregateNode = (n) => n.agg || n.kids.some(hasAggregateNode);

function fieldOf(it) {
  const c = it.c;
  const f = { name: it.name, type: c.type, column: c.col && !c.col.using ? c.col.column.col : undefined };
  if (c.col && c.col.source) {
    Object.assign(f, { orgName: c.col.name, table: c.col.source.alias, orgTable: c.col.source.orgTable, db: c.col.source.db || '' });
  } else Object.assign(f, { orgName: '', table: '', orgTable: '', db: '' });
  return f;
}

// equality for JOIN … USING (c): left.c = right.c (left may itself be a merged column)
function usingEquality(m) {
  const get = (parts) => (c) => { for (const p of parts) { const src = c.row[p.slot]; const v = src ? src[p.name] : null; if (!isNull(v)) return v; } return null; };
  const col = (parts) => ({ ev: get(parts), type: parts[0].column.type, key: 'u', kids: [], constant: false, col: { depth: 0, using: true, name: parts[0].name, slots: parts.map((p) => p.slot) } });
  const a = col(m.lp);
  const b = col(m.rp);
  const c = compileEq(a, b);
  return { c, slots: new Set([...m.lp, ...m.rp].map((p) => p.slot)) };
}
function compileEq(a, b) {
  return { ev: (c) => { const r = compare(a.ev(c), b.ev(c)); return r === null ? null : r === 0 ? 1 : 0; }, type: INT, key: 'eq', kids: [a, b], constant: false, eq: [a, b] };
}

// ---------- ONLY_FULL_GROUP_BY ----------

const colName = (col) => {
  const s = col.source;
  return `${s && s.db ? s.db + '.' : ''}${s ? s.alias + '.' : ''}${col.name}`;
};

function checkFullGroupBy({ items, order, groupBy, groupKeys, where, trees, sources }) {
  // columns known to be constant within a group: GROUP BY columns, closed under equalities and keys
  const known = new Set();
  const colKey = (col) => `${col.slot}.${col.name.toLowerCase()}`;
  // คอลัมน์ที่รวมจาก USING อยู่ได้หลาย slot — รู้ค่าหนึ่งคือรู้ทุก slot ของมัน
  const keysOf = (col) => (col.using ? col.slots.map((s) => `${s}.${col.name.toLowerCase()}`) : [colKey(col)]);
  for (const g of groupBy) if (g.col && g.col.depth === 0) for (const s of g.col.slots) known.add(`${s}.${g.col.name.toLowerCase()}`);
  const edges = []; // [from, to] : knowing `from` determines `to`
  const addEq = (cond, directed) => {
    const eq = cond.c.eq;
    if (!eq) return;
    const [a, b] = eq;
    const ka = a.col && a.col.depth === 0 ? keysOf(a.col) : null;
    const kb = b.col && b.col.depth === 0 ? keysOf(b.col) : null;
    if (ka && kb) {
      for (const x of ka) for (const y of kb) { edges.push([x, y, directed]); if (!directed) edges.push([y, x]); }
    } else if (ka && b.constant && !directed) ka.forEach((k) => known.add(k));
    else if (kb && a.constant && !directed) kb.forEach((k) => known.add(k));
  };
  for (const w of where) addEq(w, false);
  const walk = (node, nullable) => {
    if (node.k !== 'join') return;
    const inner = node.kind === 'inner' || node.kind === 'cross';
    walk(node.left, nullable || node.kind === 'right');
    walk(node.right, nullable || node.kind === 'left');
    for (const c of node.conds || []) {
      if (inner && !nullable) addEq(c, false);
      else if (c.c.eq) {
        // outer join: the preserved side determines the null-supplying side
        const [a, b] = c.c.eq;
        const inRight = (x) => x.col && x.col.slots.every((s) => node.right.slots.has(s));
        const pres = node.kind === 'left' ? (inRight(a) ? b : a) : (inRight(a) ? a : b);
        const dep = pres === a ? b : a;
        if (pres.col && dep.col && pres.col.depth === 0 && dep.col.depth === 0 && !pres.col.using && !dep.col.using) edges.push([colKey(pres.col), colKey(dep.col)]);
      }
    }
  };
  trees.forEach((t) => walk(t, false));
  for (;;) {
    const before = known.size;
    for (const [a, b] of edges) if (known.has(a)) known.add(b);
    for (const s of sources) {
      if (tableKeysOf(s).some((k) => k.every((c) => known.has(`${s.slot}.${c}`)))) for (const c of s.columns) known.add(`${s.slot}.${c.key}`);
    }
    if (known.size === before) break;
  }
  const offender = (n) => {
    if (groupKeys.has(n.key) || n.agg || n.sub || n.aliasRef) return null;
    if (n.col) {
      if (n.col.depth !== 0) return null;
      const ok = n.col.using ? n.col.slots.some((s) => known.has(`${s}.${n.col.name.toLowerCase()}`)) : known.has(colKey(n.col));
      return ok ? null : n.col;
    }
    for (const k of n.kids) { const o = offender(k); if (o) return o; }
    return null;
  };
  items.forEach((it, i) => {
    const o = offender(it.c);
    if (o) throw groupBy.length ? E.notGrouped(i + 1, 'SELECT list', colName(o)) : E.mixGroup(i + 1, colName(o));
  });
  order.forEach((o, i) => {
    const bad = offender(o.c);
    if (bad) throw E.notGrouped(i + 1, 'ORDER BY clause', colName(bad));
  });
}

// PRIMARY KEY and UNIQUE keys over NOT NULL columns determine every column of their table
function tableKeysOf(source) {
  const table = source.table;
  if (!table) return [];
  const notNull = new Set(table.columns.filter((c) => c.notNull).map((c) => c.key));
  return table.keys.filter((k) => k.primary || k.cols.every((c) => notNull.has(c.toLowerCase()))).map((k) => k.cols.map((c) => c.toLowerCase()));
}

function checkDistinctOrder(items, order) {
  const keys = new Set(items.map((i) => i.c.key));
  const cols = (n, acc = []) => { if (n.col && n.col.depth === 0) acc.push(n); n.kids.forEach((k) => cols(k, acc)); return acc; };
  order.forEach((o, i) => {
    if (o.c.aliasRef || keys.has(o.c.key)) return;
    const bad = cols(o.c).find((c) => !keys.has(c.key));
    if (bad) throw E.orderNotSelected(i + 1, colName(bad.col));
  });
}

// ---------- evaluation ----------

// top level: inner/comma-joined items with the pooled WHERE + inner ON conjuncts
function flatten(trees, where) {
  const items = [];
  const conds = [...where];
  const walk = (t) => {
    if (t.k === 'join' && (t.kind === 'inner' || t.kind === 'cross')) { walk(t.left); walk(t.right); conds.push(...t.conds); } else items.push(t);
  };
  trees.forEach(walk);
  return { items, conds };
}

function leafRows(node, N, outerCtx) {
  if (node.cache) return node.cache;
  const slot = node.sources[0].slot;
  let base;
  if (node.table) base = node.table.rows;
  else base = node.derived.run(outerCtx).map((vals) => Object.fromEntries(node.names.map((n, i) => [n, vals[i]])));
  const rows = base.map((r) => { const a = new Array(N); a[slot] = r; return a; });
  node.cache = rows;
  return rows;
}

const merge = (l, r, slots) => { const x = l.slice(); for (const s of slots) x[s] = r[s]; return x; };

// an equality usable as a hash join between `have` and `slots`; returns { probe, build } compiled sides
function findHashCond(conds, have, slots) {
  for (const x of conds) {
    const eq = x.c.eq;
    if (!eq) continue;
    const sa = localSlots(eq[0]);
    const sb = localSlots(eq[1]);
    if (!sa || !sb) continue;
    const fa = family(eq[0].type);
    const fb = family(eq[1].type);
    if (!fa || fa !== fb) continue;
    if ((eq[0].type.t === 'date' || eq[0].type.t === 'datetime' || eq[1].type.t === 'date' || eq[1].type.t === 'datetime') && eq[0].type.t !== eq[1].type.t) continue;
    // the build side is hashed once, so it must not depend on the outer row
    if (sb.size && !sb.outer && subset(sb, slots) && subset(sa, have)) return { probe: eq[0], build: eq[1], fam: fa, cond: x };
    if (sa.size && !sa.outer && subset(sa, slots) && subset(sb, have)) return { probe: eq[1], build: eq[0], fam: fa, cond: x };
  }
  return null;
}

function hashRows(rows, side, fam, outerCtx) {
  const map = new Map();
  const ctx = { row: null, group: null, item: null, outer: outerCtx };
  for (const r of rows) {
    ctx.row = r;
    const k = famKey(side.ev(ctx), fam);
    if (k === null) continue;
    const list = map.get(k);
    if (list) list.push(r); else map.set(k, [r]);
  }
  return map;
}

// ลืมเงื่อนไขเชื่อมตาราง (comma join / CROSS JOIN หลายตาราง) ทำให้แถวระเบิดเป็นหลักล้านจนเบราว์เซอร์ค้าง
// MySQL จริงรันได้ (ช้า) แต่ในแล็บบอกผู้เรียนตรง ๆ ดีกว่า
export const MAX_JOIN_ROWS = 500_000;

function joinRows(leftRows, rightRows, rightSlots, conds, hash, keep, outerCtx, node, cacheable) {
  const out = [];
  const ctx = { row: null, group: null, item: null, outer: outerCtx };
  let table = null;
  if (hash) {
    if (cacheable) { node.hashCache ||= new Map(); table = node.hashCache.get(hash.cond); }
    if (!table) { table = hashRows(rightRows, hash.build, hash.fam, outerCtx); if (cacheable) node.hashCache.set(hash.cond, table); }
  }
  for (const l of leftRows) {
    let cands = rightRows;
    if (table) { ctx.row = l; const k = famKey(hash.probe.ev(ctx), hash.fam); cands = (k !== null && table.get(k)) || []; }
    let matched = false;
    for (const r of cands) {
      const x = merge(l, r, rightSlots);
      ctx.row = x;
      let ok = true;
      for (const c of conds) if (truth(c.c.ev(ctx)) !== 1) { ok = false; break; }
      if (ok) { out.push(x); matched = true; }
    }
    if (!matched && keep) out.push(l);
    if (out.length > MAX_JOIN_ROWS) {
      throw err('SIM_TOO_MANY_ROWS', 0, `ผลของการ JOIN เกิน ${MAX_JOIN_ROWS.toLocaleString('en-US')} แถว — ลืมเงื่อนไขเชื่อมตาราง (ON หรือ WHERE) หรือเปล่า? simulator หยุดไว้ก่อนเบราว์เซอร์ค้าง`);
    }
  }
  return out;
}

function evalNode(node, N, outerCtx) {
  if (node.k === 'leaf') return leafRows(node, N, outerCtx);
  const L = evalNode(node.left, N, outerCtx);
  const R = evalNode(node.right, N, outerCtx);
  const cacheable = !node.correlated;
  if (node.kind === 'right') {
    const hash = findHashCond(node.conds, node.right.slots, node.left.slots);
    return joinRows(R, L, node.left.slots, node.conds, hash, true, outerCtx, node, cacheable);
  }
  const hash = findHashCond(node.conds, node.left.slots, node.right.slots);
  return joinRows(L, R, node.right.slots, node.conds, hash, node.kind === 'left', outerCtx, node, cacheable);
}

function evalFrom(top, N, outerCtx) {
  const pending = top.conds.slice();
  const have = new Set();
  let acc = top.items.length ? null : [new Array(N)];
  const ctx = { row: null, group: null, item: null, outer: outerCtx };
  const applyReady = () => {
    for (let i = 0; i < pending.length; i++) {
      const x = pending[i];
      if (!subset(x.slots, have)) continue;
      pending.splice(i--, 1);
      acc = acc.filter((r) => { ctx.row = r; return truth(x.c.ev(ctx)) === 1; });
    }
  };
  for (const item of top.items) {
    const rows = evalNode(item, N, outerCtx);
    const cacheable = !item.correlated;
    if (acc === null) {
      // equality with a constant / outer value: index lookup instead of a scan
      const hash = findHashCond(pending, new Set(), item.slots);
      if (hash && localSlots(hash.probe).size === 0) {
        let table = cacheable && item.hashCache && item.hashCache.get(hash.cond);
        if (!table) { table = hashRows(rows, hash.build, hash.fam, outerCtx); if (cacheable) (item.hashCache ||= new Map()).set(hash.cond, table); }
        ctx.row = new Array(N);
        const k = famKey(hash.probe.ev(ctx), hash.fam);
        acc = (k !== null && table.get(k)) || [];
      } else acc = rows;
    } else {
      const hash = findHashCond(pending, have, item.slots);
      acc = joinRows(acc, rows, item.slots, [], hash, false, outerCtx, item, cacheable);
    }
    for (const s of item.slots) have.add(s);
    applyReady();
  }
  if (pending.length) acc = acc.filter((r) => { ctx.row = r; return pending.every((x) => truth(x.c.ev(ctx)) === 1); });
  return acc;
}
