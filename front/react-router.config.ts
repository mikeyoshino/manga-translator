import type { Config } from "@react-router/dev/config";

const isVercel = process.env.VERCEL === "1";

let presets: Config["presets"] = [];
if (isVercel) {
  const { vercelPreset } = await import("@vercel/react-router/vite");
  presets = [vercelPreset()];
}

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  presets,
} satisfies Config;
