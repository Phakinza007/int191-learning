import { useEffect, useState } from "react";
import { LANG_COOKIE, type NoteLang } from "../lib/note-lang";

const OPTIONS: { value: NoteLang; label: string }[] = [
  { value: "th", label: "ไทย" },
  { value: "en", label: "EN" },
];

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Bilingual control; the learning island restores this cookie after hydration. */
export default function LangToggle({
  lang,
  onSwitch,
}: {
  lang: NoteLang;
  onSwitch?: () => void;
}) {
  const [selected, setSelected] = useState(lang);
  useEffect(() => setSelected(lang), [lang]);
  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<NoteLang>).detail;
      if (detail === "th" || detail === "en") setSelected(detail);
    };
    window.addEventListener("knowledge-language-change", sync);
    return () => window.removeEventListener("knowledge-language-change", sync);
  }, []);
  function choose(next: NoteLang) {
    if (next === selected) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    setSelected(next);
    window.dispatchEvent(new CustomEvent("knowledge-language-change", { detail: next }));
    if (onSwitch) onSwitch();
    else window.location.reload();
  }

  return (
    <div className="lang-toggle" role="group" aria-label="ภาษาของเนื้อหา">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === selected}
          onClick={() => choose(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
