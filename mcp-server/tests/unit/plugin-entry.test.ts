import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Provided {
  serverScript: string;
  serverDir: string;
  env: Record<string, string>;
}

/** A plugin context stand-in recording what the entry provides and registers. */
const fakeContext = (resolveToken: () => Promise<{ value: string } | undefined>) => {
  const provided: Record<string, unknown> = {};
  const skills: { name: string }[] = [];
  const warnings: string[] = [];
  return {
    provided,
    skills,
    warnings,
    ctx: {
      provide: (name: string, value: unknown) => {
        provided[name] = value;
      },
      skills: { register: (skill: { name: string }) => skills.push(skill) },
      credentials: { resolve: resolveToken },
      logger: { info: () => undefined, warn: (message: string) => warnings.push(message) }
    }
  };
};

const loadEntry = async (): Promise<{
  inject: string[];
  apply: (ctx: unknown) => Promise<void>;
}> => (await import(pathToFileURL(resolve(process.cwd(), '../index.js')).href)) as never;

test('插件从 DSH 凭据存储取出令牌，经 env 交给 MCP 服务', async () => {
  const entry = await loadEntry();
  // Both services must be declared, or the harness never hands them to the entry.
  assert.deepEqual(entry.inject, ['skills', 'credentials']);
  const fake = fakeContext(async () => ({ value: 'stored-token' }));
  await entry.apply(fake.ctx);
  const paths = fake.provided.momoLearningPaths as Provided;
  assert.deepEqual(paths.env, { MAIMEMO_TOKEN: 'stored-token' });
  assert.match(paths.serverScript.replace(/\\/g, '/'), /mcp-server\/dist\/server\.js$/);
  assert.deepEqual(
    fake.skills.map((skill) => skill.name),
    ['momo-daily-learning']
  );
});

test('凭据存储里没有令牌或读取失败时，env 为空，服务回退到系统凭证库', async () => {
  const entry = await loadEntry();
  const missing = fakeContext(async () => undefined);
  await entry.apply(missing.ctx);
  assert.deepEqual((missing.provided.momoLearningPaths as Provided).env, {});

  const failing = fakeContext(async () => {
    throw new Error('store says: secret-value');
  });
  await entry.apply(failing.ctx);
  assert.deepEqual((failing.provided.momoLearningPaths as Provided).env, {});
  // The warning names the credential but never repeats the provider's message.
  assert.equal(failing.warnings.length, 1);
  assert.equal(failing.warnings[0]?.includes('secret-value'), false);
});

test('MCP 那一行把 env 交给服务', () => {
  const patch = readFileSync(resolve(process.cwd(), '../cordis.patch.yml'), 'utf8');
  assert.match(patch, /env: !!js ctx\.momoLearningPaths\.env/);
});

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T;

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

test('根目录只把 keyring 声明成可选依赖，其余依赖都打进了服务包', () => {
  // The server bundle inlines its dependencies; only the native keyring addon
  // stays outside, and an install without it just loses the OS-store fallback.
  const root = readJson<Manifest>('../package.json');
  const server = readJson<Manifest>('package.json');
  assert.equal(root.dependencies, undefined);
  assert.deepEqual(root.optionalDependencies, {
    '@napi-rs/keyring': server.dependencies?.['@napi-rs/keyring']
  });
});

test('两个客户端的清单指向同一个包、同一个服务和同一份 skill', () => {
  const root = readJson<Manifest>('../package.json');
  assert.doesNotMatch(root.name, /dsh/);
  const plugin = readJson<{
    name: string;
    mcpServers: { maimemo: { command: string; args: string[]; env: Record<string, string> } };
    userConfig: { maimemo_token: { sensitive?: boolean } };
  }>('../.claude-plugin/plugin.json');
  const marketplace = readJson<{ plugins: { name: string; source: string }[] }>(
    '../.claude-plugin/marketplace.json'
  );
  assert.equal(plugin.name, root.name);
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0]?.name, root.name);
  assert.equal(marketplace.plugins[0]?.source, './');
  // Claude Code runs the same bundle DeepSeek Harness does, and hands the token
  // over the same variable, from a value stored in its secure storage.
  assert.deepEqual(plugin.mcpServers.maimemo.args, [
    '${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/server.js'
  ]);
  assert.equal(existsSync(resolve(process.cwd(), 'dist/server.js')), true);
  assert.deepEqual(plugin.mcpServers.maimemo.env, {
    MAIMEMO_TOKEN: '${user_config.maimemo_token}'
  });
  assert.equal(plugin.userConfig.maimemo_token.sensitive, true);
  const patch = readFileSync(resolve(process.cwd(), '../cordis.patch.yml'), 'utf8');
  assert.match(patch, new RegExp(`name: '${root.name}'`));
  // Both clients read the skill from the same file.
  assert.equal(existsSync(resolve(process.cwd(), '../skills/momo-daily-learning/SKILL.md')), true);
});
