import { useState } from "react";
import DatabaseTable, { type Selection } from "./DatabaseTable";
import GlossaryText from "./GlossaryText";
import {
  bcnfFDs,
  candidateKeys,
  closureTrace,
  jobAttributes,
  jobFDs,
  jobOriginal,
  bcnfRelation,
  smallFDs,
  type Lang,
  type Relation,
} from "../../lib/int191/model";
export default function FDExplorer({ lang }: { lang: Lang }) {
  const [example, setExample] = useState("small");
  const [selection, setSelection] = useState<Selection>(null);
  const [seed, setSeed] = useState<string[]>(["A"]);
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState("");
  const [reveal, setReveal] = useState(false);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const fds =
    example === "job" ? jobFDs : example === "bcnf" ? bcnfFDs : smallFDs;
  const attrs =
    example === "job"
      ? jobAttributes
      : example === "bcnf"
        ? ["studentId", "courseId", "instructorId"]
        : ["A", "B", "C", "D"];
  const trace = closureTrace(seed, fds);
  const keys = candidateKeys(attrs, fds);
  const active = trace.steps.slice(0, step);
  const known = active.at(-1)?.closure ?? seed;
  const superkey = attrs.every((a) => trace.closure.includes(a));
  const minimal = keys.some(
    (k) => k.length === seed.length && k.every((a) => seed.includes(a)),
  );
  const sample: Relation =
    example === "job"
      ? jobOriginal
      : example === "bcnf"
        ? bcnfRelation
        : {
            name: "R(A,B,C,D)",
            columns: attrs.map((name) => ({ name, pk: name === "A" })),
            rows: [
              { A: "A1", B: "B1", C: "C1", D: "D1" },
              { A: "A2", B: "B1", C: "C1", D: "D2" },
              { A: "A3", B: "B2", C: "C2", D: "D3" },
            ],
          };
  const change = (value: string) => {
    setExample(value);
    setSeed([]);
    setStep(0);
    setReveal(false);
    setChosen("");
  };
  return (
    <section>
      <h2><GlossaryText text={t("Functional Dependency Explorer", "Functional dependency explorer")} lang={lang} /></h2>
      <p><GlossaryText lang={lang} text={t(
        "เลือก attributes ฝั่งตั้งต้น แล้วใช้เฉพาะ FD ที่รู้ค่าทางซ้ายครบ คำนวณจากกฎ ไม่เดาจากข้อมูลตัวอย่าง",
        "Select starting attributes. Apply only FDs whose entire left side is known. Compute from rules rather than guessing from sample records.",
      )} /></p>
      <label>
        {t("ตัวอย่าง", "Example")}{" "}
        <select value={example} onChange={(e) => change(e.target.value)}>
          <option value="small">A → B → C, A → D</option>
          <option value="job">JOB_SHEET</option>
          <option value="bcnf">ENROLMENT · 3NF ≠ BCNF</option>
        </select>
      </label>
      <fieldset>
        <legend>{t("เลือก X เพื่อหา X+", "Choose X to calculate X+")}</legend>
        <div className="db-chip-list">
          {attrs.map((a) => (
            <label key={a} className="db-check">
              <input
                type="checkbox"
                checked={seed.includes(a)}
                onChange={() => {
                  setSeed((s) =>
                    s.includes(a) ? s.filter((x) => x !== a) : [...s, a],
                  );
                  setStep(0);
                  setReveal(false);
                }}
              />
              {a}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="db-fd-list">
        {fds.map((fd) => (
          <button
            type="button"
            key={fd.id}
            aria-pressed={chosen === fd.id}
            data-active={active.some((s) => s.fd.id === fd.id)}
            onClick={() => setChosen(fd.id)}
          >
            <strong>{fd.id}</strong>{" "}
            <code>
              {fd.left.join(", ")} → {fd.right.join(", ")}
            </code>
            <span>
              {chosen === fd.id
                ? t(
                    "ทางซ้ายคือ determinant ไม่ได้แปลว่าลูกศรย้อนกลับได้",
                    "The left side is the determinant; the reverse FD does not follow.",
                  )
                : t("สำรวจ FD นี้", "Inspect this FD")}
            </span>
          </button>
        ))}
      </div>
      <div
        className="db-diagram-canvas"
        role="region"
        tabIndex={0}
        aria-label={t("เลื่อนแผนภาพ FD", "Scrollable FD diagram")}
      >
        <svg
          className="db-fd-svg"
          viewBox={`0 0 780 ${Math.max(140, fds.length * 70)}`}
          role="img"
          aria-label={fds
            .map((f) => f.left.join(",") + " determines " + f.right.join(","))
            .join("; ")}
        >
          {fds.map((f, i) => (
            <g key={f.id} data-active={active.some((s) => s.fd.id === f.id)}>
              <rect x="10" y={i * 70 + 10} width="235" height="46" rx="8" />
              <text x="128" y={i * 70 + 38} textAnchor="middle">
                {f.left.join(" + ")}
              </text>
              <path d={`M250,${i * 70 + 33} H300 l-8,-5 m8,5 l-8,5`} />
              <rect x="310" y={i * 70 + 10} width="460" height="46" rx="8" />
              <text x="540" y={i * 70 + 38} textAnchor="middle">
                {f.right.join(", ")}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <h3><GlossaryText text={t("Attribute Closure (X+)", "Attribute Closure (X+)")} lang={lang} /></h3>
      <p className="db-closure" aria-live="polite">
        <code>{`{${seed.join(", ")}}+ = {${known.join(", ")}}`}</code>
      </p>
      <ol className="db-trace">
        {active.map((s) => (
          <li key={s.fd.id}>
            <code>
              {s.fd.left.join(", ")} → {s.fd.right.join(", ")}
            </code>{" "}
            · {t("รู้ทางซ้ายครบ เพิ่ม", "Left side known; add")}{" "}
            <strong>{s.added.join(", ")}</strong> →{" "}
            <code>{`{${s.closure.join(", ")}}`}</code>
          </li>
        ))}
      </ol>
      <div className="db-toolbar">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          {t("ขั้นก่อน", "Previous")}
        </button>
        <button
          type="button"
          disabled={step >= trace.steps.length}
          onClick={() => setStep((s) => s + 1)}
        >
          {t("ใช้ FD ถัดไป", "Apply next FD")}
        </button>
        <button type="button" onClick={() => setStep(0)}>
          {t("เล่นซ้ำ", "Replay")}
        </button>
      </div>
      {step >= trace.steps.length && (
        <p role="status">
          <GlossaryText lang={lang} text={superkey
            ? minimal
              ? t(
                  "ครบทุก attribute และตัดตัวใดออกไม่ได้ จึงเป็น Candidate Key",
                  "All attributes reached and no selected attribute is removable: a candidate key.",
                )
              : t(
                  "เป็น Superkey แต่มี attribute เกิน ลองตัดออกแล้วคำนวณใหม่",
                  "A superkey with redundant attributes. Remove an attribute and recalculate.",
                )
            : t(
                "ยังไม่เป็น Superkey เพราะ closure ไม่ครบทุก attribute",
                "Not a superkey: the closure does not cover every attribute.",
              )} />
        </p>
      )}
      <h3>
        {t(
          "ข้อมูลตัวอย่างที่สอดคล้องกับ FD",
          "Sample records consistent with the FDs",
        )}
      </h3>
      <DatabaseTable
        relation={sample}
        lang={lang}
        selection={selection}
        onSelect={setSelection}
      />
      <p><GlossaryText lang={lang} text={t(
        "ข้อมูลชุดนี้ช่วยตรวจตัวอย่าง แต่การไม่พบแถวขัดแย้งไม่ใช่หลักฐานว่า FD เป็นจริงในทุกสถานะ",
        "These records illustrate the rules. Not finding a counterexample in a sample does not establish an FD for every valid instance.",
      )} /></p>
      <button
        type="button"
        aria-expanded={reveal}
        onClick={() => setReveal((r) => !r)}
      >
        {t("ตรวจ Candidate Keys ทั้งหมด", "Check all candidate keys")}
      </button>
      {reveal && (
        <div className="db-feedback">
          <p>{keys.map((k) => `{${k.join(", ")}}`).join(" · ")}</p>
          <p>
            <GlossaryText lang={lang} text={t(
              "แต่ละชุดมี closure ครบ relation และไม่มี proper subset ใดที่เป็น superkey ลองเลือกชุดที่ตัดออกหนึ่งตัวเพื่อพิสูจน์ด้วยตัวเอง",
              "Each set covers the relation, and none of its proper subsets is a superkey. Select a key minus one attribute to verify minimality yourself.",
            )} />
          </p>
        </div>
      )}
    </section>
  );
}
