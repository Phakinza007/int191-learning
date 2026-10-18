import { it, expect } from "vitest";
import { sqlExamples } from "../src/lib/int191/sql-content";
import { runEducationalSql } from "../src/lib/int191/sql.worker.js";
it("runs every SQL example and reports the intentional FK violation", () => {
  for (const p of sqlExamples) {
    const out = runEducationalSql(p.sql);
    const errors = out.statements.filter(
      (s: { kind: string }) => s.kind === "error",
    );
    expect(errors.length, p.name).toBe(p.name === "FK error" ? 1 : 0);
  }
});
it("demonstrates JOIN semantics and restores source data for each run", () => {
  const inner = runEducationalSql(sqlExamples[3].sql),
    left = runEducationalSql(sqlExamples[4].sql);
  expect(inner.statements[0].rowCount).toBe(3);
  expect(left.statements[0].rowCount).toBe(4);
  expect(runEducationalSql(sqlExamples[9].sql).after).toHaveLength(3);
  expect(runEducationalSql(sqlExamples[0].sql).after).toHaveLength(4);
});
