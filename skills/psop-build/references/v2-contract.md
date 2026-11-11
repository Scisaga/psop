# 数据型 DKP v2：当前来源与装配目录合同

**装配解释优先遵循[装配判定与设计保真](../../../docs/architecture/assembly-judgment-policy.md)。** 本合同记录已发布字段、刚性执行器和历史重放范围；求交重叠不直接否决装配，交集减少不直接证明需要修正原设计。文档规则更新不改写冻结包或宣称执行器已完成材料与接触解释。

2026-11-08（Asia/Shanghai）。当前剖面 `psop.hardware.source-model/1.15`，目录 `psop.assembly.catalog/3`，独立要求 `psop.assembly.requirements/2`，封套 `psop.dkp/2.0-draft.1`。工具版本以 `doctor` 与包内 toolchain 为准，机械语义目标仍为硬件本体 draft.4。

## 从本件几何形成能力目录

2026-11-10 更新：`interface-matching-policy/2` 增加有证据的有效成员子组、按接口声明的功能间隙及几何假设的功能资格。`coverage.interface_analysis` 逐接口列出支持边界，并对每条原装关系核对双方接口和已指定成员；未支持结构与未恢复关系保持开放。具体字段、验收和只读核对命令见[接口分析与验收](interface-analysis.md)。policy/1 与旧包继续按原规则重放。

1.15 先从原始网格发现有限本件几何、入口与资源，再叠加已有装配声明和功能证据。原装关系不是发现范围；用途未知的结构照常发布。独立要求只作为验收输入，不参与拟合或候选发现；原模型接触、同轴和投影也不直接形成固定关系。

当前流程为：`prepare` 捕获原件并执行发现/全对候选 → `freeze` 核对独立要求和完整工件后封存 → `finalize` 发布封存字节 → `validate` 核验来源、独立覆盖及确定性重放 → 登记工作台。输入或工具变化后重做 prepare/freeze，不能沿用旧封条。finalize 不联网、不调用模型、不重新发现知识。

既有 [microduck-assembly-interfaces.json](../../../device-materials/microduck-assembly-interfaces.json) 可作为参考和语义覆盖层，不能替代几何发现。1.15 的独立要求由 `--requirements` 输入，使用 requirements/2；旧 [microduck-interface-requirements.json](../../../device-materials/assembly/microduck-interface-requirements.json) 继续服务其历史合同。设备坐标、尺寸和实例适用范围不进入通用发现规则。

## 文件、身份与来源锁

入口为 `manifest.json`；包保留固定原始输入、sources、knowledge、indexes、schemas，并增加按部件/部件对寻址的 `details`。知识入口为 entities／sources／evidence／gaps；浏览摘要为 `indexes/scene.json`。包不包含 App、执行服务或可变模拟状态。

当前 Schema 为 [manifest-source-model-1.15.schema.json](../schemas/manifest-source-model-1.15.schema.json)、[source-model-1.15.schema.json](../schemas/source-model-1.15.schema.json)、[assembly-catalog-3.schema.json](../schemas/assembly-catalog-3.schema.json) 和 [assembly-requirements-2.schema.json](../schemas/assembly-requirements-2.schema.json)。历史 1.13/catalog1、1.14/catalog2 保留原合同。

`manifest.files` 覆盖除 manifest 自身以外的全部文件，逐项固定相对 POSIX 路径、字节数和 SHA-256。路径逃逸、符号链接、重复或额外文件均拒绝。`package_digest` 是去掉自身字段后，以 UTF-8、对象键排序、无额外空白的有限 JSON 字节计算的 SHA-256；它是完整性摘要，不是发布者签名。

1.15 产生 catalog/3；可选 `--assembly-knowledge` 保留旧作者目录及引用原件的来源，将其作为覆盖层。`--requirements` 捕获 requirements/2 的字节与摘要。历史 1.14 仍按 catalog/2、1.13 按 catalog/1 接收原有输入。Evidence 引用实际 Source；来源全文不重复塞入 scene。

工具摘要覆盖 Build 脚本、Schema 与共享 assembly 实现。准备和发布期间工具血缘改变时须重新准备；历史包是否可读则由显式剖面与适配器合同决定。Part、接口、成员、连接和来源身份分别保存，显示名称及排序不进入身份。

## 输入与发布结构

历史作者目录覆盖层顶层仍为：

```text
schema, device_id, provenance,
catalog: {features, interfaces, connections, part_notes},
evidence, supporting_documents, requirements
```

新 requirements/2 按源 SHA 固定每个实例的独立检查、应有几何与排除项；不从生产输出重新计数。来源实例保留各自身份，相同网格复用测量；`stock_quantity` 未确认时为空，来源实例数不是实际库存承诺。

scene 发布基础 `meta`、`parts`、`bodies`、`joints`、`sources`、`evidence` 及浏览用 `assembly.capability_index`。`indexes/capabilities.json` 引用部件详情；`indexes/compatibility.json` 引用部件对分片；`indexes/coverage.json` 保存独立几何验收及候选处置。knowledge 保留来源 Part 和冻结参考 Configuration，通过相同索引引用完整知识。首次浏览不加载全部候选或三角见证。

`details/parts` 和 `details/pairs` 使用确定性的 `.json.gz`，固定 gzip 时间戳并省略原文件名头；scene/index 保持普通 JSON。压缩不删减候选、成员边或条件。工具按 gzip 魔数读取并保留重复键/非有限数值拒绝规则；HTTP 详情资源用 `Content-Encoding: gzip` 交由客户端透明解压。`manifest.files` 的 bytes/SHA 锁定压缩后的真实文件，来源输入锁仍针对原始输入字节，两者不能混用。

| 目录记录 | 当前字段与用途 |
| --- | --- |
| `features` | 源局部有限 `geometry`、Source／SHA／三角见证、`frame_ref`、measurement 与功能已知/未知；用途未知仍发表 |
| `interfaces` | 稳定 `owner_ref + key`、名称、用途、尺寸摘要、成员、选择规则、声明来源与 Evidence |
| `members` | 本件 `feature_refs`、局部 `position`／`direction`、可选共享 `resource_ref` |
| `resources` | 同件有限孔道、轴段或面区；entries 保存具体 feature、low/high 侧、位置、向外边界法向 direction 及单独的 insertion_direction；孔口开放性继续待证 |
| `reference_connections` | 原装来源/声明中的具体映射与证据；不作为新候选白名单或当前库存占用 |
| 跨件候选分片 | 模板、双方有限特征、角色/成员关系族、必要几何见证、连接件需求和未决条件 |
| `part_notes` | 本件尚未形成能力或有冲突的具体结构及其短说明 |

有限几何使用 `cylinder`、`plane`、`conical_frustum`、`source_region`。后者用局部原点、法向及原三角索引表示非圆、复合或未参数化区域。几何坐标使用源网格局部米制，三角索引从零开始；工作台可以转换显示单位，不能改变源顶点或源装配位姿。

## 功能侧接口与共享物理资源

接口按用途、进入侧及配合对象划分。舵机两个端盘、两个壳体安装侧可以是四项独立能力；同一孔道的两侧安装成员则共享一条有限孔壁 Feature。共享几何不会强制合并功能接口，分开功能接口也不增加物理孔道数量。

catalog/3 明确发表 resources，成员和入口按真实引用共享有限资源。合并孔壁段需要共同边/有限肩面等连通见证；同轴不能合并两耳或背靠背盲孔。历史 resource_ref 的 Feature 身份按迁移记录保留，不重写旧包。冗余旧 Feature 可设 `candidate_eligible=false` 并以 `replacement_feature_refs` 指向同件新测量段；原接口/member 身份保持，候选解析替代段。

`selection.kind=unspecified` 表示尚未给定选择规则。`adjacent_pair` 明确列出本侧允许的相邻两成员组合；检查实际共面邻接，排除矩形对角及跨侧混选。规则作用于 `allowed_pairs` 中的成员，同一接口的其他支承面或轴颈可以单独参加连接。

接口提供可用成员，连接再引用实际相关的 `member_refs`。空列表表示引用整个接口且未指定具体子集，不表示已使用全部成员。四个几何孔不自动等于四颗紧固件；共享通道的并用条件也不由资源 ID 自动授予。

## 参考连接件路径

以下沿用来源参考路径的语义，不用于自动生成新候选的位姿。

连接可选带 `fastener_paths`。每条明确 `id`、`kind=screw`、`representation=schematic`，入口引用 interface/member/feature 及有限壁 `low/high` 侧，接收端引用具体 interface/member/feature，并绑定 Evidence。入口从真实有限圆柱端求得，不能把孔壁中心或成员方向直接当旋入起点。

路径表示可查看的参考路线，不是已安装螺钉或物料清单。整组几何选择不自动生成四件；显式选择孔或路径才请求示意。图形杆仅到接收孔入口，不填造真实长度、螺纹或旋入深度。路径校验实际归属、世界同轴、入口朝内方向及接收端顺序；不相容关系不得产生可用示意。

接口/对端的确认与紧固规格未知分别表达。明确声明的连接可为 `declared`，即使实际选孔、螺钉型号或紧固状态尚未给出；空 `member_refs` 保持未指定。源几何与证据原文不能为改状态而改写。

## 来源、连接依据与消费

接口的 `origin` 区分 `user_statement`、`source_geometry`、`project_inference`。声明文字限定适用对象、修订和推导范围；厂商通用例图不自动成为本设备的紧固件规格或实物装配确认。

| 连接 basis | 表示的依据 | 默认呈现 |
| --- | --- | --- |
| `declared` | 明确装配声明 | 已确定对端 |
| `source_assembly` | 固定来源装配中的具体绑定 | 已确定对端 |
| `source_fit` | 有限源配合与明确作用结构 | 已确定对端，并保留作用范围 |
| `hypothesis` | 有具体结构依据的待核实解释 | 可能对端 |
| `incompatible` | 当前具体映射不相容，附排除原因 | 单独呈现，不进入已用连接 |

“已确定”限定接口和对端的装配依据，不宣称实物预紧、轴向保持或工程验收通过。已建立的定位、挡面和夹置堆叠仍应明确表达，不能被通用“保持未知”抹掉。

工作台先显示本件安装接口、组成及已用／可能对端，选择与定位分开。选择只更新有限局部标注，定位是独立视图操作；查看对端使用连接实际引用的接口及成员，返回保留原接口。证据从当前结论按需打开，不在目录默认展开研究过程或全部内部坐标。

## 位姿无关候选、压缩与覆盖

固定八族模板：圆柱插入、锥形插入、轴承配合、键槽导向、有限面落座、螺钉接收、贯穿紧固及卡扣几何候选。遍历全部无序异来源实例对，同型不同实例也参与；每个 pair/template 均记录候选、数据不足、不适用或声明范围无匹配。未知不合并为无匹配，普通 source_region 也不默认推为卡扣。

检查尺寸及凹凸互补、有限轮廓和全部对应轴关系。平行组检查横向距离及入口有向面积；非平行组检查轴线间最短距离与无向夹角，保留尚未验证的手性和方向映射。60°/120°入口有向角分别记录，不能在用途/进入角色未知时把相同无向轴关系拒绝。孔组允许部分成员与独立旋转/翻面分支，不以入口共面或不同孔段的中心重合约束发现范围。

`relative_axial_offsets_m` 保存本件相对首成员方向的源局部测量，A/B 不要求轴向偏移相等；有限配准与插入深度继续未评估。source Frame 只说明测量坐标，不证明共同运动刚体；不同/未知运动归属保留条件候选。几何比较余量不当制造公差。标准件只表达参数/角色需求，不从光孔推断螺纹、SKU 或确定长度。

局部几何层及历史包固定 `assessment_scope=pose_independent_geometry`、`placement_evaluated=false`。`mapping_family` 保留有限成员关系。已发布包可捕获 `whole_part_interference` 规则：完整接口在有限边界贴合后，以两个原网格实体求交筛查；默认候选改为 `assessment_scope=complete_interface_fixed_pose`、`placement_evaluated=true`。每个 `alignment_option` 保存精确 R/T、端面来源、整件求交结果及数值精度，失败分支保存到 `placement_exclusions`。这些通过或排除只表达该版本刚性筛查范围，不是统一装配许可或物理不可能结论。前端不得改变已检查的相对姿态；固定终点通过不表示动画路径、紧固、保持或载荷通过。未捕获该规则的旧包按原合同重放。

带 `provenance.compatibility_interface_policy` 的输入另执行完整功能接口筛选：`interface_matches` 绑定双方接口、全部必需成员或已声明的允许组合、全部对称/入口分支，并发布同一源局部刚性关系下的孔轴对位见证。转子端盘必须四孔齐全；台阶段和别名不重复计孔，不能跨接口拼凑。孔轴的源局部关系不等于已求出整件无碰撞的装配姿态。默认 `candidate_count` 只统计通过此规则的候选；所有原始单孔、单面及部分映射保留在 `local_geometry_clues`，保留完整 pair/template 处置。没有该策略的历史包继续按原始局部线索合同读取。

共享纯函数 `query_candidates`、`query_primitive_pairs` 和 `query_mappings` 按输入摘要/过滤条件绑定游标。映射默认查询同向入口旋转，`entry_relation=opposed` 查询翻面分支；分支预算计入失败尝试，达到预算返回未完成及续页。页大小和排序不删减集合，不以 Top K 冒充全量。完整性只涵盖固定几何、模板版本和条件策略；符号关系完整与成员映射已枚举分别报告。

## 校验与独立验收

`validate_input` 校验稳定身份、owner／Source／SHA、原三角边界及实际有限几何、成员的同孔轴绑定、共享资源、邻接许可、连接成员选择和 Evidence 引用。重复 Evidence ID 仅在内容相同时去重，冲突拒绝。`incompatible` 保持排除身份，不作为已用连接。

连接的可选 `reference_assessment` 绑定 [reference-connection-assessment/1](../schemas/reference-connection-assessment-1.schema.json)，分开表达用途、对端、来源几何及紧固细节。所有未决维度须有具体跟进项；review/2 将历史假设和来源冲突一起纳入跟进，兼容恢复单独统计。字段与版本回放规则见[接口分析与验收](interface-analysis.md)，本轮结果见[原装状态复核](../../../docs/build/reference-connection-status.md)。

独立要求绑定真实源 SHA 和应有能力。删除接口后连带删掉连接、删除某个应有成员、混淆入口侧、替换轴承半径或把非孔区域改成孔，均须失败；更新总数不能补足缺失事实。通用测试另覆盖矩形边与对角、成员误指同 owner 的另一个孔、共享物理资源及源字节篡改。

1.15 还核验完整实例审查、未参数化残余、所有 pair/template 处置及分片引用。候选重放逐条比较完整参数关系，不能删掉某条 edge 后只更新计数。独立合成用例包括世界位姿不变、四孔对六孔、对称/手性、同孔距多重集非同构反例、标准件未知与分页恢复；不能只用同一个生成器的重放作为正确性依据。

发布核验同时比较 manifest 锁、Source 与 Evidence 字节、scene／knowledge 同一目录以及确定性来源重放。重放保证可重复，独立期望与原三角复核检查遗漏及错映射；二者不能互相替代。

## 原装配用法的独立审查

几何和候选覆盖不等于原装配用法完整。requirements/2 可选 `reference_uses: {source_ref, sha256}`，通过已有 provenance 捕获 [reference-use-review/1](../schemas/reference-use-review-1.schema.json) 原件。没有该字段的历史包继续按原义读取；不能追认其通过了新增审查。

审查固定每个输入实例及源修订、必需语义接口、每个接口的使用处置、具体参考关系及成员映射、机制和必需原三角区域。原始有限面观察另捕获输入，包含源锁、配置位姿、全部异实例对检查及每个观察对的处置；近邻观察本身不建立固定关系。审查依据来自冻结原件、独立三角检查和有来源的功能角色，不能取新生产器统计作为完整性期望。

校验结果保存在 `coverage.geometry.reference_uses`（`psop.reference-use-coverage/1`），逐部件说明、未决项及接口处置按需发布到部件分片的 `reference_use_review`。发布加载器要求分片内容与审查结果一致，删改说明或未决项同样失败。状态 `reviewed_declared_scope_with_explicit_open_items` 表示已审查声明范围，不能解释为实物安装或所有潜在用途已穷尽。

新增构建声明 `analysis.surface_alias_policy=share_witnessed_replacements/1` 时，语义 plane/source_region 别名与 `replacement_feature_refs` 指向的实际测量片共享资源。替代引用直接指向同件、同类、见证相符的测量几何，不能形成语义别名链。未声明此策略的历史包按历史资源规则重放。

工作台在“原装配”显示发布的用法说明、具体未决项和接口使用审查，可打开固定审查来源。壳体承槽、有限端挡和侧肩分别拥有接口成员及参考对端；保留端盘、壳体孔组和承座用途的区别。膝部等活动输出端的静态相位差不能冒充孔距不匹配，也不能补造已验证姿态。

## 有依据的参考配置修正

1.15 可选接收 `--reference-adjustments`，合同为 `psop.reference-adjustments/1`。输入绑定原始 Source SHA、有限 Feature、修复和相邻关系约束、工程修正预算、独立计算容差及推断理由。当前通用执行器 `witnessed-minimum-reference-translation/1` 求约束下的最小刚性平移，并检查实际源三角接触范围、有限轴段和受影响邻接关系。只有独立定位、尺寸、坐标映射或设计依据支持参考错误时才据此修正；原模型可能包含预紧、弹性或补偿偏置，不能仅凭刚性交集决定移动或改设计，也不能篡改求交测量。工程可接受重叠与数值精度另行表达。

`prepare` 生成 `indexes/reference-alignment.json`（`psop.reference-alignment/1`），记录前后指标、变换、来源、方法和验证范围。`freeze`、`validate` 重放并核对报告和独立输入锁，`finalize` 只消费冻结结果。manifest 可选 `reference_alignment` 入口；scene 只携带查看摘要。knowledge 保留原始 `source-qpos0`，新增 `basis=engineering_inference` 的 `reconciled-qpos0`，并声明 `default_configuration_ref`。

原始 Part 位姿、网格、参考冲突记录及位姿无关候选不改写。工作台消费修正配置时，将原冲突或待确认、现已通过指定有限检查的关系标为 `inferred_fit`，同时绑定修正配置身份；原有明确的对端声明仍保留其声明依据。“查看原始位置”恢复来源位置和原始冲突记录。工程修正不成为源声明或实物装配确认。详见[处理规则与实例](../../../docs/reference-assembly-repair.md)和[输入 Schema](../schemas/reference-adjustments-1.schema.json)。

## 历史归档

`source-model/1.0` 至 `1.14` 按各自冻结的 Schema、解释器和包字节读取及重放，不原地补字段或升级。1.15 的发现、资源和跨件候选不改变历史结论。Simulate 已消费这些候选、配置绑定参考连接和修正参考姿态执行交互装配与整组终态检查，见[会话合同](../../psop-simulate/references/contracts-and-api.md)。多件变体搜索、连续装入路径及工程保持／载荷仍未核定；Build 发布的知识与 Simulate 会话状态分别管理。

## 虚拟装配资格与刚性观测 /3

2026-11-11 新发布采用 `psop.interface-matching-policy/3`、`psop.fixed-interface-placement-policy/2` 和 `psop.compatibility-index/2`、`psop.compatibility-pair/2`。历史 /1 索引和 /2 匹配策略继续按原义读取、校验及重放。Part 详情、catalog/3 和 source-model/1.15 不改版本。

每个有限落座 option 保留原 `interference`，另发布 `assembly_assessment` 与未计算的 `mechanics`。已尝试完整原件检查不等于结果为 clear；必须读取原始状态，不把碰撞检查标志或操作资格当成刚性通过。合格完整接口的重叠或未计算结果可带说明试装，不能在发布前仅因 CSG 为正就丢掉。`analysis.assembly_policy` 和兼容索引保存版本化策略，不扩建硬件本体。

/3 的过盈、预紧与柔性 fit rule 可声明有依据的负名义间隙；完整成员、功能角色及双方规则仍同时适用。直径不相容、未指定成员或跨接口拼孔不能借此进入候选。新增 `assembly_policy` 的场景索引摘要必须与完整索引一致，旧摘要仍采用其原字段集合。

新包 `default_configuration_ref` 指向来源原装，协调构型以 engineering_inference 单独保存。刚性结果缓存按源 SHA、R/T、算法和诊断版本寻址，校验内核与缓存摘要，不缓存操作许可；策略通过共享判定函数另外解释。`prepare/freeze/finalize/validate/register` 仍核验完整输入、分片和血缘。具体记录见[执行验收](../../../docs/assembly-judgment-optimization.md)。
