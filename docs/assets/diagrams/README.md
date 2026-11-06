# 历史架构图

本目录两张 SVG 仍使用旧串行流程、DKP profile 和包内 App 等表达，属于历史展示材料，不作为 v2 规范：

- [logical-architecture.svg](logical-architecture.svg)
- [capability-lifecycle.svg](capability-lifecycle.svg)

当前结构是统一工作台管理多个设备工作区，Build 发布数据型 DKP，Simulate 与 Compile 共用场景运行底座并形成有版本的语料、模型与测试闭环。旧 core／CMP／PORT／IFC 和包内 App 合同已退役。

当前架构图以 [系统设计](../../architecture/system-design.md) 中的 Mermaid 为准；[DKP v2](../../architecture/device-knowledge-package.md) 规定数据交付边界。历史生成脚本只可重建旧展示图，不验证新架构语义，不纳入 v2 当前验证命令。
