import type { Lang } from "../../lib/int191/model";

/** A real 1:N mapping, with a direct route to the full interactive ER lesson. */
export default function RelationshipPreview({
  lang,
  onExplore,
}: {
  lang: Lang;
  onExplore: () => void;
}) {
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  return (
    <button
      type="button"
      className="db-relationship-preview"
      onClick={onExplore}
    >
      <svg
        viewBox="0 0 370 172"
        role="img"
        aria-label={t(
          "DEPARTMENT หนึ่งแผนกมี STUDENT หลายคน เชื่อมผ่าน departmentId",
          "One DEPARTMENT has many STUDENT records, linked by departmentId",
        )}
      >
        <rect
          className="db-preview-node"
          x="8"
          y="12"
          width="152"
          height="124"
          rx="8"
        />
        <rect
          className="db-preview-node"
          x="210"
          y="36"
          width="152"
          height="124"
          rx="8"
        />
        <path className="db-preview-rule" d="M8 47h152M210 71h152" />
        <path className="db-preview-link" d="M160 80h24v44h26" />
        <circle cx="160" cy="80" r="4" className="db-preview-dot" />
        <path className="db-preview-link" d="m202 116 8 8-8 8" />
        <text x="21" y="34" className="db-preview-name">
          DEPARTMENT
        </text>
        <text x="223" y="58" className="db-preview-name">
          STUDENT
        </text>
        <text x="21" y="72">
          <tspan className="db-preview-key">PK</tspan> departmentId
        </text>
        <text x="21" y="98">
          D01 · CS
        </text>
        <text x="21" y="119">
          D02 · IT
        </text>
        <text x="223" y="96">
          <tspan className="db-preview-key">PK</tspan> studentId
        </text>
        <text x="223" y="120">
          <tspan className="db-preview-key">FK</tspan> departmentId
        </text>
        <text x="223" y="144">
          S001 · D01
        </text>
        <text x="171" y="69" className="db-preview-key">
          1
        </text>
        <text x="188" y="147" className="db-preview-key">
          N
        </text>
      </svg>
      <span>
        {t(
          "เห็นความสัมพันธ์ แล้วลองเชื่อมตาราง",
          "See the relationship. Connect the tables.",
        )}{" "}
        <span aria-hidden="true">↗</span>
      </span>
    </button>
  );
}
