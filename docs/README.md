# PSOP v2 文档目录

> 2026-11-06（Asia/Shanghai）。当前产品为统一工作台＋多个设备工作区。旧 core、旧 DKP profile 与包内独立 App 合同已退出 v2；历史实现和报告不能当作当前能力。

## 当前规范与实现入口

| 入口 | 内容 |
| --- | --- |
| [项目 README](../README.md) | 实际运行、当前能力与主数据流 |
| [硬件本体定义](architecture/hardware-ontology.md) | psop.hardware/2.0-draft.4 的机械语义 |
| [原子特征、参数化接口与装配方案](architecture/assembly-interfaces.md) | 安装孔位与共享孔道、组合规则、参考安装及三技能共同合同 |
| [系统设计](architecture/system-design.md) | 工作台、设备工作区、三个技能及执行底座 |
| [DKP v2](architecture/device-knowledge-package.md) | 数据包、来源、索引、版本和验证范围 |
| [设备工作区](architecture/device-workspace.md) | 多设备、知识快照、登记和读取接口 |
| [Build 设计](build/device-knowledge-build.md) | 来源及装配说明摄入、孔位／规则／参考映射与数据型发布 |
| [完整连接还原](build/connection-reconstruction.md) | 全对筛查、柱孔有限配合、定位／保持／第三件、有限内腔及分类补全示意 |
| [Simulate 设计](simulate/simulate-design.md) | 装配、场景、渲染和模型测试 |
| [Compile 设计](compile/compile-design.md) | 语料审核、数据划分、多模型训练与评测 |
| [十四视图](compile/canonical-14-views.md) | 共用场景执行与 Compile 数据管理的目标合同 |
| [统一工作台](../apps/workbench/README.md) | 工作区、DKP 读取与前端运行 |
| [Build 技能](../skills/psop-build/SKILL.md) | 实际 prepare／finalize／validate |
| [Simulate 技能](../skills/psop-simulate/SKILL.md) | 有界装配查询及 v2 编排边界，物理执行引擎待接入 |
| [Compile 技能](../skills/psop-compile/SKILL.md) | v2 编排边界，真实训练待接入 |

## 语义、证据与实施状态

- [本体重建与退役边界](architecture/hardware-ontology-migration.md)：旧合同退役、原始资料复用和新子集边界。
- [验证状态](architecture/hardware-ontology-validation.md)：区分定义、结构子集、来源模型和完整机械求值。
- [历史来源核查](architecture/hardware-ontology-evidence.md)：保留核查时间、来源版本与证明范围，不把旧机器 ID 当新合同。
- [设备本体旧路径说明](architecture/device-ontology.md)：旧平行草案已退役。
- [项目愿景](vision.md)：长期目标和研发原则。

当前默认 source-model/1.8，结构化支持来源模型、有限几何、孔道／内腔／安装位置、槽开口、组合规则、参考安装、柱孔有限配合和逐对连接审查。定位推断与保持未知分离，外侧共轴圆洞用途未知；参考连接件示意和未核实替代示例按 usage 区分，后者默认不显示、不生成已固定标签。补全示意与确定物料分开，用户原话、项目推断、厂商一般结构、几何复核及完整机械执行分别声明。1.0～1.7 合同保留冻结历史。路径、批量训练监督、训练和模型回测仍按资料与后端能力报告缺项，页面、合成样例和参考模型不替代真实设备验收。

## 展示与教学材料

[历史架构图](assets/diagrams/README.md)、[旧 Compile UI 参考](compile/ui/README.md)、[宣讲网页](html/README.md) 和 [介绍材料](presentations/README.md) 是独立展示／教学交付。它们可能使用旧产品结构或模拟内容，不作为 v2 CLI、数据合同和能力状态的依据。

硬件概念图位于 [figures/hardware-ontology](architecture/figures/hardware-ontology/README.md)，只辅助阅读，不作为真实机械证据。演示文稿、视频和 PPT 资产不会因工程合同重写而自动更新。
