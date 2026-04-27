# AIterLab Agent Integration

AIterLab 必须对 Codex、Claude Code 和其他 coding agent 调用友好。

这不是附加功能，而是核心设计目标：AI agent 应该能稳定地创建实验、运行迭代、写入 AI note、读取结果、更新 plan、调整 UI，而不需要依赖脆弱的人工界面操作。

## 1. 设计目标

- Agent 可以通过 CLI 完成所有核心动作
- Agent 可以通过 MCP server 发现和调用 aiterlab 工具
- Agent 可以用 JSON/JSONL 读写状态，不解析人类 UI 文本
- Agent 可以非交互式运行，不被 prompt、弹窗、TUI 卡住
- Agent 可以在 Codex、Claude Code、CI、本地终端中一致使用
- Agent 写入的每个动作都可审计、可回放、可关联到实验和迭代

## 2. 支持面

首版需要同时提供三层调用方式：

```text
CLI       -> 适合 Codex/Claude Code 直接 shell 调用
MCP       -> 适合 Codex/Claude Code 作为工具发现和调用
Files/API -> 适合最小依赖、离线、CI 和手工调试
```

## 3. CLI 设计原则

CLI 必须 agent-friendly。

规则：

- 所有命令支持 `--json`
- 实时流支持 `--jsonl`
- 所有写操作支持 `--yes` 跳过确认
- 所有写操作支持 `--dry-run`
- 所有命令有稳定 exit code
- 所有命令可设置 `--workspace`
- 支持从 stdin 读取 JSON
- 支持将输出写入文件
- 不默认打开浏览器
- 不默认进入交互式 TUI
- 错误输出也必须结构化

错误格式：

```json
{
  "ok": false,
  "error": {
    "code": "RUNNER_TIMEOUT",
    "message": "Runner exceeded timeout.",
    "details": {
      "timeoutMs": 60000
    }
  }
}
```

成功格式：

```json
{
  "ok": true,
  "data": {
    "experimentId": "exp_001",
    "iterationId": "iter_001"
  }
}
```

## 4. CLI 命令规划

### Project

```text
aiterlab init --workspace . --json
aiterlab doctor --json
aiterlab dev --port 4317
```

### Experiment

```text
aiterlab experiment create --name "loss tuning" --json
aiterlab experiment list --json
aiterlab experiment get exp_001 --json
aiterlab experiment open exp_001
aiterlab experiment archive exp_001 --yes --json
```

### Iteration

```text
aiterlab iteration create --experiment exp_001 --json
aiterlab iteration list --experiment exp_001 --json
aiterlab iteration finalize iter_001 --status completed --json
```

### Plan

```text
aiterlab plan set --iteration iter_001 --file plan.json --json
aiterlab plan append --iteration iter_001 --title "Run candidate A" --json
aiterlab plan update plan_001 --status running --json
aiterlab plan list --iteration iter_001 --json
```

### Runner

```text
aiterlab run "python train.py" --experiment exp_001 --iteration iter_001 --jsonl
aiterlab run "python train.py" --timeout 60000 --hide-window --jsonl
aiterlab run cancel run_001 --json
aiterlab run status run_001 --json
```

### AI Note

```text
aiterlab note create --iteration iter_001 --json
aiterlab note append --iteration iter_001 --section observation --stdin --json
aiterlab note finalize --iteration iter_001 --file ai_note.json --json
aiterlab note get --iteration iter_001 --format markdown
```

### Events

```text
aiterlab event append --iteration iter_001 --stdin --json
aiterlab event push --iteration iter_001 --jsonl --stdin
aiterlab event stream --experiment exp_001 --jsonl
aiterlab event stream --run run_001 --types metric,runner.log --since evt_100 --jsonl
aiterlab metric append --iteration iter_001 --name loss --value 0.183 --json
```

### UI Layout

```text
aiterlab layout get --experiment exp_001 --json
aiterlab layout patch --experiment exp_001 --stdin --json
aiterlab layout reset --experiment exp_001 --yes --json
```

## 5. MCP Server

AIterLab 应提供官方 MCP server：

```text
@aiterlab/mcp-server
```

启动方式：

```text
aiterlab mcp serve
```

MCP tools 草案：

```text
aiterlab_create_experiment
aiterlab_list_experiments
aiterlab_create_iteration
aiterlab_update_plan
aiterlab_run_command
aiterlab_cancel_run
aiterlab_append_ai_note
aiterlab_finalize_ai_note
aiterlab_append_event
aiterlab_query_metrics
aiterlab_get_recent_events
aiterlab_tail_logs
aiterlab_get_run_status
aiterlab_get_experiment_summary
aiterlab_patch_layout
```

MCP resources 草案：

```text
aiterlab://experiments
aiterlab://experiments/{experimentId}
aiterlab://experiments/{experimentId}/iterations
aiterlab://iterations/{iterationId}/note
aiterlab://iterations/{iterationId}/events
aiterlab://runs/{runId}/events
aiterlab://runs/{runId}/logs
aiterlab://schemas
aiterlab://schemas/experiment
aiterlab://schemas/ai-note
aiterlab://schemas/widget-layout
```

MCP prompts 草案：

```text
aiterlab_summarize_iteration
aiterlab_plan_next_iteration
aiterlab_analyze_failure
aiterlab_prepare_reproduction_report
```

## 6. Claude Code 友好设计

Claude Code 适配目标：

- 通过 MCP 连接 aiterlab
- 通过 slash commands 快速调用常用流程
- 通过 hooks 在代码修改、测试结束、实验结束时自动写 note
- 通过纯 CLI 在无 MCP 时降级运行

建议仓库提供：

```text
.claude/
  commands/
    aiterlab-start.md
    aiterlab-run.md
    aiterlab-note.md
    aiterlab-summary.md
  hooks/
    aiterlab-after-test.json
    aiterlab-after-run.json
```

Slash command 示例：

```text
/aiterlab-run
Create a new aiterlab iteration, run the selected experiment command, stream logs, then summarize the result into an AI note.
```

Hook 用途：

- 测试失败后追加 failure analysis
- 实验结束后 finalize note
- 运行超时后记录 runner timeout
- 生成图表后关联 figure 文件

## 7. Codex 友好设计

Codex 适配目标：

- 通过 MCP 调用 aiterlab
- 通过 shell 命令使用 `aiterlab --json`
- 通过项目内说明文件理解实验协议
- 通过非交互式命令完成端到端实验

建议仓库提供：

```text
.codex/
  skills/
    aiterlab/
      SKILL.md
  commands/
    aiterlab-run.md
    aiterlab-note.md
```

Codex 使用原则：

- 首选 MCP tools
- 无 MCP 时使用 CLI
- 任何命令都加 `--json` 或 `--jsonl`
- 长任务通过 `aiterlab run status` 查询
- 写 note 使用 stdin 或 JSON 文件
- 不要求 Codex 解析前端 DOM

## 8. Agent Output Contract

所有 agent-facing 输出必须遵守：

- `ok` 字段表示成功失败
- `data` 字段放业务结果
- `error` 字段放错误对象
- `warnings` 字段放非阻塞警告
- `traceId` 用于关联日志
- 时间统一 ISO 8601
- ID 稳定、短、可读

事件流使用 JSONL：

```jsonl
{"type":"run.started","runId":"run_001","timestamp":"2026-04-27T10:00:00Z"}
{"type":"runner.log","stream":"stdout","message":"epoch 1","timestamp":"2026-04-27T10:00:01Z"}
{"type":"metric","name":"loss","value":0.183,"timestamp":"2026-04-27T10:00:02Z"}
{"type":"run.completed","runId":"run_001","timestamp":"2026-04-27T10:00:10Z"}
```

## 9. Filesystem Contract

Agent 必须能直接通过文件系统理解实验。

最小约定：

```text
experiments/
  exp_001/
    experiment.json
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
```

每个目录都应该有机器可读索引：

```text
index.json
```

## 10. 安全边界

Agent 调用能力很强，必须有安全约束。

首版策略：

- 默认只操作当前 workspace
- runner 默认只能在允许目录内执行
- 删除和归档需要 `--yes`
- MCP tools 需要声明 destructive/non-destructive
- 记录所有 agent 写操作
- 支持 dry-run
- 支持最大运行时长
- 支持最大输出大小

## 11. 实施优先级

v0.1：

- CLI JSON/JSONL 输出
- 实验/迭代/note/runner 命令
- 文件系统 contract
- Agent output contract

v0.2：

- MCP server
- Codex skill 模板
- Claude Code slash command 模板

v0.3：

- hooks 示例
- prompts 示例
- schema export
- agent integration test suite

## 12. 验收标准

AIterLab 对 agent 友好的最低标准：

- Codex 可以用命令行创建实验、运行脚本、写 AI note、读取结果
- Claude Code 可以通过 MCP 或 CLI 完成同样流程
- 所有自动化流程都不需要人类点击 UI
- 所有输出都能被 JSON parser 稳定读取
- 实验结束后不会留下阻塞进程
- 失败时能返回结构化错误，而不是只打印文本



