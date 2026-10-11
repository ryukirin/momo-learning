import { MaimemoClient } from './maimemo-client.js';
/**
 * The answer 墨墨 recorded the first time a word came up today;
 * `STUDY_RESPONSE_UNSPECIFIED` marks an item still unanswered.
 */
export type StudyResponse = 'FAMILIAR' | 'VAGUE' | 'FORGET' | 'WELL_FAMILIAR' | 'CANCEL_WELL_FAMILIAR' | 'STUDY_RESPONSE_UNSPECIFIED';
export interface TodayItem {
    voc_id: string;
    voc_spelling: string;
    order: number;
    /** How the word was answered today; the app's own verdict on whether it is known. */
    first_response?: StudyResponse;
    is_new?: boolean;
    is_finished?: boolean;
}
/** Today's unanswered items, split by whether they were due today at all. */
export interface UnfinishedSplit {
    /** Spellings of open items due today or earlier, or whose next study day is unknown. */
    due: string[];
    /** Spellings of open items whose next study day is still after today. */
    ahead: string[];
}
/**
 * Split today's unanswered items by whether they were due today.
 *
 * Reviewing ahead in the app pulls later words into today's list, and upstream's
 * progress counts them toward today's total, so one left unanswered keeps
 * `finished` below `total` although everything due today is done. An open word
 * whose next study day is still after today was never due today; a word whose
 * next study day is unknown proves nothing and counts as due.
 * @param items - today's list.
 * @param nextStudyDays - each word's next study day, as a Beijing `YYYY-MM-DD`.
 * @param day - today, as a Beijing `YYYY-MM-DD`.
 * @returns the open items' spellings, split by whether they are due today.
 */
export declare const splitUnfinished: (items: readonly TodayItem[], nextStudyDays: ReadonlyMap<string, string | undefined>, day: string) => UnfinishedSplit;
export declare const getTodayItems: (client: MaimemoClient) => Promise<TodayItem[]>;
/** Upstream's own counters for the current day. */
export interface StudyProgress {
    /** Words completed today. */
    finished?: number;
    /** The day's target word count; zero means nothing is scheduled. */
    total?: number;
    /** Study time in milliseconds. */
    study_time?: number;
}
/**
 * Read upstream's progress counters for today.
 *
 * This is the only read that separates "still has words to study" from "nothing
 * is scheduled at all": the today list keeps finished items, so an empty list and
 * a completed day look alike there, while `total` tells them apart.
 * @param client - the upstream client.
 * @returns the day's counters, or an empty object when upstream reports none.
 */
export declare const getStudyProgress: (client: MaimemoClient) => Promise<StudyProgress>;
