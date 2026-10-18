// MySQL value semantics over plain JS values: numbers (INT/DECIMAL/DOUBLE), strings (text, dates), null.
import { E } from './sql-errors.js';

export const isNull = (v) => v === null || v === undefined;

const NUM_PREFIX = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i;
// string -> number the way MySQL casts: numeric prefix, otherwise 0
export function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const m = NUM_PREFIX.exec(String(v));
  return m ? Number(m[0]) : 0;
}

// three-valued logic: 1 / 0 / null
export const truth = (v) => (isNull(v) ? null : toNumber(v) !== 0 ? 1 : 0);

// utf8mb4_0900_ai_ci: case- and accent-insensitive, NO PAD
const ASCII = /^[\x00-\x7f]*$/;
export const fold = (s) => (ASCII.test(s) ? s.toLowerCase() : s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());

export function compare(a, b) {
  if (isNull(a) || isNull(b)) return null;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number' || typeof b === 'number') {
    const x = toNumber(a);
    const y = toNumber(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  const x = fold(s);
  const y = fold(t);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ordering with NULL first (ORDER BY ASC, MIN/MAX skip nulls before calling this)
export const sortCompare = (a, b) => (isNull(a) ? (isNull(b) ? 0 : -1) : isNull(b) ? 1 : compare(a, b));

// hash key consistent with compare() for values of one family ('n' numeric, 's' string)
export const keyOf = (v) => (isNull(v) ? '\0' : typeof v === 'number' ? 'n' + v : 's' + fold(String(v)));
export const famKey = (v, fam) => (isNull(v) ? null : fam === 'n' ? 'n' + toNumber(v) : 's' + fold(String(v)));

// DECIMAL rounding: half away from zero, exact on the decimal representation
export function roundDecimal(v, d) {
  if (!Number.isFinite(v)) return v;
  const a = Math.abs(v);
  const s = String(a);
  const r = s.includes('e') ? Math.round(a * 10 ** d) / 10 ** d : Number(Math.round(Number(s + 'e' + d)) + 'e' + -d);
  return v < 0 && r !== 0 ? -r : r;
}
export function truncateDecimal(v, d) {
  const s = String(Math.abs(v));
  const r = s.includes('e') ? Math.trunc(Math.abs(v) * 10 ** d) / 10 ** d : Number(Math.trunc(Number(s + 'e' + d)) + 'e' + -d);
  return v < 0 && r !== 0 ? -r : r;
}

// number -> text as MySQL prints it (DECIMAL keeps its scale: 95.7 in a DECIMAL(10,2) is '95.70')
export function formatNumber(v, scale) {
  if (scale !== null && scale !== undefined && scale >= 0) return roundDecimal(v, scale).toFixed(scale);
  return String(v);
}

export function likeRegExp(pattern, esc = '\\') {
  let re = '';
  const p = fold(String(pattern));
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === esc && i + 1 < p.length) { re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    re += c === '%' ? '[\\s\\S]*' : c === '_' ? '[\\s\\S]' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'u');
}

// ---------- dates ----------

const pad = (n, w = 2) => String(n).padStart(w, '0');
const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

const DATE_RE = /^\s*(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,2})(?:(?:[T ]+)(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?)?\s*$/;
const COMPACT_RE = /^\s*(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?\s*$/;

// -> { y, m, d, h, i, s, time } or null when the text is not a valid date/datetime
export function parseDateTime(v) {
  if (v instanceof Date) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), h: v.getHours(), i: v.getMinutes(), s: v.getSeconds(), time: true };
  const str = String(v);
  const m = DATE_RE.exec(str) || COMPACT_RE.exec(str);
  if (!m) return null;
  let y = Number(m[1]);
  if (m[1].length <= 2) y += y < 70 ? 2000 : 1900;
  const r = { y, m: Number(m[2]), d: Number(m[3]), h: Number(m[4] || 0), i: Number(m[5] || 0), s: Number(m[6] || 0), time: m[4] !== undefined };
  if (r.m < 1 || r.m > 12 || r.d < 1 || r.d > daysInMonth(r.y, r.m) || r.h > 23 || r.i > 59 || r.s > 59) return null;
  return r;
}
export const fmtDate = (t) => `${pad(t.y, 4)}-${pad(t.m)}-${pad(t.d)}`;
export const fmtDateTime = (t) => `${fmtDate(t)} ${pad(t.h)}:${pad(t.i)}:${pad(t.s)}`;
export const nowParts = (d) => ({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), i: d.getMinutes(), s: d.getSeconds(), time: true });
// days since 0000-00-00 style ordinal (only differences are used)
export const dayNumber = (t) => Math.round(Date.UTC(t.y, t.m - 1, t.d) / 86400000);
export const fromDayNumber = (n) => { const d = new Date(n * 86400000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: 0, i: 0, s: 0 }; };

const TIME_RE = /^\s*(-)?(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?\s*$/;
export function parseTime(v) {
  const m = TIME_RE.exec(String(v));
  if (!m || Number(m[3]) > 59 || Number(m[4] || 0) > 59) return null;
  return `${m[1] || ''}${pad(m[2])}:${pad(m[3])}:${pad(m[4] || 0)}`;
}

// ---------- column types ----------

const INT_RANGE = {
  tinyint: [-128, 127, 255], smallint: [-32768, 32767, 65535], mediumint: [-8388608, 8388607, 16777215],
  int: [-2147483648, 2147483647, 4294967295], bigint: [-(2 ** 63), 2 ** 63 - 1, 2 ** 64 - 1],
};

// column type as DESCRIBE shows it (MySQL 8 drops integer display widths except tinyint(1))
export function typeText(type) {
  const uns = type.unsigned ? ' unsigned' : '';
  switch (type.kind) {
    case 'int': return `${type.base}${type.base === 'tinyint' && type.width === 1 ? '(1)' : ''}${uns}`;
    case 'dec': return `decimal(${type.precision},${type.scale})${uns}`;
    case 'dbl': return `${type.base}${type.precision != null && type.scale != null ? `(${type.precision},${type.scale})` : ''}${uns}`;
    case 'str': return `${type.base}(${type.size})`;
    case 'enum': return `enum(${type.values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`;
    default: return type.base;
  }
}

// expression type of a column: { t: 'int'|'dec'|'dbl'|'str'|'date'|'datetime'|'time', scale }
export function exprType(type) {
  switch (type.kind) {
    case 'int': case 'year': return { t: 'int' };
    case 'dec': return { t: 'dec', scale: type.scale };
    case 'dbl': return { t: 'dbl' };
    case 'date': return { t: 'date' };
    case 'datetime': return { t: 'datetime' };
    case 'time': return { t: 'time' };
    default: return { t: 'str', len: type.size ?? null };
  }
}
export const isNumericKind = (kind) => kind === 'int' || kind === 'dec' || kind === 'dbl' || kind === 'year';

const show = (v) => (v instanceof Date ? v.toISOString() : typeof v === 'object' && v !== null ? String(v) : String(v));

// value -> stored column value, raising MySQL's strict-mode errors; `mode` 'alter' reports truncation as 1265
export function coerce(col, v, rowNo, mode = 'dml') {
  if (isNull(v)) return null;
  const t = col.type;
  switch (t.kind) {
    case 'int': case 'year': {
      let n;
      if (typeof v === 'number') n = v;
      else if (typeof v === 'boolean') n = Number(v);
      else if (typeof v === 'object' && !(v instanceof Date)) throw E.wrongValue('integer', show(v), col.name, rowNo);
      else {
        const s = String(v).trim();
        const m = NUM_PREFIX.exec(s);
        if (!m) throw E.wrongValue('integer', show(v), col.name, rowNo);
        if (m[0].trim().length !== s.length) throw E.truncated(col.name, rowNo);
        n = Number(m[0]);
      }
      if (!Number.isFinite(n)) throw E.wrongValue('integer', show(v), col.name, rowNo);
      n = roundDecimal(n, 0);
      if (t.kind === 'year') {
        if (n > 0 && n < 70) n += 2000; else if (n >= 70 && n < 100) n += 1900;
        if (n !== 0 && (n < 1901 || n > 2155)) throw E.outOfRange(col.name, rowNo);
        return n;
      }
      const [lo, hi, uhi] = INT_RANGE[t.base] || INT_RANGE.int;
      if (t.unsigned ? n < 0 || n > uhi : n < lo || n > hi) throw E.outOfRange(col.name, rowNo);
      return n;
    }
    case 'dec': case 'dbl': {
      let n;
      if (typeof v === 'number') n = v;
      else if (typeof v === 'boolean') n = Number(v);
      else {
        const s = String(v).trim();
        const m = typeof v === 'object' && !(v instanceof Date) ? null : NUM_PREFIX.exec(s);
        if (!m) throw t.kind === 'dec' ? E.wrongValue('decimal', show(v), col.name, rowNo) : E.truncated(col.name, rowNo);
        if (m[0].trim().length !== s.length) throw E.truncated(col.name, rowNo);
        n = Number(m[0]);
      }
      if (!Number.isFinite(n)) throw E.outOfRange(col.name, rowNo);
      if (t.unsigned && n < 0) throw E.outOfRange(col.name, rowNo);
      if (t.kind === 'dec') {
        n = roundDecimal(n, t.scale);
        if (Math.abs(n) >= 10 ** (t.precision - t.scale)) throw E.outOfRange(col.name, rowNo);
      }
      return n;
    }
    case 'enum': {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= t.values.length) return t.values[v - 1];
      const s = fold(String(v).replace(/ +$/, ''));
      const hit = t.values.find((x) => fold(x.replace(/ +$/, '')) === s);
      if (hit === undefined) throw E.truncated(col.name, rowNo);
      return hit;
    }
    case 'date': case 'datetime': {
      const kind = t.kind === 'date' ? 'date' : 'datetime';
      const p = typeof v === 'number' ? parseDateTime(String(v)) : parseDateTime(v);
      if (!p) throw E.badDate(kind, show(v), col.name, rowNo);
      return t.kind === 'date' ? fmtDate(p) : fmtDateTime(p);
    }
    case 'time': {
      const s = parseTime(v);
      if (!s) throw E.badDate('time', show(v), col.name, rowNo);
      return s;
    }
    default: {
      let s = v instanceof Date ? v.toISOString() : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
      if (t.base === 'char') s = s.replace(/ +$/, '');
      if (t.size && [...s].length > t.size) throw mode === 'alter' ? E.truncated(col.name, rowNo) : E.tooLong(col.name, rowNo);
      return s;
    }
  }
}

// value MySQL fills in when a NOT NULL column is added to a table that already has rows
export function implicitDefault(col) {
  switch (col.type.kind) {
    case 'int': case 'dec': case 'dbl': case 'year': return 0;
    case 'enum': return col.type.values[0];
    case 'date': return '0000-00-00';
    case 'datetime': return '0000-00-00 00:00:00';
    case 'time': return '00:00:00';
    default: return '';
  }
}
