import { redirect } from "react-router";
import type { Route } from "./+types/root-redirect";
import { DEFAULT_LOCALE } from "@/context/LocaleContext";

export function loader({ request }: Route.LoaderArgs) {
  const acceptLanguage = request.headers.get("Accept-Language") || "";
  const preferredLocale = acceptLanguage.toLowerCase().startsWith("en")
    ? "en"
    : DEFAULT_LOCALE;
  throw redirect(`/${preferredLocale}`);
}

export default function RootRedirect() {
  return null;
}
