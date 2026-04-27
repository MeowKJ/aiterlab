# AIterLab 技术栈规划

更新时间：2026-04-27

## 1. 总体策略

推荐采用 TypeScript-first monorepo。

原因：

- 前端、后端、共享 Schema、AI 可编辑 UI 协议都可以使用同一套类型系统。
- AI 更容易读写 JSON Schema、TypeScript 类型和组件配置。
- 开源用户更容易本地启动，不必先理解复杂分布式架构。
- Python 实验脚本可以作为 runner/plugin 接入，而不是把整个平台绑死在 Python 进程模型上。

核心语言分工：

```text
TypeScript: UI、API、实时网关、数据模型、AI layout schema、CLI
Python: 实验脚本适配器、科研/模型/设备脚本 runner
Rust: 可选桌面封装层，用于 Tauri 桌面应用
SQL: SQLite 本地索引和元数据查询
Markdown/JSONL: AI note、事件流、历史实验文件
```

## 2. 推荐架构

```text
apps/
  web/          React 实时工作台
  server/       API、WebSocket、实验索引、runner 调度
  desktop/      可选 Tauri 桌面壳
packages/
  shared-schema/     Zod/TypeScript 数据模型
  experiment-runner/ 后台实验执行器
  realtime-stream/   实时事件总线、JSONL、WebSocket fanout
  mcp-server/        Codex/Claude Code 可调用 MCP server
  agent-adapters/    Codex skill 和 Claude Code 命令模板
  ui-widgets/        可编辑 widget 系统
  ai-note/           AI note 模板、解析、索引
data/
  experiments/       本地实验结果
```

## 3. 前端

推荐：

- React 19
- TypeScript
- Vite
- TanStack Router
- TanStack Query
- Zustand
- Apache ECharts
- React Grid Layout 或类似 grid layout 库
- Tailwind CSS
- shadcn/ui 作为基础组件参考，不直接做成重装饰风格
- lucide-react 图标

选择理由：

- React 19 是当前稳定主线，适合长期维护。
- Vite 适合开源工具快速开发和本地启动。
- TanStack Router 提供强类型路由和搜索参数，适合实验筛选、历史回放、widget 状态同步。
- TanStack Query 适合管理实验列表、历史数据、API 缓存。
- Zustand 适合本地 UI layout、当前实验上下文、实时面板状态。
- ECharts 对实时曲线、波形、时间序列、缩放和大量点位更友好。

前端第一版页面：

- 当前实验工作台
- AI plan 面板
- AI note 面板
- 实时日志面板
- 实时指标曲线
- 波形图
- 历史实验浏览器
- Iteration 时间线

## 4. 后端

推荐首选：

- Node.js 24 LTS
- TypeScript
- Fastify
- WebSocket
- Drizzle ORM
- SQLite
- Zod

为什么不首选纯 Python 后端：

- 这个工具的核心是实时 UI、结构化 Schema、AI 可编辑布局和开源本地工具，TypeScript 端到端类型一致性更重要。
- Python 更适合实验脚本生态，但不适合作为唯一平台语言去承载 UI schema、layout protocol 和桌面端桥接。
- Python runner 仍然是一等模块，只是不直接控制平台主进程生命周期。

后端职责：

- 实验/迭代 CRUD
- AI plan 写入与状态更新
- AI note 写入、解析、索引
- 实时事件 WebSocket 推送
- 实时事件总线
- 多 runner 并发调度
- 实验文件夹扫描
- SQLite 索引
- 后台 runner 调度
- stdout/stderr 捕获
- 进程超时和回收

## 5. 实验 Runner

Runner 是这个项目最关键的基础设施之一。

推荐实现：

- `packages/experiment-runner` 使用 TypeScript
- 通过 Node `child_process.spawn` 启动外部脚本
- 通过 `@aiterlab/realtime-stream` 推送运行事件
- Windows 使用隐藏窗口配置，避免弹出 Python 控制台
- stdout/stderr 按行转成实时事件
- 支持 timeout、cancel、kill、cleanup
- 支持 Python、Node、shell、可执行文件四类任务
- 支持多个 runner 同时运行

Runner 事件统一格式：

```json
{
  "type": "runner.log",
  "experimentId": "exp_001",
  "iterationId": "iter_001",
  "timestamp": "2026-04-27T10:00:00Z",
  "stream": "stdout",
  "message": "step started"
}
```

## 6. 数据层

推荐：

- SQLite 保存索引、状态、查询字段
- 文件系统保存原始结果、日志、图像、波形和 AI note
- JSONL 保存实时事件流
- Markdown + JSON 保存 AI note

ORM：

- Drizzle ORM

Schema：

- Zod 作为运行时校验
- TypeScript 类型由 Zod 推导
- 后续可导出 JSON Schema 给外部 agent 使用

为什么这样分层：

- SQLite 方便查询历史实验。
- 文件夹结构方便开源协作和迁移。
- JSONL 适合追加写入实时事件。
- Markdown 适合人类读 AI note。

## 7. 桌面端

第一阶段不强制做桌面端。

推荐路线：

- v0.1-v0.2：Web app + local server
- v0.3：加入 CLI
- v0.4：用 Tauri 2 封装桌面版

选择 Tauri 2 的原因：

- 体积小
- 跨 Windows/macOS/Linux
- 可以复用现有 Web 前端
- 后续可做本地文件权限、托盘、系统通知、打开实验文件夹等能力

不建议首版直接 Electron：

- 体积更大
- 对这个工具的本地实验管理场景来说，Tauri 更轻

## 8. 实时通信

首版推荐：

- `@aiterlab/realtime-stream`
- in-process event bus
- WebSocket
- CLI JSONL stream
- JSONL persistence
- 服务端事件格式统一为 JSON
- 前端按 `experimentId + iterationId + eventType` 订阅
- 多进程/多线程通过 runner、HTTP ingest、WebSocket ingest 或 CLI stdin 推送事件

未来可加：

- Server-Sent Events：用于只读事件流
- gRPC：用于远程 runner
- MQTT/NATS：用于设备和分布式实验

首版不要过早引入消息队列。

Realtime stream 组件职责：

- event ingest
- event validation
- event sequencing
- stream fanout
- JSONL writer
- ring buffer
- backpressure
- reconnect replay
- metric batching
- waveform chunk references

## 9. AI Note

推荐：

- Markdown 用于阅读
- JSON 用于检索和 AI 二次处理
- JSONL 用于实时追加观察

AI note 模块语言：

- TypeScript 主实现
- Python SDK 后续补充

核心能力：

- 创建 note
- 追加 observation
- finalize note
- 从事件流生成 note 摘要
- 按标签、失败原因、指标、时间检索 note

## 10. CLI

推荐：

- TypeScript
- Commander 或 `cac`
- 打包为 `aiterlab`

首版命令：

```text
aiterlab init
aiterlab dev
aiterlab run <script>
aiterlab list
aiterlab open <experiment-id>
aiterlab note append
```

## 11. Agent 调用层

推荐：

- MCP server 使用 TypeScript 实现
- CLI 和 MCP tools 共用 service 层
- 所有 CLI 输出支持 JSON/JSONL
- 所有 schema 由 `@aiterlab/shared-schema` 导出
- Codex 和 Claude Code adapter 只放模板和配置，不复制核心逻辑

包规划：

```text
@aiterlab/mcp-server
@aiterlab/agent-adapters
@aiterlab/realtime-stream
```

Agent 调用方式：

```text
Codex -> MCP tools 或 aiterlab CLI
Claude Code -> MCP tools、slash commands、hooks 或 aiterlab CLI
CI -> aiterlab CLI
其他 agent -> MCP tools 或 JSON/JSONL 文件协议
```

关键约束：

- 不要求 agent 解析前端 DOM
- 不要求 agent 进入交互式 TUI
- 不要求 agent 等待弹窗
- 长任务必须有 run id
- 长任务必须支持 status/cancel
- 错误必须有稳定 code

## 12. 版本路线

### v0.1

- React + Vite 工作台
- Fastify API
- WebSocket 实时事件
- SQLite + Drizzle
- 本地实验目录
- 模拟 runner
- AI note 写入
- CLI JSON/JSONL 输出
- in-process realtime event bus

### v0.2

- 真实 Python runner
- Windows 隐藏 Python 窗口
- 进程取消和回收
- 实时图表
- 历史实验打开
- MCP server
- Codex/Claude Code adapter 模板
- 多 runner 并发推流

### v0.3

- AI 可编辑 widget layout
- CLI
- 导入导出
- 数据模型稳定
- Agent integration test suite

### v0.4

- Tauri 桌面版
- 插件式 runner
- Python SDK
- 开源示例实验

## 13. 最终推荐

首版最优组合：

```text
Language: TypeScript-first + Python runner support
Runtime: Node.js 24 LTS
Frontend: React 19 + Vite + TanStack Router + TanStack Query
Realtime: @aiterlab/realtime-stream + WebSocket + JSONL
Backend: Fastify + TypeScript
Database: SQLite + Drizzle ORM
Validation: Zod
Charts: Apache ECharts
Layout: React grid layout
Notes: Markdown + JSON + JSONL
Desktop: Tauri 2 later
Package manager: pnpm workspace
```

这个组合能最大化满足：

- AI 可读写
- 实时显示
- 本地优先
- 跨平台
- 开源易启动
- 后续可桌面化
- Python 实验不会卡住主平台



