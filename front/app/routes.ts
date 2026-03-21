import { type RouteConfig, index, route, layout, prefix } from "@react-router/dev/routes";

export default [
  index("routes/root-redirect.tsx"),
  ...prefix(":lang", [
    layout("routes/locale-layout.tsx", [
      index("routes/landing.tsx"),
      route("login", "routes/login.tsx"),
      route("studio", "routes/home.tsx"),
      route("studio/editor", "routes/editor.tsx"),
      route("studio/projects/:projectId", "routes/project.tsx"),
      route("studio/topup", "routes/topup.tsx"),
      route("studio/token-usage", "routes/token-usage.tsx"),
      route("studio/profile", "routes/profile.tsx"),
    ]),
  ]),
  // Legacy redirects for old bookmarkable URLs
  route("login", "routes/legacy-redirect.tsx", { id: "legacy-login" }),
  route("studio", "routes/legacy-redirect.tsx", { id: "legacy-studio" }),
  route("studio/*", "routes/legacy-redirect.tsx", { id: "legacy-studio-catch" }),
] satisfies RouteConfig;
