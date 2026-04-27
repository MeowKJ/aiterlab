# AIterLab 实施计划

## 1. 项目名

正式名称：`AIterLab`

含义：

```text
AIterLab = AI + Iteration + Lab
```

使用约定：

- 仓库名：`aiterlab`
- CLI：`aiterlab`
- npm scope：`@aiterlab/*`
- 桌面应用名：`AIterLab`
- 中文描述：AI 迭代实验实时观测与笔记平台

## 2. 产品一句话

AIterLab 是给 AI 迭代实验使用的实时工作台，用来展示 plan、运行状态、实时结果、历史实验和 AI note。

## 3. 最小可运行目标

v0.1 的目标不是功能完整，而是跑通完整闭环：

```text
创建实验 -> 创建迭代 -> 运行模拟 runner -> 推送实时日志/指标 -> 写入 AI note -> 保存历史文件 -> 重新打开复盘
```

## 4. 推荐首版目录

```text
aiterlab/
  README.md
  PLAN.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  apps/
    web/
    server/
  packages/
    shared-schema/
    experiment-runner/
    realtime-stream/
    mcp-server/
    agent-adapters/
    ai-note/
    ui-widgets/
  docs/
  data/
    experiments/
```

## 5. 开发阶段

### Phase 0：仓库定型

目标：把项目从规划文档变成可启动的开源 monorepo。

任务：

- 创建 `package.json`
- 创建 `pnpm-workspace.yaml`
- 创建 `tsconfig.base.json`
- 创建 apps 和 packages 目录
- 确定包名为 `@aiterlab/*`
- 确定 CLI 名为 `aiterlab`

验收：

- `pnpm install` 可执行
- workspace 能识别所有 package
- 文档中的名称统一为 AIterLab

### Phase 1：共享数据模型

目标：先把 AI、前端、后端都要共同理解的数据模型定下来。

任务：

- 实现 `@aiterlab/shared-schema`
- 用 Zod 定义 `Experiment`
- 用 Zod 定义 `Iteration`
- 用 Zod 定义 `PlanItem`
- 用 Zod 定义 `AI Note`
- 用 Zod 定义 `MetricEvent`
- 用 Zod 定义 `LogEvent`
- 用 Zod 定义 `WaveformChunkEvent`
- 用 Zod 定义 `RunEvent`
- 用 Zod 定义 `StreamSource`
- 用 Zod 定义 `WidgetLayout`
- 用 Zod 定义 `AgentCommandResult`
- 用 Zod 定义 `AgentError`

验收：

- 所有 schema 可导出 TypeScript 类型
- schema 可用于后端校验和前端类型提示
- 后续可以导出 JSON Schema 给外部 AI agent
- CLI、MCP、API 共用同一套结果和错误 schema

### Phase 2：本地服务端

目标：建立 AIterLab 的本地核心服务。

任务：

- 初始化 `apps/server`
- 使用 Fastify
- 提供实验 CRUD API
- 提供迭代 CRUD API
- 提供 AI note 写入 API
- 提供实验文件夹扫描 API
- 使用 SQLite + Drizzle 保存索引
- 使用 WebSocket 推送实时事件
- 实现本地 in-process event bus
- 实现 JSONL 事件追加持久化

验收：

- 可以创建实验
- 可以创建迭代
- 可以写入 note
- 可以从文件夹读取历史实验
- WebSocket 能推送日志和指标事件
- CLI 可以通过 JSONL 消费实时事件

### Phase 3：实验 Runner

目标：解决实验脚本阻塞、Python 弹窗和进程回收问题。

任务：

- 实现 `@aiterlab/experiment-runner`
- 支持运行 Python 脚本
- 支持运行 Node 脚本
- 支持运行 shell 命令
- 捕获 stdout/stderr
- 按行转成 `runner.log` 事件
- 支持多个 runner 并发
- 每个 runner 分配独立 `runId`
- stdout/stderr 实时推入 event bus
- 支持 timeout
- 支持 cancel/kill
- Windows 下隐藏 Python 控制台窗口

验收：

- 运行实验不会弹出额外 Python 窗口
- 实验结束后不会卡住命令
- stdout/stderr 能实时显示到前端
- 被取消后进程能回收
- 多个 runner 同时运行时事件不会串线

### Phase 3.5：Realtime Stream

目标：让 AIterLab 支持多进程/多线程实时推流。

任务：

- 实现 `@aiterlab/realtime-stream`
- 实现 event bus
- 实现 stream fanout
- 实现 JSONL writer
- 实现 ring buffer
- 实现 WebSocket broadcast
- 实现 CLI `aiterlab event stream --jsonl`
- 支持事件优先级
- 支持背压和降采样策略
- 支持断线重连 `since`

验收：

- 多个进程可同时推送事件
- UI、CLI、历史文件能同时收到事件
- 高频 metric 不会阻塞日志和状态事件
- 断线后能恢复最近事件

### Phase 4：前端工作台

目标：实现第一版可用 UI。

任务：

- 初始化 `apps/web`
- 使用 React 19 + Vite
- 实现实验列表
- 实现当前实验工作台
- 实现 iteration 时间线
- 实现 AI plan panel
- 实现 AI note panel
- 实现实时日志 panel
- 实现指标曲线 panel
- 实现基础布局保存

验收：

- 打开页面后直接进入工作台
- 能看到当前运行、已完成、未来计划
- 能看到实时日志
- 能看到实时指标曲线
- 能看到当前 iteration 的 AI note
- 能打开历史实验

### Phase 5：AI 可编辑 UI

目标：让 AI 可以结构化编辑界面。

任务：

- 实现 `@aiterlab/ui-widgets`
- 定义 widget schema
- 定义 layout schema
- 支持添加 widget
- 支持删除 widget
- 支持修改位置和大小
- 支持修改数据源
- 支持布局版本化

验收：

- AI 可以提交 JSON 修改布局
- 布局可以保存和恢复
- 错误布局会被 schema 拒绝
- 人类仍可用拖拽方式调整

### Phase 6：AI Note 增强

目标：把 AI note 做成项目的核心差异点。

任务：

- 实现 `@aiterlab/ai-note`
- 支持 Markdown note
- 支持 JSON note
- 支持实时追加 observation
- 支持 finalize note
- 支持 note 与日志、指标、图表互链
- 支持按标签和失败原因搜索

验收：

- 每轮迭代都有 note
- note 可被 AI 读取
- note 可被人类复盘
- note 能关联本轮实验结果

### Phase 7：CLI

目标：让开源用户不用打开 UI 也能使用核心能力。

任务：

- 实现 `aiterlab init`
- 实现 `aiterlab dev`
- 实现 `aiterlab run <script>`
- 实现 `aiterlab list`
- 实现 `aiterlab open <experiment-id>`
- 实现 `aiterlab note append`
- 所有命令支持 `--json`
- 实时流命令支持 `--jsonl`
- 写操作支持 `--yes` 和 `--dry-run`
- 所有命令提供稳定 exit code

验收：

- 命令行可创建实验
- 命令行可运行脚本并记录结果
- 命令行可追加 AI note
- 命令行可启动本地工作台
- Codex 和 Claude Code 可以不打开 UI 完成实验闭环

### Phase 8：Agent Integration

目标：让 Codex、Claude Code 和其他 coding agent 可以稳定调用 aiterlab。

任务：

- 实现 `@aiterlab/mcp-server`
- 实现 `aiterlab mcp serve`
- 暴露 experiment/iteration/plan/note/runner/layout MCP tools
- 暴露 schemas 和实验结果 MCP resources
- 提供 `.codex/skills/aiterlab/SKILL.md` 模板
- 提供 `.claude/commands` slash command 模板
- 提供 Claude Code hooks 示例
- 增加 agent integration test suite

验收：

- Codex 可以通过 MCP 或 CLI 创建实验、运行脚本、写 note、读取结果
- Claude Code 可以通过 MCP 或 CLI 完成同样流程
- 所有 agent-facing 输出都是 JSON 或 JSONL
- 所有失败都有结构化错误码
- 长任务可以查询、取消和回收

## 6. v0.1 具体 Sprint

### Sprint 1：脚手架

- 建 pnpm workspace
- 建 shared-schema
- 建 server
- 建 web
- 建 runner 空包
- 建 realtime-stream 空包
- 建 mcp-server 空包
- 建 agent-adapters 空包

产出：

- 项目能安装依赖
- 项目能启动空白 web 和 server

### Sprint 2：模拟实验闭环

- 创建 mock runner
- 模拟 3 轮 iteration
- 生成 logs
- 生成 metrics
- 生成 AI note
- 保存到 `data/experiments`

产出：

- 不接真实实验，也能演示 aiterlab 的核心价值

### Sprint 3：实时工作台

- WebSocket 连接
- in-process event bus
- JSONL persistence
- AI plan panel
- log panel
- metric chart
- AI note panel
- iteration timeline

产出：

- 人类可以实时看见 AI 实验迭代过程

### Sprint 4：真实 Python runner

- 接入 Python 脚本
- 隐藏 Windows 控制台窗口
- 捕获 stdout/stderr
- 支持 cancel/timeout

产出：

- 解决当前 Python 弹窗和命令卡死问题

### Sprint 5：Agent 调用闭环

- 实现 `aiterlab --json`
- 实现 `aiterlab event stream --jsonl`
- 实现 `aiterlab mcp serve`
- 提供 Codex skill 模板
- 提供 Claude Code slash command 模板

产出：

- Codex/Claude Code 可以稳定调用 aiterlab，不需要人工点击 UI

### Sprint 6：并发推流

- 支持多个 runner 同时运行
- 支持 `runId` 隔离
- 支持 ring buffer
- 支持背压
- 支持断线重连

产出：

- aiterlab 能承载真正的并发 AI 实验，而不是单进程演示

## 7. 技术决策

首版固定：

```text
TypeScript-first
Node.js 24 LTS
React 19
Vite
Fastify
WebSocket
Realtime event bus
SQLite
Drizzle ORM
Zod
Apache ECharts
pnpm workspace
```

后续再加：

```text
Tauri 2 desktop
Python SDK
remote runner
plugin system
cloud sync
```

Agent 调用层固定：

```text
CLI JSON/JSONL
Realtime streaming
MCP server
Filesystem contract
Codex skill template
Claude Code slash command template
Claude Code hooks examples
```

## 8. 开源发布前检查

- 确认 GitHub 仓库名 `aiterlab` 可用
- 确认 npm scope `@aiterlab` 或备用 scope 可用
- 添加 License
- 添加 CONTRIBUTING
- 添加 CODE_OF_CONDUCT
- 添加 examples
- 添加 demo gif 或截图
- 添加 README quick start

## 9. 推荐下一步

直接进入 Phase 0 和 Phase 1：

```text
先搭 monorepo，再写 shared schema。
```

这会让后面的 UI、server、runner 都围绕同一套协议展开，避免一边写一边改数据结构。



