# AI Note 规格

AI note 是平台的核心数据之一，用于记录 AI 在每轮迭代实验中的推理、观察和下一步判断。

它不同于日志：

- 日志记录“发生了什么”
- AI note 记录“AI 为什么这样理解、为什么下一步这样做”

## 1. 设计目标

- 让人类能快速复盘 AI 的实验思路
- 让 AI 能检索过去的假设、失败原因和有效策略
- 让每轮实验的结果和判断建立明确关联
- 让开源协作者可以复现实验过程，而不是只看到最终结果

## 2. 文件形式

每轮迭代建议同时保存两份 note：

```text
ai_note.md
ai_note.json
```

- `ai_note.md` 给人类阅读
- `ai_note.json` 给 AI、脚本和索引器读取

## 3. Markdown 模板

```markdown
# AI Note

## Hypothesis

本轮实验的假设。

## Action

本轮实际做了什么。

## Observation

实时观察到的现象、指标变化、异常。

## Result

本轮结果摘要。

## Reasoning

AI 对结果的解释。

## Failure Analysis

如果失败，记录可能原因。

## Next Plan

下一轮计划。

## Links

- plan:
- metrics:
- logs:
- figures:
- files:
```

## 4. JSON Schema 草案

```json
{
  "id": "note_iter_001",
  "experimentId": "exp_001",
  "iterationId": "iter_001",
  "createdAt": "2026-04-27T10:00:00Z",
  "updatedAt": "2026-04-27T10:03:00Z",
  "hypothesis": "降低学习率可能让 loss 更稳定。",
  "action": "将 learning_rate 从 0.001 调整为 0.0005。",
  "observation": [
    "前 30 秒 loss 下降更平滑。",
    "第 42 秒出现一次 spike。"
  ],
  "result": "整体收敛更稳定，但速度变慢。",
  "reasoning": "较低学习率减少了震荡，但也降低了更新速度。",
  "failureAnalysis": null,
  "nextPlan": "下一轮尝试 learning_rate=0.0007，并增加早停监控。",
  "links": {
    "plan": "plan.json",
    "metrics": ["metrics.jsonl"],
    "logs": ["logs/run.log"],
    "figures": ["figures/loss.png"],
    "files": []
  },
  "tags": ["learning-rate", "stability"],
  "confidence": 0.72
}
```

## 5. Note 生命周期

建议状态：

```text
draft
streaming
finalized
revised
archived
```

典型流程：

```text
创建迭代 -> 写入初始假设 -> 实时追加观察 -> 实验结束 -> 写入结论 -> 生成下一轮计划
```

## 6. 检索维度

AI note 应该可以按这些维度检索：

- 实验 ID
- 迭代 ID
- 时间
- 标签
- 成功/失败
- 指标名称
- 关联文件
- 假设关键词
- 失败原因
- 下一步动作



