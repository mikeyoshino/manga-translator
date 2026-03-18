/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths() as any],
  test: {
    include: ["app/**/*.{test,spec}.{ts,tsx}"],
  },
});
