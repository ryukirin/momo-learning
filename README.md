# momo-learning

墨墨背单词的学习插件，可以装进 DeepSeek Harness 或 Claude Code。

把墨墨账号的学习数据同步到本机 SQLite，然后在本地出选择题，每天 20 题，用弹窗一题一题问，每题答完给解析，错了记进错题本，答完写一份当天的错题日报。

整个过程只读，插件包含 19 个 MCP 工具（服务名 `maimemo`）和一个叫 `momo-daily-learning` 的 Skill。

## 定位

墨墨 App 已经在做记忆这件事了，所以不代替 App 复习。

当天到期的词没在 App 里复习完时，会先提示回 App 完成。

也不做账号写入——加词、改复习状态、云词本都没有对应工具。

## 前置条件

目前只在 Windows 上测试过。镜像存到 `%LOCALAPPDATA%\MomoLearning`。

- 客户端二选一：
  - DeepSeek Harness 桌面版 0.2 及以上。桌面版自带运行时，MCP 服务就用它运行，不用另外装 Node.js。
  - Claude Code。MCP 服务由本机的 `node` 启动，需要 Node.js 24，且 `node` 在 `PATH` 上。
- 一个墨墨开放平台的只读凭证。墨墨背单词 App 里「我的 → 更多设置 → 实验功能 → 开放 API」能拿到，也可以去 <https://open.maimemo.com/open/api/v1/tokens/openapi> 申请。

## 安装

### DeepSeek Harness 桌面版

DeepSeek Harness 的源码版（`npx @deepseek-ai/dsh web` 或从源码运行）仍在维护，但界面会变化，这里只介绍当前桌面版的安装方式。

在桌面版里打开「插件」→「添加插件」，输入下面任意一种：

- GitHub 仓库地址：`https://github.com/ryukirin/momo-learning`
- 本地目录路径：克隆到本机的仓库目录。

令牌放在 DeepSeek Harness 的凭据文件里：`~/.dsh/.credentials.yaml`（Windows 上是 `%USERPROFILE%\.dsh\.credentials.yaml`，设置了 `DSH_HOME` 时在 `$DSH_HOME` 下）。

在 `refs` 下加一行 `MAIMEMO_TOKEN`：

```yaml
version: 1
refs:
  MAIMEMO_TOKEN: <你的令牌>
```

文件里已有别的条目时只加这一行，其他内容不修改。

也可以写进同目录的 `.env`：`MAIMEMO_TOKEN=<你的令牌>`。

插件在 Harness 启动时读取 `MAIMEMO_TOKEN`，通过环境变量交给 MCP 服务，所以配好或改了令牌之后要重启桌面版。

### Claude Code

把本仓库添加为插件市场，再安装插件：

```
/plugin marketplace add ryukirin/momo-learning
/plugin install momo-learning@momo-learning
```

这里的「插件市场」只是仓库里的 `.claude-plugin/marketplace.json`，Claude Code 会把插件拷进自己的缓存目录。

启用插件时会提示填写「墨墨开放 API 令牌」。这一项标记为敏感，令牌存进系统的安全存储，不写进 `settings.json`；MCP 服务启动时通过环境变量 `MAIMEMO_TOKEN` 拿到。

装好后开一个新会话。

从本地目录安装的话：

- 直接克隆：克隆到本机，把上面第一条命令的 `ryukirin/momo-learning` 换成本机克隆目录的路径
- 克隆进 Skill 目录：把仓库克隆到 `~/.claude/skills/momo-learning`，Claude Code 启动时直接加载

## 示例

```text
你：开始今天的墨墨出题

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

每题都给解析，答对也给。

## 出题范围

出题看的是本地镜像里的整个词表。

取词命令：

```
maimemo_list_quiz_candidates({ limit: 20 })
```

排序写在 SQL 里：错题本里没消除的排最前，然后是墨墨打了 `STICKING` 标签的顽固词，再是今天复习时答错、答模糊的，然后是学得少的，最后是其余距上次学习较久的。

同一档里，距上次学习越久的排越前。每个词都带一个 `reason`，说明它为什么被选中。

不进候选的词：今天新学的词、今天 App 判为「认识」的词，以及距上次学习不足 `minDaysSinceStudy` 天（默认 1）的词。今天复习答错、答模糊的词不受间隔限制。

墨墨没有返回拼写的词无法出题，也会跳过。

每天 20 题，上限 50。

今天没排上的词墨墨的复习排程会继续把它们排进后面几天的词表，到时候带着新的作答结果重新进候选池。

## 题型

只出选择题，四选一。

出题的五种形态：

- **语境选词**：英文句子挖空，四个词里选一个
- **近义替换**：句子里标出一个词，问哪个选项最接近它
- **搭配填空**：空出搭配的一部分，比如 `___ price`
- **形近辨析**：给英文释义，问是哪个词
- **熟词僻义**：句子里用的是生僻义项，问此处什么意思。干扰项里会放这个词最常见的那个意思

不出中英对译（给中文选英文、给英文选中文释义），也不出「给词根选变形」这种题。

题干里不出现中文，正确选项的位置随机。

形近选项由 `maimemo_find_similar_words` 提供，它在本地拼写里按编辑距离排。单词效果好（`adapt` / `adopt`），多词短语偏弱（按整串拼写计算编辑距离，匹配结果通常只是共用一个词的短语，这类词改用同义或同词根的角度出）

## 一题一题问

用客户端的提问弹窗问（DeepSeek Harness 是 `ask_user_question`，Claude Code 是 `AskUserQuestion`），一次一题，等回答再出下一题，不会一次把 20 题列出来。

答完先判对错，再给解析：

- 题目的中文翻译
- 目标词在句中的词义、词性和本题考的义项或搭配
- 四个选项各自对错的原因，最后一句总结
- 答错时额外给一条同义项例句

解析写完才出下一题。

需要逐题停顿时，可以让它每题解析后暂停，说「继续」再出下一题。也可以要求一次出完，按题号作答后统一解析。

## 错题和日报

答题过程不存流水。只有答错才写 `quiz_mistake`，一个词一行；再错就累加 `miss_count`，不新增行。答对且没错过的词不写任何东西；答对的是错题本里的词，就标记消除。

整批答完写一份日报到 `<工作区>/reports/momo-YYYY-MM-DD.md`，一天一个文件。里面有题数、对错、错词清单（带累计错了几次），以及从错词里归纳出的薄弱点。

数据库留着可查的事实，日报留着给人看的过程记录。

## 常见问题

**工具列表里没有 `maimemo_*` 工具**：MCP 服务只在客户端启动时连接。DeepSeek Harness 装完插件后要重启桌面版，还没有的话看「插件」页里 `momo-learning` 有没有报错。Claude Code 开一个新会话，用 `/mcp` 查看本插件 `maimemo` 服务的状态；`node` 不在 `PATH` 上时服务起不来。两边的日志里都应该有「墨墨学习 MCP 已通过 stdio 启动。」这一行。

**`maimemo_auth_status` 返回 `configured: false`**：客户端没有传入令牌，按「安装」里的说明配好后重启。

**同步回来 0 个词**：确认凭证对应的是平时使用的墨墨账号，并且 App 里开启了「自动同步」。

**查询提示只覆盖已验证范围**：先跑一次 `maimemo_backfill_study_records`。

**App 里已复习完，仍提示先回 App**：判断只看当天到期的词。`maimemo_get_day_state` 返回的 `unfinished.due` 列出了未完成的词，可以和 App 对照。

**DeepSeek Harness「添加插件」装不上**：插件页会显示安装日志。用 GitHub 地址安装需要本机能连上 GitHub；连不上时可以先把仓库克隆到本机，按本地目录安装。

**改了 `SKILL.md` 不生效**：Skill 正文在插件加载时读取，要重启客户端。

## 卸载

- DeepSeek Harness：在「插件」页移除 `momo-learning`，依赖和 patch 层都会移除
- Claude Code：在 `/plugin` 里卸载 `momo-learning`

镜像数据和令牌不会随插件删除。

要清镜像数据，卸载前先调用 MCP 工具 `maimemo_clear_local_learning_data(confirm: true)`。

DeepSeek Harness 的令牌在 `.credentials.yaml` 里删掉 `MAIMEMO_TOKEN` 那一行。

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

访问凭证只存在你本机：客户端的凭据存储。项目不上传、不转发、不记录。学习数据也只留在本机镜像文件里。

## License

MIT，见 [LICENSE](LICENSE)。
