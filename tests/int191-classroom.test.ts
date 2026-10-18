import { expect, it } from "vitest";
import {
  classroomNotes,
  riderOriginal,
  riderNormalized,
  riderFDs,
} from "../src/lib/int191/classroom";
import {
  candidateKeys,
  naturalJoin,
  normalForm,
} from "../src/lib/int191/model";
import { topics } from "../src/lib/int191/curriculum";
it("preserves rider records, FDs and keys through the taught zone decomposition", () => {
  expect(
    candidateKeys(
      riderOriginal.columns.map((c) => c.name),
      riderFDs,
    ),
  ).toEqual([["riderId"]]);
  expect(
    normalForm(
      riderOriginal.columns.map((c) => c.name),
      riderFDs,
    ).level,
  ).toBe("2NF");
  for (const r of riderNormalized)
    expect(
      normalForm(
        r.columns.map((c) => c.name),
        riderFDs,
      ).level,
    ).toBe("BCNF");
  const joined = naturalJoin(riderNormalized[0].rows, riderNormalized[1].rows);
  expect(joined).toHaveLength(riderOriginal.rows.length);
  expect(joined).toEqual(expect.arrayContaining(riderOriginal.rows));
  expect(riderNormalized[0].rows).toHaveLength(2);
});
it("links every bilingual classroom takeaway to existing independent lessons", () => {
  expect(new Set(classroomNotes.map((n) => n.id)).size).toBe(
    classroomNotes.length,
  );
  for (const n of classroomNotes) {
    expect(n.topics.every((id) => topics.some((t) => t.id === id))).toBe(true);
    expect(
      n.explanation.th && n.explanation.en && n.takeaway.th && n.takeaway.en,
    ).toBeTruthy();
  }
});
