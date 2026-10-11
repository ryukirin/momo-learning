/**
 * Bundle the server and its two command-line tools into self-contained files.
 *
 * A plugin host installs this package without running `npm install` inside
 * `mcp-server` — Claude Code installs no dependencies for a plugin at all — so the
 * entry points carry their dependencies with them. `@napi-rs/keyring` stays
 * external: it is a native addon, loaded only when the OS credential store is
 * actually used, and its absence just means that fallback is unavailable.
 */
import { rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: {
    server: 'src/server.ts',
    'auth/credential-cli': 'src/auth/credential-cli.ts',
    'migrate-legacy': 'src/migrate-legacy.ts'
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['@napi-rs/keyring'],
  // Bundled CommonJS dependencies call `require`, which an ES module lacks.
  banner: {
    js: "import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);"
  },
  legalComments: 'none',
  logLevel: 'warning'
});
