import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HostTokenSecretStore,
  KeyringSecretStore,
  type SecretStore
} from '../../src/auth/secret-store.js';
import { MaimemoError } from '../../src/errors.js';

/** An OS store stand-in holding at most one token. */
const memoryStore = (
  token: string | undefined,
  available = true
): SecretStore & { writes: string[] } => {
  const writes: string[] = [];
  return {
    writes,
    get: () => {
      if (!available) throw new MaimemoError('CREDENTIAL_STORAGE_UNAVAILABLE', 'unavailable');
      return token;
    },
    set: (value) => {
      writes.push(value);
    },
    remove: () => true,
    available: () => available
  };
};

test('宿主传入的令牌优先，空白令牌视为没有，回退到系统凭证库', () => {
  assert.equal(new HostTokenSecretStore('host-token', memoryStore('os-token')).get(), 'host-token');
  assert.equal(new HostTokenSecretStore('host-token', memoryStore('os-token')).source(), 'host');
  for (const blank of [undefined, '', '   ']) {
    const store = new HostTokenSecretStore(blank, memoryStore('os-token'));
    assert.equal(store.get(), 'os-token');
    assert.equal(store.source(), 'keyring');
  }
  assert.equal(new HostTokenSecretStore(undefined, memoryStore(undefined)).source(), undefined);
});

test('有宿主令牌时不碰系统凭证库，写入仍只进系统凭证库', () => {
  // A desktop machine may have no usable OS store; the host's token still works.
  const store = new HostTokenSecretStore('host-token', memoryStore(undefined, false));
  assert.equal(store.get(), 'host-token');
  assert.equal(store.available(), true);
  const fallback = memoryStore(undefined);
  new HostTokenSecretStore('host-token', fallback).set('new-token');
  assert.deepEqual(fallback.writes, ['new-token']);
});

test('安全凭证库不可用时不回退到环境变量或普通文件', () => {
  const store = new KeyringSecretStore(() => {
    throw new Error('unavailable');
  });
  assert.throws(
    () => store.get(),
    (error: unknown) =>
      error instanceof MaimemoError && error.code === 'CREDENTIAL_STORAGE_UNAVAILABLE'
  );
  assert.equal(store.available(), false);
});

/** A keyring stand-in: service → token, shared by every entry it opens. */
const fakeKeyring = (tokens: Record<string, string>) => ({
  tokens,
  factory: (service: string) => ({
    getPassword: () => tokens[service] ?? null,
    setPassword: (value: string) => {
      tokens[service] = value;
    },
    deletePassword: () => {
      const had = service in tokens;
      delete tokens[service];
      return had;
    }
  })
});

test('系统凭据管理器先读新名字，再依次读旧名字；写入只写新名字', () => {
  const legacyOnly = fakeKeyring({ 'codex.maimemo-learning-mcp': 'codex-token' });
  assert.equal(new KeyringSecretStore(legacyOnly.factory).get(), 'codex-token');
  const both = fakeKeyring({
    'dsh.momo-learning-mcp': 'dsh-token',
    'codex.maimemo-learning-mcp': 'codex-token'
  });
  const store = new KeyringSecretStore(both.factory);
  assert.equal(store.get(), 'dsh-token');
  store.set('new-token');
  assert.equal(both.tokens['momo-learning-mcp'], 'new-token');
  assert.equal(store.get(), 'new-token');
});

test('移除时清掉新名字和所有旧名字，旧条目不会让令牌回来', () => {
  const keyring = fakeKeyring({
    'momo-learning-mcp': 'a',
    'dsh.momo-learning-mcp': 'b',
    'codex.maimemo-learning-mcp': 'c'
  });
  const store = new KeyringSecretStore(keyring.factory);
  assert.equal(store.remove(), true);
  assert.equal(store.get(), undefined);
});

test('宿主留下未展开的占位符时视为没有令牌', () => {
  // A plugin host can pass `${user_config.KEY}` through verbatim when the user
  // never set the value; using it as a token would fail every request.
  const store = new HostTokenSecretStore('${user_config.maimemo_token}', memoryStore('os-token'));
  assert.equal(store.get(), 'os-token');
  assert.equal(store.source(), 'keyring');
});

test('系统凭据管理器不可用且宿主没给令牌时，报告未配置而不是报错', () => {
  // A bundled install may ship without the keyring module; "not configured"
  // points the user at the client's token setting.
  const store = new HostTokenSecretStore(undefined, memoryStore(undefined, false));
  assert.equal(store.get(), undefined);
  assert.equal(store.available(), false);
  assert.equal(store.source(), undefined);
});
