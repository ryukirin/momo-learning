# 墨墨学习 MCP 服务（`mcp-server`）

本目录是 `momo-learning` 插件内附的 MCP 服务本体：一个仅供本机单用户使用的**只读** stdio 服务。DeepSeek Harness 和 Claude Code 运行的都是这里的 `dist/server.js`。

**日常使用不需要读这个文件** —— 安装、配置令牌、验证与卸载都在[上一级 README](../README.md)。本文件只说明这一层的边界与开发方式。

## 边界

- 访问令牌有两个来源：客户端启动服务时通过环境变量 `MAIMEMO_TOKEN` 传入（DeepSeek Harness 从自己的凭据存储读出，Claude Code 取插件配置里的敏感项）；没有时读操作系统安全凭证存储（Windows 上是 Credential Manager，服务名 `momo-learning-mcp`，也读旧版本的 `dsh.momo-learning-mcp` 和 `codex.maimemo-learning-mcp`）。服务启动后立即把 `MAIMEMO_TOKEN` 从自己的环境里删掉；客户端没展开的 `${…}` 占位符当作没有令牌。MCP 工具既不接收也不返回令牌，`maimemo_auth_status` 只报告令牌来源（`host` 或 `keyring`）。
- 学习镜像与本地状态存在 `%LOCALAPPDATA%\MomoLearning\learning.sqlite`。两个客户端共用这个文件。
- 上游只读：只调用墨墨开放 API 的读取端点，不修改账号、不写云词本、不改复习状态。
- 不保存原始 HTTP 响应，也不保存生成的讲解与题目；凭证与请求头不进数据库。

## 与客户端的衔接

- DeepSeek Harness：插件的 `cordis.patch.yml` 通过 `@deepseek-ai/dsh-mcp-client` 以 stdio 方式启动 `dist/server.js`，命令用的是运行 Harness 的那个 Node（`process.execPath`），工作目录是本目录，`env` 里带着插件从凭据存储读到的 `MAIMEMO_TOKEN`。
- Claude Code：`.claude-plugin/plugin.json` 用 `node ${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/server.js` 启动服务，`MAIMEMO_TOKEN` 取自插件配置项 `maimemo_token`。

两个客户端运行服务的 Node 不同：DeepSeek Harness 桌面版是 Electron 内置的 Node，Claude Code 是系统 Node，两者的 ABI 不同。所以服务不依赖任何需要编译的原生模块：SQLite 用 Node 内置的 `node:sqlite`，`@napi-rs/keyring` 走 N-API、不受 ABI 影响，而且只在用到系统凭证存储时才加载。

## 开发

```sh
npm install
npm run build          # tsc 类型检查 + esbuild 打包到 dist/
npm run typecheck
npm test               # 单元 + 契约 + 集成
npm run lint
npm run format:check
```

- `dist/` 是 `scripts/bundle.mjs` 的产物，**会随包提交**：`server.js`、`auth/credential-cli.js`、`migrate-legacy.js` 各是一个自带依赖的文件，客户端装插件后无需安装依赖或构建。只有 `@napi-rs/keyring` 留在外面，用 `createRequire` 按需加载。改完 `src/` 记得 `npm run build`。
- 集成测试里有一条会把 `dist/server.js` 单独拷到一个没有 `node_modules` 的临时目录启动，用来确认打包结果真的不依赖外部模块。
- `npm start` 直接跑 `dist/server.js`。
- 凭证操作：`npm run credential -- <set|status|remove>`，需要交互式终端。写入只写 `momo-learning-mcp`，删除会连旧服务名下的条目一起删。
- 实时探针：`npm run probe`，只验证已实现且当前获授权的只读端点；非交互式环境必须加 `--yes`。用户自建内容（自建释义、例句、助记）在探针未确认前固定返回 `UNSUPPORTED_CAPABILITY`。

### 从旧版本迁移

旧版本的 Claude Code 版把数据库放在 `%LOCALAPPDATA%\CodexMomoLearning`。`npm run migrate-legacy` 处理它：新位置还没有数据库时，把旧数据库连同 `-wal`、`-shm` 搬过去；两边都有时，把旧的错题本合并进来（同一个词累计次数相加），旧数据库留在原位。合并过的来源记在 `merged_source` 表里，重复运行不会重复累加。凭证不用迁移。

## License

MIT，见[上级目录的 LICENSE](../LICENSE)。
