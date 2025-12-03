import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: ["esm"],
  target: "node20",
  dts: true,
});
