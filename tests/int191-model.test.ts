import { describe, expect, it } from "vitest";
import {
  closureTrace,
  candidateKeys,
  jobAttributes,
  jobFDs,
  jobRows,
  job2NF,
  jobFinal,
  naturalJoin,
  normalForm,
  bcnfFDs,
  smallFDs,
} from "../src/lib/int191/model";
describe("INT191 relational theory", () => {
  it("computes closure sequentially and never activates half of a composite determinant", () => {
    expect(closureTrace(["A"], smallFDs).steps.map((s) => s.closure)).toEqual([
      ["A", "B"],
      ["A", "B", "C"],
      ["A", "B", "C", "D"],
    ]);
    expect(closureTrace(["jobNo"], jobFDs).closure).not.toContain("quantity");
  });
  it("finds the unique minimal JOB_SHEET key", () =>
    expect(candidateKeys(jobAttributes, jobFDs)).toEqual([
      ["jobNo", "partNo"],
    ]));
  it("classifies the initial relation as only 1NF and 2NF headers as not 3NF", () => {
    expect(normalForm(jobAttributes, jobFDs).level).toBe("1NF");
    expect(
      normalForm(
        job2NF[0].columns.map((c) => c.name),
        jobFDs,
      ).level,
    ).toBe("2NF");
  });
  it("verifies all final relations are BCNF under projected FDs", () => {
    for (const r of jobFinal)
      expect(
        normalForm(
          r.columns.map((c) => c.name),
          jobFDs,
        ).level,
        r.name,
      ).toBe("BCNF");
  });
  it("preserves every stated FD locally and rejoins the original sample without spurious tuples", () => {
    for (const fd of jobFDs)
      expect(
        jobFinal.some((r) =>
          [...fd.left, ...fd.right].every((a) =>
            r.columns.some((c) => c.name === a),
          ),
        ),
      ).toBe(true);
    const joined = jobFinal.map((r) => r.rows).reduce(naturalJoin);
    const canonical = (rows: typeof jobRows) =>
      rows.map((r) => JSON.stringify(jobAttributes.map((a) => r[a]))).sort();
    expect(canonical(joined)).toEqual(canonical(jobRows));
  });
  it("distinguishes prime attributes in a 3NF but not BCNF relation", () => {
    const attrs = ["studentId", "courseId", "instructorId"];
    const analysis = normalForm(attrs, bcnfFDs);
    expect(analysis.keys).toEqual([
      ["studentId", "courseId"],
      ["studentId", "instructorId"],
    ]);
    expect(analysis.level).toBe("3NF");
    expect(analysis.prime).toHaveLength(3);
  });
  it("terminates for cycles and validates empty-set determinants", () => {
    expect(
      closureTrace(
        ["A"],
        [
          { id: "1", left: ["A"], right: ["B"] },
          { id: "2", left: ["B"], right: ["A"] },
        ],
      ).steps,
    ).toHaveLength(1);
    expect(candidateKeys(["A"], [{ id: "1", left: [], right: ["A"] }])).toEqual(
      [[]],
    );
  });
});
