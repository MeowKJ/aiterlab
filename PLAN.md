# AIterLab 项目规划

## 1. 项目定义

`AIterLab` 是一个开源工具，用来记录、展示和管理 AI agent 在连续实验中的完整过程。

它的核心不是“控制某个单独设备”，而是把 AI 每一轮实验的计划、执行、实时结果、判断笔记和下一轮计划都结构化保存下来，并用实时 UI 展示出来。

一句话定位：

```text
给 AI 迭代实验用的实时 observability + result hub + AI note 工具。
```

项目命名：

```text
AIterLab = AI + Iteration + Lab
repo: aiterlab
cli: aiterlab
packages: @aiterlab/*
```

## 2. 核心对象

平台围绕 5 个核心对象设计：

- `Experiment`：一次完整实验主题，例如“优化某个模型参数”或“测试某套设备流程”
- `Iteration`：一次 AI 迭代尝试，是实验中的最小分析闭环
- `Plan`：AI 当前计划、已完成步骤和未来步骤
- `Result`：指标、图表、波形、文件、日志、快照
- `AI Note`：AI 对每轮实验的假设、观察、解释、失败分析和下一步判断
- `Evaluation`：ABCD 评分、是否达到 A、下一轮推荐

## 3. 产品目标

### 3.0 Codex / Claude Code 调用友好

AIterLab 必须让 coding agent 易于调用。Codex、Claude Code 和其他 agent 应该可以不依赖前端 UI，直接通过 CLI、MCP、JSON 文件和 WebSocket/API 完成核心流程。

核心要求：

- 所有核心动作都有非交互式 CLI
- 所有 CLI 输出支持 `--json` 或 `--jsonl`
- 提供官方 MCP server
- 提供 Codex skill 模板
- 提供 Claude Code slash command 和 hooks 模板
- 所有状态、错误、事件都有稳定 schema
- 长任务可查询、可取消、可回收

详细设计见 [Agent 调用集成](</C:/Users/ijink/Documents/New project/aiterlab/docs/AGENT_INTEGRATION.md>)。

### 3.1 AI 可完全操作

AI 应该可以通过结构化 API 完成这些动作：

- 创建实验
- 创建新迭代
- 写入和更新 plan
- 启动实验执行器
- 追加实时日志和指标
- 写入 AI note
- 标记实验成功、失败、暂停、取消
- 调整 UI widget 的位置、大小、数据源和显示类型
- 归档实验结果

关键原则：

- 所有动作必须可追踪
- 所有状态必须有时间戳
- AI 写入的数据必须是结构化的
- 人类可随时查看 AI 为什么这样做

### 3.2 AI plan 实时显示

UI 必须显示：

- 当前运行步骤
- 已完成步骤
- 未来计划
- 每一步开始时间
- 每一步结束时间
- 每一步运行时长
- 整体实验运行时长
- 状态变化事件

计划项建议状态：

```text
pending
running
completed
failed
cancelled
paused
scheduled
skipped
```

### 3.3 AI note 是一等公民

AI note 不是普通日志，而是 AI 对实验的“思考记录”。

每一轮迭代至少应该支持：

- 本轮假设
- 本轮动作
- 实时观察
- 结果摘要
- 异常和失败原因
- AI 判断
- 下一轮计划
- 关联图表、日志、文件和指标

AI note 要支持两种形式：

- 结构化字段，方便机器检索和二次分析
- Markdown 正文，方便人类阅读

### 3.4 实时结果展示

平台应支持这些实时数据：

- 日志流
- 指标流
- 曲线图
- 波形图
- 图像快照
- 文件生成事件
- 异常事件
- 多进程/多线程 runner 推送的并发事件
- 外部脚本通过 CLI、HTTP、WebSocket 或 SDK 推入的实时流

数据进入平台后，应统一转成带时间戳的事件：

```json
{
  "type": "metric",
  "experimentId": "exp_001",
  "iterationId": "iter_003",
  "timestamp": "2026-04-27T10:00:00Z",
  "name": "loss",
  "value": 0.183
}
```

实时流设计必须支持：

- 多 runner 并发
- stdout/stderr 实时捕获
- JSONL 追加持久化
- WebSocket 广播
- CLI `--jsonl` 消费
- 断线重连
- 背压和降采样
- 进程取消和回收

详细设计见 [实时流与并发](</C:/Users/ijink/Documents/New project/aiterlab/docs/REALTIME_STREAMING.md>)。

### 3.6 ABCD 自动评分

AIterLab 使用 ABCD 评分机制判断每轮迭代是否达标。首版目标是自动迭代到 `A`：

- `A`：达到目标，停止迭代
- `B`：接近目标，小幅增强下一轮 candidate
- `C`：需要改进，中幅增强下一轮 candidate
- `D`：明显不足，大幅调整下一轮 candidate

评分维度：

- outcome
- trend
- stability
- noteQuality
- runHealth

详细设计见 [ABCD 评分机制](</C:/Users/ijink/Documents/New project/aiterlab/docs/SCORING.md>)。

### 3.5 超高 AI 可编辑 UI

UI 要对 AI 友好，不能只面向鼠标操作。

每个界面组件都应该有：

- 唯一 ID
- 类型
- 位置
- 大小
- 数据源
- 显示配置
- 版本号

AI 可以通过 JSON 修改布局，例如：

```json
{
  "id": "widget_loss_curve",
  "type": "line-chart",
  "x": 0,
  "y": 0,
  "w": 8,
  "h": 4,
  "dataSource": "metric://loss"
}
```

首版 widget：

- AI plan panel
- AI note panel
- realtime log panel
- metric card
- line chart
- waveform chart
- file browser
- iteration timeline

## 4. 历史实验管理

历史实验以文件夹为核心，方便开源协作、版本管理、压缩迁移和跨平台访问。

建议结构：

```text
experiments/
  2026-04-27_exp001/
    experiment.json
    index.json
    iterations/
      iter_001/
        plan.json
        ai_note.md
        ai_note.json
        events.jsonl
        metrics.jsonl
        logs/
        figures/
        results/
        snapshots/
```

设计原则：

- 原始文件不强行塞进数据库
- 元数据和索引用 SQLite 或 JSON 管理
- 大数据、图像、波形、日志保留在文件系统
- 每轮迭代可以单独打开、回放、复盘

## 5. 技术路线建议

详细选型见 [技术栈规划](</C:/Users/ijink/Documents/New project/aiterlab/docs/TECH_STACK.md>)。

### 5.1 前端

推荐：

- React 19
- TypeScript
- Vite
- 可拖拽 grid layout
- 图表库用于时序曲线和波形

前端重点：

- 第一屏就是实验工作台
- 不做营销落地页
- 支持实时流刷新
- 支持历史迭代切换
- 支持 AI 通过 schema 编辑 UI

### 5.2 后端

推荐：

- Node.js 24 LTS
- TypeScript
- Fastify
- WebSocket
- SQLite
- Drizzle ORM
- WebSocket 推送实时事件
- 文件系统存实验资产

如果实验脚本主要是 Python，Python 应作为 runner/plugin 接入；平台主服务仍推荐 TypeScript-first。

### 5.3 实验执行器

执行器负责运行外部实验脚本、采集日志、回收进程。

必须解决：

- Python 弹窗
- 前台阻塞
- 进程无法回收
- 实验结束后命令卡住

Windows 策略：

- 后台启动子进程
- 隐藏控制台窗口
- 捕获 stdout/stderr
- 设置超时
- 支持强制终止
- 实验结束后自动释放句柄

## 6. MVP

第一版先做最小闭环：

1. 创建实验
2. 创建迭代
3. 显示 AI plan
4. 后台运行一个示例实验脚本
5. 实时显示日志和指标
6. 写入 AI note
7. 保存结果到实验文件夹
8. 从历史实验列表重新打开

MVP 页面：

- 当前实验工作台
- 迭代时间线
- AI plan 面板
- AI note 面板
- 实时日志
- 实时图表
- 历史实验浏览器

## 7. 开源仓库结构

建议结构：

```text
aiterlab/
  README.md
  PLAN.md
  docs/
    AI_NOTE_SPEC.md
    DATA_MODEL.md
    ROADMAP.md
  apps/
    web/
    server/
  packages/
    shared-schema/
    experiment-runner/
    realtime-stream/
    evaluator/
    mcp-server/
    agent-adapters/
    ui-widgets/
  data/
    experiments/
```

## 8. 开发阶段

### Phase 1：开放规格

- 定义 experiment/iteration/plan/result/AI note 数据模型
- 定义实验文件夹结构
- 定义实时事件格式
- 定义 UI widget schema

### Phase 2：可运行 demo

- 初始化 web/server
- 实现本地实验目录扫描
- 实现示例执行器
- 实现实时日志和指标推送
- 实现 AI note 写入

### Phase 3：可用工作台

- 实验列表
- 迭代时间线
- 实时图表
- AI plan 面板
- AI note 编辑和历史查看
- 布局保存与恢复

### Phase 4：开源可扩展

- 插件式实验执行器
- 多语言 SDK
- CLI
- MCP server
- Codex/Claude Code adapter
- 多进程/多线程实时流
- 导入导出
- 文档站点

## 9. 风险与原则

主要风险：

- AI note 变成普通日志，失去推理价值
- 实时图表数据过大导致 UI 卡顿
- 不同实验格式混乱
- AI 编辑 UI 时误改关键面板
- 外部实验脚本阻塞平台

设计原则：

- AI note 必须结构化
- 实时流必须可采样和限速
- 文件夹规范必须稳定
- UI 布局必须版本化
- 执行器必须可终止、可回收、可后台运行

## 10. 下一步实施建议

最建议的下一步：

1. 按 [实施计划](</C:/Users/ijink/Documents/New project/aiterlab/docs/IMPLEMENTATION_PLAN.md>) 初始化 monorepo
2. 初始化 `apps/web` 和 `apps/server`
3. 先做一个本地 demo：模拟 AI 连续 3 轮实验，实时写入 plan、metric、log、AI note
4. 再把真实实验脚本接入后台执行器
5. 最后补 CLI、Tauri 桌面版和插件系统



