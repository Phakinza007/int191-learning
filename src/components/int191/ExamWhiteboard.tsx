import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Lang } from "../../lib/int191/model";

type NodeId =
  | "requirements" | "erd" | "eer" | "mapping" | "schema" | "fd"
  | "closure" | "keys" | "anomalies" | "unf" | "2nf" | "3nf" | "bcnf";
type BoardNode = {
  id: NodeId; x: number; y: number; title: string; en: string; subtitle: string; subtitleEn: string;
  topic: string; group: "design" | "logic" | "normalization";
  what: string; whatEn: string; why: string; whyEn: string; steps: string[]; stepsEn: string[];
};
type BoardEdge = { from: NodeId; to: NodeId; label: string; labelEn: string; curve?: string };

const nodes: BoardNode[] = [
  { id: "requirements", x: 35, y: 48, title: "กฎธุรกิจ", en: "Business rules", subtitle: "ข้อมูลอะไร · เงื่อนไขอะไร", subtitleEn: "Facts to store · rules to enforce", topic: "erd", group: "design", what: "เริ่มจากประโยคความต้องการขององค์กร เช่น ลูกค้าหนึ่งคนมีงานซ่อมได้หลายงาน และงานหนึ่งมีอะไหล่ได้หลายชนิด", whatEn: "Start with organization rules: one customer may have many repair jobs, and one job may use many part types.", why: "กฎธุรกิจเป็นหลักฐานที่ใช้กำหนด Entity, Relationship, cardinality และข้อบังคับของข้อมูล ไม่ควรเดาจากแถวตัวอย่างไม่กี่แถว", whyEn: "Business rules establish entities, relationships, cardinalities, and constraints. A few sample rows cannot prove a rule.", steps: ["ขีดเส้นใต้คำนามเพื่อหา Entity", "หาคำบอกจำนวนและข้อบังคับ", "เขียนกฎให้ชัดก่อนวาดแบบจำลอง"], stepsEn: ["Find entities in the nouns", "Find cardinality and constraints", "Write rules clearly before diagramming"] },
  { id: "erd", x: 310, y: 48, title: "ER Diagram", en: "ER model", subtitle: "Entity · Attribute · Relationship", subtitleEn: "Entity · Attribute · Relationship", topic: "erd", group: "design", what: "ERD แสดงสิ่งที่ต้องเก็บ (Entity) คุณสมบัติ (Attribute) และความสัมพันธ์พร้อม cardinality เช่น 1:N หรือ M:N", whatEn: "An ERD shows the things to store (entities), their properties (attributes), and relationships with cardinalities such as 1:N or M:N.", why: "ERD ช่วยตรวจความหมายกับผู้ใช้ก่อนแปลงเป็นตาราง ลดการตกหล่นและวางความสัมพันธ์ผิด", whyEn: "An ERD lets you validate meaning before mapping to tables, helping prevent missing entities and incorrect relationships.", steps: ["กำหนด Entity และ key", "ระบุ relationship กับ cardinality", "ตรวจ optional/mandatory participation"], stepsEn: ["Identify entities and keys", "Set relationships and cardinality", "Check optional or mandatory participation"] },
  { id: "eer", x: 585, y: 48, title: "Enhanced ER", en: "EER constraints", subtitle: "Superclass / Subclass", subtitleEn: "Superclass / Subclass", topic: "erd", group: "design", what: "EER เพิ่ม subtype ให้ ER เช่น ACCOUNT แบ่งเป็น CREATOR และ PREMIUM พร้อมกฎ disjoint/overlapping และ total/partial", whatEn: "EER extends ER with subtypes, such as ACCOUNT split into CREATOR and PREMIUM, plus disjoint/overlapping and total/partial rules.", why: "สองคู่คำนี้ตอบคนละเรื่อง: disjoint บอกว่าซ้ำ subtype ได้ไหม ส่วน total บอกว่าทุก supertype ต้องอยู่ใน subtype หรือไม่", whyEn: "These pairs answer different questions: disjointness asks whether subtypes may overlap; total participation asks whether every supertype must belong to a subtype.", steps: ["กำหนด supertype และ subtype", "ถามว่า subtype ซ้อนกันได้หรือไม่", "ถามว่าทุก entity ต้องเป็น subtype หรือไม่"], stepsEn: ["Define the supertype and subtypes", "Ask whether subtype membership can overlap", "Ask whether every supertype must be in a subtype"] },
  { id: "mapping", x: 860, y: 48, title: "ER → Relations", en: "Logical mapping", subtitle: "แปลงแบบจำลองเป็นตาราง", subtitleEn: "Map the model into relations", topic: "erd", group: "design", what: "Mapping คือแปลง Entity/Relationship ให้เป็น relation และกำหนด PK/FK ตามชนิดความสัมพันธ์", whatEn: "Mapping converts entities and relationships into relations, placing PKs and FKs according to relationship type.", why: "นี่คือจุดที่แบบจำลองเชิงแนวคิดกลายเป็นโครงสร้างที่ DBMS บังคับใช้ได้", whyEn: "This turns a conceptual model into structures a DBMS can enforce.", steps: ["Entity กลายเป็น relation", "1:N วาง FK ฝั่ง N", "M:N สร้าง associative relation ที่มี FK ทั้งสองฝั่ง"], stepsEn: ["Map each entity to a relation", "Place the FK on the N side of 1:N", "Resolve M:N with a relation containing both FKs"] },
  { id: "schema", x: 860, y: 230, title: "Relational Schema", en: "Relations & constraints", subtitle: "ตาราง · PK · FK · UNIQUE · CHECK", subtitleEn: "Tables · PK · FK · UNIQUE · CHECK", topic: "fundamentals", group: "design", what: "Schema ระบุชื่อตาราง คอลัมน์ ชนิดข้อมูล และ constraints เช่น PK, FK, UNIQUE, NOT NULL และ CHECK", whatEn: "A schema defines relations, columns, data types, and constraints such as PK, FK, UNIQUE, NOT NULL, and CHECK.", why: "การออกแบบที่ดีต้องแปลงความหมายของกฎธุรกิจเป็นข้อบังคับที่ฐานข้อมูลตรวจได้จริง", whyEn: "Good design translates business meaning into rules the database can actually enforce.", steps: ["เลือกชนิดและ domain ให้ตรง", "ระบุ key และ nullability", "ยืนยัน FK อ้างถึง key ที่ unique"], stepsEn: ["Choose suitable types and domains", "Set keys and nullability", "Ensure each FK targets a unique key"] },
  { id: "fd", x: 585, y: 230, title: "Functional Dependency", en: "FD: X → Y", subtitle: "ค่า X เดียวกันต้องกำหนด Y เดียวกัน", subtitleEn: "Same X value must imply the same Y", topic: "fd", group: "logic", what: "X → Y หมายถึงทุกข้อมูลที่ถูกต้อง ถ้าสองแถวมี X เท่ากัน ต้องมี Y เท่ากันด้วย X คือ determinant", whatEn: "X → Y means that in every valid relation, any two rows equal on X must also be equal on Y. X is the determinant.", why: "FD บอกความหมายของข้อมูลและเป็นเครื่องมือหาคีย์ ตรวจ redundancy และตัดสิน Normal Form", whyEn: "FDs capture data meaning and help find keys, detect redundancy, and test normal forms.", steps: ["อ่านกฎจาก semantics", "แยก determinant กับ dependent", "ห้ามอนุมานกลับทิศหรือเดาจาก sample"], stepsEn: ["Read rules from their semantics", "Identify determinants and dependents", "Do not reverse an FD or infer it from sample rows"] },
  { id: "closure", x: 310, y: 230, title: "Attribute Closure", en: "X⁺", subtitle: "ไล่ FD เพื่อหาสิ่งที่ X ระบุได้", subtitleEn: "Apply FDs to find what X determines", topic: "closure", group: "logic", what: "X⁺ คือชุด attribute ทั้งหมดที่อนุมานจาก X ได้ภายใต้ FD ที่กำหนด เริ่มจาก X แล้วใช้ FD ซ้ำจนไม่มีค่าเพิ่ม", whatEn: "X⁺ is the set of all attributes implied by X under the given FDs. Start with X and apply FDs until no new attributes can be added.", why: "ใช้พิสูจน์ว่า X เป็น superkey หรือไม่ และช่วยตรวจ candidate key อย่างเป็นระบบ", whyEn: "Closure proves whether X is a superkey and provides a systematic way to test candidate keys.", steps: ["ตั้ง X⁺ = X", "ใช้ FD เมื่อรู้ LHS ครบ", "เพิ่ม RHS แล้ววนซ้ำจนคงที่"], stepsEn: ["Initialize X⁺ to X", "Apply an FD only when its full LHS is known", "Add its RHS and repeat until stable"] },
  { id: "keys", x: 35, y: 230, title: "Keys", en: "Superkey → Candidate → PK", subtitle: "ครอบคลุมทุกแถวและต้อง minimal", subtitleEn: "Identify every row, with minimality", topic: "candidate", group: "logic", what: "Superkey ระบุ tuple ได้ Candidate Key คือ superkey ที่ไม่มี attribute ส่วนเกิน ส่วน Primary Key คือ candidate ที่เลือกใช้เป็นหลัก", whatEn: "A superkey identifies tuples. A candidate key is a minimal superkey. The primary key is the chosen candidate key.", why: "คีย์กำหนดเอกลักษณ์ของแถวและเป็นฐานของ FK; candidate keys ยังใช้ตรวจ 2NF/3NF", whyEn: "Keys identify rows and anchor FKs. All candidate keys also matter when checking 2NF and 3NF.", steps: ["คำนวณ closure ให้ครบ relation", "ตัด attribute ทีละตัวเพื่อทดสอบ minimality", "หา prime attributes จากทุก candidate key"], stepsEn: ["Compute closure over the full relation", "Remove attributes one at a time to test minimality", "Find prime attributes across all candidate keys"] },
  { id: "anomalies", x: 35, y: 430, title: "Redundancy & Anomalies", en: "Update · Insert · Delete", subtitle: "ข้อมูลซ้ำทำให้แก้ไม่ครบหรือเพิ่มไม่ได้", subtitleEn: "Duplication can block or lose facts", topic: "unf", group: "normalization", what: "เมื่อเก็บหลาย fact ปนในตารางเดียว ข้อมูลซ้ำอาจทำให้แก้บางแถวแล้วไม่ครบ (update), เพิ่ม fact ไม่ได้ (insert) หรือลบแล้วข้อมูลอื่นหาย (delete)", whatEn: "When multiple facts share one table, duplication can cause update anomalies, prevent inserting a fact, or delete unrelated information.", why: "Anomaly เป็นอาการที่ชี้ว่าควรวิเคราะห์ grain และ FD ก่อนแยก relation อย่างถูกต้อง", whyEn: "Anomalies signal that you should analyze the row grain and FDs before decomposing relations.", steps: ["ถามว่าแต่ละแถวแทนเหตุการณ์อะไร", "ชี้ fact ที่ซ้ำและ dependency ที่ทำให้ซ้ำ", "แยก relation โดยคง key/FK"], stepsEn: ["State what one row represents", "Identify repeated facts and their dependencies", "Split relations while preserving keys and FKs"] },
  { id: "unf", x: 310, y: 430, title: "UNF → 1NF", en: "Atomic values", subtitle: "หนึ่งช่องเก็บหนึ่งค่า · ไม่มี repeating group", subtitleEn: "One value per cell · no repeating groups", topic: "1nf", group: "normalization", what: "เริ่มจากข้อมูลที่อาจมีรายการซ้อน แล้วจัดให้หนึ่งตำแหน่งเก็บค่าเดียวตาม domain และกำหนด grain/คีย์ของแต่ละแถว", whatEn: "Expand nested lists so each cell holds one domain value, and define the grain and key for each row.", why: "เป็นฐานก่อนตรวจ partial dependency; การเป็น 1NF ยังไม่ได้แปลว่าหมดข้อมูลซ้ำหรือ anomaly", whyEn: "1NF is the starting point for checking partial dependencies, but it does not remove all redundancy or anomalies.", steps: ["แผ่ repeating group เป็นหลายแถว", "รักษาคู่ข้อมูลที่สัมพันธ์กัน", "ระบุ composite key ตาม grain"], stepsEn: ["Expand repeating groups into rows", "Keep related values paired", "Set a composite key matching the row grain"] },
  { id: "2nf", x: 585, y: 430, title: "2NF", en: "Remove partial dependency", subtitle: "1NF + non-prime ไม่ขึ้นกับส่วนหนึ่งของ key", subtitleEn: "1NF + no partial dependency of non-prime attrs", topic: "2nf", group: "normalization", what: "2NF ต้องเป็น 1NF และไม่มี non-prime attribute ที่ขึ้นกับ proper subset ของ candidate key ใด ๆ", whatEn: "2NF requires 1NF and no non-prime attribute may depend on a proper subset of any candidate key.", why: "ถ้า key เป็น (jobNo, partNo), jobDate ที่ขึ้นกับ jobNo อย่างเดียวซ้ำในทุก part ของงานเดียวกัน", whyEn: "With key (jobNo, partNo), a jobDate that depends only on jobNo repeats for every part on that job.", steps: ["หา candidate keys และ prime attributes", "ตรวจทุก proper subset ของ key", "ย้าย fact ที่ขึ้นกับส่วนหนึ่งไป relation ของ determinant"], stepsEn: ["Find candidate keys and prime attributes", "Check every proper subset of each key", "Move facts determined by a subset to a relation for that determinant"] },
  { id: "3nf", x: 860, y: 430, title: "3NF", en: "Remove transitive issues", subtitle: "ทุก X → A: X superkey หรือ A prime", subtitleEn: "For X → A: X is superkey or A is prime", topic: "3nf", group: "normalization", what: "เกณฑ์ 3NF สำหรับทุก non-trivial FD X → A คือ X เป็น superkey หรือ A เป็น prime attribute", whatEn: "For every non-trivial FD X → A, 3NF requires X to be a superkey or A to be a prime attribute.", why: "เช่น jobNo → customerId และ customerId → customerName ทำให้ข้อมูลลูกค้าซ้ำตามงาน จึงแยก CUSTOMER", whyEn: "For example, jobNo → customerId and customerId → customerName duplicate customer facts across jobs, so CUSTOMER becomes a separate relation.", steps: ["ตรวจ FD ที่ไม่ trivial", "ระบุ superkey และ prime RHS", "แยก determinant ที่ไม่ใช่ superkey เมื่อ RHS non-prime"], stepsEn: ["Check non-trivial FDs", "Identify superkeys and prime RHS attributes", "Decompose when the determinant is not a superkey and the RHS is non-prime"] },
  { id: "bcnf", x: 860, y: 620, title: "BCNF", en: "Every determinant is a superkey", subtitle: "เข้มกว่า 3NF", subtitleEn: "Stronger than 3NF", topic: "bcnf", group: "normalization", what: "BCNF กำหนดให้ determinant ของทุก non-trivial FD ใน F⁺ เป็น superkey ของ relation นั้น", whatEn: "BCNF requires the determinant of every non-trivial FD in F⁺ to be a superkey of that relation.", why: "3NF ยังยอม FD ที่ determinant ไม่ใช่ superkey ได้ หาก RHS เป็น prime; BCNF ไม่มีข้อยกเว้นนี้", whyEn: "3NF may allow a non-superkey determinant when the RHS is prime; BCNF has no such exception.", steps: ["พิจารณา FD ที่ฉายอยู่ใน relation", "คำนวณ closure ของ determinant", "หากไม่เป็น superkey ให้พิจารณา decomposition และตรวจ lossless"], stepsEn: ["Check FDs projected onto the relation", "Compute each determinant’s closure", "If it is not a superkey, decompose and verify losslessness"] },
];

const edges: BoardEdge[] = [
  { from: "requirements", to: "erd", label: "หา Entity / กฎ", labelEn: "Identify entities and rules" },
  { from: "erd", to: "eer", label: "เพิ่ม subtype", labelEn: "Add subtypes" },
  { from: "erd", to: "mapping", label: "แปลงแบบจำลอง", labelEn: "Map the model", curve: "M 470 112 C 600 145, 700 145, 860 112" },
  { from: "eer", to: "mapping", label: "ใช้ constraints", labelEn: "Map constraints", curve: "M 745 112 C 790 142, 815 142, 860 112" },
  { from: "mapping", to: "schema", label: "สร้าง relation", labelEn: "Create relations" },
  { from: "schema", to: "fd", label: "ตรวจ facts", labelEn: "Check data facts", curve: "M 860 270 C 790 310, 700 310, 690 270" },
  { from: "fd", to: "closure", label: "ใช้ FD คำนวณ", labelEn: "Apply FDs" },
  { from: "closure", to: "keys", label: "พิสูจน์ superkey", labelEn: "Prove superkeys" },
  { from: "schema", to: "anomalies", label: "ตรวจข้อมูลซ้ำ", labelEn: "Find repeated facts", curve: "M 860 280 C 650 345, 350 350, 255 430" },
  { from: "fd", to: "anomalies", label: "ชี้ fact ที่ซ้ำ", labelEn: "Explain redundancy", curve: "M 585 270 C 450 330, 320 355, 255 430" },
  { from: "anomalies", to: "unf", label: "แก้ grain / repeating group", labelEn: "Fix grain and repeating groups" },
  { from: "unf", to: "2nf", label: "ตรวจ partial dependency", labelEn: "Check partial dependencies" },
  { from: "2nf", to: "3nf", label: "ตรวจ transitive / formal rule", labelEn: "Check transitive / formal rule", curve: "M 745 475 C 820 510, 820 555, 860 620" },
  { from: "3nf", to: "bcnf", label: "ตรวจ determinant", labelEn: "Check determinants", curve: "M 1005 512 L 1005 620" },
  { from: "keys", to: "2nf", label: "ต้องรู้ทุก candidate key", labelEn: "Check all candidate keys", curve: "M 255 270 C 360 350, 500 390, 585 455" },
];

const groupColor = { design: "#3478d4", logic: "#9457c7", normalization: "#147f69" };
const msg = (lang: Lang, th: string, en: string) => lang === "th" ? th : en;

export default function ExamWhiteboard({ lang, onOpenLesson }: { lang: Lang; onOpenLesson: (topic: string) => void }) {
  const [selectedId, setSelectedId] = useState<NodeId>("requirements");
  const [scale, setScale] = useState(1);
  const selected = nodes.find((n) => n.id === selectedId)!;
  const connected = useMemo(() => new Set(edges.flatMap((e) => e.from === selectedId ? [e.to] : e.to === selectedId ? [e.from] : [])), [selectedId]);
  const onKey = (event: KeyboardEvent<SVGGElement>, id: NodeId) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(id); }
  };

  return <div className="db-whiteboard">
    <div className="db-whiteboard-intro">
      <div><p className="db-whiteboard-kicker">{msg(lang, "แผนที่เนื้อหาสอบ · INT191 Exam 2", "EXAM SCOPE · INT191 EXAM 2")}</p>
        <h3>{msg(lang, "เห็นภาพรวม แล้วค่อยเจาะทีละเรื่อง", "See the whole system, then explore each idea")}</h3>
        <p>{msg(lang, "แผนที่นี้อิงขอบเขตสอบที่ประกาศ: Logical DB Design, Enhanced ER Diagram และ Normalization เลือกกล่องเพื่อดูว่าหัวข้อนั้นหมายถึงอะไร ใช้ทำอะไร และเชื่อมกับเรื่องใด", "This map follows the announced scope: Logical DB Design, Enhanced ER Diagram, and Normalization. Select a node to see what it means, why it matters, and how it connects.")}</p></div>
      <div className="db-whiteboard-domain-key" aria-label={msg(lang, "กลุ่มหัวข้อ", "Topic groups")}>
        <span><i data-group="design" />{msg(lang, "ออกแบบฐานข้อมูล", "Database design")}</span><span><i data-group="logic" />{msg(lang, "FD และ Keys", "FDs and keys")}</span><span><i data-group="normalization" />{msg(lang, "Normalization", "Normalization")}</span>
      </div>
    </div>
    <section className="db-whiteboard-frame" aria-label={msg(lang, "กระดานภาพรวมเนื้อหาสอบ", "Exam content whiteboard")}>
      <div className="db-whiteboard-toolbar"><span>{msg(lang, "เลือกหัวข้อบนกระดาน · ใช้ trackpad/แถบเลื่อนเพื่อเลื่อนดู", "Select a topic · Use trackpad or scrollbars to pan")}</span>
        <div><button type="button" aria-label={msg(lang, "ย่อภาพ", "Zoom out")} onClick={() => setScale((v) => Math.max(0.8, +(v - 0.1).toFixed(1)))}>−</button><output aria-live="polite">{Math.round(scale * 100)}%</output><button type="button" aria-label={msg(lang, "ขยายภาพ", "Zoom in")} onClick={() => setScale((v) => Math.min(1.4, +(v + 0.1).toFixed(1)))}>+</button><button type="button" onClick={() => setScale(1)}>{msg(lang, "พอดีจอ", "Fit")}</button></div>
      </div>
      <div className="db-whiteboard-canvas" tabIndex={0} aria-label={msg(lang, "พื้นที่แผนภาพ เลื่อนแนวนอนหรือแนวตั้งได้", "Diagram canvas, scroll horizontally or vertically")}>
        <svg className="db-whiteboard-svg" style={{ width: `${scale * 100}%` }} viewBox="0 0 1160 750" role="group" aria-label={msg(lang, "แผนภาพความเชื่อมโยงของหัวข้อสอบ INT191", "Connections among INT191 exam topics")}>
          <defs><marker id="wb-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker></defs>
          <g className="db-wb-edges">{edges.map((edge) => {
            const a = nodes.find((n) => n.id === edge.from)!; const b = nodes.find((n) => n.id === edge.to)!;
            const path = edge.curve ?? `M ${a.x + 110} ${a.y + 45} L ${b.x + 110} ${b.y + 45}`;
            const active = edge.from === selectedId || edge.to === selectedId;
            const labelX = edge.curve ? (a.x + b.x + 220) / 2 : (a.x + b.x + 220) / 2;
            const labelY = a.y === b.y ? a.y - 8 : a.x === b.x ? (a.y + b.y + 90) / 2 : edge.curve ? Math.min(a.y, b.y) + (Math.abs(a.y - b.y) > 100 ? 35 : 2) : (a.y + b.y + 90) / 2 - 10;
            return <g key={`${edge.from}-${edge.to}`} className={active ? "is-connected" : ""}>
              <path d={path} markerEnd="url(#wb-arrow)" />
              <text x={labelX} y={labelY} textAnchor="middle">{lang === "th" ? edge.label : edge.labelEn}</text>
            </g>;
          })}</g>
          {nodes.map((node) => {
            const active = selectedId === node.id; const related = connected.has(node.id);
            return <g key={node.id} className={`db-wb-node ${active ? "is-selected" : ""} ${related ? "is-related" : ""}`} transform={`translate(${node.x} ${node.y})`} role="button" tabIndex={0} aria-pressed={active} aria-label={`${node.title} / ${node.en}`} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => onKey(event, node.id)}>
              <rect width="220" height="91" rx="13" style={{ "--node-accent": groupColor[node.group] } as CSSProperties} />
              <path d="M 4 14 L 4 77" stroke={groupColor[node.group]} strokeWidth="4" strokeLinecap="round" />
              <text className="db-wb-node-title" x="15" y="27">{lang === "th" ? node.title : node.en}</text>
              <text className="db-wb-node-en" x="15" y="48">{lang === "th" ? node.en : node.title}</text>
              <text className="db-wb-node-sub" x="15" y="70">{lang === "th" ? node.subtitle : node.subtitleEn}</text>
              {active && <circle cx="201" cy="15" r="4" />}
            </g>;
          })}
        </svg>
      </div>
      <p className="db-whiteboard-note">{msg(lang, "ลูกศรแสดงความสัมพันธ์เพื่อการเรียนรู้ ไม่ได้หมายความว่าทุกหัวข้อต้องทำตามลำดับตายตัว · ใช้ Tab แล้วกด Enter/Space เพื่อเลือกกล่อง", "Arrows show learning relationships, not a mandatory sequence. Use Tab, then Enter/Space to select a node.")}</p>
    </section>
    <section className="db-whiteboard-detail" aria-live="polite" aria-labelledby="db-whiteboard-detail-title">
      <div className="db-whiteboard-detail-label"><span>{msg(lang, "หัวข้อที่เลือก", "SELECTED TOPIC")}</span><span>{selected.group === "design" ? msg(lang, "ออกแบบฐานข้อมูล", "DATABASE DESIGN") : selected.group === "logic" ? msg(lang, "FD และ Keys", "FDs AND KEYS") : "NORMALIZATION"}</span></div>
      <div className="db-whiteboard-detail-grid"><div><h4 id="db-whiteboard-detail-title">{lang === "th" ? selected.title : selected.en}</h4><p className="db-whiteboard-detail-en">{lang === "th" ? selected.en : selected.title}</p></div>
        <div><strong>{msg(lang, "คืออะไร", "WHAT")}</strong><p>{lang === "th" ? selected.what : selected.whatEn}</p></div><div><strong>{msg(lang, "ทำไมเชื่อมกับเรื่องอื่น", "WHY IT CONNECTS")}</strong><p>{lang === "th" ? selected.why : selected.whyEn}</p></div>
        <div><strong>{msg(lang, "วิธีคิด", "HOW TO THINK")}</strong><ol>{(lang === "th" ? selected.steps : selected.stepsEn).map((step) => <li key={step}>{step}</li>)}</ol></div>
      </div>
      <button className="db-primary-action" type="button" onClick={() => onOpenLesson(selected.topic)}>{msg(lang, "เปิดบทเรียนที่เกี่ยวข้อง", "Open related lesson")} <span aria-hidden="true">→</span></button>
    </section>
  </div>;
}
