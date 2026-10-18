import { useEffect, useRef, useState } from "react";
import { sqlExamples } from "../../lib/int191/sql-content";
import { studentTables, type Lang, type Row } from "../../lib/int191/model";
import type { SqlStatement } from "../../lib/int191/sql-types";
import SqlResults from "../lab/SqlResults";
import DatabaseTable, { type Selection } from "./DatabaseTable";
export default function SqlPlayground({ lang }: { lang: Lang }) {
  const [preset, setPreset] = useState(3);
  const [sql, setSQL] = useState(sqlExamples[3].sql);
  const [results, setResults] = useState<SqlStatement[]>([]);
  const [after, setAfter] = useState<Row[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const worker = useRef<Worker | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  function cleanup() {
    worker.current?.terminate();
    worker.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }
  useEffect(() => () => cleanup(), []);
  function run() {
    cleanup();
    setBusy(true);
    setError("");
    setResults([]);
    setHasRun(false);
    try {
      const w = new Worker(
        new URL("../../lib/int191/sql.worker.js", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      const fail = (message: string) => {
        cleanup();
        setBusy(false);
        setError(message);
      };
      timeout.current = setTimeout(
        () =>
          fail(
            t(
              "ใช้เวลานานเกิน 2 วินาที หยุด worker แล้ว ลอง query ที่เล็กลง",
              "Exceeded two seconds. Worker stopped. Try a smaller query.",
            ),
          ),
        2000,
      );
      w.onmessage = (e) => {
        if (!e.data.ok) {
          fail(String(e.data.error));
          return;
        }
        setResults(e.data.statements);
        setAfter(e.data.after);
        setHasRun(true);
        setBusy(false);
        cleanup();
      };
      w.onerror = () =>
        fail(
          t(
            "โหลด SQL worker ไม่สำเร็จ ลองรันอีกครั้ง",
            "Could not load the SQL worker. Try again.",
          ),
        );
      w.postMessage(sql);
    } catch {
      cleanup();
      setBusy(false);
      setError(
        t(
          "เบราว์เซอร์นี้เปิด Web Worker ไม่ได้",
          "Web Workers are unavailable in this browser.",
        ),
      );
    }
  }
  return (
    <section className="db-sql">
      <h2>{t("SQL Learning Playground", "SQL learning playground")}</h2>
      <p className="db-notice">
        {t(
          "Educational MySQL subset · ใช้ engine เดิมของเว็บใน Web Worker ไม่ใช่ MySQL server รองรับคำสั่งตัวอย่างด้านล่างและ syntax บางส่วน คำสั่งที่ไม่รองรับจะแจ้ง error ทุกรอบเริ่มจากข้อมูลใหม่ ไม่เชื่อม production และจำกัดผลลัพธ์ 100 แถว",
          "Educational MySQL subset · reuses the site’s existing engine in a Web Worker, not a MySQL server. Supports the examples below and a subset of syntax; unsupported syntax reports an error. Each run starts fresh, never contacts production, and displays at most 100 rows.",
        )}
      </p>
      <div className="db-paired-tables">
        {studentTables.map((r) => (
          <DatabaseTable
            key={r.name}
            relation={r}
            lang={lang}
            selection={selection}
            onSelect={setSelection}
          />
        ))}
      </div>
      <p className="db-feedback">
        {selection
          ? `${selection.column} = ${selection.value ?? "…"} · ${t("ค่าที่ match ถูกเน้นทั้งสองตาราง ดู departmentId ที่ ON ใช้จับคู่", "Matching values are highlighted in both tables. departmentId is the column used by ON.")}`
          : t(
              "คลิก D01 ใน STUDENT แล้วติดตาม D01 ที่ DEPARTMENT เพื่ออ่าน JOIN condition",
              "Click D01 in STUDENT and follow D01 in DEPARTMENT to understand the JOIN condition.",
            )}
      </p>
      <label>
        {t("ตัวอย่างคำสั่ง", "Example statement")}{" "}
        <select
          value={preset}
          onChange={(e) => {
            const n = Number(e.target.value);
            setPreset(n);
            setSQL(sqlExamples[n].sql);
            setHasRun(false);
            setResults([]);
          }}
        >
          {sqlExamples.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <p>{sqlExamples[preset].explanation[lang]}</p>
      <label>
        {t("SQL ที่จะทดลอง", "SQL to run")}
        <textarea
          className="db-sql-input"
          value={sql}
          onChange={(e) => setSQL(e.target.value)}
          maxLength={4000}
          rows={8}
          spellCheck={false}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              if (!busy) run();
            }
          }}
        />
      </label>
      <div className="db-toolbar">
        <button type="button" disabled={busy || !sql.trim()} onClick={run}>
          {busy ? t("กำลังรัน…", "Running…") : t("รัน SQL", "Run SQL")}
        </button>
        <button
          type="button"
          onClick={() => {
            cleanup();
            setBusy(false);
            setSQL(sqlExamples[preset].sql);
            setResults([]);
            setHasRun(false);
            setError("");
          }}
        >
          {t("คืนตัวอย่าง", "Reset example")}
        </button>
        <small>Ctrl / ⌘ + Enter</small>
      </div>
      {error && <p role="alert">{error}</p>}
      {hasRun && (
        <div aria-live="polite">
          <h3>{t("ผลลัพธ์ทีละคำสั่ง", "Statement results")}</h3>
          <SqlResults statements={results} lang={lang} />
          <h3>
            {t(
              "STUDENT หลังรัน เทียบกับข้อมูลต้นทางด้านบน",
              "STUDENT after execution; compare with the source above",
            )}
          </h3>
          <DatabaseTable
            relation={{
              ...studentTables[1],
              name: "STUDENT · after",
              rows: after,
            }}
            lang={lang}
            selection={selection}
            onSelect={setSelection}
          />
        </div>
      )}
    </section>
  );
}
