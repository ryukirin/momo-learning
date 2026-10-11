import test from 'node:test';
import assert from 'node:assert/strict';
import { HostTokenSecretStore } from '../../src/auth/secret-store.js';

test('令牌只来自客户端传入的值，两端空白会去掉', () => {
  assert.equal(new HostTokenSecretStore('  host-token  ').get(), 'host-token');
});

test('没传、空白或未展开的占位符都视为没有令牌', () => {
  // A client can pass `${user_config.KEY}` through verbatim when the user never
  // set the value; using it as a token would fail every request.
  for (const value of [undefined, '', '   ', '${user_config.maimemo_token}']) {
    assert.equal(new HostTokenSecretStore(value).get(), undefined);
  }
});
