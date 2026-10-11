/**
 * Bring data from the locations earlier releases used into the current one.
 *
 * Earlier releases kept the mirror database under a client-specific directory.
 * When the current location has no database yet, the old one is moved over with
 * its sidecars. When both exist — two clients each kept their own — the old
 * mistake book is merged into the current database, because it exists only
 * locally; the plan mirror needs no merging, since upstream can rebuild it. The
 * old database is left in place either way a merge happened.
 *
 * Credentials need no step: the server reads the current service name first and
 * then every name an earlier release used.
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { openDatabase } from './db/database.js';
import { mergeQuizMistakes } from './db/merge-mistakes.js';
import Database from './db/sqlite.js';

const localRoot = (): string =>
  process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? process.cwd(), 'AppData', 'Local');

/** Sidecars SQLite keeps beside a WAL database; moving the database alone would lose committed pages. */
const sidecarSuffixes = ['', '-wal', '-shm'] as const;

/**
 * Move or merge one legacy database into the current location.
 * @param legacyDirectory - the directory name an earlier release used.
 * @returns a one-line report.
 */
const migrateDatabase = (legacyDirectory: string): string => {
  const root = localRoot();
  const target = join(root, config.dataDirectoryName, 'learning.sqlite');
  const source = join(root, legacyDirectory, 'learning.sqlite');
  if (!existsSync(source)) return `数据库：${legacyDirectory} 下没有旧数据库，跳过。`;
  if (!existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true });
    let moved = 0;
    for (const suffix of sidecarSuffixes) {
      const from = `${source}${suffix}`;
      if (!existsSync(from)) continue;
      renameSync(from, `${target}${suffix}`);
      moved += 1;
    }
    return `数据库：已把 ${moved} 个文件从 ${dirname(source)} 移到 ${dirname(target)}。`;
  }
  const into = openDatabase(target);
  const from = new Database(source, { readOnly: true });
  try {
    const outcome = mergeQuizMistakes(into, from, source);
    if (outcome.alreadyMerged) return `错题本：${source} 之前已经合并过，这次没有改动。`;
    return `错题本：已把 ${source} 合并进 ${target}，新增 ${outcome.added} 个词，合并 ${outcome.combined} 个两边都有的词（累计次数相加）。旧数据库保留在原位，确认无误后可以删除。`;
  } finally {
    from.close();
    into.close();
  }
};

const run = (): void => {
  for (const legacyDirectory of config.legacyDataDirectoryNames) {
    try {
      process.stdout.write(`${migrateDatabase(legacyDirectory)}\n`);
    } catch (error) {
      process.stdout.write(`数据库：迁移失败（${String(error)}）\n`);
      process.stdout.write(
        '  多半是 MCP 服务还在运行、占着数据库文件。请先关掉用它的客户端再重跑本命令。\n'
      );
    }
  }
  process.stdout.write(
    `凭证：不需要迁移，服务会依次读取 ${[config.credentialService, ...config.legacyCredentialServices].join('、')}。\n`
  );
};

run();
