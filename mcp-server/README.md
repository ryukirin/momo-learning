# 墨墨学习 MCP 服务（`mcp-server`）

本目录是 `momo-learning` 插件内附的 MCP 服务本体：一个仅供本机单用户使用的**只读** stdio 服务。DeepSeek Harness 和 Claude Code 运行的都是这里的 `dist/server.js`。

**日常使用不需要读这个文件** —— 安装、配置令牌、验证与卸载都在[上一级 README](../README.md)。本文件只说明这一层的边界与开发方式。

## 边界

- 访问令牌只来自客户端：启动服务时通过环境变量 `MAIMEMO_TOKEN` 传入（DeepSeek Harness 从自己的凭据存储读出，Claude Code 取插件配置里的敏感项）。服务自己不保存令牌，启动后立即把 `MAIMEMO_TOKEN` 从自己的环境里删掉；客户端没展开的 `${…}` 占位符当作没有令牌。MCP 工具既不接收也不返回令牌，`maimemo_auth_status` 只报告是否已配置。
- 学习镜像与本地状态存在 `%LOCALAPPDATA%\MomoLearning\learning.sqlite`。两个客户端共用这个文件。
- 上游只读：只调用墨墨开放 API 的读取端点，不修改账号、不写云词本、不改复习状态。
- 不保存原始 HTTP 响应，也不保存生成的讲解与题目；令牌与请求头不进数据库。

## 与客户端的衔接

- DeepSeek Harness：插件的 `cordis.patch.yml` 通过 `@deepseek-ai/dsh-mcp-client` 以 stdio 方式启动 `dist/server.js`，命令用的是运行 Harness 的那个 Node（`process.execPath`），工作目录是本目录，`env` 里带着插件从凭据存储读到的 `MAIMEMO_TOKEN`。
- Claude Code：`.claude-plugin/plugin.json` 用 `node ${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/server.js` 启动服务，`MAIMEMO_TOKEN` 取自插件配置项 `maimemo_token`。

两个客户端运行服务的 Node 不同：DeepSeek Harness 桌面版是 Electron 内置的 Node，Claude Code 是系统 Node，两者的 ABI 不同。所以服务不依赖任何原生模块，SQLite 用的是 Node 内置的 `node:sqlite`。

## 开发

```sh
npm install
npm run build          # tsc 类型检查 + esbuild 打包到 dist/
npm run typecheck
npm test               # 单元 + 契约 + 集成
npm run lint
npm run format:check
```

- `dist/server.js` 是 `scripts/bundle.mjs` 的产物，**会随包提交**：它是一个自带全部依赖的文件，客户端装插件后无需安装依赖或构建。改完 `src/` 记得 `npm run build`。
- 集成测试里有一条会把 `dist/server.js` 单独拷到一个没有 `node_modules` 的临时目录启动，用来确认打包结果真的不依赖外部模块。
- `npm start` 直接跑 `dist/server.js`，令牌通过 `MAIMEMO_TOKEN` 传入。
- 实时探针：`npm run probe`，从 `MAIMEMO_TOKEN` 读令牌，只验证已实现且当前获授权的只读端点；非交互式环境必须加 `--yes`。用户自建内容（自建释义、例句、助记）在探针未确认前固定返回 `UNSUPPORTED_CAPABILITY`。

## License

MIT，见[上级目录的 LICENSE](../LICENSE)。
