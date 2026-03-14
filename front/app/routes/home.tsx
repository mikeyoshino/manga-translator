import type { Route } from "./+types/home";
import { App } from "../App";
import { AuthGuard } from "@/components/AuthGuard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Manga/Webtoon Translator" },
    { name: "description", content: "Manga/Webtoon Translator" },
  ];
}

export default function Home() {
  return (
    <AuthGuard>
      <App />
    </AuthGuard>
  );
}
