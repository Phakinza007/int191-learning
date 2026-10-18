import { useState } from "react";
import {
  jobFinal,
  studentTables,
  type Lang,
  type Relation,
} from "../../lib/int191/model";
import SchemaDiagram from "./SchemaDiagram";
import DatabaseTable, { type Selection } from "./DatabaseTable";
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
      <p>
        {example === "student"
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
                )}
      </p>
      <SchemaDiagram key={example} relations={relations} lang={lang} />
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
