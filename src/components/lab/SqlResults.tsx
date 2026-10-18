import type { SqlStatement } from "../../lib/int191/sql-types";

const oneLine = (sql: string) => {
  const s = sql.replace(/\s+/g, " ").trim();
  return s.length > 110 ? `${s.slice(0, 110)}…` : s;
};

function format(value: unknown, decimals?: number): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && decimals !== undefined && decimals > 0) return value.toFixed(decimals);
  return String(value);
}

/** ผลของสคริปต์ SQL ทีละคำสั่ง แบบแผง Output/Result ของ MySQL Workbench */
export default function SqlResults({ statements, lang = "th" }: { statements: SqlStatement[]; lang?: "th" | "en" }) {
  const t = (th: string, en: string) => lang === "th" ? th : en;
  if (statements.length === 0) return <p className="lab-empty">{t("(สคริปต์ว่าง — ยังไม่มีคำสั่งให้รัน)", "Empty script — no statements to run.")}</p>;
  return (
    <ol className="lab-sql">
      {statements.map((st, i) => (
        <li key={i} className="lab-sql__stmt" data-kind={st.kind}>
          <code className="lab-sql__text">{oneLine(st.sql)}</code>
          {st.kind === "rows" && (
            <>
              <div className="lab-sql__table-wrap">
                <table className="lab-sql__table">
                  <thead>
                    <tr>
                      {st.fields.map((f, c) => (
                        <th key={c} scope="col">
                          {f.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {st.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((v, c) => (
                          <td key={c} data-null={v === null ? "true" : undefined}>
                            {format(v, st.fields[c]?.decimals)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="lab-sql__meta">
                {st.rowCount > st.rows.length ? t(`แสดง ${st.rows.length} จาก ${st.rowCount} แถว`, `Showing ${st.rows.length} of ${st.rowCount} rows`) : t(`${st.rowCount} แถว`, `${st.rowCount} rows`)}
              </p>
            </>
          )}
          {st.kind === "ok" && (
            <p className="lab-sql__meta" data-tone="ok">
              {st.affectedRows ? `${st.affectedRows} row(s) affected` : "OK"}
              {st.info ? ` — ${st.info}` : ""}
            </p>
          )}
          {st.kind === "error" && (
            <p className="lab-sql__meta" data-tone="error">
              ERROR {st.error.errno} ({st.error.code}): {st.error.message}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
