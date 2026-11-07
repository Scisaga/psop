# 数据型 DKP v2：来源与装配知识层次

2026-11-07（Asia/Shanghai）。工具 `3.0.0-draft.10`，默认 `psop.hardware.source-model/1.9`，封套 `psop.dkp/2.0-draft.1`。机械目标仍为硬件本体 draft.4。

## 文件与身份

入口 manifest.json；文件只允许 inputs、sources、knowledge、indexes、schemas。没有包内 App、执行服务或场景可变状态。知识入口为 entities/sources/evidence/gaps，浏览入口为 indexes/scene.json，固定路径由 entrypoints 给出。

manifest 必需字段包括 schema/profile/package_id/package_version/device/created_at/ontology/adapter/inputs/toolchain/entrypoints/counts/capabilities/files/package_digest。新 Schema 为 [manifest-source-model-1.9.schema.json](../schemas/manifest-source-model-1.9.schema.json) 与 [source-model-1.9.schema.json](../schemas/source-model-1.9.schema.json)。

files 覆盖除 manifest 外的所有文件，逐项固定相对 POSIX path、bytes、SHA-256。绝对路径、点段、盘符、反斜杠、符号链接、重复和额外文件拒绝。package_digest 为去掉自身字段的 manifest，以 UTF-8、对象键排序、无额外空白及非有限数值的 JSON 字节 SHA-256。它是完整性摘要，不是发布者签名。

工具摘要纳入 Build 脚本、Schema 与共享 assembly 实现；生产工具血缘变化不自动使已有包失效，读取兼容性按明确剖面分支决定。Part ID、接口定义身份与实际连接绑定身份不得混用。

## 显式剖面

| 剖面 | 读取范围 |
| --- | --- |
| 1.0 | 来源、模型 Part 与参考配置；未分析接口 |
| 1.1 | 冻结的圆柱特征及历史几何组/配对；不作为新接口资格证明 |
| 1.2 | 冻结的有限面、局部法向计算及历史几何组/配对；旧‘接口候选’统计已撤回 |
| 1.3 | 原子几何、逻辑孔、几何模式与参考观测分层；功能机制未核定时不生成 Interface |
| 1.4 | 显式装配说明输入、安装孔位／组合规则、标准参考安装映射及有限槽开口 |
| 1.5 | 冻结的局部安装声明、显式未知规则、有限锥销与实体安装位置；小柱用途的旧用户确认标签在 1.6 纠正 |
| 1.6 | 厂商支持原件、圆内开口／有限变半径腔、全对筛查与连接链审查、补全示意和推断资格 |
| 1.7 | 源位姿柱孔有限配合、定位推断与保持未知分离，补全件按参考连接件和未核实替代解释分类 |
| 1.8 | 参考连接件 insertion 假设、外侧入口与杆向修正，独立有限区段一致性检查 |
| 1.9 | 全部件/原网格区域清单、任意轴有限圆柱发现、待证结构与局部对端提议、固定独立标注覆盖 |

旧 Schema 与算法保留原字节，不能原地升级旧包。以上不是已废弃 core/DKP v1 的兼容。

## 1.3 来源剖面

frames 是有来源的测量框架，kind=source_geometry_measurement，活动归属 unresolved；不自动提供 attached_to 或已确认 rigid_segments。features 继续使用严格 cylinder/plane 联合定义，绑定来源摘要、局部框架、有限段/区域、源三角面及数值误差。

logical_holes 保留原子孔身份、组成壁段、端口及有限连通见证。只有拓扑支持才能合并阶梯孔；同轴、相邻或共同名称都不够。孔功能和允许旋入深度不由壁长、半径或端口数推断。

feature_patterns 是共同测量框架下的几何阵列及成员/端口，不是功能 Interface；其活动归属及工程用途保持未定。几何形式可有多个描述，成员身份不复制。

reference_observations 将 source qpos0 的逐孔、孔轴与有限面测量记录为 geometry_only；participants 直接引用 part/feature/logical_hole/pattern，不借 Interface 身份。原子观测继续存在，hole_pattern_alignment 父观测保留 member_observation_refs、成员对应和参考配置。统计区分原子、派生和总记录数，不将其称连接数量。

有限面量仍为源面面积/投影交叠；normal_halfspace_test 仅给数值投影、近接假设和计算范围，不使用机械 blocked/可动结论。源码参考位姿、body 或 hinge 不证明接触、承载、紧固或活动区域映射。

1.3 没有摄入装配说明，interfaces、connection_candidates、interface_connections 为空。Part 和 Configuration 标明 mechanism_unconfirmed，不能解释为不存在接口或无法安装，也不能用这一历史空值覆盖 1.4 新输入提供的知识。

## 1.4 安装知识剖面

`--assembly-knowledge` 输入固定说明的原始字节、摘要、设备及适用几何修订，独立登记 `SRC-MD-ASSEMBLY-KNOWLEDGE` 与证据。说明区分用户原话、项目解释及参考装配限定；不能写死在算法中，也不伪称制造商认证。未提供说明时不自动获得相同功能资格。

| 扩展 | 关键字段与意义 |
| --- | --- |
| mounting_sites | 稳定 ID、owner/frame、hole_ref、portal_ref、位置及 entry_direction、side_ref、角色、assertion/source/evidence；geometry_candidate 与 user_asserted 分开 |
| mounting_interfaces | member_site_refs、侧别成员、机制及角色；selection_rule 明确同侧、min_count、允许邻接对；引用功能说明与未决条件 |
| reference_mounts | 参考 Configuration、双方孔位映射、共同参考位姿、孔轴与间隔测量、未绑定 fastener 角色、用户声明与几何复核依据 |
| slot_features | 源网格摘要与有限内边界，capsule_opening 或 rounded_rectangle_opening；记录方向、宽长、圆角及拟合依据，不声明槽深或贯通 |

八个侧别安装孔位可以引用四条共享孔道；成员池、选择 S 和实际接合集合 E 不同。相邻由明确的孔位关系定义，矩形短边／长边与对角区分。原 feature_patterns 保留侧别测量，不直接变成两个安装对象。

reference_mounts 是声明范围内的已知参考解：reference_alignment 可通过，同时 mechanical/engineering/task/completion 保持未评估。两段孔壁有间隙时仍可由已声明关系和共轴／孔距／方向复核对应；不得靠改全局近接阈值声称紧固成立。旧 raw interfaces/connection_candidates 及运行连接数组不借新来源改造成已保持状态。

## 1.5 增量与未知规则

装配说明输入 `psop.mounting.knowledge/1.1-draft.1` 保留原说明，新增 mounting_assertions；各项以网格及摘要限定适用几何，保留原话、项目解释和未声明范围。上方四孔仅确认位置，不能复制另一接口的 min_count=2、同侧或邻接许可。selection_rule 的 unknown 分支用空值表达未核定字段，不以 0、空允许集合或任意默认值冒充禁止或许可。

新增有限 Feature 几何 conical_frustum，记录真实方向、轴向范围、两端测量半径及源壁三角面。闭合端面、法向及有限拓扑支持实体柱判断；截切基部仍保留真实边界，不能补造完整圆形端口。integral_pin 安装位置的 hole_ref、portal_ref 为空，以 feature_refs 寻址同一 Part 上的柱；不新增虚构 Part。该类型的 position 为销端，entry_direction 沿基部指向销端，表达销轴方向；孔类型的 entry_direction 则指向孔内，消费时必须按 site_kind 区分。安装接口可保存未知机制／规则，必须保持来源及未决条件，不等于完整可执行连接方式。

1.5 继承原双孔 reference_mounts；新四孔和实体柱不因来源邻近而自动获得参考紧固关系。固定 qpos0 的相位差、轴线对应或重叠是几何诊断，不是“永久不可装”“已保持”或工程通过。校验对新类型、来源摘要、异主引用、未知规则及重放保持严格，旧 1.4 Schema、算法和输入说明 fixture 不被改写。

## 1.6 完整连接审查（冻结历史）

输入说明为 psop.mounting.knowledge/1.2-draft.1。mounting_assertions 增加 assertion_basis，区分 user_statement 与 project_inference；不能因用户指出部件存在漏项就替他确认具体特征的作用。supporting_documents 的相对 path、原 URL、SHA-256、manufacturer_general scope 与 claims 随 prepare 固定到 inputs，发布为独立 Source／Evidence。连接审查原话另独立定位。历史输入使用冻结 fixture 和原剖面读取。

| 扩展 | 范围 |
| --- | --- |
| circular_openings | 真正内轮廓的有限圆开口、方向、边界、拟合、来源面及摘要；不自动认定贯通或用途 |
| passage_hypotheses | 同轴开口与有限变半径壁的源边拓扑见证，不经外壳或盲底绕连，不补完整实体 |
| pair_screenings | 固定参考配置中的所有 Part 对、世界 AABB 分离量、阈值及后续 review 引用；仅广相筛查 |
| connection_reviews | 参与者、双方局部位置、辅助几何、定位／保持角色、第三件、替代解释、四维未知和缺项 |
| supplemental_components | synthetic、illustrative_unconfirmed、not_confirmed BOM，含来源、参数依据、姿态和关联审查，不计实物 Part |

算法阈值不成为制造公差。原有参考映射可作为声明范围内的已知解，广相边界外也不被解释为不能安装。面投影仅为几何证据，不能据其决定固定方式。厂商一般图中的螺钉与压盖可作为候选机制依据，不能自动确认为 Microduck 规格或物料数量。示意部件的参数、身份和用途状态必须与连接审查一致，禁止伪造保持或完整工程通过。

连接审查和 mounting_interfaces 安装定义仍是部分知识，不等于完整 Interface 资格。1.6 的静态 Simulate 输出以 installation_definitions 保存它们，functional_interfaces 保持空；规则和审查可读取不等于已执行选择、装配或保持。

详见[完整连接还原](../../../docs/build/connection-reconstruction.md)。校验覆盖支持原件输入锁、来源引用、内腔拓扑、完整广相集合、审查成员与辅助证据、推断资格、示意件非物料身份及确定性重放。重新计算摘要不能绕过这些检查。

## 1.7 柱孔配合与补全件用途

输入说明仍为 `psop.mounting.knowledge/1.2-draft.1`，新解释和原始字节进入新的输入锁，不改写 1.6 的 Schema、算法或包。新增 `pin_hole_fits`，每项只表示来源参考配置下的一组有限柱孔测量：

| 字段 | 意义 |
| --- | --- |
| review_ref／configuration_ref | 关联逐对审查及唯一共同来源配置，不进行逐柱独立配准 |
| status／inference_scope | 固定为 source_pose_geometric_fit／installation_location_only，不表示接合或固定 |
| grouping | reference_pair、selection_status=unknown；观察到两成员不自动产生最少数量或允许子集 |
| participants | pin_carrier 与 housing_hole_carrier，各自保留 part/site/feature 引用 |
| pairs | 一一柱位／孔位引用，世界坐标中的柱基部、柱端、双方轴、孔入口及有限重叠起止点 |
| pairs[].measurements | 源几何计算的轴距、轴角、有限插入长度、孔径、入口与重叠末端柱径、径向间隙；单位 m |
| measurements | 成员数、双方组距及组距差，basis=calculated_from_source_geometry |
| assessments | location=geometric_support；retention、load_capacity、mechanical、engineering、task、completion 均 unknown |
| source_refs／evidence_refs／unresolved_requirements | 可追溯原件、证据与未决条件，不借用外侧圆洞作柱孔用途依据 |

Microduck 大腿每两根柱对应同台舵机壳体 B2／B3，组距约 16 mm、有限插入约 2 mm；孔径约 2 mm、插入段柱径约 1.80→1.59 mm，源模型有间隙。该测量支持安装定位用途推断，不证明过盈、倒扣、摩擦保持、抗拔或承载。真实公差、材料和保持方式须另有依据。外侧 Ø5.5 mm 大洞用途仍 unknown，不能因共轴而列为主固定路径，也不能称为装饰。

`supplemental_components.usage` 必填：`reference_connector` 仅用于已有参考安装关系中的未绑定连接件；`unverified_alternative` 仅供检查未核实的替代解释。两类仍为 synthetic／illustrative_unconfirmed／not_confirmed BOM，不成为真实 Part。连接审查的保持 role_paths 不引用 unverified_alternative；轴心螺钉／压盖归此类、默认不显示，只能由用户显式查看，不能用图形存在反证实际使用。

Simulate 可读取这些有限配合及部分安装定义，保持规则、实际接合集合和物理执行结果独立。柱孔对齐与补全件都不产生已固定标签；历史 1.6 查询按其冻结合同返回，消费端须明确历史解释的未核实范围。

### 1.7 的历史方向缺陷

1.7 的 `entry_direction` 按安装位置类型解释，不是独立的操作方向合同。`reference_mounts.site_pairs` 固定对应位置，`connector_roles` 表示未绑定角色，`role_paths` 是作用链；它们都不直接给出装入入口、头部承座、材料层顺序或连续运动轨迹。`supplemental_components.pose` 有具体示意姿态，但 usage、摘要和重放通过不使该姿态的装入方向获得功能依据。

1.7 生产器由 bracket_mount 近侧入口生成参考螺钉，存在背离舵机目标孔的方向缺陷。该历史版本未执行独立方向检查，因此这些示意不能作为安装方向真值、模拟动作或已保持证据。1.8 的修正与受限检查见下一节。

后续完整物理与操作验证按[共同一致性规则](../../../docs/architecture/assembly-interfaces.md#9-规则绑定操作和显示的一致性)继续补足。新增机器字段以新 Schema、剖面和产物发布，不向冻结的 1.7 包添加字段。

## 1.8 参考连接件的有限装入假设

参考连接件必有 insertion，未核实替代示意的 insertion 为 null。记录 status=illustrative_hypothesis、hypothesis=through_bracket_toward_housing、reference_mount_ref、configuration_ref、实际 site_refs、entry_part_ref／entry_portal_ref、target_site_ref、head_seat_world、axis_world 和源孔壁 sections（part／hole／feature 与轴向 range_m）。checks 仅 finite_geometry=pass，continuous_path=not_evaluated、retention=unknown。

生产器从同一支架孔道选择朝向目标的唯一外侧开口，不将参考映射的近侧孔口直接当装入入口。独立校验从源孔口及有限壁段复核头下位置、姿态轴、目标朝向、区段顺序与杆段覆盖；反向、过短、借用其他孔或篡改测量均拒绝。无法唯一确定或几何不支持时移除该示意，保留未绑定紧固角色和缺项。此处是受限的图形一致性检查，仍不确认设备实际装入侧、真实长度、承压面、螺纹、连续可达性或保持。1.7 的原有错误方向按历史合同保留，消费端须注明尚未核验。

## 1.9 主动结构调查与独立覆盖

`prepare` 默认从全部 Part/几何资产开始生成 `work/investigation.json`，不依赖人工 mounting selectors。`mechanics.discover_structures` 从相邻面法向提出至多 64 个轴，用径向残差、有限壁长、角覆盖和内外法向复核。保留半径 0.5–50 mm、壁长至少 0.15 mm、角覆盖至少 35% 的适用范围；部分壁仍为部分几何，不补满圆柱、不据此认定贯通或功能。

新知识和 scene.analysis 同时包含四项，旧 1.8 的 features、接口定义、计数和重放算法保持不变：

| 字段 | 合同 |
| --- | --- |
| structure_candidates | 实例稳定 ID、源 SHA、源局部 geometry/center、支持三角、拟合误差/角覆盖、既有 feature/opening 引用；function_status 与 review_status 分离；有 next_actions、missing_evidence、stop_reason 和有限对端提议 |
| part_investigations | 每个源 Part 实例各一项；几何资产/源、SHA、资料、位置/四元数/缩放、源 body、未核定运动归属、区域与候选引用及限制 |
| review_regions | 原网格六类法向扇区覆盖全部三角面；只记 auto_screened；独立输入可另记录具体已复核或未审区域、局部位置和证据，不用一个自动标记覆盖整件 |
| review_coverage | 区域审查分类和 complete=false；独立样例 expected_count、located_count、逐项 matches/missing、位置与下一步；样例无标注为 not_supplied，不是 pass |

可选 `--investigation` 接收 `psop.interface-investigation/1.0`。输入含 device_id、sources 和 samples；每个样例限定 part_ref/geometry_sha256、regions 和独立 expected_features。期望项有稳定 id、kind、center_local_m、axis_local、radius_m（适用时）、tolerance_m、triangle_witnesses、annotation_basis 和 next_action；区域有三角范围、审查状态、证据及限制。独立清单是输入，不能由生产输出自动补齐。

输入字节被锁为 manifest.inputs.investigation，发布 `SRC-INTERFACE-INVESTIGATION`。实际检索原件的相对 capture_path（限输入目录）、sha256 固定到 inputs/investigation-sources，发布为独立 Source，manifest.inputs.investigation_documents 列明每份摘要。来源文本作为证据数据，不作为指令。功能依据仍走已有显式装配声明，独立标注不授予机械资格。

覆盖检查直接比较冻结清单与候选的 Part、SHA、局部轴/位置/有限轴段、几何类别与原三角见证，不调用生产检测器生成分母。明确应检项缺失会拒绝发布/校验并列出 ID；功能 unknown、无样例、或区域未审查可以保留，但能力始终 partial。任何统计重算或重新封装摘要均不能抹掉固定分母。完整性重放是额外防篡改手段，不代替独立漏项检查。

对端提议只在源 qpos0 下比较有限轴距、方向及轴向间隔，保持 geometry_only；不建立保持、运动归属或连接件规格。不适用尺度/几何以及没有提议都有公开限制；没有参考对端不代表不能在其他构型安装。

## 1.10 已执行调查与具体安装假设

`psop.interface-investigation/1.1` 保留 1.0 的独立源截面与原件锁，增加冻结的
`relation_studies` 和 `expected_relations`。旧 1.9 的 Schema、原输入与投影不变；
新的输入和结果只能用新剖面发布。无研究输入的 prepare 仍能发现全部件几何，
但不会自动将它们标成已调查。

| 发布字段 | 合同与资格边界 |
| --- | --- |
| `investigation_records` | 已执行的方法、实际读取的原件、局部结构、具体发现/缺项与停止理由；work_status=investigated，证据状态独立为 insufficient 或 supported_hypothesis |
| `installation_hypotheses` | 具体双方、独立结构/特征/开口与局部坐标、共同源构型、机制、定位/保持/运动/限位角色、有限尺寸与全部组距、支持/反对证据、替代方案、第三件与未知条件 |
| `relationship_coverage` | 冻结独立关系期望及匹配/缺项；假设、安装定义、合格 Interface 和工程确认分别计数，不作为整件完成率 |
| 结构候选扩展 | work_status、investigation_refs、hypothesis_refs；几何 reviewed 不自动完成用途调查，installation_hypothesis_available 不等于已安装/已保持 |

当前可执行解释器是有界螺钉夹持假设：源 SHA 和独立原三角截面定位双方完整有限
内壁，在同一来源配置下一一比较轴距、有限壁端间隔、通过/接收孔径及整个孔组
的全部两两距离。必须另有实际查阅的机制证据与反证/替代解释；仅邻近、部件名
或同 body 不足以生成假设。阈值用于源模型一致性，不是制造公差。

该记录保持 project_inference、supported_hypothesis；必要螺钉属于
unconfirmed 中间件，不生成已安装的实体。保持、活动区、实际接合、工程验收、
连续路径和真实物料仍按各自缺证保存。安装假设不进入 qualified Interface、
interface_connections 或正式 mounting_interfaces，不改变其资格要求。

结果接受检查直接读取冻结 expected_relations，要求对应的具体双方、机制、
有限结构、测量、分角色解释和证据；删除应有关系或只留下通用 next_actions，
即使重算统计和封装摘要也失败。确定性重放另作完整性检查，不代替此接受要求。
Simulate 的静态查询返回同一组假设与调查记录，execution_performed=false，
functional_interfaces 仍空；Compile 尚无执行器，不能将这些假设用作确定的
紧固/承载监督标签。

Microduck 新输入为 `device-materials/interface-review/microduck-relations.json`，
旧 `microduck-review.json` 保留 1.0 的历史语义。该输入的新增设备知识与通用
解释器分开验证；尚未有依据的右壳 Z 向台阶孔及支承件另一组孔仍有具体调查
记录并保持 insufficient。

## 1.11：已有连接审查进入机制分析

新默认合同 `psop.hardware.source-model/1.11` 接收冻结输入
`psop.interface-investigation/1.2`。原 1.10 模块、Schema、三条假设和原件字节
保持不变。新输入是 `device-materials/interface-review/microduck-connection-analysis.json`。

解释链为 `ConnectionReview → 双方有限局部结构配对 → 机制候选 → 已执行证据审查
→ 有范围假设/具体待证结果 → 独立漏项接受 → 发布`。原 `pair_screenings`、
`connection_reviews`、`mounting_interfaces`、`reference_mounts` 和已接合记录
继续保留各自资格；几何候选不借新数组成为正式安装定义。

`connection_review_findings` 按 `review_ref` 关联原审查，包含双方 Part、
structure/feature/opening 引用、源局部坐标、有限直径/轴距/间隔/重叠、机制、
定位/保持/运动/限位、实际 actions、发现、反证、替代、第三件、缺项和下一步。
无依据的局部位置为 null；不能用原点或任意首个结构代替。自动配对保持
`not_investigated + geometry_only`；只有冻结的 `connection_review_studies`
能标 `investigated`。有机制依据的四孔通过/接收结构仍须双方独立原三角截面、
完整共同构型和全部组距通过，才产生 `supported_hypothesis`，实际保持仍 unknown。

`connection_analysis_coverage` 枚举全部70实例及211已有审查，分别引用安装定义、
假设、已调查缺证、仅几何和尚未调查结果；原候选中另有12对有限线索未进入旧审查，
保留双方具体位置、有限几何测量和调查方法。`connection_relation_contexts`
保存真实三个以上源部件的机构语境，不把间接链压成直接固定关系。

`expected_review_findings` 的7个独立接受案例要求六对髋部逐项结果和另一类左踝
的具体机制。删除关系/假设或退化成通用 next_actions 后重算 coverage，仍必须失败。
全量重放是额外的完整性检查，不代替独立接受。Simulate 查询读取同一 findings、
假设和多件语境，继续 `execution_performed=false`，不产生合格 Interface。

## 参数化方式与装配方案

详细语义统一引用[原子特征、参数化接口与装配方案](../../../docs/architecture/assembly-interfaces.md)。带功能依据的能力由独立共享 assembly 合同描述：稳定原子孔/角色、Interface/mode、S 选择约束、互补角色、连接件、共同构型、局部路径与四维判断。

完整子集清单、数量范围、包含锚点与成对条件不同，集合未知保持 unknown。S 不等于已接合孔集合。同一个接口可由 AB/CD 分开使用，按真实区段与 SHARE 条件判断并用。具体连接冻结绑定及所用修订，改变绑定遵循新身份/局部连续性，Interface 定义不随子集或对端变化。

合成夹具只验证共享规则，不写入 Microduck 的安装许可。当前有界查询不等于真实物理动作、连续路径、变形或工程批准。

## 能力与验证

source_registry/source_model_projection 在声明范围内 complete；几何、安装知识及参考关系按实际覆盖报告 partial。安装说明和参考映射可用，不意味着完整机械/工程/路径/训练可用；这些执行能力仍 unavailable。确切值以代码和 manifest 为准。

validate 核验新 Schema、来源字节、拓扑/模式/观测引用、摘要以及全量重放。独立语义检查阻止伪造功能资格和几何量；重新计算 manifest 摘要不能绕过。索引必须与知识一致，不能在 UI 另造权威知识。

工作台目录只验证登记 manifest 元数据；选择/读取内容进行完整验证。接口、几何特征、模式和参考观测分别统计、定位与分享，旧记录只按历史几何显示。空功能数组不抹掉已分析几何，也不据此宣称没有装法。
