import { redirect } from "react-router";
import type { Route } from "./+types/legacy-redirect";
import { DEFAULT_LOCALE } from "@/context/LocaleContext";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  throw redirect(`/${DEFAULT_LOCALE}${url.pathname}`);
}

export default function LegacyRedirect() {
  return null;
}
