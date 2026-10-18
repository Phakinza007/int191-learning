import { useState } from "react";
import {
  jobFinal,
  studentTables,
  type Lang,
  type Relation,
} from "../../lib/int191/model";
import SchemaDiagram from "./SchemaDiagram";
import DatabaseTable, { type Selection } from "./DatabaseTable";
import GlossaryText from "./GlossaryText";
const weak: Relation[] = [
  {
    name: "ORDER",
    columns: [{ name: "orderId", pk: true }, { name: "orderDate" }],
    rows: [
      { orderId: "O01", orderDate: "2026-10-12" },
      { orderId: "O02", orderDate: "2026-10-13" },
    ],
  },
  {
    name: "ORDER_LINE",
    columns: [
      { name: "orderId", pk: true, fk: "ORDER.orderId" },
      { name: "lineNo", pk: true },
      { name: "quantity" },
    ],
    rows: [
      { orderId: "O01", lineNo: 1, quantity: 2 },
      { orderId: "O01", lineNo: 2, quantity: 1 },
      { orderId: "O02", lineNo: 1, quantity: 3 },
    ],
  },
];
const one: Relation[] = [
  jobFinal[0],
  {
    name: "CUSTOMER_PROFILE",
    columns: [
      { name: "customerId", pk: true, fk: "CUSTOMER.customerId" },
      { name: "preferredContact" },
    ],
    rows: [{ customerId: "C01", preferredContact: "Phone" }],
  },
];
export default function ERLab({
  lang,
  onPractice,
}: {
  lang: Lang;
  onPractice: () => void;
}) {
  const [example, setExample] = useState("student");
  const [overlapping, setOverlapping] = useState(true);
  const [total, setTotal] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const relations =
    example === "student"
      ? studentTables
      : example === "job"
        ? jobFinal
        : example === "weak"
          ? weak
          : one;
  return (
    <section>
      <h2>
        {t(
          "ER Diagram และ Relational Tables",
          "ER diagrams and relational tables",
        )}
      </h2>
      <label>
        {t("ตัวอย่าง relationship", "Relationship example")}{" "}
        <select
          value={example}
          onChange={(e) => {
            setExample(e.target.value);
            setSelection(null);
          }}
        >
          <option value="student">1:N · STUDENT / DEPARTMENT</option>
          <option value="job">M:N · JOB / JOB_PART / PART</option>
          <option value="one">1:1 · CUSTOMER / CUSTOMER_PROFILE</option>
          <option value="weak">Weak entity · ORDER_LINE</option>
        </select>
      </label>
      <p><GlossaryText lang={lang} text={example === "student"
          ? t(
              "DEPARTMENT หนึ่งแผนกมีนักศึกษา 0..N คน STUDENT เก็บ FK departmentId ที่เป็น NULL ได้ นักศึกษาจึงอาจยังไม่มีแผนก PK ระบุนักศึกษา ส่วน FK อ้างแผนก ทั้งสองทำคนละหน้าที่",
              "A department has 0..N students. STUDENT has nullable departmentId, so a student may have no department. The PK identifies the student; the FK references the department.",
            )
          : example === "job"
            ? t(
                "JOB กับ PART เป็น M:N: งานหนึ่งใช้อะไหล่หลายชิ้น อะไหล่ชนิดเดียวใช้ได้หลายงาน JOB_PART เป็น associative entity โดย quantity เป็นคุณสมบัติของคู่ jobNo/partNo",
                "JOB and PART have an M:N relationship: a job uses several parts and a part can occur in several jobs. JOB_PART is the associative entity; quantity describes the jobNo/partNo pair.",
              )
            : example === "one"
              ? t(
                  "CUSTOMER_PROFILE ใช้ customerId เป็นทั้ง PK และ FK จึงมี profile ได้ไม่เกินหนึ่งต่อ customer แต่ CUSTOMER อาจยังไม่มี profile การมี FK อย่างเดียวไม่พอสำหรับ 1:1 ต้องบังคับ uniqueness ด้วย",
                  "CUSTOMER_PROFILE uses customerId as both PK and FK, allowing at most one profile per customer. A customer may have no profile. An FK alone does not enforce 1:1; uniqueness is also required.",
                )
              : t(
                  "lineNo เป็น partial key ซ้ำข้าม order ได้ ต้องรวม owner key orderId จึงระบุ ORDER_LINE ได้ ความสัมพันธ์แบบ identifying นี้ต่างจาก entity อิสระที่มี FK ธรรมดา",
                  "lineNo is a partial key that may repeat across orders. It needs owner key orderId to identify ORDER_LINE. This identifying relationship differs from an independent entity with an ordinary FK.",
              )} /></p>
      <SchemaDiagram key={example} relations={relations} lang={lang} />
      <section className="db-eer-lab" aria-labelledby="db-eer-title">
        <h3 id="db-eer-title">{t("EER · Superclass และ Subclass", "EER · Superclass and subclasses")}</h3>
        <p><GlossaryText lang={lang} text={t("ตัวอย่าง requirement: ACCOUNT อาจเป็น CREATOR, PREMIUM, ทั้งสองแบบ หรือไม่เป็นทั้งคู่ เลือกข้อจำกัดสองแกนแล้วดูความหมาย", "Example requirement: an ACCOUNT may be CREATOR, PREMIUM, both, or neither. Choose each independent constraint and inspect the meaning.")} /></p>
        <div className="db-eer-controls">
          <fieldset>
            <legend>{t("สมาชิกหลาย subclass", "Subclass membership")}</legend>
            <button type="button" aria-pressed={overlapping} onClick={() => setOverlapping(true)}>{t("Overlapping · ซ้ำได้", "Overlapping · may be both")}</button>
            <button type="button" aria-pressed={!overlapping} onClick={() => setOverlapping(false)}>{t("Disjoint · เป็นพร้อมกันไม่ได้", "Disjoint · cannot be both")}</button>
          </fieldset>
          <fieldset>
            <legend>{t("ต้องเป็น subclass หรือไม่", "Subclass participation")}</legend>
            <button type="button" aria-pressed={total} onClick={() => setTotal(true)}>{t("Total · ต้องเป็นอย่างน้อยหนึ่ง", "Total · must be at least one")}</button>
            <button type="button" aria-pressed={!total} onClick={() => setTotal(false)}>{t("Partial · ไม่เป็นก็ได้", "Partial · may be neither")}</button>
          </fieldset>
        </div>
        <figure className="db-eer-figure">
          <svg className="db-eer-svg" viewBox="0 0 600 300" role="img" aria-labelledby="eer-svg-title eer-svg-desc">
            <title id="eer-svg-title">{t("การทำ Specialization ของ ACCOUNT", "ACCOUNT specialization")}</title>
            <desc id="eer-svg-desc">{t("ACCOUNT เชื่อมผ่านวงกลมที่มี o หมายถึง overlapping หรือ d หมายถึง disjoint ไปยัง CREATOR และ PREMIUM; เส้นคู่หมายถึง total และเส้นเดี่ยวหมายถึง partial", "ACCOUNT connects through an o (overlapping) or d (disjoint) circle to CREATOR and PREMIUM; a double line means total, a single line means partial.")}</desc>
            <g className="db-eer-links" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={total ? "M300 72 V105 M306 72 V105" : "M303 72 V105"} />
              <path d="M303 145 V177 H155 V207 M303 177 H445 V207" />
            </g>
            <g className="db-eer-nodes">
              <rect x="215" y="22" width="176" height="52" rx="8" />
              <text x="303" y="45" textAnchor="middle">ACCOUNT</text>
              <text className="db-eer-node-subtitle" x="303" y="63" textAnchor="middle">{t("Superclass", "Superclass")}</text>
              <circle cx="303" cy="125" r="20" />
              <text x="303" y="131" textAnchor="middle">{overlapping ? "o" : "d"}</text>
              <rect x="65" y="207" width="180" height="58" rx="8" />
              <text x="155" y="233" textAnchor="middle">CREATOR</text>
              <text className="db-eer-node-subtitle" x="155" y="251" textAnchor="middle">{t("Subclass", "Subclass")}</text>
              <rect x="355" y="207" width="180" height="58" rx="8" />
              <text x="445" y="233" textAnchor="middle">PREMIUM</text>
              <text className="db-eer-node-subtitle" x="445" y="251" textAnchor="middle">{t("Subclass", "Subclass")}</text>
            </g>
          </svg>
          <figcaption>{t("วงกลม o/d แสดงข้อจำกัดการทับซ้อน; เส้นคู่จาก superclass แสดง total specialization", "The o/d circle shows overlap constraints; a double line from the superclass means total specialization.")}</figcaption>
        </figure>
        <p className="db-feedback" aria-live="polite"><GlossaryText lang={lang} text={`${overlapping
          ? t("Overlapping: account เดียวอยู่ได้ทั้งสอง subclass", "Overlapping: one account may belong to both subclasses")
          : t("Disjoint: account หนึ่งอยู่ได้ไม่เกินหนึ่ง subclass", "Disjoint: an account belongs to at most one subclass")} · ${total
            ? t("Total: ทุก account ต้องอยู่ในอย่างน้อยหนึ่ง subclass", "Total: every account must belong to at least one subclass")
            : t("Partial: account อาจไม่อยู่ใน subclass ใดเลย", "Partial: an account may belong to neither subclass")}`} /></p>
        <div className="db-eer-mapping">
          <h4>{t("แปลงเป็น relational tables", "Map to relational tables")}</h4>
          <p><GlossaryText lang={lang} text={t("วิธีเก็บ superclass และ subclass แยกตารางใช้ได้ทั้งสี่รูปแบบ: PK ของ subclass เป็น FK กลับไปยัง ACCOUNT ด้วย จึงรับ attributes ที่สืบทอดมาโดยอ้างอิง account เดิม ไม่สร้างรหัสบัญชีใหม่", "The separate superclass/subclass table mapping works for all four constraint combinations: each subclass PK is also an FK to ACCOUNT, inheriting the account identity without inventing a second account ID.")} /></p>
          <div className="db-schema-list" aria-label={t("โครงสร้างตารางที่ได้", "Resulting relational schemas")}>
            <code>ACCOUNT(<strong>accountId PK</strong>, email)</code>
            <code>CREATOR(<strong>accountId PK/FK</strong>, channelName)</code>
            <code>PREMIUM(<strong>accountId PK/FK</strong>, renewalDate)</code>
          </div>
          <p className="db-muted">{total
            ? overlapping
              ? t("ข้อจำกัดเพิ่มเติม: ทุก account ต้องอยู่ใน CREATOR หรือ PREMIUM อย่างน้อยหนึ่งตาราง และอยู่ทั้งคู่ได้ (o)", "Additional constraint: every account must appear in CREATOR or PREMIUM, and may appear in both (o).")
              : t("ข้อจำกัดเพิ่มเติม: ทุก account ต้องอยู่ในตาราง subclass หนึ่งตารางพอดี (d)", "Additional constraint: every account must appear in exactly one subclass table (d).")
            : overlapping
              ? t("ข้อจำกัดเพิ่มเติม: account อาจไม่อยู่ในตาราง subclass เลย หรืออยู่ทั้งสองตารางก็ได้ (o)", "Additional constraint: an account may appear in neither subclass table or both (o).")
              : t("ข้อจำกัดเพิ่มเติม: account อาจไม่อยู่ใน subclass เลย หรืออยู่ในหนึ่งตารางเท่านั้น (d)", "Additional constraint: an account may appear in neither subclass table or in one only (d).")}</p>
        </div>
      </section>
      <div className="db-paired-tables">
        {relations.map((r) => (
          <DatabaseTable
            key={r.name}
            relation={r}
            lang={lang}
            selection={selection}
            onSelect={setSelection}
          />
        ))}
      </div>
      <p className="db-feedback" aria-live="polite">
        {selection ? (
          <>
            <strong>{selection.column}</strong> ={" "}
            {String(selection.value ?? "…")} ·{" "}
            {t(
              "ค่าที่เลือกตรงกันถูกเน้นข้ามตาราง ป้าย PK/FK บอกบทบาท แม้ปิดสีไว้ก็ยังอ่านได้",
              "Matching values are highlighted across tables. PK/FK labels explain the roles without relying on color.",
            )}
          </>
        ) : (
          t(
            "ลองคลิก departmentId = D01 แล้วหาแถว parent ที่ตรงกัน; คลิกหัวคอลัมน์เพื่อเน้นทั้ง attribute",
            "Click departmentId = D01 and locate the matching parent row. Click a column heading to highlight an attribute.",
          )
        )}
      </p>
      <button type="button" onClick={onPractice}>
        {t("ลองวาง Foreign Key ด้วยตัวเอง", "Practice placing a foreign key")}
      </button>
    </section>
  );
}
