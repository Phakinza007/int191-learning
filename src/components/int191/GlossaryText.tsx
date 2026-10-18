import { useId, useState, type ReactNode } from "react";
import { type Lang } from "../../lib/int191/model";

type Definition = { th: string; en: string };
const definitions: Record<string, Definition> = {
  "attribute closure": { th: "เซต attribute ที่อนุมานได้จากชุดตั้งต้น โดยใช้ Functional Dependencies ซ้ำจนเพิ่มค่าไม่ได้ ถ้าครบทุก attribute ของตาราง ชุดตั้งต้นนั้นเป็น Superkey", en: "The set of attributes derivable from a starting set by repeatedly applying functional dependencies. If it contains every relation attribute, the starting set is a superkey." },
  "functional dependency": { th: "กฎ X → Y ที่บอกว่าแถวซึ่งมี X เท่ากันต้องมี Y เท่ากันด้วย X เรียกว่า determinant", en: "A rule X → Y: tuples with the same X must have the same Y. X is the determinant." },
  "full functional dependency": { th: "Y ขึ้นกับ X ทั้งชุด และไม่มี proper subset ของ X ที่กำหนด Y ได้", en: "Y depends on all of X; no proper subset of X determines Y." },
  "partial dependency": { th: "Non-prime attribute ขึ้นกับเพียงบางส่วนของ Candidate Key ที่มีหลาย attribute เป็นปัญหาที่ 2NF แก้", en: "A non-prime attribute depends on only part of a composite candidate key. 2NF removes this." },
  "transitive dependency": { th: "คีย์กำหนด attribute หนึ่ง แล้ว attribute นั้นกำหนด non-prime attribute อีกทอดหนึ่ง เป็นสิ่งที่ 3NF พิจารณา", en: "A key determines an attribute that in turn determines a non-prime attribute; 3NF addresses this." },
  "candidate key": { th: "ชุด attribute ที่ระบุทุกแถวได้ และไม่มี attribute ส่วนเกินเมื่อตัดออกทีละตัว", en: "A minimal set of attributes that identifies every tuple; removing any attribute breaks that property." },
  "superkey": { th: "ชุด attribute ที่ระบุทุกแถวได้ อาจมี attribute เกินจากที่จำเป็น", en: "A set of attributes that identifies every tuple; it may contain unnecessary attributes." },
  "primary key": { th: "Candidate Key ที่เลือกใช้ระบุแถวหลักของตาราง ต้องไม่ซ้ำและห้ามเป็น NULL", en: "The selected candidate key for identifying rows. It must be unique and non-NULL." },
  "foreign key": { th: "attribute ที่อ้างอิง Primary Key หรือ candidate ที่บังคับ unique ในอีกตาราง ช่วยรักษาความสอดคล้องของความสัมพันธ์", en: "An attribute referencing an enforced key in another relation, helping maintain referential integrity." },
  "composite key": { th: "คีย์ที่ประกอบด้วยหลาย attribute เช่น {jobNo, partNo}", en: "A key composed of more than one attribute, such as {jobNo, partNo}." },
  determinant: { th: "ชุด attribute ทางซ้ายของ Functional Dependency ซึ่งกำหนดค่าทางขวา", en: "The attribute set on the left of a functional dependency; it determines the right side." },
  "prime attribute": { th: "attribute ที่อยู่ใน Candidate Key อย่างน้อยหนึ่งชุด", en: "An attribute that belongs to at least one candidate key." },
  "non-prime attribute": { th: "attribute ที่ไม่ได้อยู่ใน Candidate Key ชุดใดเลย", en: "An attribute that belongs to no candidate key." },
  normalization: { th: "การจัด relation เพื่อลดข้อมูลซ้ำและปัญหาเพิ่ม แก้ไข หรือลบข้อมูล โดยอาศัย FD และกฎของแต่ละ Normal Form", en: "Organizing relations to reduce redundancy and insertion, update, and deletion anomalies using FDs and normal-form rules." },
  "1nf": { th: "First Normal Form: แต่ละช่องมีค่าเดียว ไม่มี repeating group ใน cell", en: "First Normal Form: each cell holds one value; no repeating groups in a cell." },
  "2nf": { th: "Second Normal Form: อยู่ใน 1NF และไม่มี partial dependency ของ non-prime attribute บน candidate key", en: "Second Normal Form: in 1NF, with no partial dependency of a non-prime attribute on a candidate key." },
  "3nf": { th: "Third Normal Form: ทุก FD ที่ไม่ trivial มี determinant เป็น superkey หรือด้านขวาเป็น prime attribute", en: "Third Normal Form: each non-trivial FD has a superkey determinant or a prime right-side attribute." },
  bcnf: { th: "Boyce-Codd Normal Form: determinant ของทุก FD ที่ไม่ trivial ต้องเป็น superkey", en: "Boyce-Codd Normal Form: the determinant of every non-trivial FD must be a superkey." },
  unf: { th: "Unnormalized Form: ตารางที่ยังมี repeating group หรือข้อมูลหลายค่าในช่องเดียว", en: "An unnormalized relation that may contain repeating groups or multiple values in one cell." },
  "functional dependencies": { th: "กฎที่เชื่อมชุด attribute ต้นทางกับ attribute ที่ถูกกำหนด เช่น A → B", en: "Rules connecting determinant attributes to attributes they determine, such as A → B." },
  fd: { th: "ตัวย่อของ Functional Dependency", en: "Short for functional dependency." },
  closure: { th: "ผลลัพธ์ของ Attribute Closure: attribute ทั้งหมดที่อนุมานได้จากชุดตั้งต้น", en: "The result of attribute closure: every attribute derivable from the starting set." },
  "foreign key (fk)": { th: "Foreign Key ใช้อ้างอิง key ของ relation ปลายทาง", en: "A foreign key references a key in a target relation." },
  "primary key (pk)": { th: "Primary Key คือ Candidate Key ที่เลือกใช้ระบุแถว", en: "The chosen candidate key used to identify rows." },
  "entity relationship diagram": { th: "แผนภาพที่แสดง entity, attribute และความสัมพันธ์ก่อนแปลงเป็น relational schema", en: "A diagram of entities, attributes, and relationships before mapping them to a relational schema." },
  "entity": { th: "สิ่งหรือแนวคิดที่ต้องเก็บข้อมูล เช่น STUDENT หรือ COURSE", en: "A thing or concept about which the database stores data, such as STUDENT or COURSE." },
  "cardinality": { th: "จำนวนสมาชิกที่สัมพันธ์กันได้ เช่น 1:1, 1:N หรือ M:N", en: "How many instances can participate in a relationship, such as 1:1, 1:N, or M:N." },
  "associative entity": { th: "entity กลางที่แปลงความสัมพันธ์ M:N เป็นตาราง เช่น JOB_PART", en: "An entity that maps an M:N relationship into a relation, such as JOB_PART." },
  "weak entity": { th: "entity ที่ระบุแถวด้วย partial key ร่วมกับ key ของ owner entity", en: "An entity identified using a partial key together with its owner entity key." },
  "referential integrity": { th: "ค่า FK ที่ไม่ใช่ NULL ต้องตรงกับ key ที่มีอยู่ใน relation ปลายทาง", en: "Every non-NULL FK value must match an existing key in the referenced relation." },
  "lossless decomposition": { th: "การแยก relation ที่ JOIN กลับแล้วไม่สร้างแถวปลอมและไม่ทำข้อมูลเดิมหาย", en: "A decomposition whose join reconstructs the original relation without spurious or lost tuples." },
  "dependency preserving": { th: "ตรวจสอบ FD เดิมได้จาก relation ที่แยกแล้ว โดยไม่ต้อง JOIN กลับ", en: "The original FDs can be checked on the decomposed relations without joining them back." },
  "overlapping": { th: "entity หนึ่งอยู่ในหลาย subclass พร้อมกันได้", en: "One entity may belong to more than one subclass at the same time." },
  disjoint: { th: "entity หนึ่งอยู่ใน subclass ได้ไม่เกินหนึ่งประเภท", en: "An entity can belong to at most one subclass." },
  "total specialization": { th: "ทุก instance ของ superclass ต้องเป็นสมาชิกอย่างน้อยหนึ่ง subclass", en: "Every superclass instance must belong to at least one subclass." },
  "partial specialization": { th: "instance ของ superclass อาจไม่อยู่ใน subclass ใดเลย", en: "A superclass instance may belong to no subclass." },
  "subclass": { th: "กลุ่มย่อยของ entity หลัก (superclass) ที่อาจมี attribute หรือ relationship เฉพาะของตัวเอง", en: "A subgroup of a superclass entity that may have its own attributes or relationships." },
  "superclass": { th: "entity หลักที่แบ่งออกเป็น subclass ต่าง ๆ", en: "The parent entity that is specialized into subclasses." },
  "generalization": { th: "รวม entity หลายชนิดที่มีคุณสมบัติร่วมเป็น superclass เดียว", en: "Combining entity types with shared properties into one superclass." },
  "specialization": { th: "แบ่ง superclass เป็น subclass ตามคุณสมบัติหรือเงื่อนไขเฉพาะ", en: "Dividing a superclass into subclasses based on specific properties or conditions." },
  "partial": { th: "ใน EER หมายถึง superclass instance ไม่จำเป็นต้องอยู่ใน subclass; ใน Normalization อาจหมายถึง dependency ที่ขึ้นกับบางส่วนของ key", en: "In EER, a superclass instance need not belong to a subclass. In normalization, a partial dependency uses only part of a key." },
  total: { th: "ใน EER หมายถึงทุก superclass instance ต้องอยู่ใน subclass อย่างน้อยหนึ่งประเภท", en: "In EER, every superclass instance must belong to at least one subclass." },
  tuple: { th: "หนึ่งแถวของ relation", en: "One row of a relation." },
  relation: { th: "ตารางเชิงสัมพันธ์ที่มี schema ระบุ attribute และข้อกำหนด", en: "A relational table with a schema defining attributes and constraints." },
  attribute: { th: "คุณสมบัติหรือคอลัมน์ของ relation เช่น studentId", en: "A property or column of a relation, such as studentId." },
  domain: { th: "เซตของค่าที่ attribute หนึ่งยอมรับได้ เช่น จำนวนเต็มหรือรหัสนักศึกษา", en: "The set of permitted values for an attribute, such as integers or student IDs." },
  schema: { th: "โครงสร้างที่บอก relation, attributes และข้อกำหนด โดยไม่ใช่ข้อมูลแต่ละแถว", en: "The structure describing relations, attributes, and constraints, separate from the individual rows." },
  relationship: { th: "ความเชื่อมโยงระหว่าง entity เช่น STUDENT อยู่ใน DEPARTMENT", en: "An association between entities, such as a STUDENT belonging to a DEPARTMENT." },
  eer: { th: "Enhanced ER เพิ่มแนวคิด superclass/subclass และข้อจำกัดการแบ่งประเภทจาก ER model", en: "Enhanced ER extends the ER model with superclasses, subclasses, and specialization constraints." },
  anomaly: { th: "ปัญหาจากการเก็บข้อมูลซ้ำ เช่น update, insertion หรือ deletion anomaly", en: "A problem caused by redundant data, such as an update, insertion, or deletion anomaly." },
  "insertion anomaly": { th: "เพิ่มข้อมูลใหม่ไม่ได้โดยไม่ต้องใส่ข้อมูลอื่นที่ยังไม่มีหรือไม่เกี่ยวข้อง", en: "A new fact cannot be inserted without also supplying unrelated or unavailable data." },
  "update anomaly": { th: "ข้อมูลข้อเท็จจริงเดียวกันอยู่หลายแถว ทำให้แก้ไม่ครบแล้วข้อมูลขัดแย้งกัน", en: "The same fact appears in multiple rows; an incomplete update leaves conflicting values." },
  "deletion anomaly": { th: "การลบแถวหนึ่งทำให้ข้อเท็จจริงอื่นที่ยังต้องการหายไปด้วย", en: "Deleting a row unintentionally removes another fact that should be retained." },
  "first normal form": { th: "1NF: แต่ละช่องมีค่าเดียว ไม่มี repeating group", en: "1NF: every cell holds one value, with no repeating groups." },
  "second normal form": { th: "2NF: อยู่ใน 1NF และไม่มี partial dependency ของ non-prime attribute", en: "2NF: in 1NF, with no partial dependency of a non-prime attribute." },
  "third normal form": { th: "3NF: determinant เป็น superkey หรือ attribute ด้านขวาเป็น prime", en: "3NF: the determinant is a superkey or the right-side attribute is prime." },
  "boyce-codd normal form": { th: "BCNF: determinant ของ FD ที่ไม่ trivial ทุกตัวต้องเป็น superkey", en: "BCNF: every non-trivial FD determinant must be a superkey." },
  "lossless": { th: "การแยกแบบ JOIN กลับแล้วสร้าง relation เดิมได้โดยไม่มีแถวเกินหรือข้อมูลหาย", en: "A decomposition whose join recovers the original relation without extra or missing tuples." },
};

const aliases: Record<string, string> = {
  "attribute closure": "attribute closure", "closure": "closure",
  "functional dependency": "functional dependency", "functional dependencies": "functional dependencies", "fd": "fd",
  "full functional dependency": "full functional dependency", "partial dependency": "partial dependency", "transitive dependency": "transitive dependency",
  "candidate key": "candidate key", "candidate keys": "candidate key", "superkey": "superkey", "super key": "superkey",
  "primary key": "primary key", "primary keys": "primary key", "pk": "primary key (pk)", "foreign key": "foreign key", "foreign keys": "foreign key", "fk": "foreign key (fk)", "composite key": "composite key",
  "determinant": "determinant", "prime attribute": "prime attribute", "non-prime attribute": "non-prime attribute",
  "normalization": "normalization", "unnormalized form": "unf", "unf": "unf", "1nf": "1nf", "first normal form": "first normal form", "2nf": "2nf", "second normal form": "second normal form", "3nf": "3nf", "third normal form": "third normal form", "bcnf": "bcnf", "boyce-codd normal form": "boyce-codd normal form",
  "entity relationship diagram": "entity relationship diagram", "erd": "entity relationship diagram", "eer": "eer", "entity": "entity", "cardinality": "cardinality", "relationship": "relationship",
  "associative entity": "associative entity", "weak entity": "weak entity", "referential integrity": "referential integrity",
  "lossless decomposition": "lossless decomposition", "lossless": "lossless", "dependency preserving": "dependency preserving", "dependency-preserving": "dependency preserving", "overlapping": "overlapping", "disjoint": "disjoint",
  "total specialization": "total specialization", "partial specialization": "partial specialization", "tuple": "tuple", "relation": "relation", "anomaly": "anomaly", "anomalies": "anomaly", "insertion anomaly": "insertion anomaly", "update anomaly": "update anomaly", "deletion anomaly": "deletion anomaly",
  "subclass": "subclass", "superclass": "superclass", "generalization": "generalization", "specialization": "specialization", "partial": "partial", "total": "total", "attribute": "attribute", "attributes": "attribute", "domain": "domain", "schema": "schema",
};

const patterns = Object.keys(aliases).sort((a, b) => b.length - a.length);
const termPattern = new RegExp(`\\b(${patterns.join("|")})\\b`, "gi");

function GlossaryTerm({ term, lang }: { term: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const key = aliases[term.toLowerCase()];
  const definition = definitions[key]?.[lang] ?? definitions[key]?.en ?? "";
  return (
    <span className="db-glossary-term-wrap">
      <button
        type="button"
        className="db-glossary-term"
        aria-label={`${term}: ${definition}`}
        aria-describedby={tooltipId}
        aria-controls={tooltipId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        {term}
      </button>
      <span id={tooltipId} className="db-glossary-tooltip" role="tooltip">{definition}</span>
    </span>
  );
}

export default function GlossaryText({ text, lang }: { text: string; lang: Lang }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(termPattern)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    nodes.push(<GlossaryTerm key={`${index}-${value}`} term={value} lang={lang} />);
    last = index + value.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
