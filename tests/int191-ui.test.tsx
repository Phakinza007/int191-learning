// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { questions } from "../src/lib/int191/practice";
import PracticeCard from "../src/components/int191/PracticeCard";
import FDExplorer from "../src/components/int191/FDExplorer";
import SchemaDiagram from "../src/components/int191/SchemaDiagram";
import DatabaseTable from "../src/components/int191/DatabaseTable";
import { jobFinal, studentTables } from "../src/lib/int191/model";
afterEach(cleanup);
it("uses progressive hints after wrong answers and does not reveal the solution until requested", () => {
  const q = questions[0];
  render(<PracticeCard question={q} lang="en" onAnswer={() => {}} />);
  fireEvent.click(screen.getByLabelText("Domain"));
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.getByText("Hint 1")).toBeTruthy();
  expect(screen.queryByText(q.solution.en)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reveal full solution" }));
  expect(
    screen.getByRole("button", { name: "tuple: One row of a relation." }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /attribute: A property or column/ }),
  ).toBeTruthy();
});
it("checks the entire composite key before giving positive feedback", () => {
  render(
    <PracticeCard
      question={questions.find((q) => q.id === "key")!}
      lang="en"
      onAnswer={() => {}}
    />,
  );
  fireEvent.click(screen.getByLabelText("jobNo"));
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.queryByText("Correct!")).toBeNull();
  fireEvent.click(screen.getByLabelText("partNo"));
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
  expect(screen.getByText("Correct!")).toBeTruthy();
});
it("replays a valid closure and resets the trace when seed attributes change", () => {
  render(<FDExplorer lang="en" />);
  for (let i = 0; i < 3; i++)
    fireEvent.click(screen.getByRole("button", { name: "Apply next FD" }));
  expect(screen.getByText("{A}+ = {A, B, C, D}")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Replay" }));
  expect(screen.getByText("{A}+ = {A}")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("B"));
  expect(screen.getByText("{A, B}+ = {A, B}")).toBeTruthy();
});
it("supports keyboard activation on schema entities and displays FK details", () => {
  render(<SchemaDiagram relations={jobFinal} lang="en" />);
  fireEvent.keyDown(screen.getByRole("button", { name: "JOB entity" }), {
    key: "Enter",
  });
  expect(screen.getByText(/JOB: jobNo \[PK\]/)).toBeTruthy();
  const edge = screen.getByRole("button", {
    name: /CUSTOMER → JOB: customerId/,
  });
  fireEvent.keyDown(edge, { key: " " });
  expect(screen.getByText(/The FK belongs on the child side/)).toBeTruthy();
});
it("keeps table selection accessible without relying on color", () => {
  render(
    <DatabaseTable
      relation={studentTables[1]}
      lang="en"
      selection={{ column: "departmentId", value: "D01" }}
      onSelect={() => {}}
    />,
  );
  const rows = screen.getAllByRole("row");
  expect(
    within(rows[1])
      .getByRole("button", { name: /D01/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    within(rows[2])
      .getByRole("button", { name: "D02" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});
