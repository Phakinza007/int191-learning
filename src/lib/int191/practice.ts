import { bi, type Copy } from "./model";
export type Question = {
  id: string;
  topic: string;
  difficulty: 1 | 2 | 3 | 4;
  format: "choice" | "text" | "columns" | "diagram";
  prompt: Copy;
  options?: string[];
  answer: string[];
  hints: Copy[];
  solution: Copy;
};
const englishHints: Record<string, string[]> = {
  relation: [
    "Distinguish a row from a column.",
    "An attribute is a column.",
    "A domain is a set of allowed values, not one row.",
  ],
  key: [
    "Attributes absent from all FD right sides must occur in every key.",
    "jobNo alone cannot derive partNo.",
    "quantity does not derive either jobNo or partNo.",
  ],
  fd: [
    "Look on the left of the arrow.",
    "The determinant is the attribute set that determines the right side.",
    "It need not be a key of JOB_SHEET.",
  ],
  closure: [
    "Start with A itself.",
    "Once B is known, B → C becomes applicable.",
    "Also apply A → D.",
  ],
  prime: [
    "Find every candidate key, not just the selected PK.",
    "Both AB and AC are minimal superkeys.",
    "Take the union of attributes occurring in any candidate key.",
  ],
  unf: [
    "Count the part/quantity pairs in the cell.",
    "FD analysis comes after expanding the group.",
    "Each paired entry needs its own row.",
  ],
  "1nf": [
    "1NF checks atomic values and repeating groups.",
    "Names can still repeat across rows.",
    "Continue with FD analysis for 2NF and 3NF.",
  ],
  partial: [
    "A partial dependency uses a proper subset of a candidate key.",
    "partNo is part of the composite key.",
    "customerId is not part of this candidate key.",
  ],
  full: [
    "The same part may be used in different quantities in different jobs.",
    "Both the job and the part are needed.",
    "Inspect the two-attribute determinant in FD1.",
  ],
  transitive: [
    "The name describes the customer.",
    "customerId alone determines customerName.",
    "JOB should retain customerId as a reference.",
  ],
  bcnf: [
    "Inspect each determinant in the resulting relations.",
    "Every determinant is a key of its relation.",
    "BCNF is a condition to check, not a requirement to split again.",
  ],
  fk: [
    "Find the N side.",
    "Each child row stores its parent reference.",
    "A department should not need multiple studentId columns.",
  ],
  join: [
    "Inspect which relation is on the left.",
    "INNER JOIN requires a matching pair.",
    "LEFT JOIN retains unmatched left rows.",
  ],
  anomaly: [
    "An existing fact was changed.",
    "One customerId now has different names.",
    "customerId → customerName must still hold.",
  ],
  "closure-job": [
    "Start with partNo.",
    "FD3 can be applied immediately.",
    "No FD derives jobNo from a part name or price.",
  ],
  "3nf-rule": [
    "Compare the formal 3NF and BCNF tests.",
    "Inspect the right-side attribute.",
    "Prime means membership in at least one candidate key.",
  ],
  lossless: [
    "Check which relation contains both sides of each FD.",
    "I → C fits inside INSTRUCTOR_COURSE.",
    "S and C no longer occur together in any one relation.",
  ],
  steps: [
    "Remove partial dependencies before transitive ones.",
    "CUSTOMER and TECHNICIAN are separated in the next step.",
    "quantity stays with the full composite key.",
  ],
  having: [
    "The condition applies after aggregation.",
    "WHERE filters rows before grouping.",
    "Find the clause that filters groups.",
  ],
  weak: [
    "lineNo may repeat across orders.",
    "The owner is needed to identify a line.",
    "A partial key is not globally unique.",
  ],
};
const q = (
  id: string,
  topic: string,
  difficulty: 1 | 2 | 3 | 4,
  format: Question["format"],
  th: string,
  en: string,
  answer: string[],
  options: string[] | undefined,
  hints: [string, string, string],
  explain: [string, string],
): Question => ({
  id,
  topic,
  difficulty,
  format,
  prompt: bi(th, en),
  answer,
  options,
  hints: hints.map((h, i) => bi(h, englishHints[id][i])),
  solution: bi(...explain),
});
export const questions: Question[] = [
  q(
    "relation",
    "fundamentals",
    1,
    "choice",
    "หนึ่งแถวใน relation เรียกว่าอะไร?",
    "What is a row in a relation called?",
    ["Tuple"],
    ["Domain", "Tuple", "Attribute", "Schema"],
    [
      "แยกแถวกับคอลัมน์ก่อน",
      "Attribute คือคอลัมน์",
      "Domain เป็นเซตค่าที่อนุญาต ไม่ใช่หนึ่งแถว",
    ],
    [
      "Tuple คือหนึ่งแถว ส่วน attribute คือคอลัมน์",
      "A tuple is a row; an attribute is a column.",
    ],
  ),
  q(
    "key",
    "keys",
    2,
    "columns",
    "เลือก Candidate Key ของ JOB_SHEET ตาม FD1–FD5",
    "Select the candidate key of JOB_SHEET under FD1–FD5.",
    ["jobNo", "partNo"],
    ["jobNo", "partNo", "customerId", "technicianId", "quantity"],
    [
      "ตัวที่ไม่อยู่ฝั่งขวาของ FD ต้องอยู่ในคีย์",
      "jobNo ตัวเดียวหา partNo ไม่ได้",
      "quantity ไม่ได้ช่วยหา jobNo หรือ partNo",
    ],
    [
      "{jobNo,partNo}+ ได้ครบทุก attribute และตัดตัวใดออกไม่ได้",
      "{jobNo,partNo}+ covers every attribute, and neither attribute can be removed.",
    ],
  ),
  q(
    "fd",
    "fd",
    1,
    "choice",
    "ตาม partNo → partName,unitPrice อะไรคือ determinant?",
    "In partNo → partName,unitPrice, what is the determinant?",
    ["partNo"],
    ["unitPrice", "partNo", "partName", "jobNo"],
    [
      "มองทางซ้ายของลูกศร",
      "Determinant เป็นตัวกำหนดค่า",
      "ไม่จำเป็นต้องเป็น PK ของ JOB_SHEET",
    ],
    [
      "partNo อยู่ทางซ้ายและกำหนดชื่อกับราคาอะไหล่",
      "partNo is on the left and determines the part’s name and price.",
    ],
  ),
  q(
    "closure",
    "closure",
    2,
    "text",
    "A → B, B → C, A → D: เติม A+ โดยคั่นด้วย comma",
    "A → B, B → C, A → D: enter A+ separated by commas.",
    ["A", "B", "C", "D"],
    undefined,
    ["เริ่มจาก A เอง", "เมื่อได้ B แล้วจึงใช้ B → C", "อย่าลืมใช้ A → D"],
    [
      "A+ = {A,B,C,D} ใช้ A→B, B→C, A→D ตามลำดับ",
      "A+ = {A,B,C,D}, applying A→B, B→C, A→D.",
    ],
  ),
  q(
    "prime",
    "candidate",
    4,
    "columns",
    "R(A,B,C), AB → C และ C → B: เลือก prime attributes ทั้งหมด",
    "R(A,B,C), AB → C and C → B: select every prime attribute.",
    ["A", "B", "C"],
    ["A", "B", "C"],
    [
      "หา candidate ทุกชุด ไม่ใช่แค่ PK ชุดเดียว",
      "AB และ AC เป็น minimal superkeys",
      "นำ attributes จาก candidate ทุกชุดมารวมกัน",
    ],
    [
      "Candidate คือ AB และ AC ดังนั้น A,B,C เป็น prime ทั้งหมด",
      "The candidate keys are AB and AC; all A,B,C are prime.",
    ],
  ),
  q(
    "unf",
    "unf",
    1,
    "choice",
    "parts = [(P01,2),(P02,1)] ในหนึ่งเซลล์ มีปัญหาใด?",
    "What is wrong with parts = [(P01,2),(P02,1)] in one cell?",
    ["Repeating group"],
    ["Repeating group", "Transitive Dependency", "FK placement", "BCNF only"],
    [
      "ดูจำนวนคู่ข้อมูลในเซลล์",
      "ยังไม่ต้องวิเคราะห์ FD",
      "ต้องแผ่แต่ละคู่เป็นหนึ่งแถวก่อน",
    ],
    [
      "เป็น repeating group ต้องแผ่ partNo และ quantity เป็นแถวคู่กัน",
      "It is a repeating group: expand partNo and quantity together into rows.",
    ],
  ),
  q(
    "1nf",
    "1nf",
    1,
    "choice",
    "เป็น 1NF แล้ว รับประกันว่าไม่มีข้อมูลซ้ำหรือไม่?",
    "Does being in 1NF guarantee no redundancy?",
    ["No"],
    ["Yes", "No"],
    [
      "1NF ดูค่า atomic",
      "ชื่อคนอาจซ้ำข้ามแถวได้",
      "ต้องวิเคราะห์ FD ต่อใน 2NF/3NF",
    ],
    [
      "ไม่รับประกัน 1NF ยังมี partial และ transitive dependency ได้",
      "No. A 1NF relation may still contain partial and transitive dependencies.",
    ],
  ),
  q(
    "partial",
    "2nf",
    2,
    "choice",
    "PK {jobNo,partNo}: FD ใดเป็น partial dependency?",
    "With PK {jobNo,partNo}, which is a partial dependency?",
    ["partNo → partName"],
    [
      "jobNo,partNo → quantity",
      "partNo → partName",
      "customerId → customerPhone",
    ],
    [
      "partial ใช้เพียง proper subset ของคีย์",
      "partNo เป็นส่วนหนึ่งของ composite key",
      "customerId ไม่ใช่ส่วนหนึ่งของ candidate key ชุดนี้",
    ],
    [
      "partNo เป็น proper subset ของคีย์และกำหนด non-prime partName",
      "partNo is a proper subset of the key and determines non-prime partName.",
    ],
  ),
  q(
    "full",
    "2nf",
    2,
    "choice",
    "ควรเก็บ quantity ไว้ใน relation ใด?",
    "Where does quantity belong?",
    ["JOB_PART"],
    ["PART", "CUSTOMER", "JOB_PART", "TECHNICIAN"],
    [
      "อะไหล่เดียวกันใช้จำนวนต่างกันในแต่ละงาน",
      "ต้องรู้ทั้งงานและอะไหล่",
      "ดู FD1 ที่มี determinant สองตัว",
    ],
    [
      "quantity ขึ้นกับทั้ง jobNo และ partNo จึงอยู่ JOB_PART",
      "quantity depends on both jobNo and partNo, so it belongs in JOB_PART.",
    ],
  ),
  q(
    "transitive",
    "3nf",
    2,
    "choice",
    "jobNo → customerId → customerName ควรแยกอะไร?",
    "For jobNo → customerId → customerName, what should be separated?",
    ["CUSTOMER(customerId,customerName)"],
    [
      "CUSTOMER(customerId,customerName)",
      "PART(partNo,quantity)",
      "JOB_PART(jobNo,customerName)",
    ],
    [
      "ชื่อเป็นรายละเอียดของลูกค้า",
      "customerId กำหนด customerName ได้เอง",
      "JOB ควรเหลือ customerId เป็น FK",
    ],
    [
      "แยก CUSTOMER และคง customerId เป็น FK ใน JOB",
      "Separate CUSTOMER and keep customerId as an FK in JOB.",
    ],
  ),
  q(
    "bcnf",
    "bcnf",
    3,
    "choice",
    "ผล JOB_SHEET 3NF ตาม FD ที่ให้ ต้องแยกอีกเพื่อเป็น BCNF ไหม?",
    "Does the JOB_SHEET 3NF result need another split for BCNF?",
    ["No"],
    ["Yes", "No"],
    [
      "ตรวจ determinant ของ FD ในแต่ละตาราง",
      "ทุก determinant เป็น key ของตารางนั้น",
      "BCNF เป็นเกณฑ์ตรวจ ไม่ใช่คำสั่งว่าต้องแยกทุกครั้ง",
    ],
    [
      "ไม่ต้องแยก ผล 3NF นี้ผ่าน BCNF อยู่แล้วตาม FD ที่ให้",
      "No. This 3NF result already satisfies BCNF under the stated FDs.",
    ],
  ),
  q(
    "fk",
    "erd",
    1,
    "diagram",
    "STUDENT หลายคนอยู่ DEPARTMENT หนึ่งแห่ง เลือก entity ที่ควรเก็บ FK departmentId",
    "Many students belong to one department. Select the entity holding departmentId as FK.",
    ["STUDENT"],
    undefined,
    [
      "หา entity ฝั่ง N",
      "เก็บ reference ในแต่ละแถวฝั่งลูก",
      "ตารางแผนกไม่ควรมี studentId หลายช่อง",
    ],
    [
      "วาง departmentId ใน STUDENT ซึ่งเป็นฝั่ง N",
      "Place departmentId in STUDENT, the N side.",
    ],
  ),
  q(
    "join",
    "sql",
    2,
    "choice",
    "Dana มี departmentId = NULL คำสั่งใดเก็บ Dana ไว้?",
    "Dana has departmentId = NULL. Which operation keeps Dana?",
    ["STUDENT LEFT JOIN DEPARTMENT"],
    ["STUDENT INNER JOIN DEPARTMENT", "STUDENT LEFT JOIN DEPARTMENT"],
    [
      "ดูฝั่งซ้ายของ JOIN",
      "INNER JOIN ต้อง match",
      "LEFT JOIN เก็บแถวซ้ายที่ไม่มีคู่",
    ],
    [
      "LEFT JOIN เก็บ Dana และให้คอลัมน์ฝั่งแผนกเป็น NULL",
      "LEFT JOIN retains Dana with NULL department columns.",
    ],
  ),
  q(
    "anomaly",
    "fundamentals",
    2,
    "choice",
    "แก้ชื่อ Mali ใน JOB_SHEET แค่หนึ่งในสองแถว เป็น anomaly ใด?",
    "Changing Mali’s name in only one JOB_SHEET row causes which anomaly?",
    ["Update anomaly"],
    ["Insertion anomaly", "Update anomaly", "Deletion anomaly"],
    [
      "เป็นการแก้ข้อมูลเดิม",
      "ค่า customerId เดียวกันมีชื่อต่างกัน",
      "FD customerId → customerName ไม่ควรถูกละเมิด",
    ],
    [
      "Update anomaly ทำให้ลูกค้าคนเดียวมีชื่อต่างกันในข้อมูล",
      "An update anomaly gives the same customer inconsistent names.",
    ],
  ),
  q(
    "closure-job",
    "closure",
    3,
    "columns",
    "เลือก attributes ที่อยู่ใน {partNo}+ ตาม FD ที่ให้",
    "Select the attributes in {partNo}+ under the stated FDs.",
    ["partNo", "partName", "unitPrice"],
    ["partNo", "partName", "unitPrice", "quantity", "jobNo"],
    [
      "เริ่มด้วย partNo",
      "ใช้ FD3 ได้โดยตรง",
      "ไม่มี FD ให้ย้อนจากชื่อหรือราคาไปหา jobNo",
    ],
    [
      "{partNo}+ = {partNo,partName,unitPrice} ไม่มี quantity",
      "{partNo}+ = {partNo,partName,unitPrice}, without quantity.",
    ],
  ),
  q(
    "3nf-rule",
    "3nf",
    4,
    "choice",
    "3NF ยอมให้ determinant ที่ไม่ใช่ superkey เมื่อใด?",
    "When does 3NF allow a non-superkey determinant for a nontrivial single-attribute FD?",
    ["RHS is prime"],
    ["RHS is prime", "RHS is non-prime", "PK has one column"],
    [
      "เทียบเกณฑ์ 3NF กับ BCNF",
      "ดู attribute ฝั่งขวา",
      "Prime หมายถึงอยู่ใน candidate อย่างน้อยหนึ่งชุด",
    ],
    [
      "3NF มีข้อยกเว้นเมื่อ RHS เป็น prime ส่วน BCNF ไม่มี",
      "3NF permits a prime RHS; BCNF has no such exception.",
    ],
  ),
  q(
    "lossless",
    "bcnf",
    4,
    "choice",
    "ENROLMENT แยกเป็น INSTRUCTOR_COURSE(I,C) และ STUDENT_INSTRUCTOR(S,I) อาจเสีย FD ใดที่ตรวจในตารางเดียวไม่ได้?",
    "Which FD may no longer be enforceable locally after splitting ENROLMENT into INSTRUCTOR_COURSE(I,C) and STUDENT_INSTRUCTOR(S,I)?",
    ["S,C → I"],
    ["I → C", "S,C → I"],
    [
      "ตรวจว่า FD แต่ละตัวอยู่ในตารางใดครบ",
      "I → C อยู่ใน INSTRUCTOR_COURSE",
      "S กับ C ไม่อยู่ร่วมกันในตารางใด",
    ],
    [
      "S,C → I ไม่ถูก preserve ในการแยกนี้ แม้ lossless เพราะ I กำหนด I,C ได้",
      "S,C → I is not preserved here, even though the split is lossless because I determines I,C.",
    ],
  ),
  q(
    "steps",
    "2nf",
    3,
    "columns",
    "ขั้น 2NF ของ JOB_SHEET มี relation อะไรบ้าง?",
    "Which relations are produced at the JOB_SHEET 2NF step?",
    ["JOB_HEADER", "PART", "JOB_PART"],
    ["JOB_HEADER", "PART", "JOB_PART", "CUSTOMER", "TECHNICIAN"],
    [
      "แยก partial ก่อน transitive",
      "CUSTOMER และ TECHNICIAN แยกในขั้นถัดไป",
      "quantity ยังอยู่กับคีย์เต็ม",
    ],
    [
      "ขั้น 2NF มี JOB_HEADER, PART และ JOB_PART; ขั้น 3NF ค่อยแยกลูกค้าและช่าง",
      "2NF gives JOB_HEADER, PART, JOB_PART. Customer and technician details are separated at 3NF.",
    ],
  ),
  q(
    "having",
    "sql",
    2,
    "choice",
    "ต้องการแผนกที่มีนักศึกษา COUNT(*) > 1 หลัง GROUP BY ใช้อะไร?",
    "After GROUP BY, how do you keep departments with COUNT(*) > 1?",
    ["HAVING"],
    ["WHERE", "HAVING", "ORDER BY", "CREATE TABLE"],
    [
      "กรองหลัง aggregate",
      "WHERE กรองแถวก่อนจัดกลุ่ม",
      "มองหาคำสั่งที่กรองกลุ่ม",
    ],
    [
      "HAVING กรองกลุ่มหลัง aggregation",
      "HAVING filters groups after aggregation.",
    ],
  ),
  q(
    "weak",
    "erd",
    3,
    "choice",
    "ORDER_LINE(orderId,lineNo) ใช้ owner key ร่วมกับเลขบรรทัดเฉพาะภายใน order เรียกอะไร?",
    "ORDER_LINE(orderId,lineNo) uses an owner key and a locally unique line number. What does this illustrate?",
    ["Weak entity"],
    ["Weak entity", "Every FK is a PK", "Independent entity"],
    [
      "lineNo ซ้ำข้าม order ได้",
      "ต้องรู้ owner จึงระบุบรรทัดได้",
      "partial key ไม่ใช่ globally unique key",
    ],
    [
      "Weak entity ใช้ owner key + partial key ระบุ entity",
      "A weak entity is identified by its owner key plus a partial key.",
    ],
  ),
];
export function checkAnswer(q: Question, selected: string[]): boolean {
  const norm = (v: string) => v.trim().toLowerCase();
  const a = [...new Set(selected.map(norm).filter(Boolean))].sort();
  const b = [...new Set(q.answer.map(norm))].sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
