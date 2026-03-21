import { Outlet, redirect } from "react-router";
import { LocaleProvider, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/context/LocaleContext";
import type { Locale } from "@/context/LocaleContext";
import type { Route } from "./+types/locale-layout";

export function loader({ params }: Route.LoaderArgs) {
  const lang = params.lang as string;
  if (!SUPPORTED_LOCALES.includes(lang as Locale)) {
    throw redirect(`/${DEFAULT_LOCALE}`);
  }
  return { lang: lang as Locale };
}

export default function LocaleLayout({ loaderData }: Route.ComponentProps) {
  const { lang } = loaderData;

  return (
    <LocaleProvider locale={lang}>
      <Outlet />
    </LocaleProvider>
  );
}
