// INSERT / UPDATE / DELETE with row-by-row constraint checks (CHECK, UNIQUE, FOREIGN KEY actions) like InnoDB.
// Every statement is atomic: Stmt keeps an undo journal and rolls back all touched tables on any error.
import { E, fkDetail } from './sql-errors.js';
import { isNull, truth, compare, famKey, coerce, isNumericKind, fmtDate, fmtDateTime, nowParts, sortCompare } from './sql-values.js';
import { Scope, makeSource, compileExpr, toStr } from './sql-expr.js';
import { compileSelect } from './sql-select.js';

const SEP = '\u0001';
export const DEFAULT = Symbol('DEFAULT');
const MAX_CASCADE_DEPTH = 15;

export class Stmt {
  constructor(x) {
    this.x = x;
    this.saved = new Map(); // table -> rows array before the statement
    this.copies = new Map(); // row -> original values
    this.deleted = new Set();
    this.indexes = new Map(); // table -> Map(signature -> index)
    this.checks = new Map();
    this.children = new Map();
  }
  touchTable(t) { if (!this.saved.has(t)) this.saved.set(t, t.rows.slice()); }
  touchRow(t, r) { this.touchTable(t); if (!this.copies.has(r)) this.copies.set(r, { ...r }); }
  rollback() {
    for (const [r, c] of this.copies) { for (const k of Object.keys(r)) if (!(k in c)) delete r[k]; Object.assign(r, c); }
    for (const [t, rows] of this.saved) t.rows = rows;
  }
  finish() {
    if (this.deleted.size) for (const t of this.saved.keys()) t.rows = t.rows.filter((r) => !this.deleted.has(r));
  }

  // hash index over live rows, built lazily and maintained while the statement runs
  index(t, cols) {
    let byTable = this.indexes.get(t);
    if (!byTable) this.indexes.set(t, (byTable = new Map()));
    const sig = cols.map((c) => c.toLowerCase()).join(SEP);
    let ix = byTable.get(sig);
    if (!ix) {
      const defs = cols.map((c) => t.columns.find((x) => x.key === c.toLowerCase()));
      if (defs.some((d) => !d)) return null;
      ix = { cols: defs.map((d) => d.name), fams: defs.map((d) => (isNumericKind(d.type.kind) ? 'n' : 's')), map: new Map() };
      for (const r of t.rows) if (!this.deleted.has(r)) ixAdd(ix, r);
      byTable.set(sig, ix);
    }
    return ix;
  }
  addRow(t, r) { const m = this.indexes.get(t); if (m) for (const ix of m.values()) ixAdd(ix, r); }
  removeRow(t, r) { const m = this.indexes.get(t); if (m) for (const ix of m.values()) ixRemove(ix, r); }
  lookup(t, cols, vals) {
    const ix = this.index(t, cols);
    if (!ix) return [];
    const k = keyVals(ix, vals);
    const hit = k !== null && ix.map.get(k);
    return hit ? [...hit] : [];
  }
  // foreign keys (in any table) that reference t
  childFks(t) {
    let list = this.children.get(t);
    if (!list) {
      list = [];
      for (const db of this.x.server.dbs.values()) for (const c of db.tables.values()) for (const fk of c.fks) {
        if (fk.refDb === t.db.name.toLowerCase() && fk.refKey === t.name.toLowerCase()) list.push({ child: c, fk });
      }
      this.children.set(t, list);
    }
    return list;
  }
  checksOf(t) {
    let list = this.checks.get(t);
    if (!list) {
      const env = rowEnv(this.x, t, null, 'field list');
      list = t.checks.filter((c) => c.enforced).map((c) => ({ name: c.name, ev: compileExpr(c.expr, env).ev }));
      this.checks.set(t, list);
    }
    return list;
  }
}

const keyVals = (ix, vals) => {
  let k = '';
  for (let i = 0; i < vals.length; i++) {
    if (isNull(vals[i])) return null;
    k += (i ? SEP : '') + famKey(vals[i], ix.fams[i]);
  }
  return k;
};
function ixAdd(ix, r) {
  const k = keyVals(ix, ix.cols.map((c) => r[c]));
  if (k === null) return;
  const set = ix.map.get(k);
  if (set) set.add(r); else ix.map.set(k, new Set([r]));
}
function ixRemove(ix, r) {
  const k = keyVals(ix, ix.cols.map((c) => r[c]));
  const set = k !== null && ix.map.get(k);
  if (set) set.delete(r);
}

// scope over one table (UPDATE / DELETE / CHECK / VALUES): the row is ctx.row[0]
export function rowEnv(x, table, alias, clause) {
  const cols = table.columns.map((c) => ({ name: c.name, key: c.key, type: c.et, col: c }));
  const src = makeSource(0, alias || table.name, table.db.name, table.name, cols, !!alias);
  src.table = table;
  return { scope: new Scope([src]), clause, agg: 'forbid', rt: x.rt, ctes: null };
}

export const colOf = (table, name, where) => {
  const c = table.columns.find((x) => x.key === String(name).toLowerCase());
  if (!c) throw E.badField(name, where);
  return c;
};

export function defaultOf(x, col) {
  if (col.def && col.def.now) return col.type.kind === 'date' ? fmtDate(nowParts(x.rt.now)) : fmtDateTime(nowParts(x.rt.now));
  return col.def ? col.def.value : null;
}

// ---------- row checks ----------

const parentTable = (x, fk) => { const db = x.server.dbs.get(fk.refDb); return db ? db.tables.get(fk.refKey) : undefined; };
const parentCols = (parent, fk) => fk.refCols.map((c) => { const d = parent.columns.find((x) => x.key === c.toLowerCase()); return d ? d.name : c; });

function checkParent(x, stmt, t, row, fk) {
  const vals = fk.cols.map((c) => row[c]);
  if (vals.some(isNull)) return;
  const parent = parentTable(x, fk);
  if (!parent || !stmt.lookup(parent, parentCols(parent, fk), vals).length) throw E.noParentRow(fkDetail(t.db.name, t.name, fk));
}

function checkUnique(stmt, t, row) {
  for (const key of t.keys) {
    const ix = stmt.index(t, key.cols);
    const k = keyVals(ix, key.cols.map((c) => row[c]));
    if (k === null) continue;
    const hits = ix.map.get(k);
    if (hits && [...hits].some((h) => h !== row)) {
      const vals = key.cols.map((c) => toStr(row[c], t.columns.find((d) => d.name === c).et)).join('-');
      throw E.dupEntry(vals, t.name, key.name);
    }
  }
}

function checkConstraints(stmt, t, row) {
  const ctx = { row: [row], group: null, item: null, outer: null };
  for (const c of stmt.checksOf(t)) if (truth(c.ev(ctx)) === 0) throw E.checkViolated(c.name);
}

// ---------- foreign key actions ----------

export function deleteRow(x, stmt, t, row, depth = 0) {
  if (stmt.deleted.has(row)) return;
  if (depth > MAX_CASCADE_DEPTH) throw E.fkCascadeDepth();
  stmt.touchTable(t);
  stmt.deleted.add(row);
  stmt.removeRow(t, row);
  if (!x.session.fkChecks()) return;
  for (const { child, fk } of stmt.childFks(t)) {
    const vals = parentCols(t, fk).map((c) => row[c]);
    if (vals.some(isNull)) continue;
    const kids = stmt.lookup(child, fk.cols, vals);
    if (!kids.length) continue;
    if (fk.onDelete === 'CASCADE') for (const k of kids) deleteRow(x, stmt, child, k, depth + 1);
    else if (fk.onDelete === 'SET NULL') {
      const nulls = Object.fromEntries(fk.cols.map((c) => [c, null]));
      for (const k of kids) cascadeUpdate(x, stmt, child, k, nulls, depth + 1, new Set([child]));
    } else throw E.rowReferenced(fkDetail(child.db.name, child.name, fk));
  }
}

function cascadeUpdate(x, stmt, t, row, changes, depth, chain) {
  if (depth > MAX_CASCADE_DEPTH) throw E.fkCascadeDepth();
  const before = { ...row };
  stmt.touchRow(t, row);
  stmt.removeRow(t, row);
  Object.assign(row, changes);
  checkUnique(stmt, t, row);
  stmt.addRow(t, row);
  parentKeyChanged(x, stmt, t, before, row, depth, chain);
}

// a referenced key changed: apply ON UPDATE of every child FK. InnoDB treats a cascade that
// comes back to a table already updated in this chain (e.g. self-referencing ON UPDATE CASCADE) as RESTRICT.
function parentKeyChanged(x, stmt, t, before, after, depth, chain) {
  if (!x.session.fkChecks()) return;
  for (const { child, fk } of stmt.childFks(t)) {
    const pc = parentCols(t, fk);
    if (pc.every((c) => compare(before[c], after[c]) === 0 || (isNull(before[c]) && isNull(after[c])))) continue;
    const vals = pc.map((c) => before[c]);
    if (vals.some(isNull)) continue;
    const kids = stmt.lookup(child, fk.cols, vals);
    if (!kids.length) continue;
    const act = fk.onUpdate;
    if ((act === 'CASCADE' || act === 'SET NULL') && !chain.has(child)) {
      const next = new Set(chain).add(child);
      const changes = Object.fromEntries(fk.cols.map((c, i) => [c, act === 'CASCADE' ? after[pc[i]] : null]));
      for (const k of kids) cascadeUpdate(x, stmt, child, k, changes, depth + 1, next);
    } else throw E.rowReferenced(fkDetail(child.db.name, child.name, fk));
  }
}

// ---------- INSERT ----------

// makers: one function per row returning Map(colKey -> value | DEFAULT)
export function insertRows(x, stmt, table, makers) {
  const noAutoZero = /NO_AUTO_VALUE_ON_ZERO/.test(x.session.sys.get('sql_mode'));
  const fkOn = x.session.fkChecks();
  let insertId = 0;
  let generated = 0;
  makers.forEach((make, idx) => {
    const rowNo = idx + 1;
    const given = make();
    const row = {};
    for (const col of table.columns) {
      let has = given.has(col.key);
      let v = has ? given.get(col.key) : undefined;
      if (v === DEFAULT) { has = false; v = undefined; }
      if (has && !isNull(v)) v = coerce(col, v, rowNo);
      if (col.autoInc && (isNull(v) || (v === 0 && !noAutoZero))) {
        v = table.nextId++;
        if (!generated) generated = v;
      } else if (!has) {
        if (col.def) v = defaultOf(x, col);
        else if (col.notNull) throw E.noDefault(col.name);
        else v = null;
      } else if (isNull(v)) {
        if (col.notNull) throw E.badNull(col.name);
        v = null;
      } else if (col.autoInc && v >= table.nextId) table.nextId = v + 1;
      row[col.name] = v;
      if (col.autoInc && !insertId) insertId = v;
    }
    checkConstraints(stmt, table, row);
    checkUnique(stmt, table, row);
    stmt.touchTable(table);
    table.rows.push(row);
    stmt.addRow(table, row);
    if (fkOn) for (const fk of table.fks) checkParent(x, stmt, table, row, fk);
  });
  if (generated) x.session.lastInsertId = generated;
  return insertId;
}

export function execInsert(x, ast) {
  const table = x.tableOf(ast.table);
  const cols = ast.set ? ast.set.map((a) => colOf(table, a.col, 'field list')) : ast.columns ? ast.columns.map((c) => colOf(table, c, 'field list')) : table.columns;
  const seen = new Set();
  for (const c of cols) { if (seen.has(c.key)) throw E.fieldTwice(c.name); seen.add(c.key); }
  const env = rowEnv(x, table, null, 'field list');
  const valuesMaker = (exprs) => {
    const compiled = exprs.map((e) => (e.k === 'default' ? null : compileExpr(e, env)));
    return () => {
      const partial = {};
      const ctx = { row: [partial], group: null, item: null, outer: null };
      const m = new Map();
      compiled.forEach((c, j) => {
        const v = c ? c.ev(ctx) : DEFAULT;
        m.set(cols[j].key, v);
        if (v !== DEFAULT) partial[cols[j].name] = v;
      });
      return m;
    };
  };
  let makers;
  let info = '';
  if (ast.set) makers = [valuesMaker(ast.set.map((a) => a.expr))];
  else if (ast.rows) {
    ast.rows.forEach((r, k) => { if (r.length !== cols.length && !(r.length === 0 && !ast.columns)) throw E.valueCount(k + 1); });
    makers = ast.rows.map((r) => (r.length ? valuesMaker(r) : () => new Map()));
    if (ast.rows.length > 1) info = `Records: ${ast.rows.length}  Duplicates: 0  Warnings: 0`;
  } else {
    const P = compileSelect(ast.select, { scope: null, ctes: null }, x.rt);
    if (P.fields.length !== cols.length) throw E.valueCount(1);
    const rows = P.run(null);
    makers = rows.map((vals) => () => new Map(cols.map((c, j) => [c.key, vals[j]])));
    info = `Records: ${rows.length}  Duplicates: 0  Warnings: 0`;
  }
  return x.dml((stmt) => {
    x.rt.strictDml = true;
    const insertId = insertRows(x, stmt, table, makers);
    return x.header(makers.length, { insertId, info });
  });
}

// ---------- UPDATE / DELETE ----------

function matchRows(x, table, env, ast) {
  x.rt.dmlTarget = table;
  const where = ast.where ? compileExpr(ast.where, { ...env, clause: 'where clause' }) : null;
  const order = ast.orderBy.map((o) => ({ c: compileExpr(o.expr, { ...env, clause: 'order clause' }), desc: o.desc }));
  return () => {
    const ctx = { row: null, group: null, item: null, outer: null };
    let rows = table.rows.filter((r) => { if (!where) return true; ctx.row = [r]; return truth(where.ev(ctx)) === 1; });
    if (order.length) {
      const keyed = rows.map((r) => { ctx.row = [r]; return { r, keys: order.map((o) => o.c.ev(ctx)) }; });
      keyed.sort((a, b) => { for (let i = 0; i < order.length; i++) { const c = sortCompare(a.keys[i], b.keys[i]); if (c) return order[i].desc ? -c : c; } return 0; });
      rows = keyed.map((k) => k.r);
    }
    if (ast.limit) rows = rows.slice(0, ast.limit.count);
    x.rt.dmlTarget = null;
    return rows;
  };
}

export function execUpdate(x, ast) {
  const table = x.tableOf(ast.table);
  const env = rowEnv(x, table, ast.alias, 'field list');
  const sets = ast.set.map((a) => {
    const col = colOf(table, a.col, 'field list');
    return { col, c: a.expr.k === 'default' ? null : compileExpr(a.expr, env) };
  });
  const match = matchRows(x, table, env, ast);
  const assigned = new Set(sets.map((s) => s.col.key));
  const autoNow = table.columns.filter((c) => c.onUpdateNow && !assigned.has(c.key));
  return x.dml((stmt) => {
    const rows = match();
    x.rt.strictDml = true;
    const fkOn = x.session.fkChecks();
    let changed = 0;
    const ctx = { row: null, group: null, item: null, outer: null };
    rows.forEach((row, idx) => {
      const rowNo = idx + 1;
      const before = { ...row };
      stmt.touchRow(table, row);
      stmt.removeRow(table, row);
      ctx.row = [row];
      for (const s of sets) { // left to right: later assignments see earlier ones (MySQL single-table UPDATE)
        const v = s.c ? s.c.ev(ctx) : defaultOf(x, s.col);
        if (isNull(v)) {
          if (s.col.notNull) throw E.badNull(s.col.name);
          row[s.col.name] = null;
        } else row[s.col.name] = coerce(s.col, v, rowNo);
      }
      const differs = () => table.columns.some((c) => row[c.name] !== before[c.name]);
      if (autoNow.length && differs()) for (const c of autoNow) row[c.name] = defaultOf(x, { ...c, def: { now: true } });
      if (!differs()) { stmt.addRow(table, row); return; }
      changed++;
      checkConstraints(stmt, table, row);
      checkUnique(stmt, table, row);
      stmt.addRow(table, row);
      if (fkOn) for (const fk of table.fks) if (fk.cols.some((c) => row[c] !== before[c])) checkParent(x, stmt, table, row, fk);
      parentKeyChanged(x, stmt, table, before, row, 0, new Set([table]));
    });
    return x.header(rows.length, { changedRows: changed, info: `Rows matched: ${rows.length}  Changed: ${changed}  Warnings: 0` });
  });
}

export function execDelete(x, ast) {
  const table = x.tableOf(ast.table);
  const env = rowEnv(x, table, ast.alias, 'where clause');
  const match = matchRows(x, table, env, ast);
  return x.dml((stmt) => {
    const rows = match();
    for (const row of rows) deleteRow(x, stmt, table, row);
    return x.header(rows.length);
  });
}
