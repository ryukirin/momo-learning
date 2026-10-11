import type Database from './sqlite.js';

interface MistakeRow {
  word_id: string;
  spelling: string;
  first_missed_day: string;
  last_missed_day: string;
  miss_count: number;
  last_prompt: string | null;
  last_type: string | null;
  cleared_day: string | null;
}

/** What one merge did. */
export interface MergeOutcome {
  /** Words only the source had. */
  added: number;
  /** Words both sides had, now one row. */
  combined: number;
  /** The source was merged before, so nothing changed this time. */
  alreadyMerged: boolean;
}

const earlier = (left: string, right: string): string => (left <= right ? left : right);
const later = (left: string, right: string): string => (left >= right ? left : right);

/**
 * Fold another mirror's mistake book into this one.
 *
 * The plan mirror can be rebuilt from upstream at any time, but the mistake book
 * exists only locally, so two installs that each kept one are merged rather than
 * one of them dropped. A word missed on both sides keeps one row: the counts add
 * up, the miss window spans both, the prompt and type come from the later miss,
 * and the word stays open unless both sides cleared it. The source's key is
 * recorded in the same transaction, so merging the same source again changes
 * nothing instead of adding its counts twice.
 * @param target - the database to merge into; its schema must be current.
 * @param source - the database to read the other mistake book from.
 * @param sourceKey - a stable name for the source, such as its file path.
 * @returns how many words were added and combined.
 */
export const mergeQuizMistakes = (
  target: Database,
  source: Database,
  sourceKey: string
): MergeOutcome => {
  if (target.prepare('SELECT 1 FROM merged_source WHERE path=?').get(sourceKey) !== undefined) {
    return { added: 0, combined: 0, alreadyMerged: true };
  }
  const rows = source
    .prepare(
      `SELECT word_id, spelling, first_missed_day, last_missed_day, miss_count, last_prompt, last_type, cleared_day
       FROM quiz_mistake`
    )
    .all() as MistakeRow[];
  const now = new Date().toISOString();
  return target.transaction(() => {
    // A mistake row needs its word, and the target may not have mirrored it yet.
    const word = target.prepare(
      `INSERT INTO mirror_word(word_id,spelling,first_seen_at,last_seen_at,plan_state,plan_state_updated_at,latest_sync_id)
       VALUES(?,?,?,?,'current',?,NULL) ON CONFLICT(word_id) DO NOTHING`
    );
    const existing = target.prepare(
      `SELECT word_id, spelling, first_missed_day, last_missed_day, miss_count, last_prompt, last_type, cleared_day
       FROM quiz_mistake WHERE word_id=?`
    );
    const insert = target.prepare(
      `INSERT INTO quiz_mistake(word_id,spelling,first_missed_day,last_missed_day,miss_count,last_prompt,last_type,cleared_day)
       VALUES(?,?,?,?,?,?,?,?)`
    );
    const update = target.prepare(
      `UPDATE quiz_mistake SET spelling=?, first_missed_day=?, last_missed_day=?, miss_count=?,
         last_prompt=?, last_type=?, cleared_day=? WHERE word_id=?`
    );
    let added = 0;
    let combined = 0;
    for (const row of rows) {
      word.run(row.word_id, row.spelling, now, now, now);
      const mine = existing.get(row.word_id) as MistakeRow | undefined;
      if (mine === undefined) {
        insert.run(
          row.word_id,
          row.spelling,
          row.first_missed_day,
          row.last_missed_day,
          row.miss_count,
          row.last_prompt,
          row.last_type,
          row.cleared_day
        );
        added += 1;
        continue;
      }
      const latest = row.last_missed_day > mine.last_missed_day ? row : mine;
      update.run(
        mine.spelling.trim() === '' ? row.spelling : mine.spelling,
        earlier(mine.first_missed_day, row.first_missed_day),
        later(mine.last_missed_day, row.last_missed_day),
        mine.miss_count + row.miss_count,
        latest.last_prompt,
        latest.last_type,
        mine.cleared_day === null || row.cleared_day === null
          ? null
          : later(mine.cleared_day, row.cleared_day),
        row.word_id
      );
      combined += 1;
    }
    target.prepare('INSERT INTO merged_source(path, merged_at) VALUES(?,?)').run(sourceKey, now);
    return { added, combined, alreadyMerged: false };
  })();
};
