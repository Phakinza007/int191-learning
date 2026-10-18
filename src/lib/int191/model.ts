/** Pure relational theory. No UI or storage; FDs are assumptions, never inferred from sample rows. */
export type Lang = "th" | "en";
export type Copy = { th: string; en: string };
export const bi = (th: string, en: string): Copy => ({ th, en });
export type FD = { id: string; left: string[]; right: string[] };
export type Column = {
  name: string;
  pk?: boolean;
  fk?: string;
  description?: Copy;
};
export type Row = Record<string, string | number | null>;
export type Relation = { name: string; columns: Column[]; rows: Row[] };
export const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));
export function closureTrace(seed: string[], fds: FD[]) {
  const known = new Set(seed);
  const steps: { fd: FD; added: string[]; closure: string[] }[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const fd of fds) {
      if (!fd.left.every((a) => known.has(a))) continue;
      const added = fd.right.filter((a) => !known.has(a));
      if (!added.length) continue;
      added.forEach((a) => known.add(a));
      steps.push({ fd, added, closure: [...known] });
      changed = true;
    }
  }
  return { closure: [...known], steps };
}
export const closure = (seed: string[], fds: FD[]) =>
  closureTrace(seed, fds).closure;
export function subsets(attributes: string[]): string[][] {
  if (attributes.length > 16)
    throw new Error("This teaching explorer supports up to 16 attributes.");
  return Array.from({ length: 2 ** attributes.length }, (_, mask) =>
    attributes.filter((_, i) => mask & (2 ** i)),
  );
}
export function candidateKeys(attributes: string[], fds: FD[]): string[][] {
  const keys: string[][] = [];
  for (const set of subsets(attributes).sort((a, b) => a.length - b.length)) {
    if (keys.some((k) => k.every((a) => set.includes(a)))) continue;
    if (attributes.every((a) => closure(set, fds).includes(a))) keys.push(set);
  }
  return keys;
}
/** Includes inferred FDs projected onto a relation, not only explicitly written FDs. */
export function normalForm(attributes: string[], fds: FD[]) {
  const keys = candidateKeys(attributes, fds);
  const prime = new Set(keys.flat());
  const violations: {
    left: string[];
    right: string;
    bcnf: boolean;
    third: boolean;
    partial: boolean;
  }[] = [];
  for (const left of subsets(attributes)) {
    const plus = closure(left, fds);
    const superkey = attributes.every((a) => plus.includes(a));
    if (superkey) continue;
    for (const right of attributes.filter(
      (a) => plus.includes(a) && !left.includes(a),
    )) {
      const third = !prime.has(right);
      const partial =
        third &&
        keys.some(
          (k) => left.length < k.length && left.every((a) => k.includes(a)),
        );
      violations.push({ left, right, bcnf: true, third, partial });
    }
  }
  const level = violations.some((v) => v.partial)
    ? "1NF"
    : violations.some((v) => v.third)
      ? "2NF"
      : violations.length
        ? "3NF"
        : "BCNF";
  return { level, keys, prime: [...prime], violations };
}
export function project(rows: Row[], names: string[]): Row[] {
  const seen = new Set<string>();
  return rows
    .map((r) => Object.fromEntries(names.map((n) => [n, r[n]])))
    .filter((r) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
export function naturalJoin(left: Row[], right: Row[]): Row[] {
  return left.flatMap((a) =>
    right
      .filter((b) =>
        Object.keys(a)
          .filter((k) => k in b)
          .every((k) => a[k] === b[k]),
      )
      .map((b) => ({ ...a, ...b })),
  );
}
export const jobAttributes = [
  "jobNo",
  "jobDate",
  "customerId",
  "customerName",
  "customerPhone",
  "technicianId",
  "technicianName",
  "partNo",
  "partName",
  "unitPrice",
  "quantity",
];
export const jobFDs: FD[] = [
  { id: "FD1", left: ["jobNo", "partNo"], right: ["quantity"] },
  {
    id: "FD2",
    left: ["jobNo"],
    right: ["jobDate", "customerId", "technicianId"],
  },
  { id: "FD3", left: ["partNo"], right: ["partName", "unitPrice"] },
  { id: "FD4", left: ["customerId"], right: ["customerName", "customerPhone"] },
  { id: "FD5", left: ["technicianId"], right: ["technicianName"] },
];
export const jobRows: Row[] = [
  {
    jobNo: "J101",
    jobDate: "2026-10-12",
    customerId: "C01",
    customerName: "Mali",
    customerPhone: "081-111-1111",
    technicianId: "T01",
    technicianName: "Somchai",
    partNo: "P01",
    partName: "Filter",
    unitPrice: 250,
    quantity: 2,
  },
  {
    jobNo: "J101",
    jobDate: "2026-10-12",
    customerId: "C01",
    customerName: "Mali",
    customerPhone: "081-111-1111",
    technicianId: "T01",
    technicianName: "Somchai",
    partNo: "P02",
    partName: "Belt",
    unitPrice: 450,
    quantity: 1,
  },
  {
    jobNo: "J102",
    jobDate: "2026-10-13",
    customerId: "C02",
    customerName: "Niran",
    customerPhone: "082-222-2222",
    technicianId: "T01",
    technicianName: "Somchai",
    partNo: "P01",
    partName: "Filter",
    unitPrice: 250,
    quantity: 1,
  },
  {
    jobNo: "J103",
    jobDate: "2026-10-14",
    customerId: "C03",
    customerName: "Arun",
    customerPhone: "083-333-3333",
    technicianId: "T02",
    technicianName: "Suda",
    partNo: "P03",
    partName: "Pump",
    unitPrice: 1200,
    quantity: 1,
  },
];
function relation(
  name: string,
  names: string[],
  pk: string[],
  refs: Record<string, string> = {},
): Relation {
  return {
    name,
    columns: names.map((n) => ({ name: n, pk: pk.includes(n), fk: refs[n] })),
    rows: project(jobRows, names),
  };
}
export const jobOriginal = relation("JOB_SHEET", jobAttributes, [
  "jobNo",
  "partNo",
]);
export const job2NF: Relation[] = [
  relation(
    "JOB_HEADER",
    [
      "jobNo",
      "jobDate",
      "customerId",
      "customerName",
      "customerPhone",
      "technicianId",
      "technicianName",
    ],
    ["jobNo"],
  ),
  relation("PART", ["partNo", "partName", "unitPrice"], ["partNo"]),
  relation("JOB_PART", ["jobNo", "partNo", "quantity"], ["jobNo", "partNo"], {
    jobNo: "JOB_HEADER.jobNo",
    partNo: "PART.partNo",
  }),
];
export const jobFinal: Relation[] = [
  relation(
    "CUSTOMER",
    ["customerId", "customerName", "customerPhone"],
    ["customerId"],
  ),
  relation("TECHNICIAN", ["technicianId", "technicianName"], ["technicianId"]),
  relation("PART", ["partNo", "partName", "unitPrice"], ["partNo"]),
  relation(
    "JOB",
    ["jobNo", "jobDate", "customerId", "technicianId"],
    ["jobNo"],
    {
      customerId: "CUSTOMER.customerId",
      technicianId: "TECHNICIAN.technicianId",
    },
  ),
  relation("JOB_PART", ["jobNo", "partNo", "quantity"], ["jobNo", "partNo"], {
    jobNo: "JOB.jobNo",
    partNo: "PART.partNo",
  }),
];
export const smallFDs: FD[] = [
  { id: "F1", left: ["A"], right: ["B"] },
  { id: "F2", left: ["B"], right: ["C"] },
  { id: "F3", left: ["A"], right: ["D"] },
];
export const bcnfFDs: FD[] = [
  { id: "F1", left: ["studentId", "courseId"], right: ["instructorId"] },
  { id: "F2", left: ["instructorId"], right: ["courseId"] },
];
export const bcnfRelation: Relation = {
  name: "ENROLMENT",
  columns: [
    { name: "studentId", pk: true },
    { name: "courseId", pk: true },
    { name: "instructorId" },
  ],
  rows: [
    { studentId: "S01", courseId: "DB", instructorId: "I01" },
    { studentId: "S02", courseId: "DB", instructorId: "I01" },
    { studentId: "S01", courseId: "WEB", instructorId: "I02" },
  ],
};
export const studentTables: Relation[] = [
  {
    name: "DEPARTMENT",
    columns: [{ name: "departmentId", pk: true }, { name: "departmentName" }],
    rows: [
      { departmentId: "D01", departmentName: "Computer Science" },
      { departmentId: "D02", departmentName: "Information Technology" },
    ],
  },
  {
    name: "STUDENT",
    columns: [
      { name: "studentId", pk: true },
      { name: "studentName" },
      { name: "departmentId", fk: "DEPARTMENT.departmentId" },
    ],
    rows: [
      { studentId: "S001", studentName: "Alice", departmentId: "D01" },
      { studentId: "S002", studentName: "Bob", departmentId: "D02" },
      { studentId: "S003", studentName: "Charlie", departmentId: "D01" },
      { studentId: "S004", studentName: "Dana", departmentId: null },
    ],
  },
];
