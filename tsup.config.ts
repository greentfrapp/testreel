import { defineConfig } from "tsup";
import pkg from "./package.json";
import nodePath from "node:path";
import nodeFs from "node:fs";

/**
 * esbuild plugin that copies .png imports to the output directory
 * and resolves the import to the co-located file at runtime.
 *
 * Uses import.meta.url (ESM) with __dirname fallback (CJS) so the
 * generated code works in both module systems.
 */
const resolvePngAssets: import("esbuild").Plugin = {
  name: "resolve-png-assets",
  setup(build) {
    build.onLoad({ filter: /\.png$/ }, (args) => {
      const basename = nodePath.basename(args.path);
      const outdir = build.initialOptions.outDir ?? "dist";
      const dest = nodePath.resolve(outdir, basename);
      nodeFs.mkdirSync(nodePath.dirname(dest), { recursive: true });
      nodeFs.copyFileSync(args.path, dest);
      // Resolve to the co-located PNG at runtime using only __dirname + string concat.
      // Avoids require("path") which breaks in ESM (esbuild wraps it in a throwing shim).
      // The PNG is always in the same directory as the output JS, so join is just __dirname + "/" + name.
      return {
        contents: `module.exports = __dirname + "/" + ${JSON.stringify(basename)};`,
        loader: "js",
      };
    });
  },
};

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    splitting: false,
    minify: true,
    shims: true,
    platform: "node",
    external: ["playwright-core", "ffmpeg-static"],
    esbuildPlugins: [resolvePngAssets],
    loader: { ".svg": "text", ".html": "text" },
    onSuccess: "mkdir -p dist/docs && cp docs/*.md dist/docs/",
  },
  {
    entry: ["src/cli.ts"],
    format: ["cjs"],
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
    minify: true,
    platform: "node",
    external: ["playwright-core", "ffmpeg-static"],
    esbuildPlugins: [resolvePngAssets],
    loader: { ".svg": "text", ".html": "text" },
    define: {
      __TESTREEL_VERSION__: JSON.stringify(pkg.version),
    },
  },
  {
    entry: ["src/fixture.ts"],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    minify: true,
    shims: true,
    platform: "node",
    external: ["playwright-core", "@playwright/test", "ffmpeg-static"],
    esbuildPlugins: [resolvePngAssets],
    loader: { ".svg": "text", ".html": "text" },
  },
]);
