// Lexer + recursive-descent parser: SQL text -> statement AST (MySQL 8 grammar subset).
// `?` placeholders are bound while parsing (like mysql2's client-side formatting), so the AST only holds literals.
import { err, syntaxError, unsupported } from './sql-errors.js';

// ---------- versioned comments, script splitting ----------

const SERVER_VERSION_ID = 80036;

// `-- ` starts a comment only when followed by whitespace (so `5--3` is 5 - -3)
const isDashComment = (s, i) => s[i] === '-' && s[i + 1] === '-' && (i + 2 >= s.length || /\s/.test(s[i + 2]));

// skip a quoted string starting at i; returns the index just past it
function skipQuoted(s, i) {
  const qc = s[i];
  i++;
  while (i < s.length) {
    if (s[i] === '\\' && qc !== '`') { i += 2; continue; }
    if (s[i] === qc) { if (s[i + 1] === qc) { i += 2; continue; } return i + 1; }
    i++;
  }
  return i;
}

// MySQL executes `/*!40101 SET NAMES utf8 */` as code (when the version number is <= the server's); mysqldump relies on it
export function expandVersioned(sql) {
  if (!sql.includes('/*!')) return sql;
  let out = '';
  let last = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`') i = skipQuoted(sql, i);
    else if (isDashComment(sql, i) || c === '#') { while (i < sql.length && sql[i] !== '\n') i++; }
    else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end;
      if (sql[i + 2] === '!') {
        const m = /^\d{0,6}/.exec(sql.slice(i + 3, i + 9));
        const version = m[0] ? Number(m[0]) : 0;
        out += sql.slice(last, i) + ' ' + (version <= SERVER_VERSION_ID ? sql.slice(i + 3 + m[0].length, stop) : '') + ' ';
        i = end === -1 ? sql.length : end + 2;
        last = i;
      } else i = end === -1 ? sql.length : end + 2;
    } else i++;
  }
  return out + sql.slice(last);
}

function scan(sql, onChar) {
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`') i = skipQuoted(sql, i);
    else if (isDashComment(sql, i) || c === '#') { while (i < sql.length && sql[i] !== '\n') i++; }
    else if (c === '/' && sql[i + 1] === '*') { const end = sql.indexOf('*/', i + 2); i = end === -1 ? sql.length : end + 2; }
    else { onChar(c, i); i++; }
  }
}

const hasCode = (s) => { let found = false; scan(s, (c) => { if (!/\s/.test(c)) found = true; }); return found; };

export function splitStatements(sql) {
  const text = expandVersioned(sql);
  const cuts = [];
  scan(text, (c, i) => { if (c === ';') cuts.push(i); });
  const parts = [];
  let start = 0;
  for (const cut of cuts) { parts.push(text.slice(start, cut)); start = cut + 1; }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter(hasCode);
}

// ---------- lexer ----------

const RE_NUM = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const RE_WORD = /[A-Za-z_$\u0080-￿][A-Za-z0-9_$\u0080-￿]*/y;
const RE_VAR = /@@?(?:(?:global|session|local|persist)\.)?(?:[A-Za-z0-9_$.]+|`[^`]*`|'[^']*')/iy;
const isWordStart = (sql, i) => { RE_WORD.lastIndex = i; return RE_WORD.test(sql); };
const OPS3 = ['<=>'];
const OPS2 = ['<=', '>=', '<>', '!=', '||', '&&', ':=', '<<', '>>'];
const OPS1 = '(),;=<>*.+-/%!~&|^';
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', 0: '\0', Z: '\x1a', '%': '\\%', _: '\\_' };

function tokenize(sql) {
  const tokens = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
    if (isDashComment(sql, i) || c === '#') { while (i < n && sql[i] !== '\n') i++; continue; }
    if (c === '/' && sql[i + 1] === '*') { const e = sql.indexOf('*/', i + 2); i = e === -1 ? n : e + 2; continue; }
    const pos = i;
    if (c === "'" || c === '"') {
      let v = '';
      i++;
      while (i < n) {
        const ch = sql[i];
        if (ch === '\\' && i + 1 < n) { const nx = sql[i + 1]; v += ESCAPES[nx] ?? nx; i += 2; continue; }
        if (ch === c) { if (sql[i + 1] === c) { v += c; i += 2; continue; } break; }
        v += ch;
        i++;
      }
      if (i >= n) throw syntaxError(sql, pos);
      i++;
      tokens.push({ t: 'str', v, pos, end: i });
    } else if (c === '`') {
      let v = '';
      i++;
      for (;;) {
        const e = sql.indexOf('`', i);
        if (e === -1) throw syntaxError(sql, pos);
        v += sql.slice(i, e);
        if (sql[e + 1] === '`') { v += '`'; i = e + 2; continue; }
        i = e + 1;
        break;
      }
      tokens.push({ t: 'ident', v, pos, end: i });
    } else if ((c >= '0' && c <= '9') || (c === '.' && /[0-9]/.test(sql[i + 1] || '') && !/^(ident|word)$/.test(tokens.length ? tokens[tokens.length - 1].t : ''))) {
      RE_NUM.lastIndex = i;
      const raw = RE_NUM.exec(sql)[0];
      i += raw.length;
      tokens.push({ t: 'num', v: Number(raw), raw, pos, end: i });
    } else if (isWordStart(sql, i)) {
      const w = sql.slice(i, RE_WORD.lastIndex);
      i = RE_WORD.lastIndex;
      tokens.push({ t: 'word', v: w, u: w.toUpperCase(), pos, end: i });
    } else if (c === '?') {
      tokens.push({ t: 'param', pos, end: ++i });
    } else if (c === '@') {
      RE_VAR.lastIndex = i;
      const m = RE_VAR.exec(sql);
      if (!m) throw syntaxError(sql, pos);
      const raw = m[0];
      i += raw.length;
      const sys = raw[1] === '@';
      let name = raw.slice(sys ? 2 : 1).replace(/^(global|session|local|persist)\./i, '');
      if (/^[`']/.test(name)) name = name.slice(1, -1);
      tokens.push({ t: 'var', v: name.toLowerCase(), sys, pos, end: i });
    } else {
      const op = OPS3.find((o) => sql.startsWith(o, i)) || OPS2.find((o) => sql.startsWith(o, i)) || (OPS1.includes(c) ? c : null);
      if (!op) throw syntaxError(sql, pos);
      i += op.length;
      tokens.push({ t: 'op', v: op, pos, end: i });
    }
  }
  return tokens;
}

// ---------- keywords ----------

const RESERVED = new Set(`ADD ALL ALTER ANALYZE AND AS ASC BETWEEN BIGINT BINARY BLOB BOTH BY CALL CASCADE CASE CHANGE CHAR CHARACTER CHECK
COLLATE COLUMN CONSTRAINT CONVERT CREATE CROSS CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER DATABASE DATABASES DEC DECIMAL
DEFAULT DELETE DESC DESCRIBE DISTINCT DISTINCTROW DIV DOUBLE DROP DUAL ELSE EXCEPT EXISTS EXPLAIN FALSE FLOAT FOR FORCE FOREIGN FROM
FULLTEXT GRANT GROUP HAVING IF IGNORE IN INDEX INNER INSERT INT INTEGER INTERSECT INTERVAL INTO IS JOIN KEY KEYS KILL LATERAL LEADING
LEFT LIKE LIMIT LOAD LOCALTIME LOCALTIMESTAMP LOCK LONGBLOB LONGTEXT MATCH MEDIUMBLOB MEDIUMINT MEDIUMTEXT MOD NATURAL NOT NULL NUMERIC
ON OPTIMIZE OR ORDER OUTER OVER PARTITION PRIMARY RANGE REAL REFERENCES REGEXP RENAME REPEAT REPLACE RESTRICT RIGHT RLIKE SCHEMA
SCHEMAS SELECT SEPARATOR SET SHOW SMALLINT STRAIGHT_JOIN TABLE THEN TINYBLOB TINYINT TINYTEXT TO TRAILING TRUE UNION UNIQUE UNLOCK
UNSIGNED UPDATE USE USING VALUES VARBINARY VARCHAR WHEN WHERE WINDOW WITH XOR ZEROFILL`.split(/\s+/));
// words that end a table reference, so `FROM t offset` style implicit aliases don't swallow them
const NOT_ALIAS = new Set(['OFFSET']);

export const AGGREGATES = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'GROUP_CONCAT', 'STD', 'STDDEV', 'STDDEV_POP', 'STDDEV_SAMP', 'VARIANCE', 'VAR_POP', 'VAR_SAMP', 'BIT_AND', 'BIT_OR', 'BIT_XOR']);
const UNITS = new Set(['MICROSECOND', 'SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR']);
const NO_PAREN_FUNCS = new Set(['CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'LOCALTIME', 'LOCALTIMESTAMP', 'CURRENT_USER', 'UTC_DATE']);
const KNOWN_STATEMENTS = new Set(['GRANT', 'REVOKE', 'CALL', 'EXPLAIN', 'ANALYZE', 'OPTIMIZE', 'REPAIR', 'FLUSH', 'KILL', 'LOAD', 'HANDLER', 'DO',
  'PREPARE', 'EXECUTE', 'DEALLOCATE', 'RENAME', 'CHECKSUM', 'INSTALL', 'RESET', 'PURGE', 'CHANGE', 'XA', 'SAVEPOINT', 'RELEASE', 'SIGNAL',
  'RESIGNAL', 'GET', 'DECLARE', 'REPLACE', 'TABLE', 'VALUES', 'HELP', 'IMPORT', 'CLONE', 'SHUTDOWN', 'RESTART', 'CHECK']);

// ---------- parser ----------

export class Parser {
  constructor(sql, values = []) {
    this.sql = sql;
    this.values = values;
    this.tokens = tokenize(sql);
    this.i = 0;
    this.pi = 0; // placeholders consumed
  }
  peek(o = 0) { return this.tokens[this.i + o]; }
  next() { return this.tokens[this.i++]; }
  prevEnd() { return this.i > 0 ? this.tokens[this.i - 1].end : 0; }
  fail(tok = this.peek()) { throw syntaxError(this.sql, tok ? tok.pos : null); }
  unsupported() { throw unsupported(this.sql); }
  isWord(w, o = 0) { const t = this.peek(o); return !!t && t.t === 'word' && t.u === w; }
  isAnyWord(list, o = 0) { const t = this.peek(o); return !!t && t.t === 'word' && list.includes(t.u); }
  eatWord(w) { if (this.isWord(w)) { this.i++; return true; } return false; }
  expectWord(w) { if (!this.eatWord(w)) this.fail(); }
  isOp(v, o = 0) { const t = this.peek(o); return !!t && t.t === 'op' && t.v === v; }
  eatOp(v) { if (this.isOp(v)) { this.i++; return true; } return false; }
  expectOp(v) { if (!this.eatOp(v)) this.fail(); }
  atEnd() { return this.i >= this.tokens.length || (this.isOp(';') && this.i === this.tokens.length - 1); }
  expectEnd() { if (!this.atEnd()) this.fail(); }
  isName(o = 0) { const t = this.peek(o); return !!t && (t.t === 'ident' || (t.t === 'word' && !RESERVED.has(t.u))); }
  // identifier; after a `.` MySQL accepts reserved words too
  name(anyWord = false) {
    const t = this.next();
    if (!t || !(t.t === 'ident' || (t.t === 'word' && (anyWord || !RESERVED.has(t.u))))) this.fail(t);
    return t.v;
  }
  qname() {
    const a = this.name();
    if (this.eatOp('.')) return { db: a, name: this.name(true) };
    return { db: null, name: a };
  }
  nameList() {
    this.expectOp('(');
    const list = [this.name()];
    while (this.eatOp(',')) list.push(this.name());
    this.expectOp(')');
    return list;
  }
  param() { return this.values[this.pi++]; }
  intLiteral() {
    const t = this.next();
    if (t && t.t === 'num' && Number.isInteger(t.v)) return t.v;
    if (t && t.t === 'param') { const v = Number(this.param()); if (Number.isInteger(v) && v >= 0) return v; throw syntaxError(this.sql, t.pos); }
    return this.fail(t);
  }
  str() { const t = this.next(); if (!t || t.t !== 'str') this.fail(t); return t.v; }

  // ---------- statements ----------

  statement() {
    if (!this.tokens.length) this.fail(null);
    const first = this.peek();
    if (first.t === 'op' && first.v === '(' && this.isWord('SELECT', 1)) return this.selectStatement();
    if (first.t !== 'word') this.fail(first);
    switch (first.u) {
      case 'SELECT': case 'WITH': return this.selectStatement();
      case 'INSERT': return this.insert();
      case 'UPDATE': return this.update();
      case 'DELETE': return this.del();
      case 'CREATE': return this.create();
      case 'DROP': return this.drop();
      case 'ALTER': return this.alter();
      case 'USE': { this.i++; const db = this.name(); this.expectEnd(); return { type: 'use', db }; }
      case 'SHOW': return this.show();
      case 'DESCRIBE': case 'DESC': case 'EXPLAIN': return this.describe();
      case 'SET': return this.set();
      case 'TRUNCATE': { this.i++; this.eatWord('TABLE'); const table = this.qname(); this.expectEnd(); return { type: 'truncate', table }; }
      case 'START': this.i++; this.expectWord('TRANSACTION'); this.skipRest(); return { type: 'tx', op: 'begin' };
      case 'BEGIN': this.i++; this.eatWord('WORK'); this.expectEnd(); return { type: 'tx', op: 'begin' };
      case 'COMMIT': this.i++; this.skipRest(); return { type: 'tx', op: 'commit' };
      case 'ROLLBACK': this.i++; if (this.isWord('TO')) this.unsupported(); this.skipRest(); return { type: 'tx', op: 'rollback' };
      case 'LOCK': case 'UNLOCK': this.i++; this.skipRest(); return { type: 'noop' }; // mysqldump's LOCK TABLES … / UNLOCK TABLES
      default:
        if (KNOWN_STATEMENTS.has(first.u)) this.unsupported();
        return this.fail(first);
    }
  }
  skipRest() { while (!this.atEnd()) this.i++; }

  selectStatement() {
    let ast;
    if (this.eatOp('(')) { ast = this.selectStatement(); this.expectOp(')'); return ast; }
    ast = this.select();
    if (this.isAnyWord(['UNION', 'INTERSECT', 'EXCEPT'])) this.unsupported();
    if (this.isWord('INTO')) this.unsupported();
    this.expectEnd();
    return ast;
  }

  // SELECT … (also used for subqueries; does not require end of input)
  select() {
    let ctes = null;
    if (this.eatWord('WITH')) {
      if (this.isWord('RECURSIVE')) this.unsupported();
      ctes = [];
      do {
        const name = this.name();
        const columns = this.isOp('(') ? this.nameList() : null;
        this.expectWord('AS');
        this.expectOp('(');
        const select = this.select();
        this.expectOp(')');
        ctes.push({ name, columns, select });
      } while (this.eatOp(','));
    }
    const start = this.peek();
    this.expectWord('SELECT');
    const ast = { type: 'select', ctes, distinct: false, items: [], from: null, where: null, groupBy: [], having: null, orderBy: [], limit: null, pos: start.pos };
    for (;;) {
      if (this.eatWord('DISTINCT') || this.eatWord('DISTINCTROW')) ast.distinct = true;
      else if (this.eatWord('ALL') || this.eatWord('HIGH_PRIORITY') || this.eatWord('STRAIGHT_JOIN') || this.eatWord('SQL_NO_CACHE') || this.eatWord('SQL_SMALL_RESULT') || this.eatWord('SQL_BIG_RESULT') || this.eatWord('SQL_BUFFER_RESULT')) { /* hints */ }
      else if (this.isWord('SQL_CALC_FOUND_ROWS')) this.unsupported();
      else break;
    }
    do ast.items.push(this.selectItem()); while (this.eatOp(','));
    if (this.isWord('INTO')) this.unsupported();
    if (this.eatWord('FROM')) {
      if (this.eatWord('DUAL')) ast.from = null;
      else ast.from = this.tableRefs();
    }
    if (this.eatWord('WHERE')) ast.where = this.expr();
    if (this.eatWord('GROUP')) {
      this.expectWord('BY');
      do ast.groupBy.push(this.expr()); while (this.eatOp(','));
      if (this.isWord('WITH')) this.unsupported(); // WITH ROLLUP
    }
    if (this.eatWord('HAVING')) ast.having = this.expr();
    if (this.isWord('WINDOW')) this.unsupported();
    if (this.eatWord('ORDER')) { this.expectWord('BY'); ast.orderBy = this.orderList(); }
    if (this.eatWord('LIMIT')) ast.limit = this.limit();
    if (this.eatWord('FOR')) { if (!this.eatWord('UPDATE') && !this.eatWord('SHARE')) this.fail(); }
    else if (this.eatWord('LOCK')) { this.expectWord('IN'); this.expectWord('SHARE'); this.expectWord('MODE'); }
    return ast;
  }

  orderList() {
    const list = [];
    do {
      const expr = this.expr();
      const desc = this.eatWord('DESC') ? true : (this.eatWord('ASC'), false);
      list.push({ expr, desc });
    } while (this.eatOp(','));
    return list;
  }

  limit() {
    const a = this.intLiteral();
    if (this.eatOp(',')) return { offset: a, count: this.intLiteral() };
    if (this.eatWord('OFFSET')) return { count: a, offset: this.intLiteral() };
    return { count: a, offset: 0 };
  }

  selectItem() {
    const t = this.peek();
    if (this.eatOp('*')) return { star: true, pos: t.pos };
    // t.* and db.t.*
    if (this.isName() && this.isOp('.', 1)) {
      if (this.isOp('*', 2)) { this.i += 3; return { star: true, table: t.v, pos: t.pos }; }
      if (this.peek(2) && (this.peek(2).t === 'word' || this.peek(2).t === 'ident') && this.isOp('.', 3) && this.isOp('*', 4)) {
        this.i += 5;
        return { star: true, db: t.v, table: this.tokens[this.i - 3].v, pos: t.pos };
      }
    }
    const expr = this.expr();
    const text = this.sql.slice(expr.s, expr.e);
    let alias = null;
    if (this.eatWord('AS')) alias = this.aliasName(true);
    else if (this.isName() || (this.peek() && this.peek().t === 'str')) alias = this.aliasName(false);
    return { expr, alias, text };
  }
  aliasName() {
    const t = this.peek();
    if (t && t.t === 'str') { this.i++; return t.v; }
    return this.name();
  }

  // ----- FROM -----
  tableRefs() {
    const list = [this.tableRef()];
    while (this.eatOp(',')) list.push(this.tableRef());
    return list;
  }
  tableRef() {
    let left = this.tableFactor();
    for (;;) {
      const natural = this.eatWord('NATURAL');
      let kind = null;
      if (this.eatWord('JOIN') || this.eatWord('STRAIGHT_JOIN')) kind = 'inner';
      else if (this.isWord('INNER') || this.isWord('CROSS')) { kind = this.next().u === 'CROSS' ? 'cross' : 'inner'; this.expectWord('JOIN'); }
      else if (this.isWord('LEFT') || this.isWord('RIGHT')) {
        kind = this.next().u.toLowerCase();
        this.eatWord('OUTER');
        this.expectWord('JOIN');
      } else if (natural) this.fail();
      else break;
      const right = this.tableFactor();
      const join = { k: 'join', kind, natural, left, right, on: null, using: null };
      if (!natural) {
        if (this.eatWord('ON')) join.on = this.expr();
        else if (this.eatWord('USING')) join.using = this.nameList();
        else if (kind === 'left' || kind === 'right') this.fail();
      }
      left = join;
    }
    return left;
  }
  tableFactor() {
    const t = this.peek();
    if (this.isWord('LATERAL')) this.unsupported();
    if (this.eatOp('(')) {
      if (this.isWord('SELECT') || this.isWord('WITH')) {
        const select = this.select();
        if (this.isAnyWord(['UNION', 'INTERSECT', 'EXCEPT'])) this.unsupported();
        this.expectOp(')');
        this.eatWord('AS');
        if (!this.isName()) throw err('ER_DERIVED_MUST_HAVE_ALIAS', 1248, 'Every derived table must have its own alias', '42000');
        const alias = this.name();
        const columns = this.isOp('(') ? this.nameList() : null;
        return { k: 'derived', select, alias, columns, pos: t.pos };
      }
      const refs = this.tableRefs();
      this.expectOp(')');
      return refs.slice(1).reduce((left, right) => ({ k: 'join', kind: 'cross', natural: false, left, right, on: null, using: null }), refs[0]);
    }
    const q = this.qname();
    let alias = null;
    if (this.eatWord('AS')) alias = this.name();
    else if (this.isName() && !NOT_ALIAS.has(this.peek().u)) alias = this.name();
    // index hints are accepted and ignored
    while (this.isAnyWord(['USE', 'FORCE', 'IGNORE']) && this.isAnyWord(['INDEX', 'KEY'], 1)) {
      this.i += 2;
      if (this.eatWord('FOR')) { if (this.eatWord('ORDER') || this.eatWord('GROUP')) this.expectWord('BY'); else this.expectWord('JOIN'); }
      this.expectOp('(');
      while (!this.isOp(')')) this.name();
      this.expectOp(')');
    }
    return { k: 'table', db: q.db, name: q.name, alias, pos: t.pos };
  }

  // ---------- expressions (MySQL operator precedence) ----------

  node(n, start) { n.s = start; n.e = this.prevEnd(); return n; }
  expr() { return this.orExpr(); }
  orExpr() {
    const s = this.peek() ? this.peek().pos : this.sql.length;
    let a = this.xorExpr();
    while (this.eatWord('OR') || this.eatOp('||')) a = this.node({ k: 'bin', op: 'or', a, b: this.xorExpr() }, s);
    return a;
  }
  xorExpr() {
    const s = this.peek() ? this.peek().pos : this.sql.length;
    let a = this.andExpr();
    while (this.eatWord('XOR')) a = this.node({ k: 'bin', op: 'xor', a, b: this.andExpr() }, s);
    return a;
  }
  andExpr() {
    const s = this.peek() ? this.peek().pos : this.sql.length;
    let a = this.notExpr();
    while (this.eatWord('AND') || this.eatOp('&&')) a = this.node({ k: 'bin', op: 'and', a, b: this.notExpr() }, s);
    return a;
  }
  notExpr() {
    const s = this.peek() ? this.peek().pos : this.sql.length;
    if (this.eatWord('NOT')) return this.node({ k: 'not', a: this.notExpr() }, s);
    return this.predicate();
  }
  predicate() {
    const s = this.peek() ? this.peek().pos : this.sql.length;
    let a = this.bitExpr();
    for (;;) {
      if (this.eatWord('IS')) {
        const neg = this.eatWord('NOT');
        let what;
        if (this.eatWord('NULL')) what = 'null';
        else if (this.eatWord('TRUE')) what = 'true';
        else if (this.eatWord('FALSE')) what = 'false';
        else if (this.eatWord('UNKNOWN')) what = 'null';
        else this.fail();
        a = this.node({ k: 'is', a, what, neg }, s);
        continue;
      }
      const neg = this.isWord('NOT') && this.isAnyWord(['IN', 'LIKE', 'BETWEEN', 'REGEXP', 'RLIKE'], 1) ? (this.i++, true) : false;
      if (this.eatWord('IN')) {
        this.expectOp('(');
        if (this.isWord('SELECT') || this.isWord('WITH')) {
          const sub = this.select();
          this.expectOp(')');
          a = this.node({ k: 'in', a, sub, neg }, s);
        } else {
          const list = [];
          do this.pushListItem(list); while (this.eatOp(','));
          this.expectOp(')');
          a = this.node({ k: 'in', a, list, neg }, s);
        }
        continue;
      }
      if (this.eatWord('LIKE')) {
        const b = this.bitExpr();
        let esc = null;
        if (this.eatWord('ESCAPE')) esc = this.bitExpr();
        a = this.node({ k: 'like', a, b, esc, neg }, s);
        continue;
      }
      if (this.eatWord('REGEXP') || this.eatWord('RLIKE')) { a = this.node({ k: 'regexp', a, b: this.bitExpr(), neg }, s); continue; }
      if (this.eatWord('BETWEEN')) {
        const lo = this.bitExpr();
        this.expectWord('AND');
        const hi = this.bitExpr();
        a = this.node({ k: 'between', a, lo, hi, neg }, s);
        continue;
      }
      if (neg) this.fail();
      const t = this.peek();
      if (t && t.t === 'op' && ['=', '<=>', '!=', '<>', '<', '<=', '>', '>='].includes(t.v)) {
        this.i++;
        const op = t.v === '!=' ? '<>' : t.v;
        if (this.isAnyWord(['ANY', 'SOME', 'ALL']) && this.isOp('(', 1) && (this.isWord('SELECT', 2) || this.isWord('WITH', 2))) {
          const all = this.next().u === 'ALL';
          this.expectOp('(');
          const sub = this.select();
          this.expectOp(')');
          a = this.node({ k: 'quant', op, a, sub, all }, s);
        } else a = this.node({ k: 'bin', op, a, b: this.bitExpr() }, s);
        continue;
      }
      return a;
    }
  }
  // `IN (?)` with an array value expands to a list (mysql2 formats arrays as `a, b`)
  pushListItem(list) {
    const t = this.peek();
    if (t && t.t === 'param' && Array.isArray(this.values[this.pi]) && !this.isOpAfterParam()) {
      this.i++;
      for (const v of this.param()) list.push({ k: 'lit', v, s: t.pos, e: t.end });
      return;
    }
    list.push(this.expr());
  }
  isOpAfterParam() { const t = this.peek(1); return !!t && t.t === 'op' && !(t.v === ',' || t.v === ')'); }
  bitExpr() { return this.addExpr(); }
  addExpr() {
    const s = this.peek() ? this.peek().pos : this.sql.length;
    let a = this.mulExpr();
    for (;;) {
      if (this.isOp('+') || this.isOp('-')) { const op = this.next().v; a = this.node({ k: 'bin', op, a, b: this.mulExpr() }, s); } else return a;
    }
  }
  mulExpr() {
    const s = this.peek() ? this.peek().pos : this.sql.length;
    let a = this.unaryExpr();
    for (;;) {
      let op = null;
      if (this.isOp('*') || this.isOp('/') || this.isOp('%')) op = this.next().v;
      else if (this.eatWord('DIV')) op = 'div';
      else if (this.eatWord('MOD')) op = '%';
      else return a;
      a = this.node({ k: 'bin', op, a, b: this.unaryExpr() }, s);
    }
  }
  unaryExpr() {
    const t = this.peek();
    if (!t) this.fail();
    if (t.t === 'op' && t.v === '-') {
      this.i++;
      const a = this.unaryExpr();
      if (a.k === 'lit' && typeof a.v === 'number' && !a.param) return this.node({ ...a, v: -a.v }, t.pos);
      return this.node({ k: 'neg', a }, t.pos);
    }
    if (t.t === 'op' && t.v === '+') { this.i++; return this.unaryExpr(); }
    if (t.t === 'op' && t.v === '!') { this.i++; return this.node({ k: 'not', a: this.unaryExpr() }, t.pos); }
    if (t.t === 'op' && t.v === '~') this.unsupported();
    if (this.isWord('BINARY') && !this.isOp('(', 1)) { this.i++; return this.unaryExpr(); }
    return this.primary();
  }
  primary() {
    const t = this.next();
    if (!t) this.fail(t);
    const s = t.pos;
    const done = (n) => this.node(n, s);
    if (t.t === 'num') {
      const dot = t.raw.indexOf('.');
      if (/[eE]/.test(t.raw)) return done({ k: 'lit', v: t.v, dbl: true });
      return done({ k: 'lit', v: t.v, scale: dot === -1 ? 0 : t.raw.length - dot - 1 });
    }
    if (t.t === 'str') {
      let v = t.v;
      while (this.peek() && this.peek().t === 'str') v += this.next().v; // 'a' 'b' is 'ab'
      return done({ k: 'lit', v });
    }
    if (t.t === 'param') {
      const v = this.param();
      if (Array.isArray(v)) throw syntaxError(this.sql, t.pos);
      return done({ k: 'lit', v, param: true });
    }
    if (t.t === 'var') {
      if (this.isOp(':=')) this.unsupported();
      return done({ k: 'var', name: t.v, sys: t.sys });
    }
    if (t.t === 'op' && t.v === '(') {
      if (this.isWord('SELECT') || this.isWord('WITH')) {
        const sub = this.select();
        if (this.isAnyWord(['UNION', 'INTERSECT', 'EXCEPT'])) this.unsupported();
        this.expectOp(')');
        return done({ k: 'subquery', sub });
      }
      const inner = this.expr();
      if (this.isOp(',')) this.unsupported(); // row constructors
      this.expectOp(')');
      return done({ ...inner, paren: true });
    }
    if (t.t === 'ident') return this.columnRef(t, s);
    if (t.t !== 'word') this.fail(t);
    switch (t.u) {
      case 'NULL': return done({ k: 'lit', v: null });
      case 'TRUE': return done({ k: 'lit', v: 1, scale: 0 });
      case 'FALSE': return done({ k: 'lit', v: 0, scale: 0 });
      case 'DEFAULT': if (!this.isOp('(')) return done({ k: 'default' }); break;
      case 'EXISTS': {
        this.expectOp('(');
        const sub = this.select();
        this.expectOp(')');
        return done({ k: 'exists', sub });
      }
      case 'CASE': {
        const base = this.isWord('WHEN') ? null : this.expr();
        const whens = [];
        while (this.eatWord('WHEN')) {
          const w = this.expr();
          this.expectWord('THEN');
          whens.push({ w, t: this.expr() });
        }
        if (!whens.length) this.fail();
        const otherwise = this.eatWord('ELSE') ? this.expr() : null;
        this.expectWord('END');
        return done({ k: 'case', base, whens, otherwise });
      }
      case 'INTERVAL': {
        const a = this.expr();
        return done({ k: 'interval', a, unit: this.unit() });
      }
      default:
    }
    if (this.isOp('(')) { this.i++; return this.fnCall(t, s); }
    if (NO_PAREN_FUNCS.has(t.u)) return done({ k: 'fn', name: t.u, as: t.v, args: [] });
    if (RESERVED.has(t.u)) this.fail(t);
    return this.columnRef(t, s);
  }
  columnRef(t, s) {
    const parts = [t.v];
    while (this.isOp('.') && this.peek(1) && (this.peek(1).t === 'word' || this.peek(1).t === 'ident')) { this.i++; parts.push(this.next().v); }
    if (parts.length > 3) this.fail(this.tokens[this.i - 1]);
    const [name, table, db] = parts.reverse();
    return this.node({ k: 'col', name, table: table ?? null, db: db ?? null }, s);
  }
  unit() {
    const t = this.next();
    if (!t || t.t !== 'word' || !UNITS.has(t.u)) this.fail(t);
    return t.u;
  }
  fnCall(t, s) {
    const name = t.u;
    const n = { k: 'fn', name, as: t.v, args: [], distinct: false };
    const done = () => { this.expectOp(')'); if (this.isWord('OVER')) this.unsupported(); return this.node(n, s); };
    if (AGGREGATES.has(name)) {
      if (this.eatWord('DISTINCT')) n.distinct = true; else this.eatWord('ALL');
      if (name === 'COUNT' && !n.distinct && this.eatOp('*')) { n.star = true; return done(); }
      if (this.isOp(')')) this.fail();
      do n.args.push(this.expr()); while (this.eatOp(','));
      if (name === 'GROUP_CONCAT') {
        if (this.eatWord('ORDER')) { this.expectWord('BY'); n.order = this.orderList(); }
        n.sep = this.eatWord('SEPARATOR') ? this.str() : ',';
      } else if (n.args.length > 1 && !(name === 'COUNT' && n.distinct)) this.fail();
      return done();
    }
    switch (name) {
      case 'CAST': case 'CONVERT': {
        n.args.push(this.expr());
        if (name === 'CONVERT' && this.eatWord('USING')) { this.name(); n.name = 'CAST'; n.cast = { kind: 'char' }; return done(); }
        if (name === 'CAST') this.expectWord('AS'); else this.expectOp(',');
        n.name = 'CAST';
        n.cast = this.castType();
        return done();
      }
      case 'TRIM': {
        let mode = 'BOTH';
        if (this.isAnyWord(['BOTH', 'LEADING', 'TRAILING'])) mode = this.next().u;
        let rem = null;
        if (!this.eatWord('FROM')) {
          const x = this.expr();
          if (this.eatWord('FROM')) { rem = x; n.args.push(this.expr()); } else n.args.push(x);
        } else n.args.push(this.expr());
        n.trim = { mode, rem };
        return done();
      }
      case 'SUBSTRING': case 'SUBSTR': case 'MID': {
        n.args.push(this.expr());
        if (this.eatWord('FROM')) {
          n.args.push(this.expr());
          if (this.eatWord('FOR')) n.args.push(this.expr());
        } else while (this.eatOp(',')) n.args.push(this.expr());
        return done();
      }
      case 'EXTRACT': {
        n.unit = this.unit();
        this.expectWord('FROM');
        n.args.push(this.expr());
        return done();
      }
      case 'POSITION': {
        n.args.push(this.bitExpr());
        this.expectWord('IN');
        n.args.push(this.expr());
        n.name = 'LOCATE';
        return done();
      }
      case 'TIMESTAMPDIFF': case 'TIMESTAMPADD': {
        n.unit = this.unit();
        while (this.eatOp(',')) n.args.push(this.expr());
        return done();
      }
      default:
    }
    if (!this.isOp(')')) { do n.args.push(this.expr()); while (this.eatOp(',')); }
    return done();
  }
  castType() {
    const t = this.next();
    if (!t || t.t !== 'word') this.fail(t);
    const size = () => {
      if (!this.eatOp('(')) return [null, null];
      const a = this.intLiteral();
      const b = this.eatOp(',') ? this.intLiteral() : null;
      this.expectOp(')');
      return [a, b];
    };
    switch (t.u) {
      case 'SIGNED': case 'UNSIGNED': this.eatWord('INTEGER') || this.eatWord('INT'); return { kind: t.u === 'SIGNED' ? 'signed' : 'unsigned' };
      case 'DECIMAL': case 'DEC': case 'NUMERIC': { const [p, sc] = size(); return { kind: 'decimal', precision: p ?? 10, scale: sc ?? 0 }; }
      case 'CHAR': case 'NCHAR': case 'VARCHAR': case 'BINARY': { const [len] = size(); if (this.eatWord('CHARACTER')) { this.expectWord('SET'); this.name(); } return { kind: 'char', len }; }
      case 'DATE': return { kind: 'date' };
      case 'DATETIME': size(); return { kind: 'datetime' };
      case 'TIME': size(); return { kind: 'time' };
      case 'DOUBLE': case 'FLOAT': case 'REAL': size(); return { kind: 'double' };
      case 'YEAR': return { kind: 'signed' };
      default: return this.unsupported();
    }
  }

  // ---------- DML ----------

  insert() {
    this.expectWord('INSERT');
    while (this.eatWord('LOW_PRIORITY') || this.eatWord('DELAYED') || this.eatWord('HIGH_PRIORITY')) { /* ignored */ }
    if (this.isWord('IGNORE')) this.unsupported();
    this.eatWord('INTO');
    const table = this.qname();
    const ast = { type: 'insert', table, columns: null, rows: null, set: null, select: null };
    if (this.isOp('(') && !this.isWord('SELECT', 1) && !this.isWord('WITH', 1)) {
      this.i++;
      ast.columns = [];
      if (!this.isOp(')')) { do ast.columns.push(this.colTarget()); while (this.eatOp(',')); }
      this.expectOp(')');
    }
    if (this.eatWord('SET')) ast.set = this.assignments();
    else if (this.eatWord('VALUES') || this.eatWord('VALUE')) {
      ast.rows = [];
      const t = this.peek();
      if (t && t.t === 'param' && Array.isArray(this.values[this.pi])) {
        this.i++;
        for (const row of this.param()) ast.rows.push((Array.isArray(row) ? row : [row]).map((v) => ({ k: 'lit', v, s: t.pos, e: t.end })));
      } else {
        do {
          this.eatWord('ROW');
          this.expectOp('(');
          const row = [];
          if (!this.isOp(')')) { do row.push(this.expr()); while (this.eatOp(',')); }
          this.expectOp(')');
          ast.rows.push(row);
        } while (this.eatOp(','));
      }
    } else if (this.isWord('SELECT') || this.isWord('WITH') || this.isOp('(')) {
      const paren = this.eatOp('(');
      ast.select = this.select();
      if (paren) this.expectOp(')');
      if (this.isAnyWord(['UNION', 'INTERSECT', 'EXCEPT'])) this.unsupported();
    } else this.fail();
    if (this.isWord('ON') || this.isWord('AS')) this.unsupported(); // ON DUPLICATE KEY UPDATE
    this.expectEnd();
    return ast;
  }
  colTarget() {
    const a = this.name();
    if (this.eatOp('.')) { const b = this.name(true); if (this.eatOp('.')) return this.name(true); return b; }
    return a;
  }
  // SET a = x, b = y | SET ? (object)
  assignments() {
    const t = this.peek();
    if (t && t.t === 'param' && !this.isOp('=', 1)) {
      this.i++;
      const obj = this.param();
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj) || obj instanceof Date) throw syntaxError(this.sql, t.pos);
      return Object.entries(obj).map(([col, v]) => ({ col, expr: { k: 'lit', v, s: t.pos, e: t.end } }));
    }
    const list = [];
    do {
      const col = this.colTarget();
      this.expectOp('=');
      list.push({ col, expr: this.expr() });
    } while (this.eatOp(','));
    return list;
  }
  update() {
    this.expectWord('UPDATE');
    this.eatWord('LOW_PRIORITY');
    if (this.isWord('IGNORE')) this.unsupported();
    const table = this.qname();
    let alias = null;
    if (this.eatWord('AS')) alias = this.name(); else if (this.isName()) alias = this.name();
    if (this.isOp(',') || this.isAnyWord(['JOIN', 'INNER', 'LEFT', 'RIGHT', 'CROSS', 'STRAIGHT_JOIN', 'NATURAL'])) this.unsupported(); // multi-table UPDATE
    this.expectWord('SET');
    const ast = { type: 'update', table, alias, set: this.assignments(), where: null, orderBy: [], limit: null };
    this.dmlTail(ast);
    return ast;
  }
  del() {
    this.expectWord('DELETE');
    while (this.eatWord('LOW_PRIORITY') || this.eatWord('QUICK')) { /* ignored */ }
    if (this.isWord('IGNORE')) this.unsupported();
    if (!this.isWord('FROM')) this.unsupported(); // multi-table DELETE t1 FROM …
    this.expectWord('FROM');
    const table = this.qname();
    let alias = null;
    if (this.eatWord('AS')) alias = this.name(); else if (this.isName()) alias = this.name();
    if (this.isOp(',') || this.isWord('USING') || this.isAnyWord(['JOIN', 'INNER', 'LEFT', 'RIGHT'])) this.unsupported();
    const ast = { type: 'delete', table, alias, where: null, orderBy: [], limit: null };
    this.dmlTail(ast);
    return ast;
  }
  dmlTail(ast) {
    if (this.eatWord('WHERE')) ast.where = this.expr();
    if (this.eatWord('ORDER')) { this.expectWord('BY'); ast.orderBy = this.orderList(); }
    if (this.eatWord('LIMIT')) ast.limit = { count: this.intLiteral(), offset: 0 };
    this.expectEnd();
  }

  // ---------- DDL ----------

  ifNotExists() { if (this.eatWord('IF')) { this.expectWord('NOT'); this.expectWord('EXISTS'); return true; } return false; }
  ifExists() { if (this.eatWord('IF')) { this.expectWord('EXISTS'); return true; } return false; }

  create() {
    this.expectWord('CREATE');
    if (this.eatWord('DATABASE') || this.eatWord('SCHEMA')) {
      const ifNot = this.ifNotExists();
      const name = this.name();
      this.skipRest(); // [DEFAULT] CHARACTER SET / COLLATE
      return { type: 'createDb', name, ifNot };
    }
    if (this.eatWord('TEMPORARY')) this.unsupported();
    if (this.eatWord('TABLE')) return this.createTable();
    const unique = this.eatWord('UNIQUE');
    if (this.eatWord('INDEX')) {
      const name = this.name();
      if (this.eatWord('USING')) this.name();
      this.expectWord('ON');
      const table = this.qname();
      const cols = this.keyParts();
      this.skipRest();
      return { type: 'alter', table, specs: [{ op: 'addIndex', unique, name, cols }] };
    }
    return this.unsupported();
  }

  createTable() {
    const ifNot = this.ifNotExists();
    const table = this.qname();
    const ast = { type: 'createTable', table, ifNot, columns: [], constraints: [], options: {}, select: null, like: null };
    const paren = this.isOp('(') && this.isWord('LIKE', 1);
    if (paren) this.i++;
    if (this.eatWord('LIKE')) {
      ast.like = this.qname();
      if (paren) this.expectOp(')');
      this.expectEnd();
      return ast;
    }
    if (this.isOp('(') && !this.isWord('SELECT', 1) && !this.isWord('WITH', 1)) {
      this.i++;
      do this.tableElement(ast); while (this.eatOp(','));
      this.expectOp(')');
    }
    this.tableOptions(ast.options);
    if (this.eatWord('IGNORE') || this.eatWord('REPLACE')) this.unsupported();
    const as = this.eatWord('AS');
    if (this.isWord('SELECT') || this.isWord('WITH') || this.isOp('(')) {
      const paren = this.eatOp('(');
      ast.select = this.select();
      if (paren) this.expectOp(')');
      if (this.isAnyWord(['UNION', 'INTERSECT', 'EXCEPT'])) this.unsupported();
    } else if (as) this.fail();
    this.expectEnd();
    if (!ast.columns.length && !ast.select) this.fail(null);
    return ast;
  }

  tableOptions(opts) {
    while (!this.atEnd() && !this.isWord('SELECT') && !this.isWord('AS') && !this.isWord('WITH') && !this.isOp('(') && !this.isWord('IGNORE') && !this.isWord('REPLACE')) {
      if (this.eatOp(',')) continue;
      const t = this.next();
      if (t.t !== 'word') this.fail(t);
      if (t.u === 'AUTO_INCREMENT') { this.eatOp('='); opts.autoIncrement = this.intLiteral(); continue; }
      if (t.u === 'DEFAULT') continue;
      if (t.u === 'CHARACTER') { this.expectWord('SET'); this.eatOp('='); this.name(); continue; }
      if (t.u === 'COMMENT') { this.eatOp('='); opts.comment = this.str(); continue; }
      // ENGINE=InnoDB, CHARSET=utf8mb4, COLLATE=…, ROW_FORMAT=…
      this.eatOp('=');
      const v = this.next();
      if (!v || (v.t !== 'word' && v.t !== 'ident' && v.t !== 'str' && v.t !== 'num')) this.fail(v);
      if (t.u === 'ENGINE') opts.engine = v.v;
    }
  }

  keyParts() {
    this.expectOp('(');
    const cols = [];
    do {
      cols.push(this.name());
      if (this.eatOp('(')) { this.intLiteral(); this.expectOp(')'); }
      this.eatWord('ASC') || this.eatWord('DESC');
    } while (this.eatOp(','));
    this.expectOp(')');
    while (this.isAnyWord(['USING', 'COMMENT', 'VISIBLE', 'INVISIBLE', 'KEY_BLOCK_SIZE'])) { const w = this.next().u; if (w === 'USING' || w === 'COMMENT') this.next(); else if (w === 'KEY_BLOCK_SIZE') { this.eatOp('='); this.next(); } }
    return cols;
  }

  // one element of CREATE TABLE ( … ): a column or a table constraint
  tableElement(ast) {
    const c = this.constraintDef();
    if (c) ast.constraints.push(c); else ast.columns.push(this.columnDef(ast.constraints));
  }

  constraintDef() {
    const start = this.i;
    let name = null;
    if (this.eatWord('CONSTRAINT')) { if (this.isName()) name = this.name(); }
    if (this.eatWord('PRIMARY')) {
      this.expectWord('KEY');
      if (this.eatWord('USING')) this.name();
      return { kind: 'primary', cols: this.keyParts() };
    }
    if (this.eatWord('UNIQUE')) {
      this.eatWord('KEY') || this.eatWord('INDEX');
      const kname = this.isName() ? this.name() : null;
      if (this.eatWord('USING')) this.name();
      return { kind: 'unique', name: kname || name, cols: this.keyParts() };
    }
    if (this.eatWord('FOREIGN')) {
      this.expectWord('KEY');
      const indexName = this.isName() ? this.name() : null;
      const cols = this.nameList();
      return { kind: 'foreign', name, indexName, cols, ...this.references() };
    }
    if (this.eatWord('CHECK')) {
      const check = this.checkBody();
      return { kind: 'check', name, ...check };
    }
    if (this.i !== start) this.fail(this.tokens[start]); // CONSTRAINT must be followed by one of the above
    if (this.isAnyWord(['KEY', 'INDEX', 'FULLTEXT', 'SPATIAL'])) {
      const w = this.next().u;
      if (w === 'FULLTEXT' || w === 'SPATIAL') this.eatWord('KEY') || this.eatWord('INDEX');
      const kname = this.isName() ? this.name() : null;
      if (this.eatWord('USING')) this.name();
      return { kind: 'index', name: kname, cols: this.keyParts() };
    }
    return null;
  }

  checkBody() {
    this.expectOp('(');
    const start = this.peek() ? this.peek().pos : this.sql.length;
    const expr = this.expr();
    const text = this.sql.slice(start, this.prevEnd());
    this.expectOp(')');
    let enforced = true;
    if (this.eatWord('NOT')) { this.expectWord('ENFORCED'); enforced = false; } else this.eatWord('ENFORCED');
    return { expr, text, enforced };
  }

  references() {
    this.expectWord('REFERENCES');
    const ref = this.qname();
    const refCols = this.nameList();
    let onDelete = 'NO ACTION';
    let onUpdate = 'NO ACTION';
    for (;;) {
      if (this.eatWord('MATCH')) { this.next(); continue; }
      if (!this.eatWord('ON')) break;
      const which = this.next();
      if (!which || which.t !== 'word' || (which.u !== 'DELETE' && which.u !== 'UPDATE')) this.fail(which);
      const action = this.refAction();
      if (which.u === 'DELETE') onDelete = action; else onUpdate = action;
    }
    return { ref, refCols, onDelete, onUpdate };
  }
  refAction() {
    if (this.eatWord('RESTRICT')) return 'RESTRICT';
    if (this.eatWord('CASCADE')) return 'CASCADE';
    if (this.eatWord('NO')) { this.expectWord('ACTION'); return 'NO ACTION'; }
    if (this.eatWord('SET')) {
      if (this.eatWord('NULL')) return 'SET NULL';
      if (this.eatWord('DEFAULT')) this.unsupported(); // InnoDB rejects SET DEFAULT
    }
    return this.fail();
  }

  dataType() {
    const t = this.next();
    if (!t || t.t !== 'word') this.fail(t);
    const size = (required) => {
      if (!this.eatOp('(')) { if (required) this.fail(); return [null, null]; }
      const a = this.intLiteral();
      const b = this.eatOp(',') ? this.intLiteral() : null;
      this.expectOp(')');
      return [a, b];
    };
    const flags = (type) => {
      for (;;) {
        if (this.eatWord('UNSIGNED')) type.unsigned = true;
        else if (this.eatWord('SIGNED')) type.unsigned = false;
        else if (this.eatWord('ZEROFILL')) type.unsigned = true;
        else return type;
      }
    };
    const u = t.u;
    switch (u) {
      case 'INT': case 'INTEGER': case 'TINYINT': case 'SMALLINT': case 'MEDIUMINT': case 'BIGINT': {
        const [w] = size(false);
        return flags({ kind: 'int', base: u === 'INTEGER' ? 'int' : u.toLowerCase(), width: w, unsigned: false });
      }
      case 'BOOL': case 'BOOLEAN': return { kind: 'int', base: 'tinyint', width: 1, unsigned: false };
      case 'SERIAL': return { kind: 'int', base: 'bigint', unsigned: true, serial: true };
      case 'DECIMAL': case 'DEC': case 'NUMERIC': case 'FIXED': {
        const [p, s] = size(false);
        return flags({ kind: 'dec', precision: p ?? 10, scale: s ?? 0, unsigned: false });
      }
      case 'FLOAT': case 'DOUBLE': case 'REAL': {
        if (u === 'DOUBLE') this.eatWord('PRECISION');
        const [p, s] = size(false);
        return flags({ kind: 'dbl', base: u === 'FLOAT' ? 'float' : 'double', precision: p, scale: s, unsigned: false });
      }
      case 'CHAR': case 'CHARACTER': case 'NCHAR': {
        if (u === 'CHARACTER' && this.eatWord('VARYING')) { const [n] = size(true); return { kind: 'str', base: 'varchar', size: n }; }
        const [n] = size(false);
        return { kind: 'str', base: 'char', size: n ?? 1 };
      }
      case 'VARCHAR': case 'NVARCHAR': { const [n] = size(true); return { kind: 'str', base: 'varchar', size: n }; }
      case 'BINARY': { const [n] = size(false); return { kind: 'str', base: 'binary', size: n ?? 1 }; }
      case 'VARBINARY': { const [n] = size(true); return { kind: 'str', base: 'varbinary', size: n }; }
      case 'TINYTEXT': return { kind: 'text', base: 'tinytext', size: 255 };
      case 'TEXT': { size(false); return { kind: 'text', base: 'text', size: 65535 }; }
      case 'MEDIUMTEXT': return { kind: 'text', base: 'mediumtext', size: 16777215 };
      case 'LONGTEXT': return { kind: 'text', base: 'longtext', size: null };
      case 'TINYBLOB': return { kind: 'blob', base: 'tinyblob', size: 255 };
      case 'BLOB': { size(false); return { kind: 'blob', base: 'blob', size: 65535 }; }
      case 'MEDIUMBLOB': return { kind: 'blob', base: 'mediumblob', size: 16777215 };
      case 'LONGBLOB': return { kind: 'blob', base: 'longblob', size: null };
      case 'DATE': return { kind: 'date', base: 'date' };
      case 'DATETIME': { size(false); return { kind: 'datetime', base: 'datetime' }; }
      case 'TIMESTAMP': { size(false); return { kind: 'datetime', base: 'timestamp' }; }
      case 'TIME': { size(false); return { kind: 'time', base: 'time' }; }
      case 'YEAR': { size(false); return { kind: 'year', base: 'year' }; }
      case 'ENUM': {
        this.expectOp('(');
        const values = [this.str()];
        while (this.eatOp(',')) values.push(this.str());
        this.expectOp(')');
        return { kind: 'enum', base: 'enum', values };
      }
      default: return this.unsupported(); // SET, JSON, BIT, spatial types …
    }
  }

  // column definition; column-level CHECK constraints are appended to `constraints`
  columnDef(constraints) {
    const name = this.name();
    const type = this.dataType();
    const col = { name, type, notNull: false, explicitNull: false, autoInc: false, def: undefined, primary: false, unique: false, onUpdateNow: false, comment: null };
    if (type.serial) { col.notNull = true; col.autoInc = true; col.unique = true; }
    for (;;) {
      if (this.eatWord('NOT')) { this.expectWord('NULL'); col.notNull = true; }
      else if (this.eatWord('NULL')) { col.notNull = false; col.explicitNull = true; }
      else if (this.eatWord('DEFAULT')) col.def = this.defaultValue();
      else if (this.eatWord('AUTO_INCREMENT')) col.autoInc = true;
      else if (this.eatWord('PRIMARY')) { this.expectWord('KEY'); col.primary = true; }
      else if (this.eatWord('KEY')) col.primary = true;
      else if (this.eatWord('UNIQUE')) { this.eatWord('KEY'); col.unique = true; }
      else if (this.eatWord('COMMENT')) col.comment = this.str();
      else if (this.eatWord('COLLATE')) this.name();
      else if (this.eatWord('CHARACTER')) { this.expectWord('SET'); this.name(); }
      else if (this.eatWord('CHARSET')) this.name();
      else if (this.eatWord('VISIBLE') || this.eatWord('INVISIBLE')) { /* ignored */ }
      else if (this.eatWord('ON')) { this.expectWord('UPDATE'); this.nowValue(); col.onUpdateNow = true; }
      else if (this.isWord('CONSTRAINT') || this.isWord('CHECK')) {
        let cname = null;
        if (this.eatWord('CONSTRAINT') && this.isName()) cname = this.name();
        this.expectWord('CHECK');
        constraints.push({ kind: 'check', name: cname, column: name, ...this.checkBody() });
      }
      else if (this.isWord('REFERENCES')) this.references(); // parsed but ignored, like MySQL
      else if (this.isWord('GENERATED') || this.isWord('AS')) this.unsupported();
      else if (this.eatWord('SERIAL')) { this.expectWord('DEFAULT'); this.expectWord('VALUE'); col.notNull = true; col.autoInc = true; col.unique = true; }
      else break;
    }
    return col;
  }
  nowValue() {
    const t = this.next();
    if (!t || t.t !== 'word' || !['CURRENT_TIMESTAMP', 'NOW', 'LOCALTIME', 'LOCALTIMESTAMP'].includes(t.u)) this.fail(t);
    if (this.eatOp('(')) { if (!this.isOp(')')) this.intLiteral(); this.expectOp(')'); }
  }
  defaultValue() {
    if (this.isAnyWord(['CURRENT_TIMESTAMP', 'NOW', 'LOCALTIME', 'LOCALTIMESTAMP'])) { this.nowValue(); return { now: true }; }
    if (this.isOp('(')) { this.i++; const e = this.expr(); this.expectOp(')'); if (e.k !== 'lit') this.unsupported(); return { value: e.v }; }
    const t = this.peek();
    const e = this.unaryExpr();
    if (e.k !== 'lit') this.fail(t);
    return { value: e.v, scale: e.scale };
  }

  drop() {
    this.expectWord('DROP');
    if (this.eatWord('DATABASE') || this.eatWord('SCHEMA')) {
      const ifExists = this.ifExists();
      const name = this.name();
      this.expectEnd();
      return { type: 'dropDb', name, ifExists };
    }
    if (this.eatWord('TEMPORARY')) this.unsupported();
    if (this.eatWord('TABLE') || this.eatWord('TABLES')) {
      const ifExists = this.ifExists();
      const tables = [this.qname()];
      while (this.eatOp(',')) tables.push(this.qname());
      this.eatWord('RESTRICT') || this.eatWord('CASCADE');
      this.expectEnd();
      return { type: 'dropTable', tables, ifExists };
    }
    if (this.eatWord('INDEX')) {
      const name = this.name();
      this.expectWord('ON');
      const table = this.qname();
      this.skipRest();
      return { type: 'alter', table, specs: [{ op: 'dropIndex', name }] };
    }
    return this.unsupported();
  }

  alter() {
    this.expectWord('ALTER');
    if (!this.eatWord('TABLE')) this.unsupported();
    const table = this.qname();
    const specs = [];
    do {
      if (this.atEnd()) break;
      specs.push(this.alterSpec());
    } while (this.eatOp(','));
    this.expectEnd();
    return { type: 'alter', table, specs };
  }

  position() {
    if (this.eatWord('FIRST')) return { first: true };
    if (this.eatWord('AFTER')) return { after: this.name() };
    return null;
  }

  alterSpec() {
    if (this.eatWord('ADD')) {
      const c = this.constraintDef();
      if (c) {
        if (c.kind === 'index') return { op: 'addIndex', unique: false, name: c.name, cols: c.cols };
        return { op: 'addConstraint', c };
      }
      this.eatWord('COLUMN');
      if (this.eatOp('(')) {
        const list = [];
        do { const cons = []; list.push({ col: this.columnDef(cons), cons }); } while (this.eatOp(','));
        this.expectOp(')');
        return { op: 'addColumns', list };
      }
      const cons = [];
      const col = this.columnDef(cons);
      return { op: 'addColumns', list: [{ col, cons, position: this.position() }] };
    }
    if (this.eatWord('DROP')) {
      if (this.eatWord('PRIMARY')) { this.expectWord('KEY'); return { op: 'dropPrimary' }; }
      if (this.eatWord('FOREIGN')) { this.expectWord('KEY'); return { op: 'dropForeign', name: this.name() }; }
      if (this.eatWord('CHECK')) return { op: 'dropCheck', name: this.name() };
      if (this.eatWord('CONSTRAINT')) return { op: 'dropConstraint', name: this.name() };
      if (this.eatWord('INDEX') || this.eatWord('KEY')) return { op: 'dropIndex', name: this.name() };
      this.eatWord('COLUMN');
      return { op: 'dropColumn', name: this.name() };
    }
    if (this.eatWord('MODIFY')) {
      this.eatWord('COLUMN');
      const cons = [];
      const col = this.columnDef(cons);
      return { op: 'change', from: col.name, col, cons, position: this.position() };
    }
    if (this.eatWord('CHANGE')) {
      this.eatWord('COLUMN');
      const from = this.name();
      const cons = [];
      const col = this.columnDef(cons);
      return { op: 'change', from, col, cons, position: this.position() };
    }
    if (this.eatWord('RENAME')) {
      if (this.eatWord('COLUMN')) { const from = this.name(); this.expectWord('TO'); return { op: 'renameColumn', from, to: this.name() }; }
      if (this.eatWord('INDEX') || this.eatWord('KEY')) { const from = this.name(); this.expectWord('TO'); return { op: 'renameIndex', from, to: this.name() }; }
      this.eatWord('TO') || this.eatWord('AS');
      return { op: 'rename', to: this.qname() };
    }
    if (this.eatWord('ALTER')) {
      this.eatWord('COLUMN');
      const name = this.name();
      if (this.eatWord('SET')) {
        if (this.eatWord('DEFAULT')) return { op: 'setDefault', name, def: this.defaultValue() };
        if (this.eatWord('VISIBLE') || this.eatWord('INVISIBLE')) return { op: 'noop' };
        this.fail();
      }
      this.expectWord('DROP');
      this.expectWord('DEFAULT');
      return { op: 'dropDefault', name };
    }
    if (this.isWord('DISABLE') || this.isWord('ENABLE')) { this.i++; this.expectWord('KEYS'); return { op: 'noop' }; }
    if (this.isAnyWord(['ENGINE', 'AUTO_INCREMENT', 'DEFAULT', 'CHARACTER', 'CHARSET', 'COLLATE', 'COMMENT', 'ROW_FORMAT', 'CONVERT'])) {
      if (this.eatWord('CONVERT')) { this.expectWord('TO'); }
      const opts = {};
      this.tableOptions(opts);
      return { op: 'options', opts };
    }
    return this.unsupported();
  }

  // ---------- utility statements ----------

  show() {
    this.expectWord('SHOW');
    const full = this.eatWord('FULL');
    const like = () => (this.eatWord('LIKE') ? this.str() : (this.isWord('WHERE') ? this.unsupported() : null));
    if (this.eatWord('TABLES')) {
      let db = null;
      if (this.eatWord('FROM') || this.eatWord('IN')) db = this.name();
      const pattern = like();
      this.expectEnd();
      return { type: 'showTables', db, pattern, full };
    }
    if (this.eatWord('DATABASES') || this.eatWord('SCHEMAS')) { const pattern = like(); this.expectEnd(); return { type: 'showDatabases', pattern }; }
    if (this.eatWord('COLUMNS') || this.eatWord('FIELDS')) {
      if (!this.eatWord('FROM')) this.expectWord('IN');
      const table = this.qname();
      if (this.eatWord('FROM') || this.eatWord('IN')) table.db = this.name();
      const pattern = like();
      this.expectEnd();
      return { type: 'describe', table, pattern, full };
    }
    if (this.eatWord('CREATE')) {
      if (this.eatWord('TABLE')) { const table = this.qname(); this.expectEnd(); return { type: 'showCreateTable', table }; }
      if (this.eatWord('DATABASE') || this.eatWord('SCHEMA')) { this.ifNotExists(); const name = this.name(); this.expectEnd(); return { type: 'showCreateDb', name }; }
      return this.unsupported();
    }
    if (this.eatWord('WARNINGS') || this.eatWord('ERRORS')) { this.skipRest(); return { type: 'showWarnings' }; }
    return this.unsupported();
  }

  describe() {
    this.next();
    if (this.isAnyWord(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FORMAT', 'ANALYZE', 'WITH', 'TABLE'])) this.unsupported();
    const table = this.qname();
    let pattern = null;
    if (!this.atEnd()) pattern = this.next().v;
    this.expectEnd();
    return { type: 'describe', table, pattern, exact: true };
  }

  set() {
    this.expectWord('SET');
    if (this.eatWord('NAMES')) {
      const cs = this.peek() && this.peek().t === 'str' ? this.str() : this.name();
      if (this.eatWord('COLLATE')) this.peek() && this.peek().t === 'str' ? this.str() : this.name();
      this.expectEnd();
      return { type: 'set', list: [{ sys: true, name: 'names', expr: { k: 'lit', v: cs } }] };
    }
    if (this.isAnyWord(['PASSWORD', 'ROLE', 'DEFAULT'])) this.unsupported();
    if (this.eatWord('CHARACTER') || this.eatWord('CHARSET') || this.eatWord('TRANSACTION')) { this.skipRest(); return { type: 'noop' }; }
    const list = [];
    do {
      if (this.isAnyWord(['GLOBAL', 'SESSION', 'LOCAL', 'PERSIST', 'PERSIST_ONLY'])) this.i++; // every scope acts on this session
      const t = this.next();
      let target;
      if (t && t.t === 'var') target = { sys: t.sys, name: t.v };
      else if (t && (t.t === 'word' || t.t === 'ident')) {
        let name = t.v;
        if (this.isOp('.')) { this.i++; name = this.name(true); }
        target = { sys: true, name: name.toLowerCase() };
      } else this.fail(t);
      if (!this.eatOp('=') && !this.eatOp(':=')) this.fail();
      let expr;
      if (target.sys && this.isAnyWord(['ON', 'OFF', 'DEFAULT']) && (this.isOp(',', 1) || this.peek(1) === undefined || this.isOp(';', 1))) {
        const w = this.next();
        expr = { k: 'lit', v: w.u, keyword: true };
      } else expr = this.expr();
      list.push({ ...target, expr });
    } while (this.eatOp(','));
    this.expectEnd();
    return { type: 'set', list };
  }
}

export function parse(sql, values) {
  const p = new Parser(sql, values);
  const ast = p.statement();
  ast.placeholders = p.pi;
  return ast;
}
