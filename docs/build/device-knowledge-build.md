# psop-build v2：设备知识构建

2026-11-06（Asia/Shanghai）。新默认工具 `3.0.0-draft.9`，知识剖面 `psop.hardware.source-model/1.8`；封套仍为 [DKP v2](../architecture/device-knowledge-package.md)。

## 职责与输入

Build 固定获准原件、本体、工具及共享规则，提取可追溯知识，验证后原子发布。工作区登记多个不可变快照；Build 不为设备生成工作台程序，不直接执行模拟或训练。

Microduck 输入为真实材料 ZIP、固定版本/摘要的 MJCF，以及显式传入的[装配知识说明](../../device-materials/microduck-assembly-knowledge.json)。说明固定用户原话、项目解释、适用源网格及标准参考关系，独立登记来源和摘要。XML 与说明均为补充输入，不宣称 ZIP 原本包含它们；模型参考、alpha 软件与 HAT C1 资料不无证拼成已确认实机装配。

## 分层分析

共同规则见[装配接口与方案](../architecture/assembly-interfaces.md)。1.4 复用冻结 1.3 的有限几何、孔道、端口和参考观测，在其上发布安装孔位、规则、参考安装及有限槽开口。阶梯孔不是多个孔道；同一孔道两端可提供不同入口孔位；源面不是承压作用区，齐孔不是已紧固状态。

功能 Interface 需要机制、角色、原子作用特征、互补条件、选择规则和 warrant。Microduck 壳体四条孔道提供两侧共八个安装孔位，组合规则约束同侧邻接选择，不产生 02／03 两个同名接口，也不强制四孔齐用。用户说明是功能依据，参考模型验证双方孔位映射；已知关系不因孔壁间隔大于原几何近接阈值而丢弃。缺少实物连接件时保留角色要求，不生成虚构螺钉或实际保持。

1.5 补齐连杆上方四孔和左右大腿的实体安装柱。新增声明分别限定几何修订与来源，未提供的最少选用数量、侧别许可及保持机制保持 unknown，不复用下方双孔规则。有限锥壁需源法向、闭合端面及真实边界见证；实体柱引用 Feature，不虚构孔道、端口或独立紧固件。来源 qpos0 的轴线对应／相位差不自动成为参考紧固或永久不可装结论。

1.6 按[完整连接还原](connection-reconstruction.md)组织全机部件对筛查和连接链，补识别圆内开口及有限变半径腔。小柱用途由旧用户确认纠正为项目推断，孔、柱、轴端和保持件分别审查，面投影仅作辅助。

1.7 新增 pin_hole_fits，按实际柱孔配合组织安装定位知识：每两根大腿小柱对应同台舵机壳体 B2／B3 孔，组距约 16 mm、有限插入约 2 mm；源孔径约 2 mm、插入柱段约 1.80→1.59 mm，有间隙、无过盈／倒扣依据。定位用途为项目推断，保持与承载 unknown；参考两成员不定义最少双柱规则。外侧 Ø5.5 mm 大洞用途未知，不因共轴成为主固定接口，也不称装饰。

说明引用的厂商 md／PNG 原件随 prepare 捕获并锁定摘要，finalize 发布及 validate 重放只消费冻结字节。厂商一般图不直接指定 Microduck 实际用法。补全件的 usage 区分已有参考路径中的未绑定连接件与未核实替代示例；轴心螺钉／压盖仅为 unverified_alternative，默认不显示，不进入当前保持角色或确定物料。1.0～1.6 合同、包及算法保持冻结，历史关联不延续为新的固定依据。

## 执行

使用新工作目录和发布目录，完整参数见[技能](../../skills/psop-build/SKILL.md)：

```powershell
python -B skills/psop-build/scripts/psop_build.py prepare --input device-materials/microduck-official-materials.zip --assembly-knowledge device-materials/microduck-assembly-knowledge.json --work build/microduck/source-1.8/work --device-id microduck --device-name Microduck
python -B skills/psop-build/scripts/psop_build.py finalize --work build/microduck/source-1.8/work --output build/microduck/source-1.8/microduck.dkp --version 2.0.0-connector-direction.1
python -B skills/psop-build/scripts/psop_build.py validate --dkp build/microduck/source-1.8/microduck.dkp
node apps/workbench/scripts/workspaces.mjs register --dkp build/microduck/source-1.8/microduck.dkp --workspace microduck
```

离线可以传正确摘要的 `--xml`。prepare 捕获输入与工具血缘；finalize 重新构建，在暂存目录完整核验后原子发布，任何已有包不覆盖。新逻辑与共享 Schema 纳入工具固定范围。

## 验证和消费

校验覆盖字节、来源、引用、孔道/孔位/槽/规则/参考映射身份、摘要与确定性重放；装配说明也须固定及复验。禁止 raw 几何改名为 Interface、伪造活动区域和保持状态。拟合阈值不是制造公差，壁长不是旋入许可，投影重叠不是承载证明。

统一工作台只读取知识与资产；目录展示登记 manifest 元数据，选择内容后完整验证。新版本分开几何/观测与合格接口，保留各自定位及搜索。1.1/1.2 旧自动‘接口’仅按历史几何浏览，统计资格不沿用。

安装孔位、组合规则及已知参考映射是 Build 交付，Simulate 消费这些知识进行后续试装、路径与状态评估。当前静态知识查询及有界匹配不冒充物理执行。Compile 可消费带来源的参考孔位对应监督，未核定观测不能成为已紧固真值，未见组合不自动成为失败标签。
