import { bi, project, type Copy, type FD, type Relation } from "./model";

/** Paraphrased learning notes. Raw classroom transcripts stay in the private local archive. */
export type ClassroomNote = {
  id: string;
  date: string;
  topics: string[];
  title: Copy;
  explanation: Copy;
  takeaway: Copy;
};
export const classroomNotes: ClassroomNote[] = [
  {
    id: "key-choice",
    date: "2026-10-08",
    topics: ["keys", "candidate"],
    title: bi(
      "เลือก Primary Key อย่างมีเหตุผล",
      "Choose a primary key for a reason",
    ),
    explanation: bi(
      "หา Candidate Key ให้ครบก่อน แล้วค่อยเลือก PK โดยพิจารณาความเสถียร ขนาด และความเหมาะสม รหัสที่ไม่เปลี่ยนมักเหมาะกว่าชื่อที่อาจแก้ไขได้ จำนวน attribute ช่วยตัดสินใจ แต่ไม่ใช่เกณฑ์เดียว",
      "Identify candidate keys first, then select a PK based on stability, size and suitability. A stable identifier is often preferable to a changeable name. Attribute count matters, but it is not the only consideration.",
    ),
    takeaway: bi(
      "Minimal ไม่ใช่ minimum size: Candidate Key คือ superkey ที่ตัด attribute ออกไม่ได้ Candidate Key คนละชุดอาจมีจำนวน attribute ไม่เท่ากัน",
      "Minimal does not mean minimum size: no attribute can be removed from a candidate key. Different candidate keys can have different numbers of attributes.",
    ),
  },
  {
    id: "bcnf-check",
    date: "2026-10-08",
    topics: ["bcnf", "fd"],
    title: bi(
      "ผ่าน 3NF แล้ว ยังต้องตรวจ BCNF",
      "After 3NF, check BCNF separately",
    ),
    explanation: bi(
      "ตรวจ non-trivial FD X → Y ทุกตัวที่อนุมานได้ใน relation: BCNF ต้องให้ X เป็น superkey เสมอ ส่วน 3NF ยังยอมให้ FD ที่ X ไม่ใช่ superkey ได้ หากแต่ละ attribute ด้านขวาเป็น prime attribute จึงมี relation ที่ผ่าน 3NF แต่ไม่ผ่าน BCNF",
      "For every implied non-trivial FD X → Y in the relation, BCNF requires X to be a superkey. 3NF also permits a non-superkey determinant when every right-side attribute is prime. A relation can therefore satisfy 3NF and fail BCNF.",
    ),
    takeaway: bi(
      "Superkey ไม่จำเป็นต้อง minimal และห้ามตัดสิน key จากการเห็นข้อมูลตัวอย่างไม่ซ้ำเพียงอย่างเดียว ลอง counterexample ใน Normalization Lab",
      "A superkey need not be minimal. Unique-looking sample records do not establish a key. Explore the counterexample in the Normalization Lab.",
    ),
  },
  {
    id: "rider-zone",
    date: "2026-10-15",
    topics: ["3nf"],
    title: bi(
      "กรณี RIDER: ข้อมูล Zone ซ้ำตามคนขับ",
      "RIDER case: zone details repeated per rider",
    ),
    explanation: bi(
      "กำหนด riderId → riderName, zoneId และ zoneId → zoneName, zoneFee จะได้ riderId → zoneId → zoneName, zoneFee จึงมี Transitive Dependency ไปยัง non-prime attributes แยก ZONE ออก และเก็บ zoneId เป็น FK ใน RIDER",
      "Given riderId → riderName, zoneId and zoneId → zoneName, zoneFee, the chain riderId → zoneId → zoneName, zoneFee creates a transitive dependency to non-prime attributes. Separate ZONE and keep zoneId as an FK in RIDER.",
    ),
    takeaway: bi(
      "แก้ค่าจัดส่งของ Zone เพียงจุดเดียว Join ด้วย zoneId กลับมาได้ โดยไม่ต้องคัดลอกชื่อและค่าธรรมเนียมลงใน rider ทุกแถว ข้อมูลด้านล่างเป็นข้อมูลสมมติ",
      "Update a zone fee in one place and join on zoneId, instead of copying zone details into each rider row. Records below are fictional.",
    ),
  },
  {
    id: "requirements-constraints",
    date: "2026-10-15",
    topics: ["keys", "sql"],
    title: bi(
      "Requirement ต้องกลายเป็น constraint จริง",
      "Turn requirements into actual constraints",
    ),
    explanation: bi(
      "รหัสยาวคงที่ 3 ตัวอักษรใช้ CHAR(3); ชื่อประเภทห้ามซ้ำใช้ UNIQUE; ค่าบริการที่ต้องระบุและเป็นบวกใช้ NOT NULL ร่วมกับ CHECK (hourlyRate > 0) อย่าปล่อยให้เงื่อนไขอยู่แค่ในคำอธิบาย",
      "Use CHAR(3) for a fixed three-character code, UNIQUE for a type name that must not repeat, and NOT NULL plus CHECK (hourlyRate > 0) for a required positive rate. Requirements should be enforced, not left only in prose.",
    ),
    takeaway: bi(
      "CHECK (> 0) อย่างเดียวไม่ปฏิเสธ NULL ใน SQL เพราะเงื่อนไขอาจได้ UNKNOWN จึงต้องเพิ่ม NOT NULL เมื่อต้องบังคับให้กรอก",
      "CHECK (> 0) alone does not reject NULL in SQL: the predicate can evaluate to UNKNOWN. Add NOT NULL when the value is required.",
    ),
  },
  {
    id: "account-subclasses",
    date: "2026-10-15",
    topics: ["erd"],
    title: bi(
      "ACCOUNT เป็นทั้ง CREATOR และ PREMIUM ได้ไหม?",
      "Can ACCOUNT be both CREATOR and PREMIUM?",
    ),
    explanation: bi(
      "หาก requirement อนุญาตให้ account เป็นทั้งสองประเภทพร้อมกัน หรือไม่เป็นทั้งคู่ การจัด subclass ต้องเป็น overlapping และ partial โดย CREATOR มี channelName ส่วน PREMIUM มี expiryDate เป็น attribute เฉพาะ",
      "If an account may belong to both categories or neither category, subclass membership is overlapping and partial. CREATOR has its own channelName; PREMIUM has its own expiryDate.",
    ),
    takeaway: bi(
      "Overlapping / disjoint บอกว่าเป็นหลาย subclass พร้อมกันได้ไหม ส่วน partial / total บอกว่าต้องอยู่ใน subclass อย่างน้อยหนึ่งประเภทหรือไม่ เป็นข้อจำกัดคนละแกน",
      "Overlapping/disjoint controls whether multiple subclass memberships are allowed. Partial/total controls whether at least one membership is required. These are independent constraints.",
    ),
  },
];
export const riderFDs: FD[] = [
  { id: "R1", left: ["riderId"], right: ["riderName", "zoneId"] },
  { id: "R2", left: ["zoneId"], right: ["zoneName", "zoneFee"] },
];
export const riderOriginal: Relation = {
  name: "RIDER_BEFORE",
  columns: [
    { name: "riderId", pk: true },
    { name: "riderName" },
    { name: "zoneId" },
    { name: "zoneName" },
    { name: "zoneFee" },
  ],
  rows: [
    {
      riderId: "R01",
      riderName: "Mali",
      zoneId: "Z01",
      zoneName: "Central",
      zoneFee: 30,
    },
    {
      riderId: "R02",
      riderName: "Niran",
      zoneId: "Z01",
      zoneName: "Central",
      zoneFee: 30,
    },
    {
      riderId: "R03",
      riderName: "Arun",
      zoneId: "Z02",
      zoneName: "East",
      zoneFee: 45,
    },
  ],
};
export const riderNormalized: Relation[] = [
  {
    name: "ZONE",
    columns: [
      { name: "zoneId", pk: true },
      { name: "zoneName" },
      { name: "zoneFee" },
    ],
    rows: project(riderOriginal.rows, ["zoneId", "zoneName", "zoneFee"]),
  },
  {
    name: "RIDER",
    columns: [
      { name: "riderId", pk: true },
      { name: "riderName" },
      { name: "zoneId", fk: "ZONE.zoneId" },
    ],
    rows: project(riderOriginal.rows, ["riderId", "riderName", "zoneId"]),
  },
];
