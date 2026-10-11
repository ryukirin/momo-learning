import { diagnostic } from '../redaction.js';
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
export const splitUnfinished = (items, nextStudyDays, day) => {
    const split = { due: [], ahead: [] };
    for (const item of items) {
        if (item.is_finished === true)
            continue;
        const next = nextStudyDays.get(item.voc_id);
        if (next !== undefined && next > day)
            split.ahead.push(item.voc_spelling);
        else
            split.due.push(item.voc_spelling);
    }
    return split;
};
export const getTodayItems = async (client) => {
    const response = await client.post('/open/api/v1/memo/study/get_today_items', {
        limit: 1000
    });
    const items = response.today_items ?? [];
    diagnostic('当天项目读取完成。', { returnedCount: items.length });
    return items;
};
/**
 * Read upstream's progress counters for today.
 *
 * This is the only read that separates "still has words to study" from "nothing
 * is scheduled at all": the today list keeps finished items, so an empty list and
 * a completed day look alike there, while `total` tells them apart.
 * @param client - the upstream client.
 * @returns the day's counters, or an empty object when upstream reports none.
 */
export const getStudyProgress = async (client) => {
    const response = await client.post('/open/api/v1/memo/study/get_study_progress', {});
    diagnostic('今日学习进度读取完成。', {
        finished: response.progress?.finished ?? null,
        total: response.progress?.total ?? null
    });
    return response.progress ?? {};
};
//# sourceMappingURL=today-items.js.map