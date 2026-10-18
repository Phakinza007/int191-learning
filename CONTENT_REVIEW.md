# INT191 learning site: educational content review

วันที่ตรวจ: 18 ตุลาคม 2026 · ขอบเขต: บทเรียนและเครื่องมือการเรียนทั้งหมดที่ยังอยู่ใน source รวม 12 topics (11 หัวข้อใน Exam 2 scope และ SQL) ไม่ได้ลบหรือซ่อนบท SQL จากโค้ด แม้หน้า Exam 2 จะเน้น 11 หัวข้อที่ประกาศไว้

คะแนนเป็น **expert heuristic** จากเนื้อหาและ interactions ใน source ไม่ใช่ผลทดสอบผู้เรียน คะแนน 7 มิติใช้ rubric ที่กำหนด: Clarity 20%, Accuracy 20%, Visual explanation 15%, Example quality 15%, Learning progression 10%, Interactivity 10%, Practice effectiveness 10%. สูตรคะแนนรวม = ผลรวม `(คะแนนมิติ ÷ 10 × น้ำหนัก)` จึงได้คะแนนเต็ม 100. “ก่อน” คือการประเมินก่อนการแก้รอบนี้; “หลัง” คือการประเมิน source หลังแก้ และเพิ่มคะแนนเฉพาะเมื่อมีการแก้ที่รองรับคะแนนนั้นจริง

## ภาพรวมการตรวจ

ตรวจบทเรียน 12 หัวข้อ, เครื่องมือ FD/closure/key, Normalization Lab, ER/EER Lab, SQL simulation, แบบฝึกและ hint/เฉลย, lecture notes ที่นำมาเรียบเรียง, ตารางตัวอย่าง, schema diagram, navigation และการเลือกภาษาไทย/อังกฤษ

ประเด็นกระทบความเข้าใจสูงสุด:

1. **Candidate Key:** คำว่า minimal มักถูกเข้าใจผิดว่าเป็น “คีย์ที่สั้นที่สุดเมื่อเทียบกับทุกชุด” เนื้อหาเดิมมีคำว่า minimality แต่ตัวบทเรียนยังไม่ย้ำความต่างหรือสาธิตการตัดสมาชิก เราเพิ่มคำอธิบายและไล่พิสูจน์ `{S,C}` จาก FD `SC → I`, `I → C` พร้อมตรวจ proper subsets และย้ำว่า key คนละชุดอาจมีจำนวน attribute ต่างกัน
2. **EER diagram:** ตัวเลือก overlapping/disjoint และ total/partial มีอยู่แล้ว แต่ภาพเดิมใช้ข้อความลูกศรแทนสัญลักษณ์ ทำให้ผู้เริ่มเรียนถ่ายโอนไปอ่าน diagram มาตรฐานได้ยาก เราแทนด้วย SVG ที่มี superclass/subclass, วงกลม `o`/`d`, และเส้นคู่สำหรับ total พร้อมคำอธิบายและ mapping เป็นตาราง PK/FK
3. **Functional Dependency:** เนื้อหาเดิมถูกต้อง แต่ไม่แสดงตัวอย่าง trivial FD ที่เกี่ยวกับการทดสอบ Normal Form โดยตรง เราเพิ่ม `A → A` พร้อมเหตุผล และตัวอย่าง FD ที่ย้อนกลับไม่ได้
4. **ข้อจำกัดของตัวอย่าง:** FD เป็นกฎของทุก legal instance ไม่ใช่สิ่งที่อนุมานได้จากแถว sample; เว็บบอกเรื่องนี้ใน FD Explorer แล้ว และควรย้ำต่อเนื่องเวลาใช้ตารางสาธิต
5. **ความครบถ้วนในการเรียนรู้:** แต่ละหัวข้อมี objective, คำอธิบาย, lab, misconception, understanding check และ progressive hint/reveal; ยังไม่มีผลวิจัยผู้เรียนยืนยันว่าเข้าใจได้ด้วยตนเอง จึงถือเป็นความเสี่ยงที่ต้องทดสอบกับนักศึกษา ไม่ใช่อ้างว่าผ่านแล้ว

คำถามประเมิน 10 ด้าน: **ความชัดเจน/ความถูกต้อง/ความเหมาะกับมือใหม่/ความครบถ้วน/ตัวอย่าง/ภาพและตาราง/ลำดับ/การฝึก/ความพร้อมสอบ** ตรวจครบในทุกแถวด้านล่าง โดยย่อเหตุผลใน “จุดที่พบ/สถานะ”. ตัวเลข 7 มิติคือเกณฑ์ weighted rubric ตามโจทย์; ความครบถ้วนและ exam readiness อธิบายเชิงคุณภาพเพื่อไม่สร้างน้ำหนักใหม่ที่ขัดกับ rubric

## คะแนนรายบท

ตัวย่อคะแนน: `C` clarity, `A` accuracy, `V` visual explanation, `E` examples, `P` progression, `I` interaction, `Q` practice; ทุกมิติเต็ม 10. `รวม` เป็น weighted score /100. ก่อน→หลังแสดงการเปลี่ยนที่ตรวจสอบได้

| บทเรียน | C/A/V/E/P/I/Q ก่อน → หลัง | รวม ก่อน → หลัง | จุดที่พบ · ความสำคัญ · การปรับปรุง/สถานะ |
|---|---:|---:|---|
| Relational fundamentals | 7/9/7/7/8/7/7 → คงเดิม | 75 → 75 | คำจำกัดความ relation/tuple/attribute ถูกต้อง และเตือนว่า row order ไม่ใช่ identity; ตัวอย่างเชื่อมตารางมีให้สำรวจ แต่ยังพึ่งผู้เรียนกดไป Relationship Lab. **P2**: เพิ่ม table walkthrough ในบทนี้ในอนาคต; ปัจจุบันมี interactive table ที่ lab ร่วมใช้ |
| Keys and constraints | 7/9/7/7/8/8/7 → คงเดิม | 76 → 76 | นิยาม Superkey/Candidate/PK/FK ถูกต้อง; แนะนำให้ลอง closure ผ่าน FD Explorer แต่ยังไม่มี key proof แบบอยู่ในบทโดยตรง. **P2**: เพิ่ม worked key comparison แบบ guided |
| Functional dependencies | 7/9/8/8/8/9/7 → 8/9/8/8/8/9/7 | 80 → 82 | อธิบายข้อกำหนดเหนือทุก legal instance และ determinant ไม่จำเป็นเป็น PK ได้ถูกต้อง; เพิ่มตัวอย่าง trivial `A → A`, JOB_SHEET FD ที่ต้องใช้คีย์คู่ และย้ำว่ากลับทิศไม่ได้ |
| Attribute closure | 8/9/9/8/9/9/8 → คงเดิม | 85.5 → 85.5 | แสดงการเพิ่มค่า closure ทีละ FD, เงื่อนไขใช้ LHS ครบ, replay และทดสอบ superkey; ครอบคลุมการทำโจทย์ได้ดี. **P3**: เพิ่มโจทย์ closure ที่มี LHS หลาย attribute ในตัวบทเรียน |
| Candidate keys and prime attributes | 6/9/8/7/8/8/7 → 8/9/9/8/8/8/8 | 75.5 → 83.5 | ก่อนแก้ไม่แยก “minimal” กับ “มีจำนวน attribute น้อยที่สุด”; ตัวอย่าง candidate สองชุดมีขนาดเท่ากัน. เพิ่มความหมายที่ถูกต้อง, วิธี closure+ตัดสมาชิก, และ proof `{S,C}` / `{S,I}` ของ ENROLMENT; เพิ่มตัวอย่างคีย์ขนาดต่างกันใน misconception |
| UNF and repeating groups | 7/9/8/8/8/8/7 → คงเดิม | 79 → 79 | ชี้ nested/repeating group และรักษาการจับคู่ partNo/quantity; เชื่อมไปการแผ่เป็นแถวใน Normalization Lab. **P3**: เพิ่มภาพเปรียบเทียบ cell ก่อน/หลังไว้ในเนื้อหาบทโดยตรง |
| First Normal Form | 7/9/8/8/8/8/8 → คงเดิม | 80 → 80 | อธิบาย atomicity ภายใต้ domain และสมมติฐานหนึ่ง part ต่อหนึ่ง job line; เตือนว่า 1NF ไม่ลบ anomaly. **P2**: ควรเปิดสมมติฐานเรื่อง atomicity/domain เป็น callout ใกล้ตารางแรก |
| Second Normal Form | 8/9/9/9/8/9/8 → คงเดิม | 86 → 86 | นิยามเป็น 1NF และไม่มี non-prime attribute ขึ้นกับ proper subset ของ candidate key; jobDate/partName เทียบกับ quantity ถูกต้อง มี decomposition และข้อมูลหลายแถว. **P2**: เพิ่ม visual bracket บน composite key ในบทข้อความเอง |
| Third Normal Form | 8/9/9/9/8/9/8 → คงเดิม | 86 → 86 | มีเงื่อนไข formal `X` เป็น superkey หรือ RHS เป็น prime และมี RIDER→ZONE ตัวอย่าง transitive; เตือน shorthand ไม่ใช่นิยามทั่วไป. **P2**: เพิ่มแบบฝึกสั้นที่ RHS เป็น prime เพื่อกันจำ rule แบบง่ายเกิน |
| BCNF and lossless decomposition | 8/9/9/9/8/9/8 → คงเดิม | 86 → 86 | ความต่างจาก 3NF, ENROLMENT counterexample, lossless และ dependency-preserving แยกกันชัด; ตรวจ JOB_SHEET ภายใต้ FDs ที่ระบุ. **P2**: เพิ่มเหตุผล proof lossless แบบ binary decomposition ต่อขั้น พร้อมแยกจากการทดสอบ rejoin sample |
| ER diagrams and cardinality | 7/9/6/7/7/8/7 → 8/9/9/8/8/9/8 | 73.5 → 84.5 | ก่อนแก้ EER control ทำงานแต่ภาพเป็นตัวอักษร/ลูกศรและไม่มี mapping ไปตาราง subclass. เพิ่ม SVG EER จริงพร้อม o/d, total/partial, accessible title/description และ schema `ACCOUNT`, `CREATOR`, `PREMIUM` ซึ่งแสดง PK/FK ที่สืบทอด |
| SQL and JOIN results | 8/9/8/8/8/9/8 → คงเดิม | 83 → 83 | อธิบาย INNER/LEFT JOIN, WHERE/HAVING และระบุการจำลอง; SQL อยู่นอก scope สอบปัจจุบันแต่ยังคงบทและฟังก์ชันไว้. **P3**: ย้ำ supported examples ใกล้ editor และเพิ่มโจทย์ตรวจผล LEFT JOIN |

## ตรวจความถูกต้องทางฐานข้อมูล

- **JOB_SHEET:** ภายใต้ FD1–FD5, `{jobNo,partNo}` เป็น candidate key: ทั้ง `jobNo` และ `partNo` ไม่ปรากฏเป็น RHS จึงต้องอยู่ในทุก key; closure ของคู่ได้ครบ 11 attributes; ตัดตัวใดตัวหนึ่งแล้วไม่ครบ. FD1 เป็น full dependency ของ `quantity`; FD2/FD3 เป็น partial dependencies ของ non-prime attributes.
- **2NF/3NF schema:** JOB_HEADER, PART, JOB_PART แก้ partial dependency; CUSTOMER/TECHNICIAN ถูกแยกเมื่อทำ 3NF; JOB เก็บ FK. ทุก FD ที่ให้มายังคงตรวจได้ในตารางปลายทาง และทุก determinant ในแต่ละ relation เป็น superkey จึงผ่าน BCNF **ตาม FD ที่ระบุ**.
- **ENROLMENT:** `SC → I`, `I → C`, keys `SC` และ `SI`; ทุก attribute เป็น prime, จึงผ่าน 3NF แต่ `I` ไม่ใช่ superkey จึงผิด BCNF. Decompose `IC` และ `SI` เป็น lossless แต่ `SC → I` ไม่ได้อยู่ภายใน relation เดียว จึงไม่ dependency preserving.
- **ราคาชิ้นส่วน:** ตัวอย่างปฏิบัติต่อ `unitPrice` เป็นราคาปัจจุบันที่กำหนดจาก `partNo`. หากโจทย์หมายถึงราคาประวัติการซื้อ จะต้องเก็บ transaction price ใน JOB_PART และเปลี่ยน FD/ตัวอย่างตาม business rule; เว็บควรระบุ assumption นี้เพิ่มก่อนใช้กับงานจริง.
- **EER:** overlapping/disjoint กับ total/partial เป็นข้อจำกัดสองแกนแยกกัน. ตาราง superclass+subclass ที่ใช้ inherited PK เป็น PK/FK ใช้ได้ทั้งสี่ชุด; ข้อจำกัดการมีสมาชิก subclass อาจต้อง enforcement เพิ่มใน DBMS ไม่ได้เกิดขึ้นเพียงเพราะวาด diagram.
- ตารางตัวอย่าง 4 JOB_SHEET rows สอดคล้องกับ FDs ที่ประกาศ แต่ใช้เป็นภาพประกอบ ไม่ใช่ proof ของ FD. แบบจำลอง key closure รองรับได้ถึง 16 attributes ด้วยการ enumerate subsets ซึ่งเหมาะกับตัวอย่างสอนขนาดเล็ก ไม่ใช่เครื่องมือวิเคราะห์ schema ขนาดใหญ่.

## สิ่งที่ปรับและสิ่งที่คงเดิม

- ปรับข้อความและ worked reasoning ใน Candidate Key, Functional Dependency.
- เปลี่ยน EER text diagram เป็น responsive SVG ที่มี accessible description; เพิ่มการแปลง subclass ไป relational schemas พร้อม PK/FK.
- คงเนื้อหาเดิมและฟังก์ชันทั้งหมด: bilingual toggle, exam topic mode, navigation/search, bookmarks/progress, FD closure/key explorer, normalization steps/anomaly demos, ER/weak/M:N/1:1/EER lab, practice hints/solutions/timer, classroom notes, SQL educational simulation, dark/light mode และ existing routes.
- ไม่ลบ lesson หรือแบบฝึกใด; คะแนนบทที่ไม่เปลี่ยนเนื้อหาในรอบนี้จึงไม่เพิ่ม.

## การตรวจหลังแก้

ผลตรวจ: `npm test` ผ่าน 25 tests ใน 6 files; `npm run check` ผ่าน 42 Astro files โดยไม่มี errors, warnings หรือ hints; `npm run build` สร้าง static route สำเร็จ; `git diff --check` ผ่าน. เพิ่ม UI test สำหรับ SVG/EER constraint states/table mapping แล้ว. ยังไม่ได้ทำ browser-based visual QA บนอุปกรณ์จริงหรือ usability session กับนักศึกษา; score ไม่ใช่หลักฐานผลสัมฤทธิ์.
