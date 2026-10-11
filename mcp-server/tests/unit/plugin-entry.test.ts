import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('根目录与 mcp-server 的运行时依赖保持一致', () => {
  // The harness installs a plugin from its root manifest only, so the server's
  // runtime dependencies are declared there too; the two lists must not drift.
  const root = JSON.parse(readFileSync(resolve(process.cwd(), '../package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  const server = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  assert.deepEqual(root.dependencies, server.dependencies);
});
