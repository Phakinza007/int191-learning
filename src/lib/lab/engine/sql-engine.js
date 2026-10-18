// A MySQL 8-faithful SQL engine over in-memory tables (see docs/plans/2026-09-24-plan-3-w4-database.md and
// docs/superpowers/specs/2026-09-26-labs-all-subjects-design.md). Layers: sql-parser (text -> AST),
// sql-expr (expressions), sql-select (queries), sql-dml (INSERT/UPDATE/DELETE + constraints), sql-ddl (schema).
//
// Accepted as no-ops (they return an OK header): SET NAMES / CHARACTER SET / TRANSACTION, LOCK/UNLOCK TABLES,
// ALTER TABLE … DISABLE/ENABLE KEYS and table options. sql_mode only switches ONLY_FULL_GROUP_BY,
// NO_AUTO_VALUE_ON_ZERO and division-by-zero errors; the engine always behaves as in strict mode otherwise.
// START TRANSACTION / COMMIT / ROLLBACK work on a whole-server snapshot (no isolation between sessions).
import { SqlError, E } from './sql-errors.js';
import { parse, splitStatements, expandVersioned } from './sql-parser.js';
import { compileSelect } from './sql-select.js';
import { compileExpr, Scope } from './sql-expr.js';
import { Stmt, execInsert, execUpdate, execDelete } from './sql-dml.js';
import { execCreateTable, execAlter, execDropTable, execTruncate, describe, showCreateTable } from './sql-ddl.js';
import { likeRegExp, fold, toNumber } from './sql-values.js';

export { SqlError, splitStatements };

const lower = (s) => String(s).toLowerCase();
const DEFAULT_SQL_MODE = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
const SYS_DEFAULTS = {
  foreign_key_checks: 1, unique_checks: 1, autocommit: 1, sql_notes: 1, sql_safe_updates: 0, sql_mode: DEFAULT_SQL_MODE,
  character_set_client: 'utf8mb4', character_set_connection: 'utf8mb4', character_set_results: 'utf8mb4', character_set_server: 'utf8mb4',
  character_set_database: 'utf8mb4', collation_connection: 'utf8mb4_0900_ai_ci', collation_server: 'utf8mb4_0900_ai_ci',
  collation_database: 'utf8mb4_0900_ai_ci', time_zone: 'SYSTEM', transaction_isolation: 'REPEATABLE-READ', group_concat_max_len: 1024,
  div_precision_increment: 4, max_allowed_packet: 67108864, auto_increment_increment: 1, auto_increment_offset: 1, lc_time_names: 'en_US',
  default_storage_engine: 'InnoDB', explicit_defaults_for_timestamp: 1, sql_log_bin: 1, innodb_strict_mode: 1, net_write_timeout: 60,
  wait_timeout: 28800, interactive_timeout: 28800, sql_quote_show_create: 1, information_schema_stats_expiry: 86400, big_tables: 0,
  version: '8.0.36', version_comment: 'MySQL Community Server - GPL (in-browser simulator)', hostname: 'localhost', port: 3306,
};
const BOOL_VARS = new Set(['foreign_key_checks', 'unique_checks', 'autocommit', 'sql_notes', 'sql_safe_updates', 'explicit_defaults_for_timestamp', 'sql_log_bin', 'innodb_strict_mode', 'sql_quote_show_create', 'big_tables']);
const READ_ONLY = new Set(['version', 'version_comment', 'hostname', 'port']);
const ALIASES = { tx_isolation: 'transaction_isolation', storage_engine: 'default_storage_engine' };

function header(affectedRows, extra = {}) {
  return { type: 'header', header: { fieldCount: 0, affectedRows, insertId: 0, info: '', serverStatus: 2, warningStatus: 0, changedRows: 0, ...extra } };
}

function rowsResult(names, rows) {
  return {
    type: 'rows',
    rows: rows.map((vals) => Object.fromEntries(names.map((n, i) => [n, vals[i]]))),
    fields: names.map((name) => ({ name, orgName: name, table: '', orgTable: '' })),
    values: rows,
  };
}

// field metadata in mysql2's spirit; `decimals` tells a client how to print DECIMAL values
function publicField(f) {
  const out = { name: f.name, orgName: f.orgName, table: f.table, orgTable: f.orgTable };
  if (f.type.t === 'dec') out.decimals = f.type.scale;
  return out;
}

function snapshot(server) {
  const saved = new Map();
  for (const db of server.dbs.values()) for (const t of db.tables.values()) saved.set(t, t.rows.map((r) => ({ ...r })));
  return saved;
}

function context(server, session, sql) {
  const rt = {
    sql, session, server, now: new Date(), strictDml: false, dmlTarget: null,
    divZero() { if (this.strictDml && session.strictDivision()) throw E.divByZero(); return null; },
    table: (ref) => x.tableOf(ref),
    sub: (ast, env, opts) => compileSelect(ast, { scope: env.scope, ctes: env.ctes, inDerived: env.inDerived }, rt, opts),
  };
  const x = {
    server, session, rt, header, rowsResult,
    dbOf(q) {
      const name = q.db ?? session.database;
      if (!name) throw E.noDb();
      const db = server.dbs.get(lower(name));
      if (!db) throw E.badDb(name);
      return db;
    },
    tableOf(q) {
      const db = x.dbOf(q);
      const t = db.tables.get(lower(q.name));
      if (!t) throw E.noTable(db.name, q.name);
      return t;
    },
    dml(fn) {
      if (!session.tx && session.sys.get('autocommit') === 0) session.tx = snapshot(server);
      const stmt = new Stmt(x);
      try {
        const r = fn(stmt);
        stmt.finish();
        return r;
      } catch (e) {
        stmt.rollback();
        throw e;
      }
    },
    implicitCommit() { session.tx = null; }, // DDL commits an open transaction, as in MySQL
    evalConst(expr) {
      const c = compileExpr(expr, { scope: new Scope([]), clause: 'field list', agg: 'forbid', rt, ctes: null });
      return c.ev({ row: [], group: null, item: null, outer: null });
    },
  };
  return x;
}

function execSet(x, ast) {
  const { session } = x;
  for (const a of ast.list) {
    if (!a.sys) { session.userVars.set(a.name, x.evalConst(a.expr) ?? null); continue; }
    if (a.name === 'names') {
      for (const n of ['character_set_client', 'character_set_connection', 'character_set_results']) session.sys.set(n, String(a.expr.v));
      continue;
    }
    const name = ALIASES[a.name] || a.name;
    if (!session.sys.has(name)) throw E.unknownSysVar(a.name);
    if (READ_ONLY.has(name)) throw E.readOnlyVar(name);
    let v = a.expr.keyword ? a.expr.v : x.evalConst(a.expr);
    if (v === 'DEFAULT' && a.expr.keyword) v = SYS_DEFAULTS[name];
    if (BOOL_VARS.has(name)) {
      const s = typeof v === 'string' ? v.toUpperCase() : v;
      if (s === 1 || s === 'ON' || s === '1' || s === 'TRUE') v = 1;
      else if (s === 0 || s === 'OFF' || s === '0' || s === 'FALSE') v = 0;
      else throw E.wrongVarValue(name, v);
      if (name === 'autocommit' && v === 1) session.tx = null;
    } else if (name === 'sql_mode') {
      if (v === null) throw E.wrongVarValue(name, 'NULL');
      v = String(v).toUpperCase().replace(/\s+/g, '');
    } else if (typeof SYS_DEFAULTS[name] === 'number') v = toNumber(v);
    session.sys.set(name, v);
  }
  return header(0);
}

function execTx(x, ast) {
  const { session, server } = x;
  if (ast.op === 'begin') session.tx = snapshot(server);
  else if (ast.op === 'commit') session.tx = null;
  else if (session.tx) {
    for (const [t, rows] of session.tx) t.rows = rows;
    session.tx = null;
  }
  return header(0);
}

function showTables(x, ast) {
  const db = ast.db ? x.dbOf({ db: ast.db }) : x.dbOf({ db: null });
  const re = ast.pattern != null ? likeRegExp(ast.pattern) : null;
  const names = [...db.tables.values()].map((t) => t.name).filter((n) => !re || re.test(fold(n))).sort((a, b) => (lower(a) < lower(b) ? -1 : 1));
  const col = `Tables_in_${db.name}`;
  return ast.full ? rowsResult([col, 'Table_type'], names.map((n) => [n, 'BASE TABLE'])) : rowsResult([col], names.map((n) => [n]));
}

function execute(server, session, sql, values) {
  const ast = parse(sql, values);
  if (ast.placeholders > values.length) throw E.wrongArgs();
  const x = context(server, session, sql);
  switch (ast.type) {
    case 'select': {
      const P = compileSelect(ast, { scope: null, ctes: null }, x.rt);
      const rows = P.run(null);
      const names = P.fields.map((f) => f.name);
      return {
        type: 'rows',
        rows: rows.map((vals) => { const o = {}; for (let i = 0; i < vals.length; i++) o[names[i]] = vals[i]; return o; }),
        fields: P.fields.map(publicField),
        values: rows,
      };
    }
    case 'insert': return execInsert(x, ast);
    case 'update': return execUpdate(x, ast);
    case 'delete': return execDelete(x, ast);
    case 'createDb': {
      if (server.dbs.has(lower(ast.name))) {
        if (ast.ifNot) return header(0);
        throw E.dbExists(ast.name);
      }
      x.implicitCommit();
      server.dbs.set(lower(ast.name), { name: ast.name, tables: new Map() });
      return header(1);
    }
    case 'dropDb': {
      const db = server.dbs.get(lower(ast.name));
      if (!db) {
        if (ast.ifExists) return header(0);
        throw E.dbDropMissing(ast.name);
      }
      x.implicitCommit();
      server.dbs.delete(lower(ast.name));
      for (const s of server.sessions) if (s.database && lower(s.database) === lower(db.name)) s.database = null;
      return header(db.tables.size);
    }
    case 'use': {
      const db = server.dbs.get(lower(ast.db));
      if (!db) throw E.badDb(ast.db);
      session.database = db.name;
      return header(0);
    }
    case 'createTable': return execCreateTable(x, ast);
    case 'dropTable': return execDropTable(x, ast);
    case 'alter': return execAlter(x, ast);
    case 'truncate': return execTruncate(x, ast);
    case 'describe': return describe(x, ast);
    case 'showCreateTable': return showCreateTable(x, ast);
    case 'showTables': return showTables(x, ast);
    case 'showDatabases': {
      const re = ast.pattern != null ? likeRegExp(ast.pattern) : null;
      const names = [...server.dbs.values()].map((d) => d.name).filter((n) => !re || re.test(fold(n))).sort((a, b) => (lower(a) < lower(b) ? -1 : 1));
      return rowsResult(['Database'], names.map((n) => [n]));
    }
    case 'showCreateDb': {
      const db = server.dbs.get(lower(ast.name));
      if (!db) throw E.badDb(ast.name);
      return rowsResult(['Database', 'Create Database'], [[db.name, `CREATE DATABASE \`${db.name}\` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */`]]);
    }
    case 'showWarnings': return rowsResult(['Level', 'Code', 'Message'], []);
    case 'set': return execSet(x, ast);
    case 'tx': return execTx(x, ast);
    case 'noop': return header(0);
    default: throw E.wrongArgs();
  }
}

// ---------- server / session ----------

export function createSqlServer({ seed } = {}) {
  let nextSession = 1;
  const server = {
    dbs: new Map(),
    sessions: new Set(),
    hasDatabase: (name) => server.dbs.has(lower(name)),
    connect({ database } = {}) {
      const session = {
        id: nextSession++, database: null, userVars: new Map(), sys: new Map(Object.entries(SYS_DEFAULTS)), tx: null, lastInsertId: 0, query: null,
        getSysVar(name) {
          const n = ALIASES[name] || name;
          if (!session.sys.has(n)) throw E.unknownSysVar(name);
          return session.sys.get(n);
        },
        fkChecks: () => session.sys.get('foreign_key_checks') === 1,
        onlyFullGroupBy: () => /(^|,)ONLY_FULL_GROUP_BY(,|$)/.test(session.sys.get('sql_mode')),
        strictDivision: () => { const m = session.sys.get('sql_mode'); return /STRICT_(TRANS|ALL)_TABLES/.test(m) && /ERROR_FOR_DIVISION_BY_ZERO/.test(m); },
      };
      if (database) {
        const db = server.dbs.get(lower(database));
        if (!db) throw E.badDb(database);
        session.database = db.name;
      }
      session.query = (sql, values) => {
        const vals = values === undefined ? [] : Array.isArray(values) ? values : [values];
        const text = expandVersioned(String(sql));
        try {
          return execute(server, session, text, vals);
        } catch (e) {
          if (e instanceof SqlError) e.sql = String(sql);
          throw e;
        }
      };
      server.sessions.add(session);
      return session;
    },
    runScript(script, session = server.connect({})) {
      return splitStatements(script).map((st) => session.query(st));
    },
  };
  if (seed) server.runScript(seed);
  return server;
}
