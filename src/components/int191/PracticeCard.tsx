import { useState } from "react";
import { checkAnswer, type Question } from "../../lib/int191/practice";
import { studentTables, type Lang } from "../../lib/int191/model";
import SchemaDiagram from "./SchemaDiagram";
import GlossaryText from "./GlossaryText";
export default function PracticeCard({
  question: q,
  lang,
  onAnswer,
  disabled = false,
}: {
  question: Question;
  lang: Lang;
  onAnswer: (correct: boolean, revealed: boolean) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [hints, setHints] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  function check() {
    const values =
      q.format === "text" ? text.replace(/[{}]/g, "").split(",") : selected;
    const ok = checkAnswer(q, values);
    setCorrect(ok);
    setWrong(!ok);
    if (!ok) setHints((h) => Math.min(3, h + 1));
    onAnswer(ok, revealed);
  }
  return (
    <section
      className="db-question"
      aria-label={t("แบบฝึก", "Practice question")}
    >
      <h3><GlossaryText text={q.prompt[lang]} lang={lang} /></h3>
      <p>
        {t("ระดับ", "Level")} {q.difficulty}/4 · {q.format}
      </p>
      {q.format === "diagram" ? (
        <>
          <SchemaDiagram
            relations={studentTables}
            lang={lang}
            onPick={(name) => {
              if (!correct && !disabled) setSelected([name]);
            }}
          />
          <p>
            {t("Entity ที่เลือก", "Selected entity")}:{" "}
            <strong>{selected[0] ?? "—"}</strong>
          </p>
        </>
      ) : q.format === "text" ? (
        <label>
          {t(
            "คำตอบ ใช้ comma คั่น attributes",
            "Answer, comma-separated attributes",
          )}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || correct}
            placeholder="A, B, …"
            autoComplete="off"
          />
        </label>
      ) : (
        <fieldset disabled={disabled || correct}>
          <legend>
            {q.format === "columns"
              ? t(
                  "เลือกให้ครบทุกคอลัมน์หรือ relation ที่ถูกต้อง",
                  "Select every correct column or relation",
                )
              : t("เลือกหนึ่งคำตอบ", "Choose one answer")}
          </legend>
          <div className="db-options">
            {q.options?.map((o) => (
              <label key={o}>
                <input
                  type={q.format === "columns" ? "checkbox" : "radio"}
                  name={`answer-${q.id}`}
                  value={o}
                  checked={selected.includes(o)}
                  onChange={() =>
                    setSelected((s) =>
                      q.format === "columns"
                        ? s.includes(o)
                          ? s.filter((x) => x !== o)
                          : [...s, o]
                        : [o],
                    )
                  }
                />
                <code>{o}</code>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="db-toolbar">
        <button
          type="button"
          disabled={
            disabled ||
            correct ||
            (q.format === "text" ? !text.trim() : !selected.length)
          }
          onClick={check}
        >
          {t("ตรวจคำตอบ", "Check answer")}
        </button>
        <button
          type="button"
          disabled={hints >= 3 || correct || disabled}
          onClick={() => setHints((h) => Math.min(3, h + 1))}
        >
          {t("ขอ Hint ถัดไป", "Next hint")}
        </button>
        <button
          type="button"
          disabled={disabled || revealed || correct}
          onClick={() => {
            setRevealed(true);
            onAnswer(false, true);
          }}
        >
          {t("ขอดูเฉลยเต็ม", "Reveal full solution")}
        </button>
      </div>
      <div role="status" className="db-feedback">
        {correct
          ? t("ถูกต้อง!", "Correct!")
          : wrong
            ? t(
                "ยังไม่ตรงกฎ ลองใช้ Hint แล้วเลือกใหม่ คำตอบยังไม่ถูกเปิดเผย",
                "Not yet. Use the hint and try again. The answer remains hidden.",
              )
            : t(
                "ลองคิดเองก่อน ไม่จำเป็นต้องตอบเร็ว",
                "Think it through before requesting the solution.",
              )}{" "}
        {(correct || revealed) && <p><GlossaryText text={q.solution[lang]} lang={lang} /></p>}
      </div>
      {!correct &&
        q.hints.slice(0, hints).map((h, i) => (
          <p className="db-hint" key={i}>
            <strong>Hint {i + 1}</strong> · <GlossaryText text={h[lang]} lang={lang} />
          </p>
        ))}
    </section>
  );
}
