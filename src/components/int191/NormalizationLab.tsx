import { useState } from "react";
import {
  bcnfFDs,
  bcnfRelation,
  job2NF,
  jobFinal,
  jobFDs,
  jobOriginal,
  jobRows,
  normalForm,
  project,
  type Lang,
  type Relation,
} from "../../lib/int191/model";
import { stages } from "../../lib/int191/curriculum";
import DatabaseTable, { type Selection } from "./DatabaseTable";
import SchemaDiagram from "./SchemaDiagram";
import GlossaryText from "./GlossaryText";
const unf: Relation = {
  name: "JOB_SHEET_UNF",
  columns: [
    { name: "jobNo" },
    { name: "customerName" },
    { name: "parts (repeating group)" },
  ],
  rows: project(jobRows, ["jobNo", "customerName"]).map((r) => ({
    ...r,
    "parts (repeating group)": jobRows
      .filter((x) => x.jobNo === r.jobNo)
      .map((x) => `${x.partNo} × ${x.quantity}`)
      .join("; "),
  })),
};
export default function NormalizationLab({
  lang,
  onPractice,
  initialStep = 0,
}: {
  lang: Lang;
  onPractice: (id: string) => void;
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [selection, setSelection] = useState<Selection>(null);
  const [fd, setFD] = useState("");
  const [anomaly, setAnomaly] = useState("none");
  const [bcnf, setBCNF] = useState(false);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const source =
    step === 0
      ? [unf]
      : step === 1
        ? [unf]
        : step === 2
          ? [jobOriginal]
          : step === 3
            ? job2NF
            : jobFinal;
  const target =
    step === 0
      ? [unf]
      : step === 1
        ? [jobOriginal]
        : step === 2
          ? job2NF
          : jobFinal;
  const focus = fd
    ? (jobFDs.find((f) => f.id === fd)?.right ?? [])
    : stages[step].focus;
  const badRows =
    anomaly === "update"
      ? jobRows.map((r, i) =>
          i === 0 ? { ...r, customerName: "Mali Updated" } : r,
        )
      : anomaly === "delete"
        ? jobRows.filter((r) => r.jobNo !== "J103")
        : jobRows;
  const counter = [
    {
      name: "INSTRUCTOR_COURSE",
      columns: [{ name: "instructorId", pk: true }, { name: "courseId" }],
      rows: project(bcnfRelation.rows, ["instructorId", "courseId"]),
    },
    {
      name: "STUDENT_INSTRUCTOR",
      columns: [
        { name: "studentId", pk: true },
        {
          name: "instructorId",
          pk: true,
          fk: "INSTRUCTOR_COURSE.instructorId",
        },
      ],
      rows: project(bcnfRelation.rows, ["studentId", "instructorId"]),
    },
  ] satisfies Relation[];
  const next = (s: number) => {
    setStep(s);
    setFD("");
    setSelection(null);
  };
  return (
    <section>
      <h2>{t("Normalization Laboratory", "Normalization laboratory")}</h2>
      <p>
        {t(
          "JOB_SHEET · เรียนจากใบงานเดียวจนถึง BCNF โดยไม่สร้างการแยกที่ไม่จำเป็น",
          "JOB_SHEET · follow one job sheet to BCNF without unnecessary decompositions.",
        )}
      </p>
      <p className="db-notice">
        {t(
          "สมมติฐาน: หนึ่งแถวต่อคู่ jobNo/partNo, unitPrice คือราคาปัจจุบันใน catalogue และ FD1–FD5 เป็นกฎของโจทย์ ไม่ได้อนุมานจาก sample หากต้องเก็บราคาซื้อจริงต่อครั้งต้องปรับ FD และ schema",
          "Assumptions: one row per jobNo/partNo pair; unitPrice is the current catalogue price; FD1–FD5 are given business rules, not inferred from samples. Historical transaction prices require different FDs and a revised schema.",
        )}
      </p>
      <ol
        className="db-steps"
        aria-label={t("ขั้น Normalization", "Normalization steps")}
      >
        {stages.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              aria-current={step === i ? "step" : undefined}
              onClick={() => next(i)}
            >
              {s.title}
            </button>
            {i < 4 && <span aria-hidden="true">→</span>}
          </li>
        ))}
      </ol>
      <h3><GlossaryText text={stages[step].action[lang]} lang={lang} /></h3>
      <div className="db-transform">
        <div>
          <h4>{t("ก่อนเปลี่ยน", "Before")}</h4>
          {source.map((r) => (
            <DatabaseTable
              key={r.name}
              relation={r}
              lang={lang}
              selection={selection}
              onSelect={setSelection}
              focus={focus}
            />
          ))}
        </div>
        <div className="db-reason">
          <h4>{t("เหตุผลของการเปลี่ยน", "Why this step")}</h4>
          <p><GlossaryText text={stages[step].reason[lang]} lang={lang} /></p>
          <div className="db-fd-list">
            {jobFDs.map((f) => (
              <button
                type="button"
                key={f.id}
                aria-pressed={fd === f.id}
                onClick={() => setFD(f.id)}
              >
                <strong>{f.id}</strong>
                <code>
                  {f.left.join(", ")} → {f.right.join(", ")}
                </code>
              </button>
            ))}
          </div>
          <svg
            viewBox="0 0 200 48"
            role="img"
            aria-label={t(
              "ย้าย attributes ตาม determinant ไปยัง relation ที่ถูกต้อง",
              "Move attributes to relations based on their determinants",
            )}
          >
            <path
              d="M5 24H185l-14-10m14 10l-14 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <p>
            {t(
              "คอลัมน์ที่มีพื้นหลังและเส้นเน้นคือ attribute ที่กำลังวิเคราะห์ คลิก FD เพื่อเปลี่ยนชุดที่เน้น",
              "Highlighted columns are the attributes under analysis. Select an FD to change the highlighted set.",
            )}
          </p>
        </div>
        <div>
          <h4>{t("ผลของขั้นนี้", "After")}</h4>
          {target.map((r) => (
            <DatabaseTable
              key={r.name}
              relation={r}
              lang={lang}
              selection={selection}
              onSelect={setSelection}
              focus={focus}
            />
          ))}
        </div>
      </div>
      {selection && (
        <p className="db-feedback" role="status">
          <code>{selection.column}</code>{" "}
          {selection.value !== undefined
            ? `= ${selection.value ?? "NULL"}`
            : ""}{" "}
          ·{" "}
          {t(
            "ไฮไลต์ attribute และค่าที่ตรงกันในทุกตาราง ใช้ PK/FK ที่หัวคอลัมน์ตรวจว่าค่าถูกเก็บหรืออ้างอิงที่ใด",
            "Matching attributes and values are highlighted across the tables. Inspect the PK/FK labels to see where the value is stored or referenced.",
          )}{" "}
          <button type="button" onClick={() => setSelection(null)}>
            {t("ล้างการเลือก", "Clear selection")}
          </button>
        </p>
      )}
      <p className="db-feedback">
        <strong>
          {t(
            "ผ่าน Normal Form เพราะอะไร?",
            "Why does this satisfy the normal form?",
          )}
        </strong>{" "}
        <GlossaryText text={stages[step].proof[lang]} lang={lang} />
      </p>
      {step >= 2 && (
        <>
          <h3>
            {t(
              "Relational schema ของขั้นนี้",
              "Relational schema at this step",
            )}
          </h3>
          <SchemaDiagram relations={target} lang={lang} />
          <ul>
            {target.map((r) => (
              <li key={r.name}>
                <code>
                  {r.name}(
                  {r.columns
                    .map(
                      (c) =>
                        `${c.name}${c.pk ? " PK" : ""}${c.fk ? " FK" : ""}`,
                    )
                    .join(", ")}
                  )
                </code>{" "}
                ·{" "}
                {
                  normalForm(
                    r.columns.map((c) => c.name),
                    jobFDs,
                  ).level
                }
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="db-toolbar">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => next(step - 1)}
        >
          {t("ขั้นก่อนหน้า", "Previous step")}
        </button>
        <button
          type="button"
          disabled={step === 4}
          onClick={() => next(step + 1)}
        >
          {t("ขั้นถัดไป", "Next step")}
        </button>
        <button type="button" onClick={() => next(0)}>
          {t("เริ่มใหม่", "Replay")}
        </button>
        <button
          type="button"
          onClick={() =>
            onPractice(["unf", "1nf", "partial", "transitive", "bcnf"][step])
          }
        >
          {t("ลองตอบก่อนดูเฉลย", "Practice this step")}
        </button>
      </div>
      <details>
        <summary>
          {t(
            "ทดลอง Insertion / Update / Deletion anomalies",
            "Experiment with insertion, update, and deletion anomalies",
          )}
        </summary>
        <p>
          {t(
            "ใช้ตาราง 1NF เดิมเพื่อเห็นปัญหา แล้วเทียบกับ CUSTOMER/PART ที่แยกแล้วด้านบน",
            "Use the original 1NF table to observe anomalies and compare it with the separated CUSTOMER/PART relations.",
          )}
        </p>
        <div className="db-toolbar">
          {["none", "insert", "update", "delete"].map((a) => (
            <button
              type="button"
              key={a}
              aria-pressed={anomaly === a}
              onClick={() => setAnomaly(a)}
            >
              {
                {
                  none: biText("คืนข้อมูล", "Reset"),
                  insert: biText("เพิ่มลูกค้า", "Insert customer"),
                  update: biText("แก้ชื่อแค่แถวเดียว", "Update one name"),
                  delete: biText("ลบงาน J103", "Delete J103"),
                }[a]
              }
            </button>
          ))}
        </div>
        <p role="status">
          {anomaly === "insert"
            ? t(
                "ต้องการเพิ่ม C04 โดยยังไม่มีงาน: JOB_SHEET บังคับ PK jobNo+partNo จึงเก็บลูกค้าล้วนไม่ได้ แต่ CUSTOMER แยกแล้วเพิ่ม C04 ได้โดยไม่สร้างงานปลอม",
                "To insert C04 without a job, JOB_SHEET requires the jobNo+partNo PK. A separate CUSTOMER relation can store C04 without inventing a job.",
              )
            : anomaly === "update"
              ? t(
                  "C01 มีทั้ง Mali และ Mali Updated: ละเมิด customerId → customerName ต้องแก้หลายแถว หรือแยก CUSTOMER เพื่อแก้ครั้งเดียว",
                  "C01 now has both Mali and Mali Updated, violating customerId → customerName. Update multiple copies or separate CUSTOMER and update once.",
                )
              : anomaly === "delete"
                ? t(
                    "ลบ J103 แล้วข้อมูลลูกค้า C03 และช่าง T02 หายจากตารางรวมด้วย ใน schema ที่แยกแล้ว CUSTOMER/TECHNICIAN ไม่ต้องถูกลบตาม",
                    "Deleting J103 also removes the only stored details for C03 and T02. Separate CUSTOMER/TECHNICIAN relations can retain those facts.",
                  )
                : t(
                    "ข้อมูลซ้ำไม่ได้ผิดทุกกรณี แต่เมื่อข้อเท็จจริงเดียวต้องแก้หลายแถวจะเสี่ยง inconsistency",
                    "Not every repeated value is wrong. Repeating a fact across rows makes inconsistent updates possible.",
                  )}
        </p>
        <DatabaseTable
          relation={{ ...jobOriginal, rows: badRows }}
          lang={lang}
          selection={selection}
          onSelect={setSelection}
          duplicates
        />
        {anomaly === "insert" && (
          <div className="db-paired-tables">
            <div>
              <h4>
                {t(
                  "คำขอที่ถูกปฏิเสธ ไม่ถูกเก็บใน JOB_SHEET",
                  "Rejected request, not stored in JOB_SHEET",
                )}
              </h4>
              <DatabaseTable
                relation={{
                  ...jobOriginal,
                  name: "JOB_SHEET · rejected INSERT",
                  rows: [
                    Object.fromEntries(
                      jobOriginal.columns.map((c) => [
                        c.name,
                        c.name === "customerId"
                          ? "C04"
                          : c.name === "customerName"
                            ? "Nok"
                            : c.name === "customerPhone"
                              ? "084-444-4444"
                              : null,
                      ]),
                    ),
                  ],
                }}
                lang={lang}
                selection={selection}
                onSelect={setSelection}
              />
              <p>
                {t(
                  "jobNo และ partNo เป็น NULL จึงผิด PK ข้อมูลเดิมไม่เปลี่ยน",
                  "NULL jobNo and partNo violate the PK. Existing data remains unchanged.",
                )}
              </p>
            </div>
            <div>
              <h4>
                {t(
                  "เพิ่มได้หลังแยก CUSTOMER",
                  "Valid after separating CUSTOMER",
                )}
              </h4>
              <DatabaseTable
                relation={{
                  ...jobFinal[0],
                  rows: [
                    ...jobFinal[0].rows,
                    {
                      customerId: "C04",
                      customerName: "Nok",
                      customerPhone: "084-444-4444",
                    },
                  ],
                }}
                lang={lang}
                selection={selection}
                onSelect={setSelection}
              />
            </div>
          </div>
        )}
      </details>
      <details open={bcnf} onToggle={(e) => setBCNF(e.currentTarget.open)}>
        <summary>
          {t(
            "อีกตัวอย่าง: 3NF ที่ยังไม่เป็น BCNF",
            "Counterexample: 3NF that is not BCNF",
          )}
        </summary>
        <p>
          {t(
            "ENROLMENT(S,C,I): SC → I และ I → C; candidate keys คือ SC กับ SI ดังนั้นทุก attribute เป็น prime แต่ I ไม่ใช่ superkey",
            "ENROLMENT(S,C,I): SC → I and I → C. Candidate keys are SC and SI, so all attributes are prime. I is not a superkey.",
          )}
        </p>
        <DatabaseTable
          relation={bcnfRelation}
          lang={lang}
          selection={selection}
          onSelect={setSelection}
        />
        <div className="db-fd-list">
          {bcnfFDs.map((f) => (
            <code key={f.id}>
              {f.left.join(", ")} → {f.right.join(", ")}
            </code>
          ))}
        </div>
        <p>
          {t(
            "แยกด้วย I → C เป็นสองตาราง โดย intersection I กำหนด INSTRUCTOR_COURSE ได้ จึง lossless แต่ไม่ preserve SC → I: สองตารางใหม่อาจยอมให้ S01 มีทั้ง I01 และ I03 ที่สอน C เดียวกัน ซึ่งผิดกฎเดิม ต้องตรวจข้ามตารางเพิ่ม",
            "Split on I → C. The intersection I determines INSTRUCTOR_COURSE, so the split is lossless. It does not preserve SC → I: the new tables could allow S01 with I01 and I03 teaching the same course. Enforcing the original rule requires a cross-table check.",
          )}
        </p>
        <SchemaDiagram relations={counter} lang={lang} />
        {counter.map((r) => (
          <DatabaseTable
            key={r.name}
            relation={r}
            lang={lang}
            selection={selection}
            onSelect={setSelection}
          />
        ))}
      </details>
    </section>
  );
  function biText(th: string, en: string) {
    return t(th, en);
  }
}
