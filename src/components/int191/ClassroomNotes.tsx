import { useState } from "react";
import {
  classroomNotes,
  riderOriginal,
  riderNormalized,
} from "../../lib/int191/classroom";
import type { Lang } from "../../lib/int191/model";
import DatabaseTable, { type Selection } from "./DatabaseTable";
import SchemaDiagram from "./SchemaDiagram";

export function ClassroomUpdates({
  lang,
  onOpen,
}: {
  lang: Lang;
  onOpen: (topic: string) => void;
}) {
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  return (
    <details className="db-classroom-updates">
      <summary>
        {t(
          "เพิ่มจากคาบ 8 และ 15 ต.ค. 2026",
          "Added from the 8 and 15 Oct 2026 classes",
        )}
      </summary>
      <p>
        {t(
          "สรุปประเด็นที่ย้ำในห้อง เรียบเรียงใหม่และเชื่อมกับบทเรียนที่ฝึกได้",
          "Paraphrased classroom takeaways, connected to lessons you can practice.",
        )}
      </p>
      <ul>
        {classroomNotes.map((note) => (
          <li key={note.id}>
            <time dateTime={note.date}>
              {new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
                day: "numeric",
                month: "short",
              }).format(new Date(note.date + "T12:00:00Z"))}
            </time>
            <button type="button" onClick={() => onOpen(note.topics[0])}>
              {note.title[lang]} <span aria-hidden="true">→</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
export default function ClassroomNotes({
  topic,
  lang,
}: {
  topic: string;
  lang: Lang;
}) {
  const [after, setAfter] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  return (
    <>
      {classroomNotes
        .filter((n) => n.topics.includes(topic))
        .map((note) => (
          <details className="db-classroom-note" key={note.id}>
            <summary>
              {t("จากคาบเรียน", "From class")} ·{" "}
              <time dateTime={note.date}>{note.date}</time> · {note.title[lang]}
            </summary>
            <p>{note.explanation[lang]}</p>
            {note.id === "rider-zone" && (
              <>
                <p>
                  <code>riderId → riderName, zoneId</code>
                  <br />
                  <code>zoneId → zoneName, zoneFee</code>
                </p>
                <div className="db-toolbar">
                  <button
                    type="button"
                    aria-pressed={!after}
                    onClick={() => {
                      setAfter(false);
                      setSelection(null);
                    }}
                  >
                    {t("ก่อนแก้", "Before decomposition")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={after}
                    onClick={() => {
                      setAfter(true);
                      setSelection(null);
                    }}
                  >
                    {t("ดูวิธีแยกตาราง", "Explore the decomposition")}
                  </button>
                </div>
                {(after ? riderNormalized : [riderOriginal]).map((relation) => (
                  <DatabaseTable
                    key={relation.name}
                    relation={relation}
                    lang={lang}
                    selection={selection}
                    onSelect={setSelection}
                    duplicates={!after}
                  />
                ))}
                {after && (
                  <>
                    <p>
                      {t(
                        "แยกแบบ lossless: attribute ร่วมคือ zoneId และ zoneId เป็น key ของ ZONE; FD ทั้งสองตรวจได้ภายในตารางของตัวเอง และทั้งสองตารางผ่าน BCNF ตาม FD ที่กำหนด",
                        "Lossless: the shared attribute zoneId is a key of ZONE. Both FDs are locally preserved, and both relations satisfy BCNF under the stated dependencies.",
                      )}
                    </p>
                    <SchemaDiagram relations={riderNormalized} lang={lang} />
                  </>
                )}
              </>
            )}
            <p className="db-notice">{note.takeaway[lang]}</p>
            <small className="db-classroom-source">
              {t(
                "สรุปเพื่อการเรียนจาก transcript; แก้ศัพท์ที่ระบบถอดเสียงคลาดเคลื่อน ไม่ใช่ข้อความอ้างอิงตรง",
                "Learning summary from a classroom transcript; transcription terminology corrected. This is a paraphrase, not a direct quotation.",
              )}
            </small>
          </details>
        ))}
    </>
  );
}
