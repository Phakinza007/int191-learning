import { bi, type Copy } from "./model";
export type Topic = {
  id: string;
  title: Copy;
  objective: Copy;
  explanation: Copy;
  why: Copy;
  mistake: Copy;
  lab: "normalization" | "fd" | "er" | "sql";
  question: string;
};
/** Topics explicitly relevant to the announced INT191 Exam 2 scope. */
export const examTopicIds: readonly string[] = [
  "fundamentals",
  "keys",
  "fd",
  "closure",
  "candidate",
  "unf",
  "1nf",
  "2nf",
  "3nf",
  "bcnf",
  "erd",
] as const;
export const topics: Topic[] = [
  {
    id: "fundamentals",
    title: bi("ฐานข้อมูลเชิงสัมพันธ์", "Relational fundamentals"),
    objective: bi(
      "แยก relation, tuple และ attribute ได้",
      "Distinguish relations, tuples, and attributes",
    ),
    explanation: bi(
      "Relation คือตารางตาม schema ส่วน tuple คือหนึ่งแถว และ attribute คือคอลัมน์ แต่ละคอลัมน์มี domain กำหนดชนิดและค่าที่อนุญาต ข้อมูลตัวอย่างช่วยอธิบาย แต่ไม่ใช่หลักฐานว่ากฎธุรกิจเป็นจริงเสมอ",
      "A relation follows a schema; a tuple is a row and an attribute is a column. Each attribute has a domain of permitted values. Sample data illustrates rules but cannot establish them for every valid database.",
    ),
    why: bi(
      "ลองเลือก departmentId ของ Alice แล้วติดตามแถว D01 ใน DEPARTMENT ตารางสองชุดเชื่อมกันด้วยค่า ไม่ใช่ตำแหน่งแถว",
      "Select Alice’s departmentId and follow D01 into DEPARTMENT. Tables connect by values, not row positions.",
    ),
    mistake: bi(
      "ลำดับแถวไม่ใช่เอกลักษณ์ของข้อมูล ห้ามใช้แถวที่ 1 แทน Student ID",
      "Row order does not identify a record. “Row 1” is not a Student ID.",
    ),
    lab: "er",
    question: "relation",
  },
  {
    id: "keys",
    title: bi("Keys และ Constraints", "Keys and constraints"),
    objective: bi(
      "แยก Superkey, Candidate Key และ PK ได้",
      "Distinguish superkeys, candidate keys, and primary keys",
    ),
    explanation: bi(
      "Superkey ระบุแถวได้แน่นอน Candidate Key คือ superkey ที่ตัด attribute ใดออกอีกไม่ได้ เลือกหนึ่ง candidate เป็น PK ส่วนอีก candidate เป็น alternate key Composite Key มีหลาย attribute ส่วน FK อ้างถึง key ที่บังคับ unique ของอีกตารางหรือในตารางเดียวกันได้",
      "A superkey identifies every tuple. A candidate key is a minimal superkey. One candidate is selected as PK; others are alternate keys. A composite key has multiple attributes. An FK references an enforced unique key in another or the same table.",
    ),
    why: bi(
      "ใน JOB_SHEET ให้ลอง closure ของ jobNo, partNo และทั้งคู่ แล้วตัดออกทีละตัว",
      "In JOB_SHEET, compare the closures of jobNo, partNo, and both together. Remove each attribute to test minimality.",
    ),
    mistake: bi(
      "ค่าที่ดูไม่ซ้ำในตัวอย่างยังไม่พอจะเป็น Candidate Key ต้องอาศัยกฎที่ให้มา และ PK ห้าม NULL",
      "Unique-looking sample values alone do not establish a candidate key. Use the stated rules. PK attributes cannot be NULL.",
    ),
    lab: "fd",
    question: "key",
  },
  {
    id: "fd",
    title: bi("Functional Dependency", "Functional dependencies"),
    objective: bi(
      "อ่าน X → Y และหา determinant ได้",
      "Read X → Y and identify determinants",
    ),
    explanation: bi(
      "X → Y เป็นกฎของ relation: ทุกคู่แถวในทุกสถานะที่ถูกต้อง ถ้ามี X เท่ากันต้องมี Y เท่ากันด้วย X คือ determinant; กฎนี้ไม่ได้แปลว่ากลับทิศ Y → X ได้ และ X ไม่จำเป็นต้องเป็น PK เช่น jobNo → jobDate แต่ {jobNo,partNo} → quantity ต้องใช้ค่าทั้งคู่ กฎ A → A เป็น trivial FD เพราะด้านขวาอยู่ในด้านซ้ายอยู่แล้ว",
      "X → Y is a relation rule: in every valid instance, any two tuples agreeing on X must also agree on Y. X is the determinant; the rule does not reverse to Y → X, and X need not be a PK. For example, jobNo → jobDate, while {jobNo,partNo} → quantity needs both values. A → A is a trivial FD because the right side is already contained in the left.",
    ),
    why: bi(
      "กดลูกศร FD3 เพื่อเห็นว่า partNo กำหนด partName และ unitPrice โดยไม่ต้องรู้ jobNo",
      "Select FD3: partNo determines partName and unitPrice without knowing jobNo.",
    ),
    mistake: bi(
      "FD เป็นข้อกำหนดของข้อมูล ไม่ใช่ความบังเอิญของข้อมูลเพียงสี่แถว",
      "An FD is a data constraint, not a coincidence in four sample rows.",
    ),
    lab: "fd",
    question: "fd",
  },
  {
    id: "closure",
    title: bi("Attribute Closure", "Attribute closure"),
    objective: bi(
      "คำนวณ X+ ด้วย FD ทีละขั้น",
      "Compute X+ using one FD at a time",
    ),
    explanation: bi(
      "เริ่มด้วย X เอง ใช้ FD ได้เมื่อรู้ทุก attribute ทางซ้าย เพิ่ม attribute ทางขวา แล้วทำซ้ำจนไม่มีค่าใหม่ ถ้า X+ ครบทุก attribute ของ relation X เป็น superkey",
      "Start with X itself. Apply an FD only when every left-side attribute is known. Add its right side and repeat until nothing changes. If X+ covers the relation, X is a superkey.",
    ),
    why: bi(
      "เลือก A ในตัวอย่าง A → B, B → C, A → D แล้วกดขั้นถัดไปจนได้ {A,B,C,D}",
      "Select A under A → B, B → C, A → D. Step forward until the closure is {A,B,C,D}.",
    ),
    mistake: bi(
      "ถ้าทางซ้ายเป็น {A,B} การรู้ A ตัวเดียวใช้ FD นั้นไม่ได้",
      "Knowing A alone cannot activate an FD whose left side is {A,B}.",
    ),
    lab: "fd",
    question: "closure",
  },
  {
    id: "candidate",
    title: bi(
      "Candidate Key และ Prime Attribute",
      "Candidate keys and prime attributes",
    ),
    objective: bi(
      "พิสูจน์ความ minimal และแยก prime attribute",
      "Prove minimality and identify prime attributes",
    ),
    explanation: bi(
      "หา closure ของชุด attribute ก่อน: ถ้า X+ ครบทุก attribute ใน relation, X เป็น superkey จากนั้นตัดสมาชิกออกทีละตัว; ถ้าตัดตัวใดแล้วไม่ครบ X จึงเป็น Candidate Key (minimal หมายถึงไม่มีส่วนเกิน ไม่ได้หมายถึงมีจำนวนคอลัมน์น้อยที่สุดเมื่อเทียบกับคีย์ชุดอื่น) Prime attribute คือ attribute ที่อยู่ใน candidate key อย่างน้อยหนึ่งชุด ไม่ใช่แค่อยู่ใน PK ที่เลือก",
      "Find the closure first: if X+ contains every relation attribute, X is a superkey. Then remove attributes one at a time; X is a candidate key if removing any one makes it stop being a superkey. Minimal means no redundant member, not the fewest columns compared with other keys. An attribute is prime if it belongs to any candidate key, not just the selected PK.",
    ),
    why: bi(
      "ใน ENROLMENT, SC → I และ I → C: closure ของ {S,C} ครบ S,C,I; ตัด S เหลือ {C}+ = {C} และตัด C เหลือ {S}+ = {S} จึงเป็นคีย์ ส่วน {S,I} ก็เป็นคีย์อีกชุด แม้มีสอง attribute เท่ากัน ตัวอย่างนี้แสดง prime attribute ครบทั้งสาม",
      "In ENROLMENT, SC → I and I → C: {S,C}+ contains S,C,I. Remove S and {C}+ is only {C}; remove C and {S}+ is only {S}, so SC is a candidate key. {S,I} is another candidate key. All three attributes are prime.",
    ),
    mistake: bi(
      "minimal ไม่ได้แปลว่าต้องเป็นคีย์ที่สั้นที่สุดในทุกชุด: คีย์ {A,B} และ {A,C,D} เป็น candidate ได้พร้อมกัน ถ้าแต่ละชุดระบุแถวได้และตัดสมาชิกตัวใดออกไม่ได้ ส่วน superkey ที่มี attribute เกินยังไม่เป็น candidate",
      "Minimal does not mean shortest among all keys: {A,B} and {A,C,D} can both be candidate keys if each identifies tuples and no member can be removed. A superkey with an extra attribute is not a candidate key.",
    ),
    lab: "fd",
    question: "prime",
  },
  {
    id: "unf",
    title: bi("UNF และ Repeating Group", "UNF and repeating groups"),
    objective: bi(
      "เห็นปัญหารายการซ้อนในหนึ่งเซลล์",
      "Recognize repeating groups inside a cell",
    ),
    explanation: bi(
      "ถ้าเซลล์ parts เก็บรายการ partNo และ quantity หลายชุด การค้นหรือบังคับ FK ทีละชิ้นทำได้ยาก UNF เป็นจุดตั้งต้นของการสอน ยังไม่ใช่ relation แบบ 1NF",
      "If a parts cell holds multiple partNo/quantity pairs, querying and enforcing per-part FKs is difficult. UNF is a teaching starting point, not a 1NF relation.",
    ),
    why: bi(
      "แผ่รายการ parts ให้หนึ่งแถวแทนหนึ่งคู่ jobNo และ partNo โดยไม่ทำ quantity หาย",
      "Expand parts so each row represents one jobNo/partNo pair, preserving quantity.",
    ),
    mistake: bi(
      "อย่าแยก partNo และ quantity เป็นคนละรายการจนจับคู่กันไม่ได้",
      "Do not split partNo and quantity into independent lists that lose their pairing.",
    ),
    lab: "normalization",
    question: "unf",
  },
  {
    id: "1nf",
    title: bi("First Normal Form 1NF", "First normal form"),
    objective: bi(
      "แปลง repeating group เป็นแถว atomic",
      "Expand repeating groups into atomic rows",
    ),
    explanation: bi(
      "1NF เก็บค่าเดี่ยวตาม domain ในแต่ละตำแหน่ง และไม่มี repeating group ใน JOB_SHEET เราสมมติว่าหนึ่งอะไหล่มีได้หนึ่งบรรทัดต่อหนึ่งงาน ถ้าใช้อะไหล่ซ้ำให้รวม quantity",
      "1NF stores a single domain value at each position with no repeating groups. JOB_SHEET assumes one line per part per job; repeated use of the same part is aggregated into quantity.",
    ),
    why: bi(
      "PK {jobNo,partNo} ระบุหนึ่งบรรทัดได้ แต่ชื่อคนและราคาอะไหล่ยังซ้ำอยู่",
      "The PK {jobNo,partNo} identifies a line, but people’s names and part prices still repeat.",
    ),
    mistake: bi(
      "เป็น 1NF ไม่ได้แปลว่าไม่มี redundancy หรือ anomaly",
      "Being in 1NF does not eliminate redundancy or anomalies.",
    ),
    lab: "normalization",
    question: "1nf",
  },
  {
    id: "2nf",
    title: bi("Second Normal Form 2NF", "Second normal form"),
    objective: bi(
      "หา Partial และ Full Functional Dependency",
      "Distinguish partial and full functional dependencies",
    ),
    explanation: bi(
      "2NF ต้องเป็น 1NF และทุก non-prime attribute ต้องไม่ขึ้นกับ proper subset ของ candidate key ใด ๆ quantity ขึ้นกับทั้ง {jobNo,partNo} แต่ jobDate ขึ้นกับ jobNo และ partName ขึ้นกับ partNo จึงเกิด partial dependency",
      "2NF requires 1NF and no non-prime attribute depending on a proper subset of any candidate key. quantity needs both {jobNo,partNo}, but jobDate depends on jobNo and partName on partNo: partial dependencies.",
    ),
    why: bi(
      "แยก JOB_HEADER, PART และ JOB_PART โดยเก็บ quantity ไว้กับคีย์เต็ม",
      "Separate JOB_HEADER, PART, and JOB_PART. Keep quantity with the full composite key.",
    ),
    mistake: bi(
      "ห้ามแยก quantity ไป PART เพราะชิ้นเดียวกันอาจใช้จำนวนต่างกันในแต่ละงาน",
      "Do not move quantity into PART: the same part can have different quantities in different jobs.",
    ),
    lab: "normalization",
    question: "partial",
  },
  {
    id: "3nf",
    title: bi("Third Normal Form 3NF", "Third normal form"),
    objective: bi(
      "แยก Transitive Dependency และใช้เกณฑ์ 3NF",
      "Remove transitive dependencies and apply the formal 3NF test",
    ),
    explanation: bi(
      "เกณฑ์ 3NF: ทุก nontrivial FD X → A ต้องมี X เป็น superkey หรือ A เป็น prime ใน JOB_HEADER, jobNo → customerId → customerName และ jobNo → technicianId → technicianName ชี้ให้แยก CUSTOMER และ TECHNICIAN",
      "For every nontrivial FD X → A, 3NF requires X to be a superkey or A to be prime. In JOB_HEADER, jobNo → customerId → customerName and jobNo → technicianId → technicianName motivate CUSTOMER and TECHNICIAN.",
    ),
    why: bi(
      "เก็บ customerId เป็น FK ใน JOB แล้วแก้ชื่อลูกค้าที่ CUSTOMER แค่จุดเดียว",
      "Keep customerId as an FK in JOB; update a customer name in CUSTOMER once.",
    ),
    mistake: bi(
      "คำจำว่าไม่มี transitive dependency ใช้ได้กับโจทย์พื้นฐานนี้ แต่เกณฑ์ formal ต้องพิจารณา prime attribute ด้วย",
      "“No transitive dependency” is useful shorthand here, but the formal rule also considers prime attributes.",
    ),
    lab: "normalization",
    question: "transitive",
  },
  {
    id: "bcnf",
    title: bi(
      "BCNF และ Lossless Decomposition",
      "BCNF and lossless decomposition",
    ),
    objective: bi(
      "แยก 3NF จาก BCNF และตรวจ lossless join",
      "Distinguish 3NF from BCNF and check lossless joins",
    ),
    explanation: bi(
      "BCNF ต้องให้ determinant ของทุก nontrivial FD เป็น superkey ไม่มีข้อยกเว้น prime แบบ 3NF ผล JOB_SHEET หลัง 3NF เป็น BCNF แล้วตาม FD ที่ให้ จึงไม่ต้องแยกเพิ่ม แต่ตัวอย่าง ENROLMENT แสดงกรณี 3NF ที่ยังไม่เป็น BCNF",
      "BCNF requires every nontrivial FD determinant to be a superkey, with no prime-attribute exception. The JOB_SHEET 3NF result is already BCNF under the stated FDs. ENROLMENT demonstrates a relation in 3NF but not BCNF.",
    ),
    why: bi(
      "การแยกสอง relation เป็น lossless ถ้า attribute ที่ใช้ร่วมกันกำหนด relation ฝั่งใดฝั่งหนึ่งได้ การเป็น lossless กับ dependency preserving เป็นคนละคุณสมบัติ",
      "A binary decomposition is lossless when the shared attributes determine one entire side. Losslessness and dependency preservation are separate properties.",
    ),
    mistake: bi(
      "BCNF decomposition รับประกัน lossless ได้ แต่ไม่รับประกันเก็บ FD เดิมได้ครบโดยไม่ JOIN",
      "A BCNF decomposition can guarantee losslessness without preserving all original FDs locally.",
    ),
    lab: "normalization",
    question: "bcnf",
  },
  {
    id: "erd",
    title: bi("ERD และ Cardinality", "ER diagrams and cardinality"),
    objective: bi(
      "วาง FK และแปลง M:N เป็น associative entity",
      "Place FKs and map M:N through an associative entity",
    ),
    explanation: bi(
      "Entity คือสิ่งที่เก็บข้อมูล Attribute คือคุณสมบัติ 1:N วาง FK ที่ฝั่ง N ส่วน M:N ใช้ associative entity เช่น JOB_PART ที่มีคีย์สองฝั่งและ quantity การบังคับ optionality ต้องดู NULL และ business rule เพิ่ม",
      "Entities describe things; attributes describe their properties. Put an FK on the N side of 1:N. Resolve M:N using an associative entity such as JOB_PART, storing both references and quantity. NULL and business rules determine optionality.",
    ),
    why: bi(
      "กดเส้น JOB → JOB_PART แล้วดู PK/FK jobNo ในตารางจริงด้านล่าง",
      "Select JOB → JOB_PART and inspect jobNo as PK/FK in the actual tables below.",
    ),
    mistake: bi(
      "Weak Entity มี partial key ร่วมกับ owner key เช่น (orderId,lineNo); ไม่ใช่ทุกตารางที่มี FK จะเป็น weak entity",
      "A weak entity uses an owner key with a partial key, e.g. (orderId,lineNo). Not every table with an FK is a weak entity.",
    ),
    lab: "er",
    question: "fk",
  },
  {
    id: "sql",
    title: bi("SQL และผลลัพธ์ JOIN", "SQL and JOIN results"),
    objective: bi(
      "อ่านลำดับ WHERE, GROUP BY, HAVING และ JOIN",
      "Read WHERE, GROUP BY, HAVING, and JOIN results",
    ),
    explanation: bi(
      "INNER JOIN คืนคู่ที่ match ส่วน LEFT JOIN เก็บแถวซ้ายที่ไม่มีคู่และเติม NULL WHERE กรองแถวก่อน GROUP BY ส่วน HAVING กรองกลุ่มหลัง aggregate ORDER BY จัดลำดับผลลัพธ์",
      "INNER JOIN returns matching pairs. LEFT JOIN also keeps unmatched left rows with NULLs. WHERE filters rows before GROUP BY; HAVING filters groups after aggregation. ORDER BY sorts results.",
    ),
    why: bi(
      "ลอง INNER JOIN เทียบ LEFT JOIN: Dana ยังไม่มี departmentId จึงปรากฏเฉพาะ LEFT JOIN",
      "Compare INNER JOIN with LEFT JOIN: Dana has no departmentId and appears only in the LEFT JOIN result.",
    ),
    mistake: bi(
      "WHERE ที่กรองคอลัมน์ฝั่งขวาหลัง LEFT JOIN อาจตัดแถว NULL ออก ทำให้ผลคล้าย INNER JOIN",
      "A WHERE condition on right-side columns after a LEFT JOIN may remove NULL-extended rows.",
    ),
    lab: "sql",
    question: "join",
  },
];
export const stages: {
  title: string;
  action: Copy;
  reason: Copy;
  focus: string[];
  proof: Copy;
}[] = [
  {
    title: "UNF",
    action: bi(
      "เริ่มจากใบงานที่มีรายการอะไหล่ซ้อน",
      "Start with a job sheet containing nested parts",
    ),
    reason: bi(
      "หนึ่งเซลล์ parts เก็บหลายคู่ partNo/quantity ต้องแผ่ออกเป็นแถวก่อน จึงจะใช้ relational key ได้ชัดเจน",
      "A parts cell holds several partNo/quantity pairs. Expand them into rows before assigning a relational key.",
    ),
    focus: ["partNo", "quantity"],
    proof: bi(
      "ยังไม่ใช่ relation แบบ 1NF รายการใน parts ไม่ใช่ atomic ตาม domain ที่โจทย์ต้องการ",
      "Not yet a 1NF relation: parts contains a repeating group, not an atomic value for this problem.",
    ),
  },
  {
    title: "1NF",
    action: bi(
      "แผ่หนึ่งรายการอะไหล่เป็นหนึ่งแถว",
      "Expand each part entry into a row",
    ),
    reason: bi(
      "Candidate Key เพียงชุดเดียวคือ {jobNo,partNo} ทั้งสองตัวไม่อยู่ฝั่งขวาของ FD จึงจำเป็น และ closure ของทั้งคู่ได้ครบ 11 attributes ตัดตัวใดออกก็ไม่ครบ",
      "The only candidate key is {jobNo,partNo}. Neither attribute occurs on an FD right side, so both are necessary. Their closure contains all 11 attributes; removing either loses coverage.",
    ),
    focus: ["jobNo", "partNo"],
    proof: bi(
      "1NF แล้ว แต่ jobNo → jobDate และ partNo → partName เป็น partial dependency ต่อ non-prime จึงยังไม่เป็น 2NF",
      "Now 1NF, but jobNo → jobDate and partNo → partName are partial dependencies to non-prime attributes: not 2NF.",
    ),
  },
  {
    title: "2NF",
    action: bi(
      "ย้าย attributes ที่ขึ้นกับส่วนหนึ่งของคีย์",
      "Move attributes depending on only part of the key",
    ),
    reason: bi(
      "FD2 และ FD ที่อนุมานผ่านลูกค้า/ช่างขึ้นกับ jobNo จึงไป JOB_HEADER; FD3 ไป PART; FD1 เก็บ quantity ใน JOB_PART ที่ต้องใช้คีย์เต็ม",
      "FD2 and inferred customer/technician details depend on jobNo and move to JOB_HEADER. FD3 moves to PART. FD1 keeps quantity in JOB_PART, where the full key is required.",
    ),
    focus: [
      "jobDate",
      "customerId",
      "technicianId",
      "partName",
      "unitPrice",
      "quantity",
    ],
    proof: bi(
      "ไม่มี non-prime ที่ขึ้นกับ proper subset ของ candidate key ในแต่ละตาราง แต่ JOB_HEADER ยังมี customerId → customerName และ technicianId → technicianName",
      "No non-prime attribute depends on a proper subset of a candidate key within these relations. JOB_HEADER still has customerId → customerName and technicianId → technicianName.",
    ),
  },
  {
    title: "3NF",
    action: bi(
      "แยกข้อมูลลูกค้าและช่างออกจาก JOB",
      "Separate customer and technician details from JOB",
    ),
    reason: bi(
      "FD4 ย้ายชื่อและโทรศัพท์ไป CUSTOMER; FD5 ย้ายชื่อช่างไป TECHNICIAN ส่วน JOB เก็บ customerId และ technicianId เป็น FK จึงแก้ชื่อครั้งเดียว ไม่ต้องแก้ทุกงาน",
      "FD4 moves name/phone into CUSTOMER; FD5 moves technicianName into TECHNICIAN. JOB retains customerId and technicianId as FKs, allowing each name to be updated in one place.",
    ),
    focus: ["customerName", "customerPhone", "technicianName"],
    proof: bi(
      "ทุก FD ที่ไม่ trivial มี determinant เป็น superkey ของตารางนั้น จึงผ่านทั้ง 3NF และ BCNF ตาม FD ที่โจทย์กำหนด",
      "Every nontrivial FD has a determinant that is a superkey of its relation. These relations satisfy both 3NF and BCNF under the stated FDs.",
    ),
  },
  {
    title: "BCNF",
    action: bi(
      "ตรวจ BCNF โดยไม่แยกตารางซ้ำ",
      "Evaluate BCNF without inventing another decomposition",
    ),
    reason: bi(
      "CUSTOMER ใช้ customerId; TECHNICIAN ใช้ technicianId; PART ใช้ partNo; JOB ใช้ jobNo; JOB_PART ใช้ {jobNo,partNo} เป็น determinant ที่เป็น key ไม่มี FD ที่ละเมิด BCNF",
      "CUSTOMER uses customerId; TECHNICIAN uses technicianId; PART uses partNo; JOB uses jobNo; JOB_PART uses {jobNo,partNo}. Each determinant is a key. No stated FD violates BCNF.",
    ),
    focus: ["jobNo", "partNo", "customerId", "technicianId"],
    proof: bi(
      "Lossless: แยกด้วย jobNo, partNo, customerId และ technicianId ซึ่งกำหนดตารางที่แยกออกได้ เก็บ FD1–FD5 ในตารางใดตารางหนึ่งครบ จึง dependency preserving ด้วย การ JOIN ข้อมูลตัวอย่างยืนยันผลเฉพาะตัวอย่าง ไม่ใช่ตัวพิสูจน์ทั่วไป",
      "Lossless: the split intersections jobNo, partNo, customerId, and technicianId determine the separated relations. Each FD1–FD5 remains enforceable within a relation, so dependencies are preserved. A sample rejoin illustrates the result; it is not the general proof.",
    ),
  },
];
export const glossary: { term: string; definition: Copy }[] = [
  ...topics.map((t) => ({ term: t.title.en, definition: t.explanation })),
  {
    term: "Full Functional Dependency",
    definition: bi(
      "X → Y เป็น full เมื่อไม่มี proper subset ของ X กำหนด Y ได้ เช่น {jobNo,partNo} → quantity ตาม FD ที่ให้",
      "X → Y is full if no proper subset of X determines Y, e.g. {jobNo,partNo} → quantity under the given FDs.",
    ),
  },
  {
    term: "Determinant",
    definition: bi(
      "ชุด attribute ทางซ้ายของ FD ไม่จำเป็นต้องเป็น superkey เสมอไป",
      "The attribute set on an FD left side; it is not necessarily a superkey.",
    ),
  },
  {
    term: "Referential Integrity",
    definition: bi(
      "ค่า FK ที่ไม่ใช่ NULL ต้องอ้างถึงแถวที่มีอยู่และตรงกับ referenced key",
      "Every non-NULL FK value must match an existing referenced key.",
    ),
  },
];
