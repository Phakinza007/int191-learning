// CREATE / ALTER / DROP TABLE, TRUNCATE and the catalog views (DESCRIBE, SHOW CREATE TABLE).
// ALTER works on a draft copy of the table and only swaps it in after every change validated.
import { E, fkActions } from './sql-errors.js';
import { isNull, truth, coerce, typeText, exprType, implicitDefault, formatNumber, famKey, isNumericKind, likeRegExp, fold } from './sql-values.js';
import { compileExpr, CHECK_FORBIDDEN } from './sql-expr.js';
import { compileSelect } from './sql-select.js';
import { rowEnv, insertRows, defaultOf } from './sql-dml.js';

const q = (n) => '`' + String(n).replace(/`/g, '``') + '`';
const lower = (s) => String(s).toLowerCase();

// ---------- columns ----------

export function makeColumn(def) {
  const type = def.type;
  const col = {
    name: def.name, key: lower(def.name), type, notNull: !!(def.notNull || def.primary), autoInc: !!def.autoInc,
    def: undefined, onUpdateNow: !!def.onUpdateNow, comment: def.comment ?? null, et: exprType(type),
  };
  if (col.autoInc && type.kind !== 'int' && type.kind !== 'dbl') throw E.wrongColumnSpec(col.name);
  if (def.def) {
    const d = def.def;
    if (col.autoInc) throw E.invalidDefault(col.name);
    if ((type.kind === 'text' || type.kind === 'blob') && !(d.value === null && !d.now)) throw E.blobDefault(col.name);
    if (d.now) {
      if (type.kind !== 'datetime') throw E.invalidDefault(col.name);
      col.def = { now: true };
    } else if (d.value === null) {
      if (col.notNull) throw E.invalidDefault(col.name);
      col.def = { value: null };
    } else {
      try { col.def = { value: coerce(col, d.value, 1) }; } catch { throw E.invalidDefault(col.name); }
    }
  }
  if (col.onUpdateNow && type.kind !== 'datetime') throw E.invalidDefault(col.name);
  return col;
}

// ---------- drafts ----------

function newDraft(db, name) {
  return { name, db, columns: [], keys: [], indexes: [], fks: [], checks: [], rows: [], nextId: 1, comment: null, orig: null, newChecks: [], newFks: [] };
}

function cloneDraft(t) {
  return {
    name: t.name, db: t.db, orig: t, comment: t.comment, nextId: t.nextId,
    columns: t.columns.map((c) => ({ ...c, type: { ...c.type } })),
    keys: t.keys.map((k) => ({ ...k, cols: [...k.cols] })),
    indexes: t.indexes.map((k) => ({ ...k, cols: [...k.cols] })),
    fks: t.fks.map((f) => ({ ...f, cols: [...f.cols], refCols: [...f.refCols] })),
    checks: t.checks.map((c) => ({ ...c })),
    rows: t.rows.map((r) => ({ ...r })),
    newChecks: [], newFks: [],
  };
}

const findCol = (draft, name) => draft.columns.find((c) => c.key === lower(name));
const keyCol = (draft, name) => { const c = findCol(draft, name); if (!c) throw E.keyColumnMissing(name); return c.name; };
const allIndexes = (draft) => [...draft.keys, ...draft.indexes];
const indexNamed = (draft, name) => allIndexes(draft).find((k) => lower(k.name) === lower(name));
const covers = (index, cols) => cols.every((c, i) => index.cols[i] && lower(index.cols[i]) === lower(c));

function freshIndexName(draft, base) {
  if (lower(base) !== 'primary' && !indexNamed(draft, base)) return base;
  for (let n = 2; ; n++) if (!indexNamed(draft, `${base}_${n}`)) return `${base}_${n}`;
}
const nextNumber = (names, prefix) => {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i');
  return Math.max(0, ...names.map((n) => { const m = re.exec(n); return m ? Number(m[1]) : 0; })) + 1;
};

function addPrimary(draft, cols) {
  if (draft.keys.some((k) => k.primary)) throw E.multiplePk();
  const names = cols.map((c) => keyCol(draft, c));
  for (const n of names) findCol(draft, n).notNull = true;
  draft.keys.unshift({ name: 'PRIMARY', cols: names, primary: true });
}

function addUnique(draft, name, cols) {
  const names = cols.map((c) => keyCol(draft, c));
  if (name && indexNamed(draft, name)) throw E.dupKeyName(name);
  draft.keys.push({ name: name || freshIndexName(draft, names[0]), cols: names, primary: false });
}

function addIndex(draft, name, cols) {
  const names = cols.map((c) => keyCol(draft, c));
  if (name && indexNamed(draft, name)) throw E.dupKeyName(name);
  draft.indexes.push({ name: name || freshIndexName(draft, names[0]), cols: names });
}

function schemaNames(draft, pick) {
  const out = [];
  for (const t of draft.db.tables.values()) if (t !== draft.orig) out.push(...pick(t));
  out.push(...pick(draft));
  return out.map(lower);
}

function compatibleTypes(a, b) {
  const kind = (t) => (t.kind === 'text' ? 'str' : t.kind);
  if (kind(a) !== kind(b)) return false;
  if (a.kind === 'int') return a.base === b.base && !!a.unsigned === !!b.unsigned;
  if (a.kind === 'dec') return a.precision === b.precision && a.scale === b.scale;
  if (a.kind === 'dbl' || a.kind === 'datetime') return a.base === b.base;
  return true;
}

function addForeign(x, draft, c) {
  const name = c.name || `${draft.name}_ibfk_${nextNumber(draft.fks.map((f) => f.name), `${draft.name}_ibfk_`)}`;
  if (schemaNames(draft, (t) => t.fks.map((f) => f.name)).includes(lower(name))) throw E.fkDupName(name);
  const cols = c.cols.map((n) => keyCol(draft, n));
  const refDb = lower(c.ref.db || draft.db.name);
  const self = refDb === lower(draft.db.name) && lower(c.ref.name) === lower(draft.name);
  const pdb = x.server.dbs.get(refDb);
  const parent = self ? draft : pdb && pdb.tables.get(lower(c.ref.name));
  let refCols = c.refCols;
  let refName = c.ref.name;
  if (!parent) {
    if (x.session.fkChecks()) throw E.fkNoParent(c.ref.name);
  } else {
    refName = parent.name;
    refCols = c.refCols.map((rc) => { const pc = findCol(parent, rc); if (!pc) throw E.fkMissingColumn(rc, name, parent.name); return pc.name; });
    if (cols.length !== refCols.length) throw E.fkNoIndex(name, parent.name);
    if (!allIndexes(parent).some((ix) => covers(ix, refCols))) throw E.fkNoIndex(name, parent.name);
    cols.forEach((cn, i) => {
      if (!compatibleTypes(findCol(draft, cn).type, findCol(parent, refCols[i]).type)) throw E.fkIncompatible(cn, refCols[i], name);
    });
  }
  for (const cn of cols) {
    if (findCol(draft, cn).notNull && (c.onDelete === 'SET NULL' || c.onUpdate === 'SET NULL')) throw E.fkSetNullNotNull(cn, name);
  }
  const fk = { name, cols, refDb, refKey: lower(refName), refName, refCols, onDelete: c.onDelete, onUpdate: c.onUpdate };
  draft.fks.push(fk);
  draft.newFks.push(fk);
  // InnoDB needs an index on the referencing columns and creates one when none exists
  if (!allIndexes(draft).some((ix) => covers(ix, cols))) draft.indexes.push({ name: freshIndexName(draft, c.name || c.indexName || cols[0]), cols: [...cols] });
}

function addCheck(x, draft, c) {
  const name = c.name || `${draft.name}_chk_${nextNumber(draft.checks.map((k) => k.name), `${draft.name}_chk_`)}`;
  if (schemaNames(draft, (t) => t.checks.map((k) => k.name)).includes(lower(name))) throw E.checkDupName(name);
  const env = rowEnv(x, draft, null, 'check constraint');
  env.rt = { ...x.rt, sub: () => { throw E.checkSubquery(name); } };
  env.checkFn = (n) => {
    if (n.k === 'var') throw E.checkVariable(name);
    if (CHECK_FORBIDDEN.has(n.name)) throw E.checkFunction(name, lower(n.as));
  };
  env.onColumn = (col) => {
    if (c.column && col.col.column.key !== lower(c.column)) throw E.checkOtherColumn(name);
    if (col.col.column.col.autoInc) throw E.checkAutoInc(name);
  };
  try { compileExpr(c.expr, env); } catch (e) {
    const m = e.errno === 1054 && /Unknown column '(?:.*\.)?(.+?)'/.exec(e.sqlMessage);
    if (m) throw E.checkUnknownColumn(name, m[1]);
    throw e;
  }
  const check = { name, expr: c.expr, text: c.text, enforced: c.enforced, column: c.column || null };
  draft.checks.push(check);
  draft.newChecks.push(check);
}

function addConstraint(x, draft, c) {
  if (c.kind === 'primary') addPrimary(draft, c.cols);
  else if (c.kind === 'unique') addUnique(draft, c.name, c.cols);
  else if (c.kind === 'index') addIndex(draft, c.name, c.cols);
  else if (c.kind === 'foreign') addForeign(x, draft, c);
  else addCheck(x, draft, c);
}

function placeColumn(draft, col, position) {
  if (position && position.after) {
    const i = draft.columns.findIndex((c) => c.key === lower(position.after));
    if (i < 0) throw E.unknownColumnIn(position.after, draft.name);
    draft.columns.splice(i + 1, 0, col);
  } else if (position && position.first) draft.columns.unshift(col);
  else draft.columns.push(col);
}

function validateAutoInc(draft) {
  const autos = draft.columns.filter((c) => c.autoInc);
  if (autos.length > 1) throw E.wrongAutoKey();
  if (autos.length && !allIndexes(draft).some((ix) => lower(ix.cols[0]) === autos[0].key)) throw E.wrongAutoKey();
}

function toTable(draft) {
  return {
    name: draft.name, db: draft.db, columns: draft.columns, keys: draft.keys, indexes: draft.indexes,
    fks: draft.fks, checks: draft.checks, rows: draft.rows, nextId: draft.nextId, comment: draft.comment,
  };
}

// ---------- CREATE TABLE ----------

export function execCreateTable(x, ast) {
  const db = x.dbOf(ast.table);
  const key = lower(ast.table.name);
  if (db.tables.has(key)) {
    if (ast.ifNot) return x.header(0);
    throw E.tableExists(ast.table.name);
  }
  x.implicitCommit();
  let draft;
  if (ast.like) {
    const src = x.tableOf(ast.like);
    draft = cloneDraft(src);
    Object.assign(draft, { name: ast.table.name, orig: null, rows: [], fks: [], nextId: 1 });
    draft.checks = draft.checks.map((c) => ({ ...c, name: c.name.replace(new RegExp(`^${src.name}_chk_`, 'i'), `${ast.table.name}_chk_`) }));
  } else {
    draft = newDraft(db, ast.table.name);
    const pk = [];
    for (const def of ast.columns) {
      const col = makeColumn(def);
      if (findCol(draft, col.name)) throw E.dupFieldName(col.name);
      draft.columns.push(col);
      if (def.primary) pk.push(col.name);
    }
    if (pk.length > 1 || (pk.length && ast.constraints.some((c) => c.kind === 'primary'))) throw E.multiplePk();
    if (pk.length) addPrimary(draft, pk);
    for (const def of ast.columns) if (def.unique) addUnique(draft, null, [def.name]);
    const order = ['primary', 'unique', 'index', 'foreign', 'check'];
    for (const kind of order) for (const c of ast.constraints) if (c.kind === kind) addConstraint(x, draft, c);
    if (ast.options.autoIncrement) draft.nextId = ast.options.autoIncrement;
    draft.comment = ast.options.comment ?? null;
  }
  if (!ast.select) {
    validateAutoInc(draft);
    db.tables.set(key, toTable(draft));
    return x.header(0);
  }
  // CREATE TABLE … [AS] SELECT: extra result columns become new columns, then the rows are inserted
  const P = compileSelect(ast.select, { scope: null, ctes: null }, x.rt);
  const rows = P.run(null);
  P.fields.forEach((f, i) => {
    if (findCol(draft, f.name)) return;
    draft.columns.push(columnFromField(f, rows.map((r) => r[i])));
  });
  validateAutoInc(draft);
  const table = toTable(draft);
  db.tables.set(key, table);
  try {
    return x.dml((stmt) => {
      const makers = rows.map((vals) => () => new Map(P.fields.map((f, i) => [lower(f.name), vals[i]])));
      insertRows(x, stmt, table, makers);
      return x.header(rows.length, { info: `Records: ${rows.length}  Duplicates: 0  Warnings: 0` });
    });
  } catch (e) {
    db.tables.delete(key); // CREATE TABLE … SELECT is atomic
    throw e;
  }
}

function columnFromField(f, values) {
  if (f.column) {
    const c = f.column;
    return { ...c, type: { ...c.type }, name: f.name, key: lower(f.name), autoInc: false };
  }
  const t = f.type;
  let type;
  if (t.t === 'int') type = { kind: 'int', base: 'bigint', unsigned: false };
  else if (t.t === 'dec') type = { kind: 'dec', precision: Math.min(65, 20 + t.scale), scale: t.scale };
  else if (t.t === 'dbl') type = { kind: 'dbl', base: 'double' };
  else if (t.t === 'date') type = { kind: 'date', base: 'date' };
  else if (t.t === 'datetime') type = { kind: 'datetime', base: 'datetime' };
  else if (t.t === 'time') type = { kind: 'time', base: 'time' };
  else {
    const len = Math.max(t.len || 0, ...values.map((v) => (isNull(v) ? 0 : [...String(v)].length)));
    type = len > 16383 ? { kind: 'text', base: 'longtext', size: null } : { kind: 'str', base: 'varchar', size: Math.max(len, 1) };
  }
  return makeColumn({ name: f.name, type });
}

// ---------- ALTER TABLE ----------

export function execAlter(x, ast) {
  const table = x.tableOf(ast.table);
  x.implicitCommit();
  const draft = cloneDraft(table);
  const renames = new Map(); // old column key -> new name
  let newName = null;
  for (const spec of ast.specs) {
    switch (spec.op) {
      case 'addColumns':
        for (const { col: def, cons, position } of spec.list) {
          const col = makeColumn(def);
          if (findCol(draft, col.name)) throw E.dupFieldName(col.name);
          placeColumn(draft, col, position);
          for (const r of draft.rows) r[col.name] = col.autoInc ? draft.nextId++ : col.def ? defaultOf(x, col) : col.notNull ? implicitDefault(col) : null;
          if (def.primary) addPrimary(draft, [col.name]);
          if (def.unique) addUnique(draft, null, [col.name]);
          for (const c of cons) addCheck(x, draft, c);
        }
        break;
      case 'dropColumn': dropColumn(x, draft, spec.name); break;
      case 'change': changeColumn(x, draft, spec, renames); break;
      case 'renameColumn': {
        const col = findCol(draft, spec.from);
        if (!col) throw E.unknownColumnIn(spec.from, draft.name);
        renameColumn(draft, col, spec.to, renames);
        break;
      }
      case 'rename': {
        const db = x.dbOf(spec.to);
        if (db !== draft.db) throw E.noTable(db.name, spec.to.name);
        if (lower(spec.to.name) !== lower(draft.name) && db.tables.has(lower(spec.to.name))) throw E.tableExists(spec.to.name);
        renameTable(draft, spec.to.name);
        newName = spec.to.name;
        break;
      }
      case 'addConstraint': addConstraint(x, draft, spec.c); break;
      case 'addIndex': if (spec.unique) addUnique(draft, spec.name, spec.cols); else addIndex(draft, spec.name, spec.cols); break;
      case 'dropPrimary': dropPrimary(x, draft); break;
      case 'dropForeign': {
        const i = draft.fks.findIndex((f) => lower(f.name) === lower(spec.name));
        if (i < 0) throw E.cantDrop(spec.name);
        draft.fks.splice(i, 1);
        break;
      }
      case 'dropCheck': {
        const i = draft.checks.findIndex((c) => lower(c.name) === lower(spec.name));
        if (i < 0) throw E.checkMissing(spec.name);
        draft.checks.splice(i, 1);
        break;
      }
      case 'dropConstraint': {
        const n = lower(spec.name);
        const ci = draft.checks.findIndex((c) => lower(c.name) === n);
        const fi = draft.fks.findIndex((f) => lower(f.name) === n);
        if (ci >= 0) draft.checks.splice(ci, 1);
        else if (fi >= 0) draft.fks.splice(fi, 1);
        else if (n === 'primary' && draft.keys.some((k) => k.primary)) dropPrimary(x, draft);
        else if (draft.keys.some((k) => !k.primary && lower(k.name) === n)) dropIndex(x, draft, spec.name);
        else throw E.constraintMissing(spec.name);
        break;
      }
      case 'dropIndex': if (lower(spec.name) === 'primary') dropPrimary(x, draft); else dropIndex(x, draft, spec.name); break;
      case 'renameIndex': {
        const ix = indexNamed(draft, spec.from);
        if (!ix || ix.primary) throw E.keyMissing(spec.from, draft.name);
        if (indexNamed(draft, spec.to)) throw E.dupKeyName(spec.to);
        ix.name = spec.to;
        break;
      }
      case 'setDefault': case 'dropDefault': {
        const col = findCol(draft, spec.name);
        if (!col) throw E.unknownColumnIn(spec.name, draft.name);
        if (spec.op === 'dropDefault') col.def = undefined;
        else Object.assign(col, { def: makeColumn({ name: col.name, type: col.type, notNull: col.notNull, def: spec.def }).def });
        break;
      }
      case 'options':
        if (spec.opts.autoIncrement) draft.nextId = Math.max(spec.opts.autoIncrement, draft.nextId > 1 ? maxAuto(draft) + 1 : 1);
        if (spec.opts.comment !== undefined) draft.comment = spec.opts.comment;
        break;
      default: break;
    }
  }
  for (const k of draft.keys) if (k.primary) for (const c of k.cols) findCol(draft, c).notNull = true;
  validateAutoInc(draft);
  validateRows(x, draft);
  // commit: swap the draft in and fix references held by other tables
  const oldKey = lower(table.name);
  Object.assign(table, toTable(draft));
  for (const t of x.server.dbs.values()) for (const other of t.tables.values()) {
    for (const fk of other.fks) {
      if (fk.refDb !== lower(table.db.name) || fk.refKey !== oldKey) continue;
      fk.refCols = fk.refCols.map((c) => renames.get(lower(c)) || c);
      if (newName) { fk.refKey = lower(newName); fk.refName = newName; }
    }
  }
  if (newName) { table.db.tables.delete(oldKey); table.db.tables.set(lower(newName), table); }
  return x.header(0, { info: 'Records: 0  Duplicates: 0  Warnings: 0' });
}

const maxAuto = (draft) => { const c = draft.columns.find((x) => x.autoInc); return c ? Math.max(0, ...draft.rows.map((r) => r[c.name] || 0)) : 0; };

function referencedBy(x, draft) {
  const out = [];
  for (const db of x.server.dbs.values()) for (const t of db.tables.values()) {
    if (t === draft.orig) continue;
    for (const fk of t.fks) if (fk.refDb === lower(draft.db.name) && fk.refKey === lower(draft.orig ? draft.orig.name : draft.name)) out.push({ child: t, fk });
  }
  return out;
}

function checkUsesColumn(draft, col) {
  const uses = (n) => n && typeof n === 'object' && (n.k === 'col' ? lower(n.name) === col.key : Object.values(n).some((v) => (Array.isArray(v) ? v.some(uses) : uses(v))));
  const ch = draft.checks.find((c) => uses(c.expr));
  if (ch) throw E.checkUsesColumn(ch.name, col.name);
}

function dropColumn(x, draft, name) {
  const col = findCol(draft, name);
  if (!col) throw E.cantDrop(name);
  const own = draft.fks.find((f) => f.cols.some((c) => lower(c) === col.key));
  if (own) throw E.fkDropColumn(col.name, own.name);
  const ref = referencedBy(x, draft).find(({ fk }) => fk.refCols.some((c) => lower(c) === col.key));
  if (ref) throw E.fkDropRefColumn(col.name, ref.fk.name, ref.child.name);
  // MySQL 8: CHECK ที่อ้างถึงเฉพาะคอลัมน์ที่ถูกลบจะถูกลบตามไปด้วย ส่วน CHECK ที่อ้างคอลัมน์อื่นร่วมด้วยทำให้ลบไม่ได้ (3959)
  const refsOf = (n, acc = new Set()) => {
    if (n && typeof n === 'object') {
      if (n.k === 'col') acc.add(lower(n.name));
      else for (const v of Object.values(n)) (Array.isArray(v) ? v : [v]).forEach((y) => refsOf(y, acc));
    }
    return acc;
  };
  const onlyThis = draft.checks.filter((c) => { const r = refsOf(c.expr); return r.has(col.key) && r.size === 1; });
  draft.checks = draft.checks.filter((c) => !onlyThis.includes(c));
  checkUsesColumn(draft, col);
  if (draft.columns.length === 1) throw E.dropAllColumns();
  draft.columns = draft.columns.filter((c) => c !== col);
  for (const list of [draft.keys, draft.indexes]) {
    for (const k of list) k.cols = k.cols.filter((c) => lower(c) !== col.key);
  }
  draft.keys = draft.keys.filter((k) => k.cols.length);
  draft.indexes = draft.indexes.filter((k) => k.cols.length);
  for (const r of draft.rows) delete r[col.name];
}

function renameColumn(draft, col, to, renames) {
  if (lower(to) !== col.key && findCol(draft, to)) throw E.dupFieldName(to);
  if (lower(to) !== col.key || to !== col.name) {
    if (lower(to) !== col.key) checkUsesColumn(draft, col);
    const from = col.name;
    for (const r of draft.rows) { const v = r[from]; delete r[from]; r[to] = v; }
    const swap = (c) => (lower(c) === col.key ? to : c);
    for (const k of [...draft.keys, ...draft.indexes]) k.cols = k.cols.map(swap);
    for (const fk of draft.fks) {
      fk.cols = fk.cols.map(swap);
      if (fk.refDb === lower(draft.db.name) && fk.refKey === lower(draft.name)) fk.refCols = fk.refCols.map(swap);
    }
    renames.set(col.key, to);
    col.name = to;
    col.key = lower(to);
  }
}

function changeColumn(x, draft, spec, renames) {
  const old = findCol(draft, spec.from);
  if (!old) throw E.unknownColumnIn(spec.from, draft.name);
  const col = makeColumn(spec.col);
  if (col.key !== old.key && findCol(draft, col.name)) throw E.dupFieldName(col.name);
  const inPk = draft.keys.some((k) => k.primary && k.cols.some((c) => lower(c) === old.key));
  if (inPk) col.notNull = true;
  renameColumn(draft, old, col.name, renames);
  for (const fk of draft.fks) {
    if (col.notNull && fk.cols.some((c) => lower(c) === col.key) && (fk.onDelete === 'SET NULL' || fk.onUpdate === 'SET NULL')) throw E.fkSetNullNotNull(col.name, fk.name);
  }
  // เปลี่ยนชนิดของคอลัมน์ที่อยู่ใน foreign key ต้องยังเข้ากันกับอีกฝั่ง (MySQL ตอบ 3780)
  for (const fk of draft.fks) {
    const i = fk.cols.findIndex((c) => lower(c) === col.key);
    if (i === -1) continue;
    const parent = fk.refKey === lower(draft.name) && fk.refDb === lower(draft.db.name) ? draft : x.server.dbs.get(fk.refDb)?.tables.get(fk.refKey);
    const pc = parent && findCol(parent, fk.refCols[i]);
    if (pc && !compatibleTypes(col.type, pc.type)) throw E.fkIncompatible(col.name, pc.name, fk.name);
  }
  for (const { child, fk } of referencedBy(x, draft)) {
    const i = fk.refCols.findIndex((c) => lower(c) === old.key);
    if (i === -1) continue;
    const cc = findCol(child, fk.cols[i]);
    if (cc && !compatibleTypes(cc.type, col.type)) throw E.fkIncompatible(cc.name, col.name, fk.name);
  }
  draft.rows.forEach((r, i) => {
    const v = r[col.name];
    if (isNull(v)) { if (col.notNull) throw E.invalidNull(); r[col.name] = null; } else r[col.name] = coerce(col, v, i + 1, 'alter');
  });
  const idx = draft.columns.indexOf(old);
  draft.columns.splice(idx, 1);
  if (spec.position) placeColumn(draft, col, spec.position); else draft.columns.splice(idx, 0, col);
  if (spec.col.primary) addPrimary(draft, [col.name]);
  if (spec.col.unique) addUnique(draft, null, [col.name]);
  for (const c of spec.cons) addCheck(x, draft, c);
}

function renameTable(draft, to) {
  const from = draft.name;
  const re = (suffix) => new RegExp(`^${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(${suffix}\\d+)$`, 'i');
  for (const fk of draft.fks) {
    fk.name = fk.name.replace(re('_ibfk_'), `${to}$1`);
    if (fk.refDb === lower(draft.db.name) && fk.refKey === lower(from)) { fk.refKey = lower(to); fk.refName = to; }
  }
  for (const c of draft.checks) c.name = c.name.replace(re('_chk_'), `${to}$1`);
  draft.name = to;
}

function needsIndex(x, draft, removed) {
  const rest = allIndexes(draft).filter((k) => k !== removed);
  for (const fk of draft.fks) if (covers(removed, fk.cols) && !rest.some((k) => covers(k, fk.cols))) return true;
  for (const { fk } of referencedBy(x, draft)) if (covers(removed, fk.refCols) && !rest.some((k) => covers(k, fk.refCols))) return true;
  return false;
}

function dropPrimary(x, draft) {
  const pk = draft.keys.find((k) => k.primary);
  if (!pk) throw E.cantDrop('PRIMARY');
  if (needsIndex(x, draft, pk)) throw E.fkDropIndex('PRIMARY');
  draft.keys = draft.keys.filter((k) => k !== pk);
}

function dropIndex(x, draft, name) {
  const ix = allIndexes(draft).find((k) => !k.primary && lower(k.name) === lower(name));
  if (!ix) throw E.cantDrop(name);
  if (needsIndex(x, draft, ix)) throw E.fkDropIndex(ix.name);
  draft.keys = draft.keys.filter((k) => k !== ix);
  draft.indexes = draft.indexes.filter((k) => k !== ix);
}

// existing rows must satisfy the new definition (MySQL copies them into the new table)
function validateRows(x, draft) {
  for (const col of draft.columns) if (col.notNull && draft.rows.some((r) => isNull(r[col.name]))) throw E.invalidNull();
  for (const key of draft.keys) {
    const seen = new Set();
    for (const r of draft.rows) {
      const vals = key.cols.map((c) => r[c]);
      if (vals.some(isNull)) continue;
      const cols = key.cols.map((c) => findCol(draft, c));
      const k = vals.map((v, i) => famKey(v, isNumericKind(cols[i].type.kind) ? 'n' : 's')).join('\u0001');
      if (seen.has(k)) throw E.dupEntry(vals.map((v, i) => valueText(v, cols[i])).join('-'), draft.name, key.name);
      seen.add(k);
    }
  }
  if (draft.newChecks.length) {
    const env = rowEnv(x, draft, null, 'check constraint');
    const ctx = { row: null, group: null, item: null, outer: null };
    for (const ch of draft.newChecks) {
      if (!ch.enforced) continue;
      const ev = compileExpr(ch.expr, env).ev;
      for (const r of draft.rows) { ctx.row = [r]; if (truth(ev(ctx)) === 0) throw E.checkViolated(ch.name); }
    }
  }
  if (draft.newFks.length && x.session.fkChecks()) {
    for (const fk of draft.newFks) {
      const pdb = x.server.dbs.get(fk.refDb);
      const self = fk.refDb === lower(draft.db.name) && fk.refKey === lower(draft.name);
      const parent = self ? draft : pdb && pdb.tables.get(fk.refKey);
      const keyOfRow = (r, cols) => cols.map((c, i) => famKey(r[c], isNumericKind(findCol(parent, fk.refCols[i]).type.kind) ? 'n' : 's')).join('\u0001');
      const have = new Set(parent.rows.map((r) => keyOfRow(r, fk.refCols)));
      for (const r of draft.rows) {
        if (fk.cols.some((c) => isNull(r[c]))) continue;
        if (!have.has(keyOfRow(r, fk.cols))) throw E.noParentRow(fkDetailFor(draft, fk));
      }
    }
  }
}
const valueText = (v, col) => (typeof v === 'number' ? formatNumber(v, col.type.kind === 'dec' ? col.type.scale : null) : String(v));
const fkDetailFor = (draft, fk) => `(${q(draft.db.name)}.${q(draft.name)}, CONSTRAINT ${q(fk.name)} FOREIGN KEY (${fk.cols.map(q).join(', ')}) REFERENCES ${q(fk.refName)} (${fk.refCols.map(q).join(', ')})${fkActions(fk)})`;

// ---------- DROP / TRUNCATE ----------

export function execDropTable(x, ast) {
  const targets = ast.tables.map((t) => { const db = x.dbOf(t); return { t, db, table: db.tables.get(lower(t.name)) }; });
  const missing = targets.filter((d) => !d.table);
  if (missing.length && !ast.ifExists) throw E.badTable(missing.map((d) => `${d.db.name}.${d.t.name}`).join(','));
  const dropping = new Set(targets.filter((d) => d.table).map((d) => d.table));
  x.implicitCommit();
  if (x.session.fkChecks()) {
    for (const table of dropping) {
      for (const db of x.server.dbs.values()) for (const child of db.tables.values()) {
        if (dropping.has(child)) continue;
        const fk = child.fks.find((f) => f.refDb === lower(table.db.name) && f.refKey === lower(table.name));
        if (fk) throw E.fkDropParent(table.name, fk.name, child.name);
      }
    }
  }
  for (const table of dropping) table.db.tables.delete(lower(table.name));
  return x.header(0);
}

export function execTruncate(x, ast) {
  const table = x.tableOf(ast.table);
  x.implicitCommit();
  if (x.session.fkChecks()) {
    for (const db of x.server.dbs.values()) for (const child of db.tables.values()) {
      if (child === table) continue;
      const fk = child.fks.find((f) => f.refDb === lower(table.db.name) && f.refKey === lower(table.name));
      if (fk) {
        throw E.truncateReferenced(`(${q(child.db.name)}.${q(child.name)}, CONSTRAINT ${q(fk.name)} FOREIGN KEY (${fk.cols.map(q).join(', ')}) REFERENCES ${q(table.db.name)}.${q(fk.refName)} (${fk.refCols.map(q).join(', ')}))`);
      }
    }
  }
  table.rows = [];
  table.nextId = 1;
  return x.header(0);
}

// ---------- DESCRIBE / SHOW CREATE TABLE ----------

function keyFlag(table, col) {
  const pk = table.keys.find((k) => k.primary);
  if (pk && pk.cols.some((c) => lower(c) === col.key)) return 'PRI';
  const uni = table.keys.find((k) => !k.primary && k.cols.length === 1 && lower(k.cols[0]) === col.key);
  if (uni) return !pk && col.notNull && table.keys.filter((k) => !k.primary && k.cols.length === 1).find((k) => findColumn(table, k.cols[0]).notNull) === uni ? 'PRI' : 'UNI';
  if ([...table.keys, ...table.indexes].some((k) => lower(k.cols[0]) === col.key)) return 'MUL';
  return '';
}
const findColumn = (table, name) => table.columns.find((c) => c.key === lower(name));
const defaultText = (col) => {
  if (!col.def) return null;
  if (col.def.now) return 'CURRENT_TIMESTAMP';
  const v = col.def.value;
  return v === null ? null : typeof v === 'number' ? formatNumber(v, col.type.kind === 'dec' ? col.type.scale : null) : String(v);
};
const extraText = (col) => {
  if (col.autoInc) return 'auto_increment';
  const parts = [];
  if (col.def && col.def.now) parts.push('DEFAULT_GENERATED');
  if (col.onUpdateNow) parts.push('on update CURRENT_TIMESTAMP');
  return parts.join(' ');
};

export function describe(x, ast) {
  const table = x.tableOf(ast.table);
  let cols = table.columns;
  if (ast.pattern != null) { const re = likeRegExp(ast.pattern); cols = cols.filter((c) => re.test(fold(c.name))); }
  const names = ['Field', 'Type', 'Null', 'Key', 'Default', 'Extra'];
  return x.rowsResult(names, cols.map((c) => [c.name, typeText(c.type), c.notNull ? 'NO' : 'YES', keyFlag(table, c), defaultText(c), extraText(c)]));
}

const sqlString = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

function columnLine(col) {
  let s = `  ${q(col.name)} ${typeText(col.type)}`;
  if (col.notNull) s += ' NOT NULL';
  if (col.autoInc) s += ' AUTO_INCREMENT';
  else if (col.def) s += col.def.now ? ' DEFAULT CURRENT_TIMESTAMP' : col.def.value === null ? ' DEFAULT NULL' : ` DEFAULT ${sqlString(defaultText(col))}`;
  else if (!col.notNull && col.type.kind !== 'text' && col.type.kind !== 'blob') s += ' DEFAULT NULL';
  if (col.onUpdateNow) s += ' ON UPDATE CURRENT_TIMESTAMP';
  if (col.comment) s += ` COMMENT ${sqlString(col.comment)}`;
  return s;
}

// CHECK expressions printed the way MySQL normalises them: fully parenthesised, backticked columns
export function printExpr(n) {
  switch (n.k) {
    case 'lit': return n.v === null ? 'NULL' : typeof n.v === 'number' ? String(n.v) : `_utf8mb4${sqlString(n.v)}`;
    case 'col': return [n.table, n.name].filter(Boolean).map(q).join('.');
    case 'neg': return `-(${printExpr(n.a)})`;
    case 'not': return `(not(${printExpr(n.a)}))`;
    case 'bin': return `(${printExpr(n.a)} ${n.op === 'div' ? 'DIV' : n.op} ${printExpr(n.b)})`;
    case 'is': return `(${printExpr(n.a)} is ${n.neg ? 'not ' : ''}${n.what})`;
    case 'in': return `(${printExpr(n.a)} ${n.neg ? 'not in' : 'in'} (${(n.list || []).map(printExpr).join(',')}))`;
    case 'like': return `(${printExpr(n.a)} ${n.neg ? 'not like' : 'like'} ${printExpr(n.b)})`;
    case 'regexp': return `regexp_like(${printExpr(n.a)},${printExpr(n.b)})`;
    case 'between': return `(${printExpr(n.a)} ${n.neg ? 'not between' : 'between'} ${printExpr(n.lo)} and ${printExpr(n.hi)})`;
    case 'fn': return `${lower(n.name)}(${n.args.map(printExpr).join(',')})`;
    case 'case': return `(case ${n.base ? printExpr(n.base) + ' ' : ''}${n.whens.map((w) => `when ${printExpr(w.w)} then ${printExpr(w.t)}`).join(' ')}${n.otherwise ? ' else ' + printExpr(n.otherwise) : ''} end)`;
    default: return '?';
  }
}

export function showCreateTable(x, ast) {
  const t = x.tableOf(ast.table);
  const lines = t.columns.map(columnLine);
  const keyCols = (k) => k.cols.map(q).join(',');
  for (const k of t.keys) lines.push(k.primary ? `  PRIMARY KEY (${keyCols(k)})` : `  UNIQUE KEY ${q(k.name)} (${keyCols(k)})`);
  for (const k of t.indexes) lines.push(`  KEY ${q(k.name)} (${keyCols(k)})`);
  const byName = (a, b) => (lower(a.name) < lower(b.name) ? -1 : 1);
  for (const fk of [...t.fks].sort(byName)) {
    lines.push(`  CONSTRAINT ${q(fk.name)} FOREIGN KEY (${fk.cols.map(q).join(', ')}) REFERENCES ${q(fk.refName)} (${fk.refCols.map(q).join(', ')})${fkActions(fk)}`);
  }
  for (const c of [...t.checks].sort(byName)) lines.push(`  CONSTRAINT ${q(c.name)} CHECK (${printExpr(c.expr)})${c.enforced ? '' : ' /*!80016 NOT ENFORCED */'}`);
  const auto = t.columns.some((c) => c.autoInc) && t.nextId > 1 ? ` AUTO_INCREMENT=${t.nextId}` : '';
  const comment = t.comment ? ` COMMENT=${sqlString(t.comment)}` : '';
  const ddl = `CREATE TABLE ${q(t.name)} (\n${lines.join(',\n')}\n) ENGINE=InnoDB${auto} DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci${comment}`;
  return x.rowsResult(['Table', 'Create Table'], [[t.name, ddl]]);
}
