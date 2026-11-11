# Build：设备知识构建

2026-11-10。当前命令默认采用 `psop.hardware.source-model/1.15`，发布 `psop.assembly.catalog/3`，独立验收输入为 `psop.assembly.requirements/2`，数据封套仍为 DKP v2。当前工具为 `psop-build 3.0.0-draft.23`，以 `doctor` 和包内 `toolchain` 为准。当前包为 `2.0.0-capabilities.10`，分开表达原装用途、对端、几何及紧固状态，全部未决假设进入跟进；见[原装状态复核](reference-connection-status.md)。功能间隙、完整接口筛选与实体求交规则沿用上一版，见[接口分析与核对](interface-analysis-policy-2.md)。此前原装配用法复查见[完整性记录](../reference-use-completeness.md)。

1.15 从全部原始网格重建本件有限几何，再形成资源、潜在方式和跨件候选。原装配关系单独保留，不能限定新候选的发现范围。完整字段、模板与历史解释见 [Build 合同](../../skills/psop-build/references/v2-contract.md)，原件数学证据与限制见[几何验收](../build-capability-acceptance.md)。

## 输入和输出

| 输入 | 当前用途 |
| --- | --- |
| 原始材料 ZIP | 捕获设备资料及原始来源字节 |
| 固定版本与摘要的 MJCF XML | 读取来源实例、参考位姿、网格与来源关系；可用 `--xml` 指定相同固定版本的本地文件 |
| [装配说明与作者目录](../../device-materials/microduck-assembly-interfaces.json) | 由 `--assembly-knowledge` 可选摄入；保留有出处的功能说明和参考装配，作为几何上的语义覆盖层 |
| [独立能力要求](../../device-materials/assembly/capability-review.json) | 由 `--requirements` 显式摄入；按原网格 SHA、源三角和应有类型验收，不参与几何拟合与候选发现 |
| [参考配置修正约束](../../device-materials/assembly/reference-adjustments.json) | 由 `--reference-adjustments` 摄入；以有限配合和相邻约束求最小平移，记录工程推断、预算和前后指标 |
| 独立要求引用的复核材料 | 按 `provenance.capture_path` 捕获原字节并核对 SHA，进入输入锁、Source 和 Evidence |
| [原装配用法审查](../../device-materials/assembly/reference-use-review.json)及原三角观察 | 由 requirements/2 的可选 `reference_uses` 固定，不增加 CLI 参数；逐实例锁定功能接口、具体关系/成员映射、有限面与未决项，区别于几何/候选覆盖 |
| 硬件本体、Schema 与工具实现 | 固定语义目标、允许字段及生产者血缘 |

补充 XML、装配说明及复核材料单独登记，不声称原始 ZIP 已经包含它们。不同来源实例保留独立身份，相同网格可以复用测量；实例数量不自动成为实物库存数量。

输出只含知识、原件、证据、有限几何、索引与 Schema，由[统一工作台](../../apps/workbench/README.md)读取。新包包含以下入口：

| 路径 | 用途 |
| --- | --- |
| `manifest.json` | 剖面、版本、输入锁、工具血缘、能力范围与逐文件 bytes/SHA |
| `indexes/scene.json` | 首次浏览摘要、来源实例和 `assembly.capability_index` |
| `indexes/capabilities.json` | 按本件身份寻址完整能力详情 |
| `indexes/compatibility.json` | 按部件对寻址候选详情及检查处置 |
| `indexes/coverage.json` | 独立几何要求验收、可选原装配用法审查与候选范围处置 |
| `indexes/reference-alignment.json`（可选） | 来源配置的修正变换、有限检查及来源依据；scene 保留查看摘要 |
| `details/parts/*.json.gz` | 本件有限特征、资源、入口、功能覆盖层及参考关系；有用法审查时包含 `reference_use_review` |
| `details/pairs/*.json.gz` | 双方有限几何对应、条件、连接件角色需求与完整关系族 |
| `knowledge/`、`sources/`、`schemas/` | 结构化知识、固定来源及该剖面的机器定义 |

压缩详情保留全部成员、候选关系和条件，不通过删除记录缩小数据。manifest 锁定压缩后的真实字节；来源锁针对原始输入字节。来源正文可按需读取，摘要不内嵌正文时仍须保留相同的来源身份、路径和摘要。

## 构建、冻结、校验和登记

在仓库根目录执行，确保 `python` 与工作台使用的 `node` 可用。Windows 中也可将 `python` 替换为项目可用 Python 的完整路径。先查看工具实际支持的合同：

```powershell
python -B skills/psop-build/scripts/psop_build.py doctor
```

最快的完整流程是：

```powershell
python -B apps/workbench/scripts/prepare_workspace.py --fresh
```

该入口依次执行 `prepare → freeze → finalize → validate → register`，生成新路径和版本，在完整校验返回 `valid: true` 后登记工作区。省略 `--fresh` 时优先复用已有工作区或已发布快照，不保证重新运行当前剖面的构建。

需要控制各阶段时，使用尚未存在的工作目录与发布目录。以下是新修订示例，已有同名目录或版本须换新：

```powershell
python -B skills/psop-build/scripts/psop_build.py prepare --profile psop.hardware.source-model/1.15 --input device-materials/microduck-official-materials.zip --assembly-knowledge device-materials/microduck-assembly-interfaces.json --requirements device-materials/assembly/capability-review.json --reference-adjustments device-materials/assembly/reference-adjustments.json --work build/microduck/source-1.15/work-new --device-id microduck --device-name Microduck
python -B skills/psop-build/scripts/psop_build.py freeze --work build/microduck/source-1.15/work-new
python -B skills/psop-build/scripts/psop_build.py finalize --work build/microduck/source-1.15/work-new --output build/microduck/source-1.15/microduck-capabilities-new.dkp --version 2.0.0-capabilities.10
python -B skills/psop-build/scripts/psop_build.py validate --dkp build/microduck/source-1.15/microduck-capabilities-new.dkp
node apps/workbench/scripts/workspaces.mjs register --dkp build/microduck/source-1.15/microduck-capabilities-new.dkp --workspace microduck
```

| 阶段 | 实际工作与完成条件 |
| --- | --- |
| `prepare` | 捕获并锁定输入，发现全部本件几何，生成资源与全对候选，执行独立要求检查并写出详情分片。查看 `work/progress.json`、`work/review.json` 与 `work/intake.json` |
| `freeze` | 重验输入字节、工具血缘、独立要求、有限几何、候选及工件完整性，生成 `work/freeze.json`。未完成的 prepare 不能冻结 |
| `finalize` | 核对封条、输入锁与完整文件清单，从冻结工件复制并写入发布身份、manifest，原子发布到新目录。不重新发现知识，也不代表独立 validate 已通过 |
| `validate` | 对包执行来源、Schema、引用、原三角测量、独立覆盖、资源/入口和候选确定性核验；成功返回 `valid: true` |
| `register` | 读取并验证包，在包外工作区登记以摘要寻址的快照并选中。相同摘要重复登记复用已有快照；相同包版本不能对应另一个摘要 |

每一步成功后再执行下一步。命令返回 JSON；错误的退出码和 `ok: false`／`valid: false` 均须处理。已有包不覆盖，修改知识或增加资料时发布新版本，不编辑既有包的 manifest、详情或来源。

## 独立要求、测量缓存与冻结

优先遵循[装配判定与设计保真](../architecture/assembly-judgment-policy.md)：刚性网格交集不直接否决装配，也不直接证明需要移动或修改原设计。独立定位、尺寸、坐标映射或设计依据支持参考位置错误时，可合理修正，保留原始来源与单独的工程推断配置。修正流程和适用范围见[参考装配合理修正](../reference-assembly-repair.md)。独立要求锁定了修正输入时，省略该输入、删除修正报告或改写统计均不能通过验收；该验收只重放声明约束，不否定原设计可能的预紧或补偿。

1.15 使用 `--requirements` 的 requirements/2，不能用历史 `--investigation` 代替。建议始终显式传入文件；未传时当前实现采用仓库中的 `device-materials/assembly/capability-review.json`。要求应来自原件独立审查，明确源 SHA、应检区域、类型及最低支撑范围。生产输出的数量、重放一致或 100% 源三角处分，都不能替代独立预期。

已确认的孔壁或锥壁要求必须有相应有限解析几何支撑，普通 `source_region` 不能冒充通过。原顶点不支持单一解析模型时，应保留真实有限材料、尺寸事实和具体限制；修订独立要求须有单独原件证据，不能仅因为发现器没有返回结果而降低要求。本轮三处混合壁与三处真实漏项的区别见[几何验收](../build-capability-acceptance.md)。

测量缓存位于工作目录父级的 `measurement-cache-v1/`。基础提取按原始网格 SHA 和几何/基础力学实现摘要寻址，并核验缓存内容摘要；相同网格复用几何测量，各实例仍拥有自己的身份。非圆复合轮廓在当前 prepare 中重新求取。缓存只节省测量，不代替独立验收、候选检查或冻结。

`prepare` 固定几何与轮廓参数及工具血缘；`freeze` 固定完整 prepared 文件清单和输入摘要。工具、Schema 或输入变化后重新 prepare/freeze，符合身份的原件测量缓存仍可复用。冻结后改变 intake、输入、prepared 文件或增加未列文件，均不能沿用旧封条发布。prepare 失败留下的 `analysis_status=incomplete` 也不能直接 finalize。

工作台的完整校验缓存与上述测量缓存分开：它绑定包身份、文件状态及校验器/运行环境身份。列出工作区只核对快照描述，不重放全部历史包；选择快照、登记或读取内容时需要完整校验，随后每次资产读取继续核对其 bytes/SHA。缓存命中不授予未经验证的几何或功能资格。

## 工作台查看与候选懒加载

原装配用法需要单独的独立基线，不能用三角处置或候选对数代替。当前 Microduck 基线覆盖全部 70 个输入实例，锁定承槽/挡面/侧肩等有实际作用的有限区域及参考对端；明确保留 7 项具体未决问题。删除应有接口、具体成员映射、面区域或审查处置，重算摘要仍须失败。历史没有用法审查的包不能追认为已通过新检查。

“原装配”顶部显示所选部件的“原装配用法”，有未决问题时直接列出；“接口使用审查”逐项说明输入中的采用/冲突/未观察到使用/待核实状态，并可打开固定审查来源。说明由 Build 发布，浏览器不从接触面自行推断固定关系。

选择 1.15 快照后，首次读取 scene 和能力索引。打开部件时才请求该部件详情；“几何与能力”显示有限测量和用途状态，“原装配”显示来源采用的关系，“兼容候选”查找本件与其他部件的局部几何匹配。也可从“部件兼容候选”页检索全部含候选的部件对。

进入具体部件对时才请求该 pair 详情；点击对端几何时再加载其所属部件详情。列表的“继续查看”只增加当前展示范围，不删除包中的其余记录。浏览器详情缓存按包摘要与资产 URL 区分，切换快照不会把旧包的同名详情当作新包内容。HTTP 资产服务对 `.json.gz` 标注 gzip，客户端透明读取 JSON。

候选是 Build 已生成的局部几何关系，不是在页面中求出的装配。检查覆盖当前声明的八族模板及全部不同来源实例对，同型不同实例也参与；每个 pair/template 保留候选、数据不足、不适用或范围内无匹配的处置。界面默认列表只列含候选的部件对，完整无候选处置仍在发布索引/覆盖记录中。

局部几何层及历史包保留 `assessment_scope=pose_independent_geometry`、`placement_evaluated=false`。捕获整件检查规则的新包只把通过固定贴合检查的接口列为默认候选，声明 `assessment_scope=complete_interface_fixed_pose`、`placement_evaluated=true`，具体 R/T、来源及实体交集结果随方向保存。前端不改动该相对姿态。关系查询仍须保留分页、未完成状态和游标，不能把当前页当作全集或把有限方向说成全部连续装法。

局部尺寸互补不能替代完整几何观测；整件刚性求交也不能替代弹性、过盈、预紧、软接触及补偿的装配解释。固定终点通过不建立装入路径、轴向保持、预紧或载荷结论。source Frame 不自动证明共同运动刚体；光孔不自动给出螺纹、SKU、连接件长度或实物数量。当前求交使用随工具固定版本的离线 WASM 内核及 Node.js 22+（可用 `PSOP_NODE_PATH` 指定），许可、来源和 JS/WASM SHA 进入工具摘要。数值精度沿用源平面精度，弯曲数值接触通过同精度的内核腐蚀复核；保留真实测量，工程可接受重叠另按机制处理。Simulate 尚未执行多件变体或连续路径求解。

## 历史包的解释

`source-model/1.0`～`1.14` 保持各自冻结的 Schema、解释器和包字节。显式选择历史 `--profile` 时继续采用该剖面的输入与发布规则；1.15 的 `freeze`、requirements/2、catalog/3 和候选详情不能补写进旧包。历史包仍可在工作区选择，不因新功能发布而自动升级。

1.10 的具体安装假设与关系实查见[历史验收](interface-review/verification.md)；1.11／1.12 的局部端点和部位调查见[部位记录](interface-review/connection-sites.md)。1.13／1.14 的作者接口目录保留原引用与身份，新测量可通过迁移记录解释替代段，不重写旧结论。旧版“无功能接口”或缺少新几何，只描述当时的知识范围，不能解释为物理结构不存在。

DKP 始终是不可变知识快照，工作区、查询结果、模拟、训练和评测记录在包外独立版本化。当前可消费范围以所选 manifest 的逐项能力声明为准。

装配策略 /3 的完整接口、重叠保留、来源默认构型及新分片合同见[执行与验收](../assembly-judgment-optimization.md)。旧包及原始网格保持原字节。
