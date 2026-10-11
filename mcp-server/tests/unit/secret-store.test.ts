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
