import { type Lang, type Relation } from "../../lib/int191/model";
export type Selection = {
  column: string;
  value?: string | number | null;
} | null;
export default function DatabaseTable({
  relation,
  lang,
  selection,
  onSelect,
  focus = [],
  duplicates = false,
}: {
  relation: Relation;
  lang: Lang;
  selection: Selection;
  onSelect: (s: Selection) => void;
  focus?: string[];
  duplicates?: boolean;
}) {
  const t = (th: string, en: string) => (lang === "th" ? th : en);
  return (
    <div
      className="db-table-scroll"
      tabIndex={0}
      role="region"
      aria-label={relation.name}
    >
      <table className="db-table">
        <caption>
          {relation.name}{" "}
          <span>
            {relation.rows.length} {t("แถว", "rows")}
          </span>
        </caption>
        <thead>
          <tr>
            {relation.columns.map((c) => (
              <th
                key={c.name}
                scope="col"
                data-focus={
                  focus.includes(c.name) || selection?.column === c.name
                }
              >
                <button
                  type="button"
                  onClick={() => onSelect({ column: c.name })}
                  aria-pressed={selection?.column === c.name}
                >
                  <span className="db-column-name">{c.name}</span>
                  <span className="db-badges">
                    {c.pk && <span className="db-pk">PK</span>}
                    {c.fk && <span className="db-fk">FK → {c.fk}</span>}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {relation.rows.map((row, i) => (
            <tr key={i}>
              {relation.columns.map((c) => {
                const matched =
                  selection?.column === c.name &&
                  (selection.value === undefined ||
                    selection.value === row[c.name]);
                const repeated =
                  duplicates &&
                  !c.pk &&
                  relation.rows.filter((r) => r[c.name] === row[c.name])
                    .length > 1;
                return (
                  <td
                    key={c.name}
                    data-selected={matched}
                    data-duplicate={repeated}
                    data-focus={focus.includes(c.name)}
                  >
                    <button
                      type="button"
                      aria-pressed={matched}
                      onClick={() =>
                        onSelect({ column: c.name, value: row[c.name] })
                      }
                    >
                      {row[c.name] === null ? (
                        <em>NULL</em>
                      ) : (
                        String(row[c.name])
                      )}
                      {matched && (
                        <span
                          className="db-cell-marker"
                          aria-label={t("ค่าที่เลือก", "Selected value")}
                        >
                          {" "}
                          ✓
                        </span>
                      )}
                      {repeated && <small>{t("ซ้ำ", "repeated")}</small>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {relation.rows.length === 0 && (
        <p>{t("ไม่มีแถวที่ตรงเงื่อนไข", "No matching rows.")}</p>
      )}
    </div>
  );
}
