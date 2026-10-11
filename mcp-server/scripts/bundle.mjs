/**
 * Bundle the server into one self-contained file.
 *
 * A plugin host installs this package without running `npm install` inside
 * `mcp-server`, so the entry point carries its dependencies with it. Nothing in
 * it is a native addon: SQLite comes from Node's built-in `node:sqlite`.
 */
import { rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: { server: 'src/server.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Bundled CommonJS dependencies call `require`, which an ES module lacks.
  banner: {
    js: "import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);"
  },
  legalComments: 'none',
  logLevel: 'warning'
});
