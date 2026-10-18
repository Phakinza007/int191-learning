import { useEffect, useMemo, useState } from "react";
import { topics } from "../../lib/int191/curriculum";
import { questions } from "../../lib/int191/practice";
import { type Lang } from "../../lib/int191/model";
import { dueQuestionIds, type Attempt } from "../../lib/int191/progress";
import PracticeCard from "./PracticeCard";
export default function PracticeMode({
  lang,
  attempts,
  onAnswer,
  initialQuestion,
  exam = false,
}: {
  lang: Lang;
  attempts: Attempt[];
  onAnswer: (id: string, correct: boolean, revealed: boolean) => void;
  initialQuestion?: string;
  exam?: boolean;
}) {
  const [topic, setTopic] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [review, setReview] = useState(false);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      questions.findIndex((q) => q.id === initialQuestion),
    ),
  );
  const [session, setSession] = useState(0);
  const [started, setStarted] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [seconds, setSeconds] = useState(600);
  const [duration, setDuration] = useState("600");
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<
    Record<string, { correct: boolean; revealed: boolean }>
  >({});
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  // Keep review selection stable while answering, rather than removing a corrected item mid-question.
  const [reviewIds, setReviewIds] = useState<string[]>(() =>
    dueQuestionIds(attempts),
  );
  const eligible = questions.filter(
    (q) =>
      (topic === "all" || q.topic === topic) &&
      (difficulty === "all" || q.difficulty === Number(difficulty)) &&
      (!review || reviewIds.includes(q.id)),
  );
  const list =
    exam && started
      ? sessionIds.flatMap((id) => {
          const q = questions.find((q) => q.id === id);
          return q ? [q] : [];
        })
      : eligible;
  const q = list[index % Math.max(1, list.length)];
  useEffect(() => {
    if (!exam || !started || finished) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0) setFinished(true);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [exam, started, finished, deadline]);
  const score = useMemo(
    () => Object.values(answers).filter((a) => a.correct && !a.revealed).length,
    [answers],
  );
  const resetFilters = () => {
    setIndex(0);
    setSession((s) => s + 1);
  };
  function start() {
    const order = [
      "keys",
      "closure",
      "2nf",
      "3nf",
      "bcnf",
      "erd",
      "sql",
      "fundamentals",
      "fd",
      "candidate",
      "unf",
      "1nf",
    ];
    const mixed = order.flatMap((topic) =>
      eligible.filter((q) => q.topic === topic).slice(0, 1),
    );
    const ids = [...mixed, ...eligible.filter((q) => !mixed.includes(q))]
      .slice(0, 8)
      .map((q) => q.id);
    setSessionIds(ids);
    setAnswers({});
    setIndex(0);
    setSession((s) => s + 1);
    setStarted(true);
    setFinished(false);
    setSeconds(Number(duration));
    setDeadline(Date.now() + Number(duration) * 1000);
  }
  return (
    <section>
      <h2>
        {exam
          ? t("เตรียมสอบแบบจับเวลา", "Timed exam preparation")
          : t("Practice และ Active Recall", "Practice and active recall")}
      </h2>
      <p>
        {exam
          ? t(
              "เลือกหัวข้อและระดับ แล้วฝึกสูงสุด 8 ข้อในเวลาที่กำหนด มี Hint ได้เหมือนการฝึก คะแนนนี้เป็นการฝึกส่วนตัว ไม่ใช่ข้อสอบหรือคะแนนทางการ",
              "Choose a topic and level for up to eight timed practice questions. Hints remain available. This is personal practice, not an official exam or grade.",
            )
          : t(
              "ตอบก่อนเปิดเฉลย หากยังไม่ถูกจะได้ Hint ทีละระดับ กลับมาทบทวนข้อที่พลาดหรือเคยเปิดเฉลยได้",
              "Attempt first. Incorrect answers reveal progressive hints. Return to mistakes and questions where you requested the solution.",
            )}
      </p>
      <fieldset disabled={exam && started && !finished}>
        <legend>{t("ชุดที่ต้องการฝึก", "Practice set")}</legend>
        <div className="db-toolbar">
          <label>
            {t("หัวข้อ", "Topic")}{" "}
            <select
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                resetFilters();
              }}
            >
              <option value="all">{t("ผสมทุกหัวข้อ", "Mixed topics")}</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title[lang]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("ระดับ", "Difficulty")}{" "}
            <select
              value={difficulty}
              onChange={(e) => {
                setDifficulty(e.target.value);
                resetFilters();
              }}
            >
              <option value="all">{t("ทุกระดับ", "All levels")}</option>
              {[
                biLabel("เริ่มต้น", "Beginner"),
                biLabel("ปานกลาง", "Intermediate"),
                biLabel("ขั้นสูง", "Advanced"),
                biLabel("สอบมหาวิทยาลัย", "University exam"),
              ].map((x, i) => (
                <option key={i} value={i + 1}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="db-check">
            <input
              type="checkbox"
              checked={review}
              onChange={(e) => {
                setReview(e.target.checked);
                setReviewIds(dueQuestionIds(attempts));
                resetFilters();
              }}
            />
            {t("ทบทวนข้อที่พลาด", "Review mistakes")}
          </label>
          {exam && (
            <label>
              {t("เวลา", "Time")}{" "}
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                <option value="300">5 min</option>
                <option value="600">10 min</option>
                <option value="1200">20 min</option>
              </select>
            </label>
          )}
        </div>
      </fieldset>
      {!list.length && (
        <p role="status">
          {t(
            "ไม่มีข้อในตัวกรองนี้ ลองเลือกทุกระดับหรือปิดตัวกรองทบทวน",
            "No questions match. Select all difficulties or turn off mistake review.",
          )}
        </p>
      )}
      {exam && (!started || finished) && (
        <button type="button" disabled={!eligible.length} onClick={start}>
          {started
            ? t("เริ่มชุดใหม่", "Start new set")
            : t("เริ่มจับเวลา", "Start timed practice")}
        </button>
      )}
      {exam && started && (
        <div className="db-feedback" role="status">
          {finished
            ? t("จบการฝึก", "Session finished")
            : t("เวลาคงเหลือ", "Time remaining")}
          : {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} ·{" "}
          {t("ทำถูกโดยไม่เปิดเฉลย", "Correct without revealing")}: {score}/
          {list.length} · {t("ตอบแล้ว", "Attempted")}:{" "}
          {Object.keys(answers).length}/{list.length}
        </div>
      )}
      {q && (!exam || started) && !finished && (
        <>
          <p>
            {t("ข้อ", "Question")}{" "}
            {Math.max(1, list.findIndex((x) => x.id === q.id) + 1)} /{" "}
            {list.length}
          </p>
          <PracticeCard
            key={`${q.id}-${session}`}
            question={q}
            lang={lang}
            onAnswer={(correct, revealed) => {
              onAnswer(q.id, correct, revealed);
              setAnswers((a) => ({ ...a, [q.id]: { correct, revealed } }));
            }}
          />
          <div className="db-toolbar">
            <button
              type="button"
              onClick={() => {
                setSession((s) => s + 1);
                setIndex((i) => (i - 1 + list.length) % list.length);
              }}
            >
              {t("ข้อก่อนหน้า", "Previous question")}
            </button>
            <button
              type="button"
              onClick={() => {
                setSession((s) => s + 1);
                setIndex((i) => (i + 1) % list.length);
              }}
            >
              {t("ข้อถัดไป", "Next question")}
            </button>
            {exam && (
              <button type="button" onClick={() => setFinished(true)}>
                {t("จบและดูผล", "Finish and review")}
              </button>
            )}
          </div>
        </>
      )}
      {exam && finished && (
        <div>
          <h3>{t("ทบทวนหลังฝึก", "Review this session")}</h3>
          {list.map((item) => (
            <details key={item.id}>
              <summary>
                {item.prompt[lang]} ·{" "}
                {answers[item.id]?.correct && !answers[item.id]?.revealed
                  ? "✓"
                  : t("ควรทบทวน", "Review")}
              </summary>
              <p>{item.solution[lang]}</p>
              <p>
                <a href={`#learn/${item.topic}`}>
                  {t(
                    "กลับไปดูภาพและตารางในบทเรียน",
                    "Return to the visual lesson",
                  )}
                </a>
              </p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
  function biLabel(th: string, en: string) {
    return t(th, en);
  }
}
