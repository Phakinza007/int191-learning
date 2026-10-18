import { useId, useState } from "react";
import { type Lang, type Relation } from "../../lib/int191/model";
export default function SchemaDiagram({
  relations,
  lang,
  onPick,
}: {
  relations: Relation[];
  lang: Lang;
  onPick?: (name: string) => void;
}) {
  const id = useId().replace(/:/g, "");
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  const width = Math.min(3, relations.length) * 340;
  const height = Math.ceil(relations.length / 3) * 230 + 40;
  const positions = relations.map((_, i) => ({
    x: 20 + (i % 3) * 340,
    y: 20 + Math.floor(i / 3) * 230,
  }));
  const edges = relations
    .flatMap((r, i) =>
      r.columns
        .filter((c) => c.fk)
        .map((c) => ({
          child: i,
          parent: relations.findIndex((p) => p.name === c.fk!.split(".")[0]),
          column: c.name,
          ref: c.fk!,
        })),
    )
    .filter((e) => e.parent >= 0);
  const choose = (key: string) => {
    setSelected(key);
    onPick?.(key);
  };
  function onKey(e: React.KeyboardEvent, action: () => void) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  }
  return (
    <section
      className="db-diagram"
      aria-label={t(
        "แผนภาพความสัมพันธ์ที่โต้ตอบได้",
        "Interactive relationship diagram",
      )}
    >
      <div className="db-toolbar">
        <span>
          {t("เลือก entity หรือเส้น FK", "Select an entity or FK edge")}
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          aria-label={t("ขยาย diagram", "Zoom in")}
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          aria-label={t("ย่อ diagram", "Zoom out")}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          {t("คืนมุมมอง", "Reset view")}
        </button>
        <button
          type="button"
          onClick={() => setPan((p) => ({ ...p, x: p.x + 60 }))}
          aria-label={t("เลื่อนขวา", "Pan right")}
        >
          →
        </button>
        <button
          type="button"
          onClick={() => setPan((p) => ({ ...p, x: p.x - 60 }))}
          aria-label={t("เลื่อนซ้าย", "Pan left")}
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => setPan((p) => ({ ...p, y: p.y + 60 }))}
          aria-label={t("เลื่อนลง", "Pan down")}
        >
          ↓
        </button>
        <button
          type="button"
          onClick={() => setPan((p) => ({ ...p, y: p.y - 60 }))}
          aria-label={t("เลื่อนขึ้น", "Pan up")}
        >
          ↑
        </button>
      </div>
      <div
        className="db-diagram-canvas"
        role="region"
        tabIndex={0}
        aria-label={t("เลื่อนแผนภาพแนวนอน", "Scrollable diagram")}
      >
        <svg
          style={{ minWidth: width }}
          className="db-schema-svg"
          viewBox={`0 0 ${width} ${height}`}
          aria-labelledby={`${id}-title ${id}-desc`}
        >
          <title id={`${id}-title`}>
            {t(
              "Relational schema และ Foreign Keys",
              "Relational schema and foreign keys",
            )}
          </title>
          <desc id={`${id}-desc`}>
            {relations
              .map(
                (r) =>
                  `${r.name}: ${r.columns.map((c) => `${c.name}${c.pk ? " PK" : ""}${c.fk ? " FK to " + c.fk : ""}`).join(", ")}`,
              )
              .join("; ")}
          </desc>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {edges.map((e, i) => {
              const a = positions[e.parent],
                b = positions[e.child];
              const horizontal = a.y === b.y;
              const start = horizontal
                ? { x: a.x + 290, y: a.y + 90 }
                : { x: a.x + 145, y: a.y + 180 };
              const end = horizontal
                ? { x: b.x, y: b.y + 90 }
                : { x: b.x + 145, y: b.y };
              const path = horizontal
                ? `M${start.x},${start.y} L${end.x},${end.y}`
                : `M${start.x},${start.y} C${start.x},${start.y + 30} ${end.x},${end.y - 30} ${end.x},${end.y}`;
              const unique =
                relations[e.child].columns.filter((c) => c.pk).length === 1 &&
                relations[e.child].columns.some(
                  (c) => c.name === e.column && c.pk,
                );
              const label = `${relations[e.parent].name} → ${relations[e.child].name}: ${e.column} FK → ${e.ref} (${unique ? "1:0..1" : "1:0..N"})`;
              return (
                <g
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={selected === label}
                  onClick={() => setSelected(label)}
                  onKeyDown={(k) => onKey(k, () => setSelected(label))}
                  className="db-edge"
                  data-active={selected === label}
                >
                  <path className="db-edge-hit" d={path} />
                  <path d={path} />
                  <text
                    x={(start.x + end.x) / 2}
                    y={(start.y + end.y) / 2 - 10}
                    textAnchor="middle"
                  >
                    {relations[e.child].columns.filter((c) => c.pk).length ===
                      1 &&
                    relations[e.child].columns.some(
                      (c) => c.name === e.column && c.pk,
                    )
                      ? "1 : 0..1"
                      : "1 : 0..N"}
                  </text>
                </g>
              );
            })}
            {relations.map((r, i) => {
              const p = positions[i];
              return (
                <g
                  key={r.name}
                  transform={`translate(${p.x},${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${r.name} entity`}
                  aria-pressed={selected === r.name}
                  onClick={() => choose(r.name)}
                  onKeyDown={(e) => onKey(e, () => choose(r.name))}
                  className="db-entity"
                  data-active={selected === r.name}
                >
                  <rect width="290" height="180" rx="12" />
                  <text className="db-entity-title" x="16" y="28">
                    {r.name}
                  </text>
                  {r.columns.slice(0, 5).map((c, j) => (
                    <text
                      key={c.name}
                      x="16"
                      y={58 + j * 24}
                      className={c.pk ? "db-entity-pk" : undefined}
                    >
                      {c.pk ? "PK " : ""}
                      {c.fk ? "FK " : ""}
                      {c.name}
                    </text>
                  ))}
                  {r.columns.length > 5 && (
                    <text x="16" y="172">
                      + {r.columns.length - 5}{" "}
                      {t("attributes ดูในตาราง", "attributes in table")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="db-feedback" aria-live="polite">
        {selected
          ? selected.includes("FK")
            ? `${selected}. ${t("FK อยู่ฝั่ง child และอ้างถึง key ของ parent; ป้ายบนเส้นบอก cardinality ส่วน FK ที่ไม่ใช่ NULL ต้องอ้างถึง parent ที่มีอยู่", "The FK belongs on the child side and references the parent key. The edge label shows cardinality. A nullable FK permits no parent; non-NULL values must match an existing parent.")}`
            : `${selected}: ${relations
                .find((r) => r.name === selected)
                ?.columns.map(
                  (c) =>
                    `${c.name}${c.pk ? " [PK]" : ""}${c.fk ? ` [FK → ${c.fk}]` : ""}`,
                )
                .join(", ")}`
          : t(
              "เส้นแสดง FK; ถ้า FK ฝั่ง child unique จะเป็น 1:0..1 มิฉะนั้นเป็น 1:0..N คลิกเพื่อดูการวาง FK หรือใช้ Tab และ Enter",
              "Edges show FK relationships; a unique child FK gives 1:0..1, otherwise 1:0..N. Click an edge to inspect FK placement, or use Tab and Enter.",
            )}
      </p>
    </section>
  );
}
