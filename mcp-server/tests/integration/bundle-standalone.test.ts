import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('打包后的服务单独拷出来、旁边没有 node_modules 也能启动', async () => {
  // A plugin host runs the bundle from an install that has no dependencies
  // beside it, so it is started from a directory holding nothing else.
  const directory = mkdtempSync(join(tmpdir(), 'momo-bundle-'));
  const localAppData = mkdtempSync(join(tmpdir(), 'momo-bundle-data-'));
  copyFileSync('dist/server.js', join(directory, 'server.js'));
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(directory, 'server.js')],
    cwd: directory,
    env: {
      ...(process.env as Record<string, string>),
      LOCALAPPDATA: localAppData,
      MAIMEMO_TOKEN: 'bundle-test-token'
    },
    stderr: 'pipe'
  });
  const client = new Client({ name: 'bundle-standalone-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 19);
    const status = (await client.callTool({ name: 'maimemo_auth_status', arguments: {} })) as {
      content: { text: string }[];
    };
    const body = JSON.parse(status.content[0]?.text ?? '{}') as {
      data?: { configured?: boolean };
    };
    assert.equal(body.data?.configured, true);
  } finally {
    await client.close();
    rmSync(directory, { recursive: true, force: true });
    rmSync(localAppData, { recursive: true, force: true });
  }
});
