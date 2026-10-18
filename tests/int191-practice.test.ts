import { it, expect } from "vitest";
import { questions, checkAnswer } from "../src/lib/int191/practice";
import { parseProgress, dueQuestionIds } from "../src/lib/int191/progress";
it("checks complete column sets rather than accepting a correct subset", () => {
  const q = questions.find((q) => q.id === "key")!;
  expect(checkAnswer(q, ["jobNo"])).toBe(false);
  expect(checkAnswer(q, ["partNo", " JOBNO "])).toBe(true);
  expect(checkAnswer(q, ["jobNo", "partNo", "quantity"])).toBe(false);
});
it("has answerable bilingual questions with progressive hints and no duplicate ids", () => {
  expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  for (const q of questions) {
    expect(checkAnswer(q, q.answer)).toBe(true);
    expect(q.hints).toHaveLength(3);
    expect(q.solution.en).toBeTruthy();
    if (q.options)
      expect(q.answer.every((a) => q.options!.includes(a))).toBe(true);
  }
});
it("recovers malformed storage and tracks only the latest answer per question", () => {
  expect(parseProgress("broken", [], []).attempts).toEqual([]);
  expect(
    dueQuestionIds([
      { id: "x", correct: false, revealed: false, at: 1 },
      { id: "x", correct: true, revealed: false, at: 2 },
      { id: "y", correct: true, revealed: true, at: 3 },
    ]),
  ).toEqual(["y"]);
  expect(
    parseProgress(
      JSON.stringify({
        completed: ["valid", "bad", null],
        attempts: [{ id: "x", correct: "yes", at: 1 }],
      }),
      ["valid"],
      ["x"],
    ).completed,
  ).toEqual(["valid"]);
});

it("rejects finite but invalid Date timestamps in saved activity", () => {
  const p = parseProgress(
    JSON.stringify({
      activity: [
        { label: "keys", at: 1e30 },
        { label: "keys", at: 1000 },
      ],
    }),
    ["keys"],
    [],
  );
  expect(p.activity).toEqual([{ label: "keys", at: 1000 }]);
});
