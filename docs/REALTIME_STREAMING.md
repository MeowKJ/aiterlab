# AIterLab Realtime Streaming

AIterLab 必须支持实时推流、多进程、多线程和多 runner 并发实验。

这意味着平台不能只是假设“一个脚本跑完再读文件”。实验运行时，多个进程、线程、worker、设备采集器或 AI agent 都应该可以持续推送日志、指标、波形、图片、文件事件和 AI note observation。

## 1. 设计目标

- 支持实时推送事件到 UI、CLI、MCP client 和历史文件
- 支持多个 runner 同时写入同一个实验或不同实验
- 支持多进程和多线程生产事件
- 支持高频指标、波形、日志和低频状态事件共存
- 支持背压、采样、批处理和限流
- 支持进程崩溃后的事件恢复和尾随读取
- 保证事件可审计、可排序、可持久化

## 2. 核心架构

推荐采用本地事件总线模型：

```text
Runner Process / Thread
  -> Event Ingest API / Local IPC / CLI stdin
  -> Event Bus
  -> Stream Fanout
  -> WebSocket clients
  -> CLI JSONL stream
  -> MCP resources/tools
  -> JSONL persistence
  -> SQLite index
```

首版可以先用进程内 event bus，接口保持未来可替换：

```text
v0.1: in-process event bus
v0.2: worker/process-safe event writer
v0.3: optional broker adapter
v0.4: remote runner streaming
```

## 3. 事件入口

AIterLab 应支持 5 种实时事件入口：

- Runner stdout/stderr：外部脚本输出被捕获并转换成事件。
- CLI stdin：agent 或脚本通过 `aiterlab event push --jsonl --stdin` 推入事件。
- HTTP ingest：外部进程通过本地 API 推送事件。
- WebSocket ingest：长连接生产者持续推送事件。
- Local IPC：桌面版、本地 runner 或设备进程通过命名管道、Unix socket、Tauri bridge 推送。

## 4. 事件类型

首版事件类型：

```text
run.started
run.heartbeat
run.completed
run.failed
run.cancelled
runner.log
metric
waveform.chunk
file.created
figure.created
plan.updated
note.observation
note.finalized
layout.updated
system.warning
system.error
```

所有事件都必须包含：

```json
{
  "id": "evt_001",
  "type": "metric",
  "experimentId": "exp_001",
  "iterationId": "iter_001",
  "runId": "run_001",
  "timestamp": "2026-04-27T10:00:00Z",
  "source": {
    "kind": "runner",
    "id": "runner_001",
    "pid": 1234,
    "threadId": "worker_2"
  },
  "sequence": 42
}
```

## 5. 多进程/多线程模型

服务端维护 runner supervisor：

```text
RunnerSupervisor
  -> RunRegistry
  -> ProcessManager
  -> StreamCollector
  -> EventPublisher
```

Runner supervisor 职责：

- 启动多个 runner
- 分配 `runId`
- 记录 PID
- 监听 stdout/stderr
- 心跳检测
- 超时控制
- 取消和回收进程
- 将所有输出转成事件

Node worker threads 可用于：

- 大日志解析
- 高频指标聚合
- 波形降采样
- 图片缩略图生成
- SQLite 批量写入

外部实验脚本必须以 child process 运行，每个 child process 有独立 `runId`，退出码转成 `run.completed` 或 `run.failed`。

Python 实验内部可以自己开线程或进程，但推荐通过 aiterlab SDK 或 stdout JSONL 推送事件：

```python
print('{"type":"metric","name":"loss","value":0.183}', flush=True)
```

## 6. 排序与一致性

事件排序规则：

- 每个 `runId` 内使用递增 `sequence`
- 全局显示优先按 `timestamp`
- 同时间戳事件按接收顺序排序
- 持久化时写入 `receivedAt`
- UI 显示允许轻微乱序修正窗口

原则：

- 不要求跨进程严格全局顺序
- 要求单 runner 内顺序稳定
- 要求事件可追踪来源

## 7. 背压与限流

高频数据必须有背压策略：

- 日志按行切分，超过长度截断并保留原始文件
- metric 可批量写入
- waveform 默认 chunk 化
- UI 只订阅当前可见窗口需要的数据
- 图表层做降采样
- WebSocket client 慢时丢弃可重建事件
- 关键事件永不丢弃

事件优先级：

```text
critical: run.failed, system.error, note.finalized
normal: plan.updated, metric, runner.log
bulk: waveform.chunk, debug log, raw samples
```

## 8. 持久化

实时事件同时写入：

```text
events.jsonl
metrics.jsonl
logs/*.log
artifacts/*
SQLite index
```

写入策略：

- JSONL 追加写
- SQLite 存索引字段
- 大型波形或图像写文件
- JSONL 中只保存引用和摘要
- 批量 flush，避免每个点都 fsync

## 9. WebSocket 广播

推荐频道：

```text
/ws/experiments/{experimentId}
/ws/iterations/{iterationId}
/ws/runs/{runId}
/ws/events
```

订阅参数：

```json
{
  "experimentId": "exp_001",
  "iterationId": "iter_001",
  "types": ["metric", "runner.log", "plan.updated"],
  "since": "evt_100"
}
```

支持恢复：

- client 断线后带 `since` 重连
- server 从 JSONL 或内存 ring buffer 补发
- 超出 buffer 则返回需要 reload 的提示

## 10. CLI 实时流

Agent 需要用 CLI 直接消费实时事件：

```text
aiterlab event stream --experiment exp_001 --jsonl
aiterlab run "python train.py" --jsonl
aiterlab metric watch --iteration iter_001 --jsonl
```

CLI 输出规则：

- 一行一个 JSON
- 不混入 spinner/progress bar
- stderr 只输出结构化错误或诊断
- 支持 `--types metric,runner.log`
- 支持 `--since evt_100`

## 11. MCP 实时读取

MCP 初期不一定直接维持高频流，但必须支持：

- 获取最近事件
- 获取 run 状态
- 获取指标摘要
- 获取日志尾部
- 读取 JSONL resource

MCP tools：

```text
aiterlab_get_recent_events
aiterlab_get_run_status
aiterlab_tail_logs
aiterlab_query_metrics
aiterlab_get_stream_manifest
```

## 12. 实施优先级

v0.1：

- in-process event bus
- WebSocket broadcast
- JSONL persistence
- CLI `event stream --jsonl`
- runner stdout/stderr streaming

v0.2：

- 多 runner 并发
- run registry
- process tree cleanup
- backpressure
- ring buffer reconnect

v0.3：

- worker threads for parsing/downsampling
- Python SDK event push
- HTTP/WebSocket ingest
- waveform chunking

v0.4：

- remote runner
- optional broker adapter
- distributed experiments
- desktop IPC

## 13. 验收标准

最低标准：

- 同时运行多个实验脚本时，事件不会串线
- 每个 run 都有独立 `runId`
- stdout/stderr 能实时进入 UI 和 JSONL
- CLI 可以消费实时流
- UI 断线重连后能恢复最近事件
- 高频指标不会卡死 UI
- Python 子进程不会弹窗或阻塞平台
- 取消实验后相关进程能回收



