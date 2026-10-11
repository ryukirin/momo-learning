import test from 'node:test';
import assert from 'node:assert/strict';
import { splitUnfinished, type TodayItem } from '../../src/api/today-items.js';

const item = (id: string, finished: boolean): TodayItem => ({
  voc_id: id,
  voc_spelling: id,
  order: 0,
  is_finished: finished
});

test('提前复习没做完的词不算今天未学完，今天到期的才算', () => {
  const split = splitUnfinished(
    [item('done', true), item('ahead', false), item('due', false), item('overdue', false)],
    new Map([
      ['done', '2026-10-20'],
      // Pulled forward from tomorrow by reviewing ahead, then left open.
      ['ahead', '2026-10-12'],
      ['due', '2026-10-11'],
      ['overdue', '2026-10-09']
    ]),
    '2026-10-11'
  );
  assert.deepEqual(split, { due: ['due', 'overdue'], ahead: ['ahead'] });
});

test('查不到下次学习日的未完成词按今天到期处理', () => {
  // Without a next study day nothing shows the word was pulled forward.
  assert.deepEqual(splitUnfinished([item('unknown', false)], new Map(), '2026-10-11'), {
    due: ['unknown'],
    ahead: []
  });
});
