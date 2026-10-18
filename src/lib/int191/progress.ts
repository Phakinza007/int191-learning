export const STORAGE_KEY = "int191-academy-v1";
export type Attempt = {
  id: string;
  correct: boolean;
  revealed: boolean;
  at: number;
};
export type Progress = {
  completed: string[];
  bookmarks: string[];
  attempts: Attempt[];
  current: string;
  activity: { label: string; at: number }[];
};
export const emptyProgress = (): Progress => ({
  completed: [],
  bookmarks: [],
  attempts: [],
  current: "fundamentals",
  activity: [],
});
export function parseProgress(
  raw: string | null,
  topicIds: string[],
  questionIds: string[],
): Progress {
  try {
    const d = JSON.parse(raw ?? "null");
    if (!d || typeof d !== "object") return emptyProgress();
    const validTime = (v: number) =>
      Number.isFinite(v) && v >= 0 && v <= 8.64e15;
    const ids = (v: unknown) =>
      Array.isArray(v)
        ? [
            ...new Set(
              v.filter(
                (x): x is string =>
                  typeof x === "string" && topicIds.includes(x),
              ),
            ),
          ]
        : [];
    return {
      completed: ids(d.completed),
      bookmarks: ids(d.bookmarks),
      current: topicIds.includes(d.current) ? d.current : "fundamentals",
      attempts: Array.isArray(d.attempts)
        ? d.attempts
            .filter(
              (x: Attempt) =>
                x &&
                questionIds.includes(x.id) &&
                typeof x.correct === "boolean" &&
                typeof x.revealed === "boolean" &&
                validTime(x.at),
            )
            .slice(-200)
        : [],
      activity: Array.isArray(d.activity)
        ? d.activity
            .filter(
              (x: { label: string; at: number }) =>
                x && topicIds.includes(x.label) && validTime(x.at),
            )
            .slice(-8)
        : [],
    };
  } catch {
    return emptyProgress();
  }
}
export function dueQuestionIds(attempts: Attempt[]): string[] {
  const latest = new Map<string, Attempt>();
  for (const a of attempts) latest.set(a.id, a);
  return [...latest.values()]
    .filter((a) => !a.correct || a.revealed)
    .map((a) => a.id);
}
