# Build：设备知识构建

2026-11-07。当前工具 `3.0.0-draft.11` 默认发布 `psop.hardware.source-model/1.10`，封套为 [DKP v2](../architecture/device-knowledge-package.md)。1.0～1.9 保留原合同。实际流程与边界见[本轮验收](interface-review/verification.md)。

## 输入和输出

| 输入 | 当前用途 |
| --- | --- |
| 原始材料 ZIP | 固定设备资料及来源字节 |
| 固定版本与摘要的 MJCF XML | 获取模型实例、位姿、网格和来源参考关系 |
| [装配知识说明](../../device-materials/microduck-assembly-knowledge.json) | 保存用户声明、项目解释、适用网格和参考安装范围 |
| 厂商支持 md / PNG | 固定通用结构依据及适用范围 |
| [独立调查与标注](../../device-materials/interface-review/microduck-review.json) | 固定原网格样例的应检位置、区域审查、来源原文及缺证；与生产提取分开 |
| [关系实查与验收输入](../../device-materials/interface-review/microduck-relations.json) | 继承独立几何标注，增加已执行调查、具体机制假设、反证和固定关系期望；不授予正式 Interface 资格 |
| 硬件本体与工具 | 锁定机械语义目标及生产者血缘 |

补充 XML 与装配说明单独登记，不声称原始 ZIP 已包含它们。输出只含知识、来源、证据、几何、索引与 Schema，由[统一工作台](../../apps/workbench/README.md)读取。

## 当前实际交付内容

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
| 关系解释 | 独立截面绑定双方有限壁，检查共同构型、孔径互补、全部组距及必要中间件，发布有范围的安装假设；未调查与已调查但缺证分开 |

Microduck 的四条舵机孔道提供两侧八个安装入口，同侧邻接规则与标准双孔对应分别保存。连杆上方四孔保留独立位置及未知选用条件；大腿小柱的几何配合支持定位推断，外侧大圆洞用途未知。

1.8 修正参考螺钉近侧入口导致的反向图形：从同一连杆孔道选择朝向壳体目标的外侧开口，复核头位、杆轴、有限区段顺序和覆盖。无法支持的假设不生成错误实体。该检查不确认实物规格、承压面、螺纹、连续装入路径或保持。

共同语义见[装配接口与方案](../architecture/assembly-interfaces.md)，机械还原要求见[连接还原](connection-reconstruction.md)，字段与历史分支见 [Build 合同](../../skills/psop-build/references/v2-contract.md)。

## 构建和登记

当前默认是 `source-model/1.11` / `psop-build 3.0.0-draft.12`，冻结调查输入为
`device-materials/interface-review/microduck-connection-analysis.json`（investigation/1.2）。
它保留 1.10 的三条假设与原件，增加由已有连接审查实际开展的局部机制研究。
当前六对髋部台账、全70实例覆盖及阶段计数见[本轮连接审查台账](interface-review/connection-analysis.md)。

最快方式是在仓库根目录运行：

```powershell
python -B apps/workbench/scripts/prepare_workspace.py --fresh
```

它按当前代码生成新包、完整验证并登记到 Microduck 工作区。已有包不覆盖；工作区中旧开发版本可以在不再使用时清理。

需要控制当前各阶段时，使用尚未存在的工作目录与发布目录：

```powershell
python -B skills/psop-build/scripts/psop_build.py prepare --input device-materials/microduck-official-materials.zip --assembly-knowledge device-materials/microduck-assembly-knowledge.json --investigation device-materials/interface-review/microduck-connection-analysis.json --work build/connection-analysis/work-final-1 --device-id microduck --device-name Microduck
python -B skills/psop-build/scripts/psop_build.py finalize --work build/connection-analysis/work-final-1 --output build/microduck/source-1.11/microduck-connection-analysis.dkp --version 2.0.0-connection-analysis.1
python -B skills/psop-build/scripts/psop_build.py validate --dkp build/microduck/source-1.11/microduck-connection-analysis.dkp
node apps/workbench/scripts/workspaces.mjs register --dkp build/microduck/source-1.11/microduck-connection-analysis.dkp --workspace microduck
```

下方是1.10的历史发布命令，仅在显式选择冻结的 `--profile psop.hardware.source-model/1.10` 时重现：

```powershell
python -B skills/psop-build/scripts/psop_build.py prepare --profile psop.hardware.source-model/1.10 --input device-materials/microduck-official-materials.zip --assembly-knowledge device-materials/microduck-assembly-knowledge.json --investigation device-materials/interface-review/microduck-relations.json --work build/microduck/source-1.10/work-final-2 --device-id microduck --device-name Microduck
python -B skills/psop-build/scripts/psop_build.py finalize --work build/microduck/source-1.10/work-final-2 --output build/microduck/source-1.10/microduck-1.dkp --version 2.0.0-interface-relations.1
python -B skills/psop-build/scripts/psop_build.py validate --dkp build/microduck/source-1.10/microduck-1.dkp
node apps/workbench/scripts/workspaces.mjs register --dkp build/microduck/source-1.10/microduck-1.dkp --workspace microduck
```

`prepare` 固定输入、本体与工具；`finalize` 从冻结输入重建，在新暂存目录验证后原子发布；`validate` 核对 Schema、引用、源字节、摘要、独立语义约束与确定性重放。更改摘要不能让伪造测量或功能资格通过。

首次研究也可不传 `--investigation`：先查看 `work/investigation.json` 中全部件、候选、原区域和后续动作，再主动复核源模型与资料，形成独立标注后以新目录 prepare。无标注的结果明确为 `not_supplied`，不宣称样例验收通过。独立复核命令与标注图见[源审查记录](interface-review/source-review.md)。

## 工作台和后续消费

工作台展示 Build 已发布的知识，提供检索、定位与证据查看。Simulate 查询消费同一包中的参考关系和规则；新的动作、场景和物理结果应保存为包外产物。Compile 保留来源、推断与监督范围，不把合成补全件当确定物料或已固定标签。

完整机械、路径、工程、批量渲染和训练执行尚未接入。当前支持的实体和检查范围以 manifest 的逐项能力声明为准。

## 当前任务记录：右壳显示与具体关系分析

- 目标：修复右壳两个实际选孔位置的显示与详情，并为右壳及另一类无手写安装定义的部件形成具体、有证据的关系。
- 关键决定：1.0～1.9 冻结；1.10 将已执行调查与具体安装假设分开，保留正式 Interface 资格边界。输入研究先冻结，构建和验证确定性重放；展示法向不改变源三角或测量。
- 已完成：两目标独立截面复核、描边/源面分层隔离、按位置阅读界面、三条关系与五项实查、27 项源样例、删除关系及通用待办反例、既有资格保留；新包 `2.0.0-interface-relations.1` 已登记，旧 `.2` 保留。实际画面和验证见[本轮验收](interface-review/verification.md)。
- 未决：右壳 Z 向台阶孔的具体对端；支承件另两孔的接收螺纹/螺母/嵌件；实际紧固件、保持、公差、材料和载荷。原左壳其他唇缘/槽/台阶及未审区域没有因此完成。
- 下一步：取得匹配修订 CAD/装配图与实际紧固资料，沿五项实查的具体缺证继续；不以新增候选或 unknown 待办数量代替关系结果。
