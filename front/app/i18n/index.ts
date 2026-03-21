import th from "./th.json";
import en from "./en.json";
import type { Locale } from "@/context/LocaleContext";

export type Translations = typeof th;

const messages: Record<Locale, Translations> = { th, en };

export function getMessages(locale: Locale): Translations {
  return messages[locale];
}
