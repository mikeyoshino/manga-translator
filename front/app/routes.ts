import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/landing.tsx"),
  route("studio", "routes/home.tsx"),
  route("studio/editor", "routes/editor.tsx"),
  route("studio/projects/:projectId", "routes/project.tsx"),
  route("studio/topup", "routes/topup.tsx"),
  route("studio/token-usage", "routes/token-usage.tsx"),
  route("studio/profile", "routes/profile.tsx"),
  route("login", "routes/login.tsx"),
] satisfies RouteConfig;
