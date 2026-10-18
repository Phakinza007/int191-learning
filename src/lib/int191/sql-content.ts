import { bi } from "./model";
export const sqlExamples = [
  {
    name: "SELECT",
    sql: "SELECT studentId, studentName FROM STUDENT;",
    explanation: bi(
      "เลือกเฉพาะคอลัมน์ที่ต้องการ ไม่เปลี่ยนข้อมูลต้นทาง",
      "Project only the requested columns; source data is unchanged.",
    ),
  },
  {
    name: "WHERE",
    sql: "SELECT * FROM STUDENT WHERE departmentId = 'D01';",
    explanation: bi(
      "กรองแถวก่อนส่งผลลัพธ์ เลือก D01 ในตารางเพื่อดูค่าที่ match",
      "Filter rows before returning them. Select D01 in the table to inspect matches.",
    ),
  },
  {
    name: "ORDER BY",
    sql: "SELECT * FROM STUDENT ORDER BY studentName DESC;",
    explanation: bi(
      "เรียงผลลัพธ์ ไม่ได้เปลี่ยนลำดับเชิงตรรกะของข้อมูลที่เก็บ",
      "Sort the result; this does not impose an intrinsic row order on the stored relation.",
    ),
  },
  {
    name: "INNER JOIN",
    sql: "SELECT s.studentName, s.departmentId, d.departmentName\nFROM STUDENT s INNER JOIN DEPARTMENT d\nON s.departmentId = d.departmentId;",
    explanation: bi(
      "จับคู่ด้วย departmentId; Dana ไม่มีแผนกจึงไม่มีคู่ในผล INNER JOIN",
      "Match departmentId values. Dana has no department and no INNER JOIN match.",
    ),
  },
  {
    name: "LEFT JOIN",
    sql: "SELECT s.studentName, s.departmentId, d.departmentName\nFROM STUDENT s LEFT JOIN DEPARTMENT d\nON s.departmentId = d.departmentId;",
    explanation: bi(
      "เก็บนักศึกษาทุกคนรวม Dana ซึ่งได้ NULL ใน departmentName",
      "Retain every student, including Dana with NULL departmentName.",
    ),
  },
  {
    name: "GROUP BY",
    sql: "SELECT departmentId, COUNT(*) AS students\nFROM STUDENT GROUP BY departmentId;",
    explanation: bi(
      "รวมแถวที่มี departmentId เดียวกัน แล้วนับจำนวนในแต่ละกลุ่ม",
      "Group equal departmentId values and count the rows in each group.",
    ),
  },
  {
    name: "HAVING",
    sql: "SELECT departmentId, COUNT(*) AS students\nFROM STUDENT GROUP BY departmentId HAVING COUNT(*) > 1;",
    explanation: bi(
      "กรองกลุ่มหลัง COUNT แล้ว D01 มีสองคนจึงผ่าน",
      "Filter groups after COUNT. D01 has two students and survives.",
    ),
  },
  {
    name: "INSERT",
    sql: "INSERT INTO STUDENT VALUES ('S005', 'Eve', 'D02');\nSELECT * FROM STUDENT;",
    explanation: bi(
      "เพิ่มแถวโดยต้องไม่ซ้ำ PK และ FK ต้องอ้างแผนกที่มีอยู่",
      "Insert a row with a unique PK and an existing referenced department.",
    ),
  },
  {
    name: "UPDATE",
    sql: "UPDATE STUDENT SET departmentId = 'D02' WHERE studentId = 'S001';\nSELECT * FROM STUDENT;",
    explanation: bi(
      "ย้าย Alice ไป D02; WHERE ระบุว่าจะเปลี่ยนแถวใด ดู before/after ด้านล่าง",
      "Move Alice to D02. WHERE selects the row to change; compare before and after below.",
    ),
  },
  {
    name: "DELETE",
    sql: "DELETE FROM STUDENT WHERE studentId = 'S003';\nSELECT * FROM STUDENT;",
    explanation: bi(
      "ลบ Charlie ออกจากสำเนาใน worker เท่านั้น รันใหม่ข้อมูลตั้งต้นกลับมา",
      "Remove Charlie only from the worker’s copy. The next run restores the initial data.",
    ),
  },
  {
    name: "CREATE TABLE · PK · FK",
    sql: "CREATE TABLE ENROLMENT (\n studentId VARCHAR(8) NOT NULL,\n courseId VARCHAR(8) NOT NULL,\n PRIMARY KEY (studentId, courseId),\n FOREIGN KEY (studentId) REFERENCES STUDENT(studentId)\n);\nDESCRIBE ENROLMENT;",
    explanation: bi(
      "Composite PK กันการลงวิชาซ้ำต่อคน FK ตรวจว่ามีนักศึกษาจริง แล้ว DESCRIBE ดู schema",
      "The composite PK prevents duplicate enrolments per student/course. The FK requires an existing student. DESCRIBE inspects the schema.",
    ),
  },
  {
    name: "FK error",
    sql: "INSERT INTO STUDENT VALUES ('S005','Eve','D99');",
    explanation: bi(
      "D99 ไม่มีใน DEPARTMENT จึงต้องถูกปฏิเสธ ลองแก้เป็น D02 ก่อนรันใหม่",
      "D99 does not exist in DEPARTMENT, so the insert is rejected. Change it to D02 and rerun.",
    ),
  },
];
