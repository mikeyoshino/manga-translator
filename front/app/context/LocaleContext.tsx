import { createContext, useContext, useMemo } from "react";
import { getMessages } from "@/i18n";
import type { Translations } from "@/i18n";

export type Locale = "th" | "en";
export const SUPPORTED_LOCALES: Locale[] = ["th", "en"];
export const DEFAULT_LOCALE: Locale = "th";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useLocalePath(): (path: string) => string {
  const locale = useLocale();
  return (path: string) => `/${locale}${path}`;
}

export function useT(): Translations {
  const locale = useLocale();
  return useMemo(() => getMessages(locale), [locale]);
}
