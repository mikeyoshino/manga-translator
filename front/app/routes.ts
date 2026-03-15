import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("editor", "routes/editor.tsx"),
  route("login", "routes/login.tsx"),
  route("topup", "routes/topup.tsx"),
  route("token-usage", "routes/token-usage.tsx"),
  route("profile", "routes/profile.tsx"),
  route("projects/:projectId", "routes/project.tsx"),
] satisfies RouteConfig;
