/** Language preference is isolated from the original course website. */
export type NoteLang = "th" | "en";
export const LANG_COOKIE = "int191-language";
export function normalizeLang(value: string | null | undefined): NoteLang {
 return value === "en" ? "en" : "th";
}
