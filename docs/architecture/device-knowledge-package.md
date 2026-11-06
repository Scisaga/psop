# DKP v2：设备知识数据包合同

2026-11-06（Asia/Shanghai）。封套 `psop.dkp/2.0-draft.1`，新构建知识剖面 `psop.hardware.source-model/1.8`，机械目标 `psop.hardware/2.0-draft.4`。

## 包与工作区

DKP 是不可变、版本化的知识和资产快照，不是工作台程序、数据库或设备工作区。统一工作台管理多个设备工作区；一个工作区登记多个 DKP，包外保存构建、查询、模拟、训练和评测记录。包内不含 HTML、React、JS/CSS App 或运行服务。

manifest 固定包/设备身份、知识剖面、本体定义与摘要、源 adapter、工具及共享代码血缘、入口、能力、逐文件 bytes/SHA-256 和规范化 package_digest。精确机器定义见 [Build 技能](../../skills/psop-build/SKILL.md)与其 Schema。

## 数据入口

| 入口 | 内容 |
| --- | --- |
| knowledge/entities.json | 模型对象、参考配置、测量 Frame、Feature、孔道、槽开口、安装位置、选用规则、参考映射、柱孔有限配合、连接审查与分类补全示意 |
| knowledge/sources.json | 原件、来源 ID、路径、字节、摘要与范围 |
| knowledge/evidence.json | XML/CSV/STL 及装配说明的原始定位、依据类型与对象引用 |
| knowledge/gaps.json | 分项能力、功能依据及计算缺项 |
| indexes/scene.json | 可重建的浏览索引，与知识和来源重放一致 |
| schemas/ | 本剖面严格机器定义，不隐式接受其他字段 |

## 1.3 知识分层

共同语义见[原子特征、参数化接口与装配方案](assembly-interfaces.md)。1.3 保留有限几何，新增 logical_holes、feature_patterns、reference_observations。阶梯孔的多段壁仍是同一逻辑孔；阵列成员与参考测量不自动变成 Interface。

reference_observations 的参与者直接引用 Part/Feature/逻辑孔/几何模式，不依赖 Interface 才能表达。逐孔和有限面原始观测保留，孔阵列对应另存父观测及成员映射。整面面积、有限投影交叠和数值法向投影保留各自含义，不能改叫承压面积、接触状态或机械阻挡。

测量 Frame 标明 source_geometry_measurement 和活动归属 unresolved，不把整个源网格直接升为已确认机械刚性区域。model 域 visual occurrence 不等于实物身份。

1.3 未摄入功能说明，原 interfaces、connection_candidates、interface_connections 保持空并标明 mechanism_unconfirmed。该历史结论不覆盖新来源提供的安装知识，也不表示设备不存在接口。参数化组合查询还可使用独立共享 assembly 合同，不通过改写真实 DKP 补入合成规则。

Interface 方式应有机制、角色、原子特征、互补条件、选择规则及来源/功能结构见证；具体装配绑定选定 S、对端映射、参与者与共同构型，局部状态另行派生。裸孔、面、齐孔、body/hinge 关系以及 candidate 字样都不足以证明资格。

## 1.4 安装知识

1.4 保留冻结的 1.3 基础层，新增 mounting_sites、mounting_interfaces、reference_mounts 与 slot_features。安装孔位引用具体入口及底层孔道；同四条双入口孔道可以提供八个安装孔位，两侧不复制为独立占用资源。接口保存有来源的组合规则，参考安装保存固定 Configuration 下的具体孔位对应与测量。

装配说明通过 `--assembly-knowledge` 显式摄入，作为来源文件登记并加入输入锁、逐文件摘要和证据定位。Microduck 的说明记录用户原话和项目解释：两侧可安装、同侧至少包含允许的相邻孔对、标准双孔与腿部连杆对应。声明依据与模型几何复核分别保留；不伪称制造商认证，不补造螺纹、允许深度或已紧固连接件。

标准参考映射可跨两段孔壁之间的间隙，记录双方入口、孔轴偏差、间隔、共同参考位姿及未绑定连接件角色。它是 Build 已交付的已知解，不是运行中的接合状态，也不限制这些孔只能连接原来的对端。

slot_features 的 capsule_opening 与 rounded_rectangle_opening 表达具有源网格内边界见证的有限长槽开口；宽长、圆角与拟合分别记录，不能只因包围盒接近而混用两类。不能据此自动声明贯通、槽深、卡扣或导向功能。知识、索引与可视化的范围必须一致，不能用局部支持三角面充当整个孔口或安装作用区。

## 1.5 部分安装知识与实体柱

1.5 继续读取冻结的 1.4 知识，新增带来源的局部安装声明、有限实体锥壁及 integral_pin 安装位置。孔入口与实体柱使用同一可寻址位置层，但柱引用自己的 Feature，hole_ref／portal_ref 为空，不伪造孔道。未知选用数量、邻接、侧别或保持机制分别记录；已确认四个安装位置，不等于已经确认四个必须一起用，也不应退回统一无接口空状态。

Microduck 连杆上方四孔在两侧实例中补齐；当前来源未确认双向功能入口或组合规则。左右大腿各四个实体柱通过源壁、端面和法向辨认，不能称为空孔。与附近舵机的源相位或轴线对应保留为测量及未决条件，不增造新参考紧固关系。新说明、几何及工具进入输入锁和重放，旧 1.4 包保持原字节。

## 1.6 连接还原与支持原件（冻结历史）

新增 circular_openings、passage_hypotheses、pair_screenings、connection_reviews、supplemental_components，分别记录有限内轮廓、内腔拓扑、全对广相、连接链及补全示意。新说明和厂商支持文档逐字节进入输入锁及来源；厂商通用结构、用户原话和项目推断各自限定范围。

大腿中心大孔与两台舵机轴端的对应进入审查；小柱的用途资格从旧 user_asserted 更正为 project_inferred。面投影仅作辅助几何证据。支持资料不能自动确认 Microduck 的螺钉型号或保持机制；补全螺钉／压盖以 synthetic、illustrative_unconfirmed、not_confirmed BOM 发布，不混入来源 Part 数量或已保持连接。

1.6 的中心圆洞与轴心补全件关联保留为历史未核实解释，不能沿用为当前固定依据。1.6 及以前包、Schema 和重放算法保持原字节；已撤回的资格在消费旧包时说明。

## 1.7 柱孔配合与用途边界

新增 pin_hole_fits，每项固定共同参考配置、两类参与者、逐柱／孔位映射、有限插入及径向间隙测量、来源和缺项。status=source_pose_geometric_fit、inference_scope=installation_location_only；每组两个成员仅为 reference_pair，selection_status=unknown，不产生最少双柱或允许子集规则。

大腿每两根小柱与同台舵机壳体 B2／B3 配对，组距约 16 mm、插入约 2 mm。源孔径约 2 mm、插入柱段约 1.80→1.59 mm，有间隙、无过盈／倒扣见证；定位用途为项目推断，保持与承载仍 unknown。外侧 Ø5.5 mm 大洞用途 unknown，不作为主固定依据，也不称装饰。

supplemental_components 增加必填 usage：reference_connector 是已有参考安装路径中未绑定的连接件；unverified_alternative 是未核实替代示例，不进入当前保持角色。两类仍为 synthetic／illustrative_unconfirmed／not_confirmed BOM。厂商轴心螺钉／压盖归后一类、默认不显示，不形成 Simulate 已固定标签。完整语义及机器字段见[连接还原](../build/connection-reconstruction.md)和 [Build 合同](../../skills/psop-build/references/v2-contract.md)。

## 1.8 参考连接件方向与显示

参考连接件新增 `insertion`，将“从支架外侧穿向壳体”保留为显式装入假设，固定参考构型、双方孔位、同一孔道的外侧入口、头下位置、杆向和源孔壁的有限区段。独立校验拒绝反向、错误头位、过短杆段及借用其他孔位；几何不支持时保留未绑定角色，省略错误实体。该检查不证明实际装入侧、承压面、螺纹、连续路径或保持。

工作台按“安装定义 → 参考装配的双方孔位对应 → 紧固路径示意 → 测量与来源”组织。可选孔位池及规则默认收起，具体对应不重复列卡；未确认的真实物料与示意参数分别表达。选择单孔、参考装配或示意件保留同一连接上下文，爆炸展示以入口所属部件为显示锚点。1.7 原包及原方向保留历史口径，显示时注明未按新方法核验。

## 发布、验证与读取

prepare 固定输入、本体和工具；finalize 在新暂存目录重建并验证后原子发布；validate 核对 Schema、引用、字节、摘要及从原件确定性重放。重封摘要不能绕过篡改检查。生产者工具摘要为血缘，历史包不要求当前校验器源码逐字相同。

工作台目录只读取并核验已登记 manifest 的摘要和元数据，不将目录行称作内容已验证。选择知识、读取结构化内容和资产时运行完整验证，并按每次资产读取核对字节身份；不为列出历史版本而重复几何重放所有包。

```powershell
node apps/workbench/scripts/workspaces.mjs register --dkp <新DKP目录> --workspace <设备工作区ID>
```

来源和包始终只读。接口修改和补充资料经 Build 形成新版本，不写回既有工件。数量、覆盖及缺项以该快照为准。

## 历史与退役边界

1.0 原文未做接口分析；1.1/1.2 的机器结构和字节按各自冻结合同读取，但其自动孔面分组不计为新功能资格。1.3 的几何剖面与空功能数组、1.4～1.6 的安装及审查合同同样冻结，新增声明经新快照发布。旧 core、CMP/PORT/IFC、DKP v1 与包内 App 不恢复。

来源、逻辑孔及观测可复验不代表完整机械、工程、路径或实物验收。数据集、训练、模型、评测、动作会话与查询结果在工作区独立版本化，并固定所用 DKP 摘要。
