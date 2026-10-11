import test from 'node:test';
import assert from 'node:assert/strict';
import Database from '../../src/db/sqlite.js';
import { migrate } from '../../src/db/migrations.js';
import { MirrorRepository } from '../../src/db/mirror-repository.js';
import { mergeQuizMistakes } from '../../src/db/merge-mistakes.js';

const open = (): { db: Database; repository: MirrorRepository } => {
  const db = new Database(':memory:');
  migrate(db);
  return { db, repository: new MirrorRepository(db) };
};

const mistakes = (repository: MirrorRepository): Record<string, unknown>[] =>
  repository.listQuizMistakes({ includeCleared: true, pageSize: 50, offset: 0 }).words;

test('两边都有的词累计次数相加，答错日期取两边的范围，题干取较晚一侧', () => {
  const target = open();
  const source = open();
  target.repository.saveQuizMistakes('2026-09-10', [
    { wordId: 'both', spelling: 'both', prompt: 'target first', type: '语境选词' }
  ]);
  target.repository.saveQuizMistakes('2026-09-12', [
    { wordId: 'both', spelling: 'both', prompt: 'target later', type: '语境选词' }
  ]);
  source.repository.saveQuizMistakes('2026-09-08', [
    { wordId: 'both', spelling: 'both', prompt: 'source first', type: '近义替换' }
  ]);
  source.repository.saveQuizMistakes('2026-09-14', [
    { wordId: 'both', spelling: 'both', prompt: 'source later', type: '熟词僻义' },
    { wordId: 'only-source', spelling: 'only' }
  ]);

  assert.deepEqual(mergeQuizMistakes(target.db, source.db, 'source.sqlite'), {
    added: 1,
    combined: 1,
    alreadyMerged: false
  });
  const merged = mistakes(target.repository);
  assert.deepEqual(
    merged.find((word) => word.wordId === 'both'),
    {
      wordId: 'both',
      spelling: 'both',
      firstMissedDay: '2026-09-08',
      lastMissedDay: '2026-09-14',
      missCount: 4,
      lastPrompt: 'source later',
      lastType: '熟词僻义',
      clearedDay: null
    }
  );
  assert.equal(merged.find((word) => word.wordId === 'only-source')?.missCount, 1);
});

test('只有两边都消除了才算消除；同一个来源再合并一次不会重复累加', () => {
  const target = open();
  const source = open();
  target.repository.saveQuizMistakes('2026-09-10', [
    { wordId: 'open-on-one', spelling: 'a' },
    { wordId: 'cleared-on-both', spelling: 'b' }
  ]);
  target.repository.clearQuizMistake('open-on-one', '2026-09-11');
  target.repository.clearQuizMistake('cleared-on-both', '2026-09-12');
  source.repository.saveQuizMistakes('2026-09-09', [
    { wordId: 'open-on-one', spelling: 'a' },
    { wordId: 'cleared-on-both', spelling: 'b' }
  ]);
  source.repository.clearQuizMistake('cleared-on-both', '2026-09-15');

  mergeQuizMistakes(target.db, source.db, 'source.sqlite');
  const once = mistakes(target.repository);
  assert.equal(once.find((word) => word.wordId === 'open-on-one')?.clearedDay, null);
  assert.equal(once.find((word) => word.wordId === 'cleared-on-both')?.clearedDay, '2026-09-15');

  assert.deepEqual(mergeQuizMistakes(target.db, source.db, 'source.sqlite'), {
    added: 0,
    combined: 0,
    alreadyMerged: true
  });
  assert.deepEqual(mistakes(target.repository), once);
});
