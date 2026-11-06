# Build：设备知识构建

2026-11-07。当前工具 `3.0.0-draft.10` 默认发布 `psop.hardware.source-model/1.9`，封套为 [DKP v2](../architecture/device-knowledge-package.md)。实际流程已在 Microduck 跑通。

## 输入和输出

| 输入 | 当前用途 |
| --- | --- |
| 原始材料 ZIP | 固定设备资料及来源字节 |
| 固定版本与摘要的 MJCF XML | 获取模型实例、位姿、网格和来源参考关系 |
| [装配知识说明](../../device-materials/microduck-assembly-knowledge.json) | 保存用户声明、项目解释、适用网格和参考安装范围 |
| 厂商支持 md / PNG | 固定通用结构依据及适用范围 |
| [独立调查与标注](../../device-materials/interface-review/microduck-review.json) | 固定原网格样例的应检位置、区域审查、来源原文及缺证；与生产提取分开 |
| 硬件本体与工具 | 锁定机械语义目标及生产者血缘 |

补充 XML 与装配说明单独登记，不声称原始 ZIP 已包含它们。输出只含知识、来源、证据、几何、索引与 Schema，由[统一工作台](../../apps/workbench/README.md)读取。

## 1.9 实际交付内容

| 层次 | 内容与边界 |
| --- | --- |
| 来源模型 | model 域 Part、来源位姿、有限 Feature 和源三角面引用 |
| 几何结构 | 逻辑孔道、开口、有限内腔、长槽、实体锥柱与几何模式 |
| 安装知识 | 可寻址入口、共享孔道、安装定义、选用规则及显式未知项 |
| 参考装配 | 共同来源配置中的双方孔位对应、有限间隔及未绑定连接件角色 |
| 柱孔配合 | 小柱与壳体孔的有限插入、间隙及定位用途推断；保持未知 |
| 连接审查 | 全对广相范围、逐处定位／保持／运动分工、第三件及缺项 |
| 参考连接件 | 外侧入口、头下基准、杆向与有限壁段的示意假设和独立一致性检查 |
| 未核实方案 | 单独标明用途的替代螺钉／压盖示意，默认不作为当前连接事实 |
| 主动结构调查 | 全部 Part 实例、几何资产、原始区域、任意轴有限壁与逐处后续动作；不依赖人工 selectors |
| 独立覆盖 | 固定源 SHA 的标注样例及位置/轴/三角见证；自动初筛不算完成审查 |

Microduck 的四条舵机孔道提供两侧八个安装入口，同侧邻接规则与标准双孔对应分别保存。连杆上方四孔保留独立位置及未知选用条件；大腿小柱的几何配合支持定位推断，外侧大圆洞用途未知。

1.8 修正参考螺钉近侧入口导致的反向图形：从同一连杆孔道选择朝向壳体目标的外侧开口，复核头位、杆轴、有限区段顺序和覆盖。无法支持的假设不生成错误实体。该检查不确认实物规格、承压面、螺纹、连续装入路径或保持。

共同语义见[装配接口与方案](../architecture/assembly-interfaces.md)，机械还原要求见[连接还原](connection-reconstruction.md)，字段与历史分支见 [Build 合同](../../skills/psop-build/references/v2-contract.md)。

## 构建和登记

最快方式是在仓库根目录运行：

```powershell
python -B apps/workbench/scripts/prepare_workspace.py --fresh
```

它按当前代码生成新包、完整验证并登记到 Microduck 工作区。已有包不覆盖；工作区中旧开发版本可以在不再使用时清理。

需要控制各阶段时，使用尚未存在的工作目录与发布目录：

```powershell
python -B skills/psop-build/scripts/psop_build.py prepare --input device-materials/microduck-official-materials.zip --assembly-knowledge device-materials/microduck-assembly-knowledge.json --investigation device-materials/interface-review/microduck-review.json --work build/microduck/source-1.9-final-3/work --device-id microduck --device-name Microduck
python -B skills/psop-build/scripts/psop_build.py finalize --work build/microduck/source-1.9-final-3/work --output build/microduck/source-1.9/microduck-2.dkp --version 2.0.0-interface-investigation.2
python -B skills/psop-build/scripts/psop_build.py validate --dkp build/microduck/source-1.9/microduck-2.dkp
node apps/workbench/scripts/workspaces.mjs register --dkp build/microduck/source-1.9/microduck-2.dkp --workspace microduck
```

`prepare` 固定输入、本体与工具；`finalize` 从冻结输入重建，在新暂存目录验证后原子发布；`validate` 核对 Schema、引用、源字节、摘要、独立语义约束与确定性重放。更改摘要不能让伪造测量或功能资格通过。

首次研究也可不传 `--investigation`：先查看 `work/investigation.json` 中全部件、候选、原区域和后续动作，再主动复核源模型与资料，形成独立标注后以新目录 prepare。无标注的结果明确为 `not_supplied`，不宣称样例验收通过。独立复核命令与标注图见[源审查记录](interface-review/source-review.md)。

## 工作台和后续消费

工作台展示 Build 已发布的知识，提供检索、定位与证据查看。Simulate 查询消费同一包中的参考关系和规则；新的动作、场景和物理结果应保存为包外产物。Compile 保留来源、推断与监督范围，不把合成补全件当确定物料或已固定标签。

完整机械、路径、工程、批量渲染和训练执行尚未接入。当前支持的实体和检查范围以 manifest 的逐项能力声明为准。

## 当前任务记录：主动接口调查

- 目标：复现左壳实际漏项，默认从全部件开始调查，并让独立覆盖暴露遗漏。
- 关键决定：保留 1.0～1.8 冻结算法和包；1.9 用独立结构候选承载新发现，几何、功能和审查状态分开；研究证据在 prepare 前固定，finalize/validate 离线重放。
- 已完成：真实左壳截面漏项夹具与修复、连杆通用性样例、70 实例/38 资产初筛、11 项独立原截面清单及五份资料原件、故意遗漏检查、完整结构/未决索引、工作台定位与历史提示；`.2` 已校验并登记，发布回归 6/6、API 7/7、浏览 35 通过/1 历史跳过。
- 未决：左壳 LS-06 及同轴部分大壁的用途/连接件/保持；左壳唇缘与窄槽、连杆中部长槽和凸缘尚未逐区独立验收；Onshape 固定机械修订内容未取得。
- 下一步：按[源审查记录](interface-review/source-review.md)取得匹配 CAD/装配图，扩大逐区域标注；本轮发布与验证结果见[交付记录](interface-review/verification.md)。
