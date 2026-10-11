# momo-learning

墨墨背单词的学习插件，可以装进 DeepSeek Harness 或 Claude Code。它把你墨墨账号的学习数据同步到本机 SQLite，然后在本地出选择题考你：每天 20 题，一题一题弹窗问，每题答完给解析，错了记进错题本，答完写一份日报。

整个过程只读，不改你的墨墨账号。

插件包含 19 个 MCP 工具（服务名 `maimemo`）和一个叫 `momo-daily-learning` 的 Skill。两个客户端运行的是同一个 MCP 服务和同一份 Skill，读写同一个本地数据库，所以错题本只有一本。

## 定位

墨墨 App 已经在做记忆这件事了，所以这里管得很窄：

- 今天 App 判定为「认识」的词不考
- 今天刚新学的词也不考，刚背完还在短期记忆里，考了没意义
- 只考那些学过一阵子、已经有点忘的词

不代替 App 复习。当天到期的词没在 App 里复习完时，会先提示回 App 完成；提前复习加进来但没作答的词不算在内。也不做账号写入——加词、改复习状态、云词本都没有对应工具。

## 前置条件

目前只在 Windows 上测试过。镜像存到 `%LOCALAPPDATA%\MomoLearning`。

- 客户端二选一：
  - DeepSeek Harness 桌面版 0.2 及以上。桌面版自带运行时，MCP 服务就用它运行，不用另外装 Node.js。
  - Claude Code。MCP 服务由本机的 `node` 启动，需要 Node.js 24，且 `node` 在 `PATH` 上。
- 一个墨墨开放平台的只读凭证。墨墨背单词 App 里「我的 → 更多设置 → 实验功能 → 开放 API」能拿到，也可以去 <https://open.maimemo.com/open/api/v1/tokens/openapi> 申请。有频控，别外传。

## 安装

### DeepSeek Harness 桌面版

DeepSeek Harness 的源码版（`npx @deepseek-ai/dsh web` 或从源码运行）仍在维护，但界面会变化，这里只介绍当前桌面版的安装方式。

在桌面版里打开「插件」→「添加插件」，输入下面任意一种：

- GitHub 仓库地址：`https://github.com/ryukirin/momo-learning`
- 本地目录路径：克隆到本机的仓库目录。这种方式直接链接该目录，不会替你装依赖；要用系统凭据管理器保存令牌的话，先在仓库根目录跑一次 `npm install`

令牌放在 DeepSeek Harness 的凭据文件里：`~/.dsh/.credentials.yaml`（Windows 上是 `%USERPROFILE%\.dsh\.credentials.yaml`；设置了 `DSH_HOME` 时在 `$DSH_HOME` 下）。在 `refs` 下加一行 `MAIMEMO_TOKEN`：

```yaml
version: 1
refs:
  MAIMEMO_TOKEN: <你的令牌>
```

文件里已有别的条目时只加这一行，其他内容不动。也可以写进同目录的 `.env`：`MAIMEMO_TOKEN=<你的令牌>`。插件在 Harness 启动时读取 `MAIMEMO_TOKEN`，通过环境变量交给 MCP 服务，所以配好或改了令牌之后要重启桌面版。

### Claude Code

把本仓库添加为插件市场，再安装插件：

```
/plugin marketplace add ryukirin/momo-learning
/plugin install momo-learning@momo-learning
```

这里的「插件市场」只是仓库里的 `.claude-plugin/marketplace.json`，告诉 Claude Code 这个仓库里有哪个插件，不需要提交到任何地方。Claude Code 会把插件拷进自己的缓存目录，并按根目录的 `package-lock.json` 装好依赖。

启用插件时会提示填写「墨墨开放 API 令牌」。这一项标记为敏感，令牌存进系统的安全存储，不写进 `settings.json`；MCP 服务启动时通过环境变量 `MAIMEMO_TOKEN` 拿到它。装好后开一个新会话。

不经过 GitHub 的两种装法：

- 本地目录：把上面第一条命令的 `ryukirin/momo-learning` 换成本机克隆目录的路径
- 放进 Skill 目录：把仓库克隆到 `~/.claude/skills/momo-learning`，Claude Code 启动时直接加载

这两种都直接从原目录加载，不会替你装依赖。要用系统凭据管理器保存令牌的话，先在仓库根目录跑一次 `npm install`。

### 令牌的其他来源

客户端没有传入令牌时，MCP 服务读系统凭据管理器里的 `momo-learning-mcp` 条目，也认旧版本用过的 `dsh.momo-learning-mcp` 和 `codex.maimemo-learning-mcp`。在仓库根目录先跑一次 `npm install`，再用命令行写入：

```sh
npm run credential -- set      # 交互式输入
npm run credential -- status
npm run credential -- remove   # 新旧条目一起删除
```

### 从旧版本升级

旧版本按客户端分开存数据：Claude Code 版在 `%LOCALAPPDATA%\CodexMomoLearning`，DeepSeek Harness 版在 `%LOCALAPPDATA%\MomoLearning`。现在两边统一用 `MomoLearning`。用过 Claude Code 版的话，先关掉所有正在用这个插件的客户端，再在仓库根目录运行：

```sh
npm run migrate-legacy
```

- `MomoLearning` 里还没有数据库：把旧数据库连同 `-wal`、`-shm` 文件整体搬过去
- 两边都有数据库：只合并错题本。两边都有的词累计次数相加，答错日期取两边的范围，只有两边都消除了才算消除。镜像不用合并，下次同步会从墨墨补齐。旧数据库保留在原位
- 同一个旧数据库合并过一次后再运行，不会重复累加

凭证不用迁移，见上一节。

## 示例

```text
你：开始今天的墨墨

（先检查今天的 App 复习是否完成，完成后同步并出题）

（弹窗，第 1/20 题）
  The committee will ___ the remaining issues at next week's meeting.
  ○ redress    ○ address    ○ regress    ○ dress

你选了 address

q1 答对（你选 address，正确答案 address）

题目翻译：委员会将在下周的会议上处理剩下的问题。

考点：address（及物动词），处理、着手解决。考的是动词义，不是常见的名词「地址」。

选项辨析
- redress：纠正、补救。错，对象通常是不公或失衡（redress a grievance），不是一般的待议问题。
- address：处理、解决。正确，后面接 the remaining issues，正是「处理问题」。
- regress：倒退、退化。错，不及物动词，后面不能直接接宾语。
- dress：给……穿衣、装饰。错，和 address 形近，但不能接 issues。

一句话记住：address an issue＝处理问题；redress a grievance＝纠正不公。

（第 2/20 题…）

20 题答完：答对 17 / 答错 3。错题进了本地错题本，明天会优先出它们。
日报写到 reports/momo-2026-09-14.md。
```

每题都给解析，答对也给。答对不代表真会，解析写出来你才知道自己是不是蒙的。

## 出题范围

出题不看今天学了什么，看的是本地镜像里的整个词表。取词就一条命令：

```
maimemo_list_quiz_candidates({ limit: 20 })
```

排序写在 SQL 里：错题本里没消除的排最前，然后是墨墨打了 `STICKING` 标签的顽固词，再是今天复习时答错、答模糊的，然后是学得少的，最后是其余距上次学习较久的。同一档里，距上次学习越久的排越前。每个词都带一个 `reason`，说明它为什么被选中。

不进候选的词：今天新学的词、今天 App 判为「认识」的词，以及距上次学习不足 `minDaysSinceStudy` 天（默认 1）的词。今天复习答错、答模糊的词不受间隔限制。墨墨没有返回拼写的词无法出题，也会跳过。

每天 20 题，上限 50。候选池经常有几百个词，只取 20，不是有 n 个词就出 n 道题。

今天没排上的词不用管。墨墨的复习排程会继续把它们排进后面几天的词表，到时候带着新的作答结果重新进候选池。

## 题型

只出选择题，四选一。五种形态，都是英语考试里真实存在的：

- **语境选词**：英文句子挖空，四个词里选一个
- **近义替换**：句子里标出一个词，问哪个选项最接近它
- **搭配填空**：空出搭配的一部分，比如 `___ price`
- **形近辨析**：给英文释义，问是哪个词
- **熟词僻义**：句子里用的是生僻义项，问此处什么意思。干扰项里会放这个词最常见的那个意思

不出中英对译（给中文选英文、给英文选中文释义），也不出「给词根选变形」这种题。App 已经在考词义了，再考一遍没意义。题干里不出现中文，正确选项的位置随机。

形近选项由 `maimemo_find_similar_words` 提供，它在本地拼写里按编辑距离排。单词效果好（`adapt` / `adopt`），多词短语偏弱：按整串拼写计算编辑距离，匹配结果通常只是共用一个词的短语，这类词改用同义或同词根的角度出。

## 一题一题问

用客户端的提问弹窗问（DeepSeek Harness 是 `ask_user_question`，Claude Code 是 `AskUserQuestion`），一次一题，等回答再出下一题，不会一次把 20 题列出来。

答完先判对错，再给解析：题目的中文翻译，目标词在句中的词义、词性和本题考的义项或搭配，四个选项各自对错的原因，最后一句总结。答错时额外给一条同义项例句。解析写完才出下一题。

需要逐题停顿时，可以让它每题解析后暂停，说「继续」再出下一题。也可以要求一次出完，按题号作答后统一解析。

## 错题和日报

答题过程不存流水。只有答错才写 `quiz_mistake`，一个词一行；再错就累加 `miss_count`，不新增行。答对且没错过的词不写任何东西；答对的是错题本里的词，就标记消除。

整批答完写一份日报到 `<工作区>/reports/momo-YYYY-MM-DD.md`，一天一个文件。里面有题数、对错、错词清单（带累计错了几次），以及从错词里归纳出的薄弱点。数据库留着可查的事实，日报留着给人看的过程记录。

## 镜像怎么保持最新

本地 SQLite 里的学习记录不是历史备份，是出题的取数来源。范围筛选全在本地做，出题不打墨墨的历史记录接口。

第一次用跑一次全量回填。`maimemo_backfill_study_records` 按 `next_study_date` 滑窗分页（上游单次最多 1000 条，没有游标），`{as_count: true}` 给总数，分页走完拿全部记录。只有走到的词数和上游总数相等时才标 `complete`，否则标 `partial` 并说明只覆盖了多少。

以后是增量。`maimemo_sync_today_snapshot` 存完当天词表会顺手刷新学习记录，也可以单独调 `maimemo_refresh_study_records`。两者都先看库里最新的 `observed_at`：

- 当天已经同步过，就只按 `voc_ids` 刷当天那批词，一次调用
- 中间空了整天，就整体重走一遍计划

空了整天为什么不能只查个日期窗口？因为上游只能用 `next_study_date` 筛日期，而学一个词会把它推到未来。按「上次同步到今天」去查，窗口内到期的词可能是 0 个，而这段时间实际学过的词全在窗口外，因为学完就改期了。新词也一样，初学当天 `next_study_date` 就可能排到几十天后。墨墨也没有「按历史日期取当天词表」的接口，漏掉的那几天的词表事后补不回来。所以只有重走能证明完整；计划在 1000 词以内时，它和按词刷新一样只是一次调用。

本地查记录用 `maimemo_query_local_records`，可以按北京时间的日期范围（`last_study_date` / `first_study_date` / `next_study_date` / `add_date`）、标签 `STICKING` / `WELL_FAMILIAR`、学习次数区间筛，支持分页。

## 完整性与去重

只有走到的词数对上上游 `as_count` 才标 `complete`。滑窗不前进或者撞到页数上限就停下，标 `partial` 并给警告，不会假装走完了。

`mirror_word` 和 `study_record` 都是一词一行，`study_record` 按 `word_id` upsert。`today_item`、`study_window_member`、`todo_entry` 都以（批次或会话, 词）为主键，所以同一批次里同一个词不可能出现两次。本地查询默认只取还在计划里的词。

`today_item`、`study_window_member`、`mirror_sync` 这三张历史表会随同步次数增长，查询取的都是当天最新的批次，结果不会重复。

## 出问题

**工具列表里没有 `maimemo_*` 工具**：MCP 服务只在客户端启动时连接。DeepSeek Harness 装完插件后要重启桌面版，还没有的话看「插件」页里 `momo-learning` 有没有报错。Claude Code 开一个新会话，用 `/mcp` 查看本插件 `maimemo` 服务的状态；`node` 不在 `PATH` 上时服务起不来。两边的日志里都应该有「墨墨学习 MCP 已通过 stdio 启动。」这一行。

**`maimemo_auth_status` 返回 `configured: false`**：客户端没有传入令牌，系统凭据管理器里也没有。按「安装」里对应客户端的说明配好令牌后重启。返回里的 `source` 是令牌的来源：`host` 表示由客户端传入，`keyring` 表示来自系统凭据管理器。

**同步回来 0 个词**：确认凭证对应的是平时使用的墨墨账号，并且 App 里开启了「自动同步」。

**查询提示只覆盖已验证范围**：先跑一次 `maimemo_backfill_study_records`。

**App 里已复习完，仍提示先回 App**：判断只看当天到期的词。`maimemo_get_day_state` 返回的 `unfinished.due` 列出了未完成的词，可以和 App 对照。

**DeepSeek Harness「添加插件」装不上**：插件页会显示安装日志。用 GitHub 地址安装需要本机能连上 GitHub；连不上时可以先把仓库克隆到本机，按本地目录安装。

**改了 `SKILL.md` 不生效**：Skill 正文在插件加载时读取，要重启客户端。

## 开发

MCP 服务是 TypeScript，在 `mcp-server/`。DeepSeek Harness 的插件入口 `index.js` 是纯 JavaScript，只用 Node 内置模块，不 import 任何 harness 包。

```sh
npm run mcp:install
npm run mcp:build       # tsc 类型检查 + esbuild 打包到 mcp-server/dist
npm run mcp:typecheck
npm run mcp:test
```

`mcp:build` 先用 `tsc` 做类型检查，再用 esbuild 把服务、凭证命令行和迁移脚本各打成一个文件，放进 `mcp-server/dist/`。依赖都打进了文件里，只有 `@napi-rs/keyring` 例外：它是原生模块，用到系统凭据管理器时才加载，装不上只是少了这一个令牌来源。所以根目录的 `package.json` 只把它声明成可选依赖，客户端装插件时不需要再装别的。SQLite 用的是 Node 内置的 `node:sqlite`，DeepSeek Harness 内置的 Node 和系统 Node 都能直接运行。

`dist/` 随仓库提交，两个客户端都直接运行它。改完 `mcp-server/src/` 要重新 `npm run mcp:build`，不重建等于没改。这一层的更多细节在 [`mcp-server/README.md`](mcp-server/README.md)。

DeepSeek Harness 的自检脚本 `verify.mjs` 会按 launcher 的方式合成 `dsh-base` 各层加本 bundle 层，真的启动一次，然后断言 Skill 和 19 个工具都在。它依赖 profile 里能解析到 `@deepseek-ai/dsh-app-boot`，用源码版的 profile 运行：

```sh
cp <bundle>/verify.mjs "$DSH_HOME/profiles/<profile>/"
cd "$DSH_HOME/profiles/<profile>"
node verify.mjs
```

通过打印 `PASS`，缺东西就逐条列出来，并以退出码 1 结束。

## 目录

| 路径 | 作用 |
|---|---|
| `skills/momo-daily-learning/SKILL.md` | Skill 原文，两个客户端共用 |
| `mcp-server/` | MCP 服务本体，独立的 TypeScript 子项目，自带 `package.json`、测试和 README |
| `.claude-plugin/plugin.json` | Claude Code 插件清单：声明 MCP 服务和令牌配置项 |
| `.claude-plugin/marketplace.json` | 把本仓库作为 Claude Code 插件市场，只含这一个插件 |
| `cordis.patch.yml` | DeepSeek Harness 的 patch 层：插入本包的插件行，以及一行指向本包 MCP 服务的 `@deepseek-ai/dsh-mcp-client` |
| `index.js` | DeepSeek Harness 插件入口：注册 `momo-daily-learning` Skill，从凭据存储读取 `MAIMEMO_TOKEN`，把本包路径和要交给 MCP 服务的环境变量作为 `momoLearningPaths` 服务发布出去 |
| `verify.mjs` | DeepSeek Harness 自检脚本 |
| `LICENSE` | MIT |

在 DeepSeek Harness 里这是个 bundle。`package.json` 里声明了 `dsh.bundle.patch`，所以「添加插件」或 `dsh plugin --profile <n> add <本包>` 会把它作为一层 patch 挂进 profile；它内部再提供插件行——`index.js` 导出 `apply`，`cordis.patch.yml` 把它挂起来。DeepSeek Harness 里 bundle 和 plugin 不是一回事：bundle 是能装进 profile 的一层，plugin 是被 `cordis.yml` 挂载的一行。

`cordis.patch.yml` 里两行的顺序不是加载顺序。第一行发布 `momoLearningPaths`，第二行用 `inject` 声明依赖它，Loader 会等注入就绪再求值第二行的 `!!js` 配置。所以 MCP 行拿到的是本包的真实安装路径，不是挂载点或 profile 目录。

## 验证

开个新会话，确认四件事：

1. 能加载出 `momo-daily-learning` Skill
2. 工具列表里有 19 个 `maimemo_*` 工具
3. `maimemo_auth_status` 返回 `configured: true`
4. `maimemo_get_learning_overview` 返回镜像概况（还没同步过会带「尚无本地学习镜像」的 warning，这是正常的空状态）

## 卸载

- DeepSeek Harness：在「插件」页移除 `momo-learning`，依赖和 patch 层都会移除
- Claude Code：在 `/plugin` 里卸载 `momo-learning`

镜像数据和令牌不会随插件删除。要清镜像数据，卸载前先调用 MCP 工具 `maimemo_clear_local_learning_data(confirm: true)`。DeepSeek Harness 的令牌在 `.credentials.yaml` 里删掉 `MAIMEMO_TOKEN` 那一行；系统凭据管理器里的用 `npm run credential -- remove`。

## 已知限制

- 不支持写墨墨账号，加词、改复习状态、云词本都没有工具
- `maimemo_sync_word_supplements` 在探针没确认用户自建内容端点前固定返回 `UNSUPPORTED_CAPABILITY`
- 改 `SKILL.md` 要重启客户端才生效
- 令牌在客户端启动 MCP 服务时传入，改了令牌要重启客户端
- DeepSeek Harness：插件声明了 `inject: ['skills', 'credentials']`，组合里得有 Skill 注册表和凭据存储（`dsh-base` 都已经挂了）。精简组合缺其中之一的话这一行会停在待激活
- DeepSeek Harness 的凭据文件只有当前系统用户能读，但同一用户下运行的其他进程（包括 agent 调用的工具）也能读到
- MCP 服务要能 spawn 带管道的子进程。把 stdio 管道禁掉的受限沙箱里工具会连不上，正常启动的客户端没这个问题
- 没有提问弹窗的会话会退化成一次一题的普通消息提问
- 部分词墨墨不返回拼写，这些词无法出题，会被跳过
- 全量回填覆盖的是计划里的词。墨墨没有按历史日期取当天词表的接口，所以开始用之前的逐日清单补不回来，可靠的分日历史从开始每天存快照那天起积累
- 全量回填之后新加进计划的词，要等下次回填或者出现在某天词表里才会进镜像
- `find_similar_words` 对多词短语偏弱

## 免责声明

这是第三方工具，跟墨墨背单词没有隶属、合作或背书关系，也不代表 DeepSeek 或 Anthropic 官方。

它只调墨墨开放平台的公开只读接口，凭证需要你自己申请，使用时请遵守墨墨开放 API 的条款和频控（比如每 10 秒 20 次、每 5 小时 2000 次）。学习数据接口目前标注为公测，上游的端点和字段随时可能变，本项目不对可用性作承诺。

题目、解析、例句和日报都是模型生成的，不是墨墨账号原文。墨墨开放接口只给词 id、拼写、作答结果和学习记录，没有释义、例句和词书信息。

访问凭证只存在你本机：客户端的凭据存储或系统凭据管理器。项目不上传、不转发、不记录。学习数据也只留在本机镜像文件里。

## License

MIT，见 [LICENSE](LICENSE)。
