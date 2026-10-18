export type SqlStatement =
 | { kind: "rows"; sql: string; fields: { name: string; decimals?: number }[]; rows: unknown[][]; rowCount: number }
 | { kind: "ok"; sql: string; affectedRows: number; info: string }
 | { kind: "error"; sql: string; error: { errno: number; code: string; message: string } };
