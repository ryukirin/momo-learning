import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const skill = readFileSync(
  resolve(process.cwd(), '../skills/momo-daily-learning/SKILL.md'),
  'utf8'
);

test('每日学习 Skill 先引导 App，再按作答结果出题，并包含完整中文讲解要求', () => {
  assert.match(skill, /先去 App 完成正式复习/);
  assert.match(skill, /不得用出题代替/);
  assert.match(skill, /核心词义与词性/);
  assert.match(skill, /常见搭配/);
  assert.match(skill, /易混点或记忆提示/);
  assert.match(skill, /带中文翻译/);
  // The app's own verdict decides the scope: a word it confirmed as known is
  // never asked about again, which is what stops the loop repeating the app.
  assert.match(skill, /FAMILIAR` 的词一律不考/);
  // Generated teaching material must never be presented as the account's own.
  assert.match(skill, /不是墨墨账号原文/);
});

test('出题只在用户要求时发生，范围可追溯且题目与答案解析分离', () => {
  assert.match(skill, /只在用户要求开始当天流程或明确要题时出题/);
  // The candidate tool owns the ordering, so the skill cites it instead of
  // re-deriving the tiers from today's snapshot itself.
  assert.match(skill, /maimemo_list_quiz_candidates/);
  assert.match(skill, /本地错题/);
  assert.match(skill, /墨墨标记顽固/);
  // Interference options come from the real plan rather than being invented.
  assert.match(skill, /不得编造不存在的词/);
  assert.match(skill, /单批最多 50 题/);
  assert.match(skill, /题目、答案、解析必须分离/);
  assert.match(skill, /不得声称覆盖全部/);
});

test('出题一题一题弹窗进行，不一次列完', () => {
  assert.match(skill, /一次只问一题/);
  assert.match(skill, /ask_user_question/);
  assert.match(skill, /不得把整套题一次性写进回复/);
  // An option description carrying the meaning would hand over the answer.
  assert.match(skill, /不要写释义/);
  // A session without the popup tool still asks one question at a time.
  assert.match(skill, /一次一题\*\*的普通消息提问/);
});

test('题型只出选择题、禁止对译，且不做需要语篇的题', () => {
  assert.match(skill, /中文猜英语/);
  // The five exam-grounded multiple-choice forms.
  for (const form of ['语境选词', '近义替换', '搭配填空', '形近辨析', '熟词僻义']) {
    assert.ok(skill.includes(form), `Skill 应包含题型 ${form}`);
  }
  // Handing over the root turns the question into mechanical inflection.
  assert.ok(skill.includes('不出「给词根选词形」这类构词题'));
  // A Chinese instruction in the stem gives away both the task and the answer.
  assert.match(skill, /题干只放英文语境，不得出现中文/);
  // The stem must not carry the meaning, which would make it a translation again.
  assert.match(skill, /不得出现该词的中文释义/);
  assert.match(skill, /每题 4 个选项、1 个正确答案/);
  assert.match(skill, /不做需要语篇的题型/);
});

test('从整个镜像取词，排除今天新学的并留出间隔', () => {
  assert.match(skill, /每天固定 \*\*20 题\*\*/);
  assert.match(skill, /不要 n 个词出 n 道题/);
  assert.match(skill, /maimemo_list_quiz_candidates/);
  assert.match(skill, /排除今天新学的词/);
  assert.match(skill, /距上次学习有间隔/);
  // Nothing is permanently skipped: the app's own schedule brings a word back
  // until it is learned, so no quiz-progress state needs to be stored here.
  assert.match(skill, /没考到的词不需要记账/);
});

test('只记错题不留流水，日报落盘到工作区', () => {
  assert.match(skill, /只记错题，不留答题流水/);
  assert.match(skill, /maimemo_record_quiz_mistakes/);
  assert.match(skill, /答对的词\*\*不写任何记录\*\*/);
  assert.match(skill, /今日日报/);
  assert.match(skill, /需要加强的知识点/);
  assert.match(skill, /累计错了几次/);
  // A report is a document for a human, so it is written as a file, while the
  // queryable facts stay in the database.
  assert.match(skill, /日报落盘成文件/);
  assert.match(skill, /reports\/` 目录/);
  assert.match(skill, /momo-YYYY-MM-DD\.md/);
});

test('解析无论对错都写中文释义', () => {
  assert.match(skill, /无论答对还是答错，每题解析都必须包含/);
  assert.match(skill, /目标词或短语的中文释义（含词性）/);
  // Explaining only the right option cannot tell a lucky guess from real knowledge.
  assert.match(skill, /四个选项逐项辨析/);
});

test('每题先写可见的解析，再记录，最后才弹下一题；答对也不例外', () => {
  // Without a fixed order a correct answer can skip straight to the next popup,
  // so the order is pinned and the explanation must be visible reply text.
  assert.match(skill, /### 每题的固定顺序/);
  assert.match(skill, /解析必须是用户看得到的文字，只在思考里想过不算/);
  assert.match(skill, /\*\*答对也一样要写\*\*/);
  assert.match(skill, /解析写完才能弹下一题/);
  // A fixed shape keeps the explanation substantive rather than a one-line verdict.
  for (const heading of ['判定', '题目翻译', '考点', '选项辨析', '一句话记住']) {
    assert.ok(skill.includes(`**${heading}**`), `解析格式应包含 ${heading}`);
  }
  // Claiming an explanation was given when it was not is worse than the omission.
  assert.match(skill, /确实没写就直说漏了/);
});

test('开场覆盖全部分支：未学完就停，进度未知要先确认，报错不索要令牌', () => {
  assert.match(skill, /"unknown"/);
  // An unfinished day has no answers yet, so syncing it would save a partial snapshot.
  assert.match(skill, /也不要继续同步/);
  assert.match(skill, /reason: "start_daily_todo"/);
  assert.match(skill, /AUTH_NOT_CONFIGURED/);
  assert.match(skill, /不得在对话里索要或接收令牌/);
  assert.match(skill, /UPSTREAM_RATE_LIMITED/);
});

test('skill 列出的错误代码都是服务实际会返回的', () => {
  // A code the server never returns leaves the model with no matching row, so
  // the error table is checked against the server's own list.
  const errors = readFileSync(resolve(process.cwd(), 'src/errors.ts'), 'utf8');
  const known = new Set([...errors.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]));
  const section = skill.slice(skill.indexOf('### 工具报错'), skill.indexOf('## 出题'));
  // Only the table's first column holds codes; the second may name other identifiers.
  const firstColumns = section
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.split('|')[1] ?? '');
  const listed = firstColumns.flatMap((cell) =>
    [...cell.matchAll(/`([A-Z][A-Z_]{3,})`/g)].map((match) => match[1])
  );
  assert.ok(listed.length >= 5);
  for (const code of listed) assert.ok(known.has(code), `skill 里的 ${code} 不在 ErrorCode 里`);
});

test('skill 对两个客户端都适用', () => {
  // One skill file serves both clients, so it names both popup tools and never
  // a single client's install location.
  assert.match(skill, /AskUserQuestion/);
  assert.match(skill, /DeepSeek Harness 是 `write`，Claude Code 是 `Write`/);
  assert.doesNotMatch(skill, /dsh-momo-learning/);
});

test('同一次答错只提交一次，避免累计次数翻倍', () => {
  // The tool adds one to the count on every call, so a second submission of the
  // same miss would double it and skew both the report and tomorrow's order.
  assert.match(skill, /同一次答错只提交一次/);
  assert.match(skill, /不要\*\*把已经记过的错题再交一遍/);
});

test('正确项位置随机，日报日期用工具返回的 day', () => {
  // A predictable answer position lets the user answer without recalling the word.
  assert.match(skill, /正确项的位置随机/);
  assert.match(skill, /日期用开场记下的 `day`/);
});
