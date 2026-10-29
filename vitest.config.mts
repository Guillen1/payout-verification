import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC instead of esbuild, so decorator metadata is emitted and NestJS can inject by type in tests.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/tests/**/*.spec.ts", "src/**/tests/**/*.e2e-test.ts"]
  }
});
