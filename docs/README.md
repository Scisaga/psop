# PSOP 文档

2026-11-07。当前主线是统一工作台、设备工作区和 Build `source-model/1.8`。先阅读使用指南，再按需要进入数据合同和机械定义。

## 使用与运行

| 文档 | 内容 |
| --- | --- |
| [项目 README](../README.md) | 当前能力、实景截图与快速启动 |
| [工作台使用指南](workbench.md) | 模型、接口、证据、分享与版本维护 |
| [工作台开发说明](../apps/workbench/README.md) | 依赖、启动、本地 API、测试与截图更新 |
| [界面设计](../apps/workbench/DESIGN.md) | 面板层级、显示状态及交互约定 |

## 架构与执行边界

| 文档 | 内容 |
| --- | --- |
| [系统设计](architecture/system-design.md) | 工作台、设备工作区、三技能及当前实现与后续闭环 |
| [设备工作区](architecture/device-workspace.md) | 登记、读取、状态隔离与旧版本清理 |
| [DKP 数据合同](architecture/device-knowledge-package.md) | 1.8 数据层次、来源、验证及历史剖面沿革 |
| [Build](build/device-knowledge-build.md) | 实际摄入、分析、发布与登记 |
| [Simulate](simulate/simulate-design.md) | 当前有界查询与后续装配、渲染、模型测试 |
| [Compile](compile/compile-design.md) | 当前入口与后续语料、训练、多模型和评测 |
| [规范十四视图](compile/canonical-14-views.md) | 尚待执行器接入的视角与监督合同 |

## 机械语义与证据

| 文档 | 内容 |
| --- | --- |
| [硬件本体定义](architecture/hardware-ontology.md) | 唯一机械语义目标 `psop.hardware/2.0-draft.4` |
| [原子特征、接口与装配方案](architecture/assembly-interfaces.md) | 共享孔道、孔位池、选择规则、具体绑定和操作假设 |
| [连接还原](build/connection-reconstruction.md) | 定位、保持、第三件、逐对审查与有限方向检查 |
| [实现与验证范围](architecture/hardware-ontology-validation.md) | 定义、来源几何、静态参考与机械执行边界 |
| [迁移与历史合同](architecture/hardware-ontology-migration.md) | 版本演进与旧合同退役 |
| [历史来源核查](architecture/hardware-ontology-evidence.md) | 带核查时间和适用范围的来源研究 |

## Agent 技能与机器合同

- [psop-build](../skills/psop-build/SKILL.md)：工具 `3.0.0-draft.9`，`prepare / finalize / validate`；字段见 [Build 合同](../skills/psop-build/references/v2-contract.md)。
- [psop-simulate](../skills/psop-simulate/SKILL.md)：真实 DKP 静态查询及显式定义的有界推理，物理执行待接入。
- [psop-compile](../skills/psop-compile/SKILL.md)：语料、训练和评测编排，实际训练与推理待接入。

当前事实从代码、Schema、DKP manifest 和实际执行结果核对。目标交互、效果图和合成示意不作为已实现能力或真实装配结论。

## 截图与展示资料

[工作台截图](assets/screenshots/README.md)来自真实前后端与当前 Microduck 快照，随文档发布，可按记录的脚本重建。

[当前结构图](assets/diagrams/workbench-structure.svg)说明工作台、工作区、三技能及产物的层次，[图示说明](assets/diagrams/README.md)区分当前结构与历史示意。

[项目愿景](vision.md)描述长期目标。[旧 Compile UI](compile/ui/README.md)、[宣讲网页](html/README.md)和[演示文稿](presentations/README.md)属于独立展示或教学资料，部分表达早于当前实现。

删除本机旧知识快照不改变历史 Schema 的含义，也不要求把所有历史发布包留在工作台菜单中。
