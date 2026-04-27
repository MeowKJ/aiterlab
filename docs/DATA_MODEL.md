# 数据模型草案

## Experiment

```json
{
  "id": "exp_001",
  "name": "AI 迭代实验",
  "description": "测试 AI 连续调整参数并记录结果。",
  "status": "running",
  "createdAt": "2026-04-27T10:00:00Z",
  "updatedAt": "2026-04-27T10:10:00Z",
  "rootDir": "experiments/2026-04-27_exp001"
}
```

## Iteration

```json
{
  "id": "iter_001",
  "experimentId": "exp_001",
  "index": 1,
  "status": "completed",
  "startedAt": "2026-04-27T10:00:00Z",
  "endedAt": "2026-04-27T10:05:00Z",
  "durationMs": 300000
}
```

## Plan Item

```json
{
  "id": "plan_001",
  "experimentId": "exp_001",
  "iterationId": "iter_001",
  "title": "运行参数组合 A",
  "status": "running",
  "startedAt": "2026-04-27T10:01:00Z",
  "endedAt": null,
  "durationMs": 82000,
  "order": 1
}
```

## Event

```json
{
  "id": "evt_001",
  "type": "log",
  "experimentId": "exp_001",
  "iterationId": "iter_001",
  "timestamp": "2026-04-27T10:02:00Z",
  "level": "info",
  "message": "iteration started"
}
```

## Metric

```json
{
  "type": "metric",
  "experimentId": "exp_001",
  "iterationId": "iter_001",
  "timestamp": "2026-04-27T10:02:10Z",
  "name": "score",
  "value": 0.87,
  "unit": null
}
```

## UI Widget

```json
{
  "id": "widget_ai_note",
  "type": "ai-note",
  "x": 8,
  "y": 0,
  "w": 4,
  "h": 8,
  "dataSource": "note://current",
  "version": 1
}
```



