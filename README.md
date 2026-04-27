# AIterLab

AIterLab 是一个新的开源工具，专门用于 AI 迭代实验的实时展示、结果沉淀与 AI note 管理。

它面向的不是单次实验控制台，而是 AI 在反复尝试、修改参数、运行实验、观察结果、写下判断、继续下一轮时，需要的“实时实验工作台”。

## Name

`AIterLab` = `AI` + `Iteration` + `Lab`。

推荐包名和命令名：

- GitHub repo: `aiterlab`
- npm package scope: `@aiterlab/*`
- CLI command: `aiterlab`
- Product name: `AIterLab`

## 核心定位

- 实时显示 AI 实验迭代过程
- 管理每轮实验的计划、运行状态、结果与日志
- 记录 AI note：假设、观察、失败原因、下一步推理
- 让 AI 可以直接读写结构化实验数据和界面布局
- 让人类可以用图表、波形、历史记录快速理解实验进展
- 以文件夹为核心保存历史实验，便于开源协作、迁移和复现

## 目标用户

- 用 AI 自动迭代算法、模型、设备实验的人
- 需要长期追踪实验结果与实验笔记的研究者
- 需要把 AI agent 实验过程可视化的开发者
- 希望将实验过程、结果、AI 思考记录开源化管理的团队

## 首版重点

- AI plan：当前运行、已完成、未来计划、时间戳、运行时长
- AI note：每轮实验的假设、观察、结论、下一步
- 实时结果：日志流、指标流、曲线图、波形图
- 历史实验：按文件夹访问、索引、搜索、回放
- AI 可编辑 UI：组件添加、删除、位置、大小、数据源、布局版本
- 后台执行器：避免实验脚本弹出 Python 窗口并阻塞命令

## 文档

- [项目规划](</C:/Users/ijink/Documents/New project/aiterlab/PLAN.md>)
- [实施计划](</C:/Users/ijink/Documents/New project/aiterlab/docs/IMPLEMENTATION_PLAN.md>)
- [Agent 调用集成](</C:/Users/ijink/Documents/New project/aiterlab/docs/AGENT_INTEGRATION.md>)
- [实时流与并发](</C:/Users/ijink/Documents/New project/aiterlab/docs/REALTIME_STREAMING.md>)
- [技术栈规划](</C:/Users/ijink/Documents/New project/aiterlab/docs/TECH_STACK.md>)
- [AI note 规格](</C:/Users/ijink/Documents/New project/aiterlab/docs/AI_NOTE_SPEC.md>)

## 当前状态

项目处于规划和脚手架阶段。下一步建议先实现最小可运行闭环：

```text
创建实验 -> 运行一轮迭代 -> 实时显示日志/指标 -> 写入 AI note -> 保存历史结果
```

## License

GPL-3.0-only. See [LICENSE](</C:/Users/ijink/Documents/New project/aiterlab/LICENSE>).



