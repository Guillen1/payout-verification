import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "synthetic/**/*.spec.ts", "test/**/*.spec.ts"]
  }
});
