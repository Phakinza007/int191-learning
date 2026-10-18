import { lazy, Suspense, useEffect, useState } from "react";
import LangToggle from "../LangToggle";
import { LANG_COOKIE, normalizeLang } from "../../lib/note-lang";
import { glossary, topics } from "../../lib/int191/curriculum";
import { questions } from "../../lib/int191/practice";
import {
  STORAGE_KEY,
  dueQuestionIds,
  emptyProgress,
  parseProgress,
  type Progress,
} from "../../lib/int191/progress";
import { type Lang } from "../../lib/int191/model";
import NormalizationLab from "./NormalizationLab";
import FDExplorer from "./FDExplorer";
import ERLab from "./ERLab";
import PracticeCard from "./PracticeCard";
import PracticeMode from "./PracticeMode";
const SqlPlayground = lazy(() => import("./SqlPlayground"));
type Section =
  | "dashboard"
  | "learn"
  | "normalization"
  | "fd"
  | "er"
  | "sql"
  | "practice"
  | "exam"
  | "glossary";
const sections: Section[] = [
  "dashboard",
  "learn",
  "normalization",
  "fd",
  "er",
  "sql",
  "practice",
  "exam",
  "glossary",
];
export default function DatabaseAcademy({
  initialLang = "th",
}: {
  initialLang?: Lang;
}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [section, setSection] = useState<Section>("dashboard");
  const [topicId, setTopicId] = useState("fundamentals");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [practiceId, setPracticeId] = useState("");
  const [flip, setFlip] = useState(false);
  const [card, setCard] = useState(0);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const topic = topics.find((x) => x.id === topicId) ?? topics[0];
  const topicIndex = topics.indexOf(topic);
  const due = dueQuestionIds(progress.attempts);
  const latest = new Map(progress.attempts.map((a) => [a.id, a]));
  const mastered = [...latest.values()].filter(
    (a) => a.correct && !a.revealed,
  ).length;
  const nextTopic =
    topics.find((x) => !progress.completed.includes(x.id)) ?? topics[0];
  const visibleTopics = topics.filter((x) =>
    `${x.title.th} ${x.title.en} ${x.explanation.th} ${x.explanation.en}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  useEffect(() => {
    const savedLanguage = document.cookie.split("; ").find(v => v.startsWith(`${LANG_COOKIE}=`))?.split("=")[1];
    const restoredLanguage = normalizeLang(savedLanguage);
    setLang(restoredLanguage);
    document.documentElement.lang = restoredLanguage;
    try {
      setProgress(
        parseProgress(
          localStorage.getItem(STORAGE_KEY),
          topics.map((x) => x.id),
          questions.map((q) => q.id),
        ),
      );
    } catch {
      setStorageError(true);
    }
    setReady(true);
    const route = () => {
      const [a, b] = window.location.hash.slice(1).split("/");
      if (sections.includes(a as Section)) setSection(a as Section);
      if (topics.some((x) => x.id === b)) {
        setTopicId(b);
        if (a === "learn") setProgress((p) => ({ ...p, current: b }));
      }
    };
    route();
    window.addEventListener("hashchange", route);
    const sync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY)
        setProgress(
          parseProgress(
            e.newValue,
            topics.map((x) => x.id),
            questions.map((q) => q.id),
          ),
        );
    };
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hashchange", route);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      setStorageError(true);
    }
  }, [progress, ready]);
  function go(next: Section, id?: string) {
    setSection(next);
    if (id) {
      setTopicId(id);
      if (next === "learn")
        setProgress((p) => ({
          ...p,
          current: id,
          activity: [...p.activity, { label: id, at: Date.now() }].slice(-8),
        }));
    }
    window.location.hash = next + (id ? "/" + id : "");
    setTimeout(() => document.getElementById("db-content-title")?.focus(), 0);
  }
  function practice(id: string) {
    setPracticeId(id);
    go("practice");
  }
  function answer(id: string, correct: boolean, revealed: boolean) {
    setProgress((p) => ({
      ...p,
      attempts: [
        ...p.attempts,
        { id, correct, revealed, at: Date.now() },
      ].slice(-200),
    }));
  }
  function bookmark(id: string) {
    setProgress((p) => ({
      ...p,
      bookmarks: p.bookmarks.includes(id)
        ? p.bookmarks.filter((x) => x !== id)
        : [...p.bookmarks, id],
    }));
  }
  const topicQuestion = questions.find((q) => q.id === topic.question)!;
  const labels: Record<Section, string> = {
    dashboard: t("ภาพรวมการเรียน", "Learning dashboard"),
    learn: t("บทเรียน", "Lessons"),
    normalization: "Normalization Lab",
    fd: "FD Explorer",
    er: "ER Diagram",
    sql: "SQL Playground",
    practice: t("ฝึกและทบทวน", "Practice and review"),
    exam: t("เตรียมสอบ", "Exam preparation"),
    glossary: t("ศัพท์และ Flashcards", "Glossary and flashcards"),
  };
  const passed = progress.attempts.some(
    (a) =>
      questions.some((q) => q.id === a.id && q.topic === topic.id) &&
      a.correct &&
      !a.revealed,
  );
  return (
    <div className="db-academy" lang={lang}>
      <a className="db-skip" href="#db-content-title">
        {t("ข้ามไปเนื้อหา", "Skip to learning content")}
      </a>
      <header className="db-academy-header">
        <div>
          <a href={import.meta.env.BASE_URL}>INT191 · Database Lab</a>
          <h1>
            {t(
              "เข้าใจฐานข้อมูล ผ่านการลงมือทำ",
              "Understand databases by doing",
            )}
          </h1>
          <p>
            {t(
              "เรียน → ดูภาพ → ทดลองกับตาราง → ฝึก → อธิบายเหตุผล",
              "Learn → visualize → explore tables → practice → explain why",
            )}
          </p>
        </div>
        <LangToggle
          lang={lang}
          onSwitch={() => {
            const value = document.cookie
              .split("; ")
              .find((v) => v.startsWith(`${LANG_COOKIE}=`))
              ?.split("=")[1];
            const l = normalizeLang(value);
            setLang(l);
            document.documentElement.lang = l;
          }}
        />
      </header>
      <p className="db-local-note">
        {t(
          "เรียนได้โดยไม่เข้าสู่ระบบ · Progress ของพื้นที่นี้เก็บในเบราว์เซอร์นี้ บนอุปกรณ์นี้",
          "No login needed · This workspace saves progress in this browser, on this device.",
        )}
      </p>
      {storageError && (
        <p role="status" className="db-notice">
          {t(
            "เบราว์เซอร์ไม่อนุญาตให้บันทึกในเครื่อง ยังเรียนได้ แต่ progress อาจหายเมื่อปิดหน้า",
            "Browser storage is unavailable. You can continue learning, but progress may be lost when this page closes.",
          )}
        </p>
      )}
      <nav
        className="db-main-nav"
        aria-label={t("ส่วนของการเรียน", "Learning sections")}
      >
        {(
          [
            "dashboard",
            "learn",
            "normalization",
            "practice",
            "exam",
          ] as Section[]
        ).map((s) => (
          <button
            type="button"
            key={s}
            aria-current={
              (s === "normalization" &&
                ["normalization", "fd", "er", "sql"].includes(section)) ||
              section === s
                ? "page"
                : undefined
            }
            onClick={() => go(s)}
          >
            {s === "normalization" ? t("ห้องทดลอง", "Laboratories") : labels[s]}
          </button>
        ))}
      </nav>
      <div className="db-academy-body">
        <aside className="db-topic-nav">
          <label htmlFor="db-topic-search">
            {t("ค้นหาหัวข้อ INT191", "Search INT191 topics")}
          </label>
          <input
            id="db-topic-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("เช่น Partial, PK, JOIN", "e.g. Partial, PK, JOIN")}
          />
          <nav
            aria-label={t(
              "หัวข้อทั้งหมด ไม่บังคับลำดับ",
              "All topics, no prerequisites",
            )}
          >
            {visibleTopics.map((x) => (
              <button
                type="button"
                key={x.id}
                aria-current={
                  section === "learn" && topicId === x.id ? "page" : undefined
                }
                onClick={() => go("learn", x.id)}
              >
                <span>{x.title[lang]}</span>
                <small>
                  {progress.completed.includes(x.id)
                    ? "✓"
                    : progress.bookmarks.includes(x.id)
                      ? "★"
                      : "→"}
                </small>
              </button>
            ))}
          </nav>
          {!visibleTopics.length && (
            <p>
              {t(
                "ไม่พบหัวข้อ ลองใช้ศัพท์อังกฤษหรือคำไทยสั้นลง",
                "No topic found. Try an English term or a shorter Thai phrase.",
              )}
            </p>
          )}
          <button type="button" onClick={() => go("glossary")}>
            {labels.glossary}
          </button>
          <a href={import.meta.env.BASE_URL}>
            {t("กลับหน้าหลัก", "Back to home")}
          </a>
        </aside>
        <section
          className="db-learning-content"
          aria-labelledby="db-content-title"
        >
          <h2 id="db-content-title" tabIndex={-1} className="db-section-title">
            {labels[section]}
          </h2>
          {["normalization", "fd", "er", "sql"].includes(section) && (
            <nav
              className="db-lab-nav"
              aria-label={t("เลือกห้องทดลอง", "Choose a laboratory")}
            >
              {(["normalization", "fd", "er", "sql"] as Section[]).map((s) => (
                <button
                  type="button"
                  key={s}
                  aria-current={s === section ? "page" : undefined}
                  onClick={() => go(s)}
                >
                  {labels[s]}
                </button>
              ))}
            </nav>
          )}
          {section === "dashboard" && (
            <>
              <section className="db-overview">
                <h3>{t("กลับมาเรียนต่อ", "Continue learning")}</h3>
                {!ready ? (
                  <p role="status">
                    {t(
                      "กำลังอ่าน progress ในเครื่อง…",
                      "Loading local progress…",
                    )}
                  </p>
                ) : (
                  <>
                    <p>
                      {progress.completed.length}/{topics.length}{" "}
                      {t(
                        "บทเรียนที่ทำแบบฝึกแล้วและกดเรียนจบ",
                        "lessons practiced and marked complete",
                      )}{" "}
                      · {mastered}/{latest.size}{" "}
                      {t(
                        "ข้อที่ตอบถูกโดยไม่เปิดเฉลยในครั้งล่าสุด",
                        "questions last answered correctly without revealing",
                      )}
                    </p>
                    <progress
                      value={progress.completed.length}
                      max={topics.length}
                      aria-label={t("ความคืบหน้าบทเรียน", "Lesson progress")}
                    />
                    <p>
                      {t("หัวข้อล่าสุด", "Current topic")}:{" "}
                      {
                        topics.find((x) => x.id === progress.current)?.title[
                          lang
                        ]
                      }
                    </p>
                    <div className="db-toolbar">
                      <button
                        type="button"
                        onClick={() => go("learn", progress.current)}
                      >
                        {t("เรียนต่อ", "Resume")}
                      </button>
                      <button
                        type="button"
                        onClick={() => go("learn", nextTopic.id)}
                      >
                        {t("แนะนำถัดไป", "Recommended next")}:{" "}
                        {nextTopic.title[lang]}
                      </button>
                    </div>
                  </>
                )}
              </section>
              <div className="db-dashboard-columns">
                <section>
                  <h3>{t("ควรกลับมาทบทวน", "Review queue")}</h3>
                  <p>
                    {due.length
                      ? `${due.length} ${t("ข้อที่พลาดหรือเคยเปิดเฉลย", "mistakes or revealed solutions")}`
                      : t(
                          "ยังไม่มีข้อที่ต้องทบทวน ลองทำแบบฝึกเพื่อค้นหาจุดที่ยังไม่ชัด",
                          "No review items yet. Practice to find concepts that need more attention.",
                        )}
                  </p>
                  {due.map((id) => {
                    const q = questions.find((q) => q.id === id)!;
                    return (
                      <button
                        className="db-list-link"
                        type="button"
                        key={id}
                        onClick={() => practice(id)}
                      >
                        {q.prompt[lang]} →
                      </button>
                    );
                  })}
                </section>
                <section>
                  <h3>{t("หัวข้อที่บุ๊กมาร์ก", "Bookmarked topics")}</h3>
                  {progress.bookmarks.length ? (
                    progress.bookmarks.map((id) => (
                      <button
                        className="db-list-link"
                        type="button"
                        key={id}
                        onClick={() => go("learn", id)}
                      >
                        {topics.find((x) => x.id === id)?.title[lang]} ★
                      </button>
                    ))
                  ) : (
                    <p>
                      {t(
                        "กด ★ ในบทเรียนเพื่อเก็บหัวข้อที่ยังไม่มั่นใจ",
                        "Use ★ in a lesson to save a topic you want to revisit.",
                      )}
                    </p>
                  )}
                  <h3>{t("กิจกรรมล่าสุด", "Recent learning")}</h3>
                  <ol>
                    {progress.activity
                      .slice()
                      .reverse()
                      .map((a, i) => (
                        <li key={`${a.at}-${i}`}>
                          {topics.find((x) => x.id === a.label)?.title[lang]} ·{" "}
                          <time dateTime={new Date(a.at).toISOString()}>
                            {new Date(a.at).toLocaleDateString(
                              lang === "th" ? "th-TH" : "en-GB",
                            )}
                          </time>
                        </li>
                      ))}
                  </ol>
                </section>
              </div>
              <section>
                <h3>
                  {t(
                    "เส้นทางเรียนที่แนะนำ เลือกข้ามได้ทุกบท",
                    "Suggested learning journey, every topic is independently accessible",
                  )}
                </h3>
                <ol className="db-journey">
                  {topics.map((x) => (
                    <li key={x.id}>
                      <button type="button" onClick={() => go("learn", x.id)}>
                        {progress.completed.includes(x.id) ? "✓ " : ""}
                        {x.title[lang]}
                      </button>
                      <span aria-hidden="true">↓</span>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
          {section === "learn" && (
            <article key={topic.id} className="db-lesson">
              <div className="db-lesson-heading">
                <h3>{topic.title[lang]}</h3>
                <button
                  type="button"
                  aria-pressed={progress.bookmarks.includes(topic.id)}
                  onClick={() => bookmark(topic.id)}
                >
                  ★ {t("บุ๊กมาร์ก", "Bookmark")}
                </button>
              </div>
              <p className="db-feedback">
                <strong>
                  {t("หลังบทนี้จะทำอะไรได้", "Learning objective")}
                </strong>{" "}
                · {topic.objective[lang]}
              </p>
              <h4>{t("ทำความเข้าใจก่อน", "Understand the concept")}</h4>
              <p>{topic.explanation[lang]}</p>
              <h4>{t("ลองดูด้วยตัวเอง", "Explore the example")}</h4>
              <p>{topic.why[lang]}</p>
              {topic.lab === "normalization" ? (
                <NormalizationLab
                  key={topic.id}
                  initialStep={["unf", "1nf", "2nf", "3nf", "bcnf"].indexOf(
                    topic.id,
                  )}
                  lang={lang}
                  onPractice={practice}
                />
              ) : topic.lab === "fd" ? (
                <FDExplorer lang={lang} />
              ) : topic.lab === "er" ? (
                <ERLab lang={lang} onPractice={() => practice("fk")} />
              ) : (
                <Suspense
                  fallback={
                    <p role="status">
                      {t("กำลังโหลด SQL Lab…", "Loading SQL lab…")}
                    </p>
                  }
                >
                  <SqlPlayground lang={lang} />
                </Suspense>
              )}
              <details>
                <summary>
                  {t("ข้อผิดพลาดที่พบบ่อย", "Common misconception")}
                </summary>
                <p>{topic.mistake[lang]}</p>
              </details>
              <h4>{t("ตรวจความเข้าใจ", "Check understanding")}</h4>
              <PracticeCard
                key={topicQuestion.id}
                question={topicQuestion}
                lang={lang}
                onAnswer={(correct, revealed) =>
                  answer(topicQuestion.id, correct, revealed)
                }
              />
              <details>
                <summary>{t("สรุปสั้น ๆ", "Quick summary")}</summary>
                <p>
                  {topic.objective[lang]} · {topic.explanation[lang]}
                </p>
              </details>
              <div className="db-toolbar">
                <button
                  type="button"
                  disabled={!passed}
                  onClick={() =>
                    setProgress((p) => ({
                      ...p,
                      completed: [...new Set([...p.completed, topic.id])],
                    }))
                  }
                >
                  {progress.completed.includes(topic.id)
                    ? t("✓ เรียนจบแล้ว", "✓ Completed")
                    : t("ทำเครื่องหมายว่าเรียนจบ", "Mark lesson complete")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    go("learn", topics[(topicIndex + 1) % topics.length].id)
                  }
                >
                  {t("บทถัดไป", "Next topic")}:{" "}
                  {topics[(topicIndex + 1) % topics.length].title[lang]}
                </button>
              </div>
              {!passed && (
                <p>
                  {t(
                    "ตอบแบบฝึกของหัวข้อนี้ให้ถูกโดยไม่เปิดเฉลยก่อน จึงกดเรียนจบได้",
                    "Answer a question on this topic correctly without revealing the solution before marking it complete.",
                  )}
                </p>
              )}
            </article>
          )}
          {section === "normalization" && (
            <NormalizationLab lang={lang} onPractice={practice} />
          )}
          {section === "fd" && <FDExplorer lang={lang} />}
          {section === "er" && (
            <ERLab lang={lang} onPractice={() => practice("fk")} />
          )}
          {section === "sql" && (
            <Suspense
              fallback={
                <p role="status">
                  {t("กำลังโหลด SQL Lab…", "Loading SQL lab…")}
                </p>
              }
            >
              <SqlPlayground lang={lang} />
            </Suspense>
          )}
          {(section === "practice" || section === "exam") && (
            <PracticeMode
              key={`${section}-${practiceId}`}
              lang={lang}
              attempts={progress.attempts}
              onAnswer={answer}
              initialQuestion={section === "practice" ? practiceId : undefined}
              exam={section === "exam"}
            />
          )}
          {section === "glossary" && (
            <section>
              <p>
                {t(
                  "ศัพท์เทคนิคพร้อมคำอธิบายไทย/อังกฤษ ใช้ช่องค้นหาด้านซ้ายกับหัวข้อเรียน หรือพลิก Flashcard เพื่อทบทวน",
                  "Technical terms with Thai/English explanations. Search lesson topics in the sidebar, or flip a flashcard for recall.",
                )}
              </p>
              <div className="db-flashcard">
                <p>
                  {card + 1} / {glossary.length}
                </p>
                <button
                  type="button"
                  aria-expanded={flip}
                  onClick={() => setFlip((v) => !v)}
                >
                  <strong>{glossary[card].term}</strong>
                  {flip ? (
                    <span className="db-flashcard-answer">
                      {glossary[card].definition[lang]}
                    </span>
                  ) : (
                    <span className="db-flashcard-answer">
                      {t(
                        "ลองอธิบายเอง แล้วกดเพื่อพลิก",
                        "Explain it yourself, then click to flip",
                      )}
                    </span>
                  )}
                </button>
                <div className="db-toolbar">
                  <button
                    type="button"
                    onClick={() => {
                      setCard(
                        (c) => (c - 1 + glossary.length) % glossary.length,
                      );
                      setFlip(false);
                    }}
                  >
                    {t("ใบก่อน", "Previous card")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCard((c) => (c + 1) % glossary.length);
                      setFlip(false);
                    }}
                  >
                    {t("ใบถัดไป", "Next card")}
                  </button>
                </div>
              </div>
              <label>
                {t("ค้นหาศัพท์", "Search glossary")}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {!glossary.some((g) =>
                (g.term + " " + g.definition.th + " " + g.definition.en)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ) && <p>{t("ไม่พบศัพท์ที่ตรงกัน", "No matching terms.")}</p>}
              {glossary
                .filter((g) =>
                  (g.term + " " + g.definition.th + " " + g.definition.en)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((g) => (
                  <details key={g.term}>
                    <summary>{g.term}</summary>
                    <p>{g.definition[lang]}</p>
                  </details>
                ))}
            </section>
          )}
          <footer className="db-sources">
            <details>
              <summary>
                {t("ขอบเขตและแหล่งตรวจทฤษฎี", "Scope and theory references")}
              </summary>
              <p>
                {t(
                  "แบบฝึกนี้จัดทำเพื่อเรียน INT191 ไม่ใช่ข้อสอบจริง ตัวอย่างข้อมูลเป็นข้อมูลสมมติ กฎ FD ของ JOB_SHEET ใช้ตามโจทย์ที่ให้มา",
                  "This workspace supports INT191 learning; these are not official exam questions. Records are fictional and JOB_SHEET uses the problem’s stated FDs.",
                )}
              </p>
              <ul>
                <li>
                  <a href="https://cs.uwaterloo.ca/~david/cs348/handout-FD.pdf">
                    University of Waterloo · Normalization Theory
                  </a>
                </li>
                <li>
                  <a href="https://www.cs.rpi.edu/~sibel/csci4380/fall2019/course_notes/normalization.html">
                    RPI · Functional dependencies, 3NF and BCNF
                  </a>
                </li>
              </ul>
            </details>
          </footer>
        </section>
      </div>
    </div>
  );
}
