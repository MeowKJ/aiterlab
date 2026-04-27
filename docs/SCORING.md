# AIterLab ABCD Scoring

AIterLab 使用 ABCD 评分机制判断一次 AI 迭代实验是否已经达到可接受质量。

目标：

```text
自动迭代，直到评分达到 A。
```

## 1. 等级

```text
A: score >= 0.85
B: score >= 0.70
C: score >= 0.55
D: score < 0.55
```

首版达到 `A` 后自动停止迭代，并发布：

```text
experiment.target_reached
```

## 2. 评分维度

总分为 0 到 1。

```text
outcome:     40%
trend:       25%
stability:   15%
noteQuality: 10%
runHealth:   10%
```

## 3. 维度说明

`outcome` 衡量最终结果是否足够好，当前 demo 使用 final score 和 final loss。

`trend` 衡量实验过程中是否持续改善，当前 demo 使用 final score 与 initial score 的提升幅度。

`stability` 衡量实验是否稳定，当前 demo 使用 loss 标准差。

`noteQuality` 衡量 AI note 是否完整，检查 hypothesis、action、observation、result、reasoning、nextPlan。

`runHealth` 衡量 runner 是否正常完成。

## 4. 自动迭代策略

如果未达到 A，AIterLab 会根据当前等级推荐下一轮 candidate：

```text
B -> 小幅增强
C -> 中幅增强
D -> 大幅增强
```

如果达到 A：

```text
停止迭代 -> 保存 evaluation.json -> 标记 target reached -> 进入复现实验阶段
```

## 5. 事件和文件

每轮评分会发布：

```text
evaluation.scored
```

达到 A 会发布：

```text
experiment.target_reached
```

每轮迭代会写入：

```text
evaluation.json
```

## 6. 示例

```json
{
  "numericScore": 0.884,
  "grade": "A",
  "targetReached": true,
  "criteria": {
    "outcome": 0.88,
    "trend": 0.73,
    "stability": 0.95,
    "noteQuality": 1,
    "runHealth": 1
  }
}
```

## 7. 后续方向

下一步可以把 evaluator 扩展为多 evaluator：

- rule evaluator
- AI judge evaluator
- benchmark evaluator
- human review evaluator
- weighted ensemble evaluator
