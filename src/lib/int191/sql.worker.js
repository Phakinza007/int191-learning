import { createSqlServer, splitStatements } from "../lab/engine/sql-engine.js";
const seed = `CREATE DATABASE academy; USE academy;
CREATE TABLE DEPARTMENT (departmentId VARCHAR(8) PRIMARY KEY, departmentName VARCHAR(80) NOT NULL);
CREATE TABLE STUDENT (studentId VARCHAR(8) PRIMARY KEY, studentName VARCHAR(80) NOT NULL, departmentId VARCHAR(8), FOREIGN KEY (departmentId) REFERENCES DEPARTMENT(departmentId));
INSERT INTO DEPARTMENT VALUES ('D01','Computer Science'),('D02','Information Technology');
INSERT INTO STUDENT VALUES ('S001','Alice','D01'),('S002','Bob','D02'),('S003','Charlie','D01'),('S004','Dana',NULL);`;
export function runEducationalSql(text) {
  if (typeof text !== "string" || text.length > 4000)
    throw new Error("SQL must contain at most 4,000 characters.");
  const statements = splitStatements(text);
  if (statements.length > 20) throw new Error("At most 20 statements per run.");
  const server = createSqlServer({ seed });
  const session = server.connect({ database: "academy" });
  const results = [];
  for (const sql of statements) {
    try {
      const r = session.query(sql);
      results.push(
        r.type === "rows"
          ? {
              sql,
              kind: "rows",
              fields: r.fields,
              rows: r.values.slice(0, 100),
              rowCount: r.values.length,
            }
          : {
              sql,
              kind: "ok",
              affectedRows: r.header.affectedRows,
              info: r.header.info,
            },
      );
    } catch (e) {
      results.push({
        sql,
        kind: "error",
        error: {
          errno: e.errno ?? 0,
          code: e.code ?? "SIMULATION_ERROR",
          message: e.message,
        },
      });
      break;
    }
  }
  let after = [];
  try {
    after = session.query("SELECT * FROM STUDENT ORDER BY studentId;").rows;
  } catch {
    /* A learner may drop or rename STUDENT. */
  }
  return { statements: results, after };
}
if (typeof self !== "undefined" && typeof Window === "undefined")
  self.onmessage = (e) => {
    try {
      self.postMessage({ ok: true, ...runEducationalSql(e.data) });
    } catch (e) {
      self.postMessage({ ok: false, error: e.message });
    }
  };
