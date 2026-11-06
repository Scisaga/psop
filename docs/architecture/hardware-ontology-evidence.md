# 硬件本体资料核查与 Microduck 关联实例

> 当前语义入口：[PSOP 硬件本体 draft.4](hardware-ontology.md)。下述来源核查于 2026-11-02（UTC）；版本边界同步于 2026-11-05（Asia/Shanghai）。
> **第 1–5 节记录 draft.1 期间的历史资料核查。旧机器图、ID 合同与报告已退出 v2，只能在 Git 历史的原版本中解释；本次未重新联网核查或迁移数据。** 文中“确认”限于当时来源支持的事实，不表示当前商品状态、制造适用或实物验收确认。新构建范围见 [DKP v2](device-knowledge-package.md) 和 [验证状态](hardware-ontology-validation.md)。

## 1. 核查方法与证据边界

原资料核查实际读取：当时的设计文档；core Turtle、SHACL、JSON Schema 结构和关键实体/关系/接口契约；三份接口参考；Microduck ZIP 目录和已有解包中文资料、CSV、XML；历史 v2.0.0 README/acceptance（**只是读取旧报告，不算当次核查复验**）；editor-sandbox 的接口投影及 XL330 来源量测记录。HAT 原始电路网未展开，当次核查只读相关 BOM 与板级身份。

`source-audit.json` 是当次核查程序产生的字节/节点统计，旧机器报告仅通过 Git 历史查阅，不再链接到已退役的 Build 资产目录。ZIP 中 56 个非目录成员当时逐一与旧 v2.0.0 input 原字节比较；补充 robot_walk.xml 不在原 ZIP 中，单独登记。两类来源不能混称“ZIP 原本包含 XML”。

一手补充文件实际下载到 `build/hardware-ontology-v2/evidence/`（本地研究材料，不声明获得再分发权），`fetch-log.json` 保存 URL、HTTP 状态、最终位置、字节数与 SHA-256。实例中每份已取得字节的 Source 保存摘要；仅在线读到的标准正文/目录页不虚构文件摘要。文件访问权限、许可和标准购买权没有因当次核查而扩大。

## 2. 历史核查的行业依据

不整体导入 IOF、STEP、ECLASS 或 AAS。以下只采用已核验内容，并明确 PSOP 推论；没有虚构标准中的安装孔数、扭矩或制造参数。

| 一手来源/版本 | 实际取得层级、日期 | 可使用的资料事实 | PSOP 采用与不采用 |
| --- | --- | --- | --- |
| [IOF Core release 202603](https://spec.industrialontologies.org/portal/release/202603/core.html) | 官方 HTML 内容，版本号 202603；未从版本号猜发布日期；访问 2026-11-02 | 工业中层本体建立在 BFO 上；计划规范、过程、角色/物件等有区别；FOL 注释不是普通 OWL reasoner 执行规则 | 借鉴“物件/信息/角色/过程”分离；仅概念对齐，不声明 owl:equivalentClass 或全量合规 |
| [ISO 10303-242:2025](https://www.iso.org/cms/%20render/live/en/sites/isoorg/contents/data/standard/08/43/84300.html?browse=tc) | 官方公开摘要/目录；Edition 4，2025-08；未购得完整标准正文 | 范围涵盖机械产品/装配、产品结构、长期数据管理、几何工程数据及验证等 | 借鉴定义/结构/几何/版本分离；不声称实现 AP242 解析或一致性类；Microduck STEP 不因扩展名被认作 AP242 |
| [ECLASS IRDI 技术说明](https://eclass.eu/support/technical-specification/structure-and-elements/irdi) | 官方网页，无显式发布版本；访问 2026-11-02 | 分类、属性、单位等对象使用包含版本的稳定标识 | 自建 `urn:psop:hardware:property:*`；没有编造 ECLASS 类码/属性 IRDI，也没有复制受许可的完整字典 |
| [AAS Part 1 v3.2](https://industrialdigitaltwin.io/aas-specifications/IDTA-01001/v3.2/index.html)、[Core 元模型](https://industrialdigitaltwin.io/aas-specifications/IDTA-01001/v3.2/spec-metamodel/core.html) | 官方 HTML；2026-07；访问 2026-11-02 | AssetInformation、assetKind、global/specificAssetId 分开；v3.2 区分 Type/Instance/Batch/Role 等 | 参考身份与语义标识治理；不把 AAS 类型直接等同于 PSOP 装配身份，不声称 AASX/API 合规。曾核对 v3.1.2（2025-10）后选用当前可见 v3.2，不称旧版“最新” |
| [ISO 261:1998](https://www.iso.org/standard/4165.html?browse=ics) | 官方摘要；Edition 2，1998-12；页面记录 2024 确认；未取得收费正文 | 公制螺纹体系；基础尺寸和公差分别涉及其他标准 | 只用于明确线程规范应分维度；不抄表、不猜 M2 螺距/公差，也不把 TAP 自攻螺钉当机器螺纹 |
| [ISO/ASTM 52901:2017](https://www.iso.org/cms/%20render/live/en/sites/isoorg/contents/data/standard/06/72/67288.html) | 官方摘要；2017-08；页面记录 2023 确认；未取得收费正文 | 增材采购信息涵盖零件定义、原料、最终特性、检验及接受方法 | 用于支持“制造交付不是 STL”；本体的具体 FFF 字段、判定门为 PSOP 自定义，不声称标准逐条规定喷嘴/填充率 |

旧实验的属性字典、接口算子、五结果代数、超图、AST、门禁和规则测试均是 **PSOP 自定义设计**，不是标准要求保留这些独立对象或模块。计算出的 AABB/孔口是 **资料几何计算**。对原厂身份、许可、装配要求的主张只在相应来源明确支持的范围内成立。

## 3. Microduck 的四个隔离资料域

| 域 | 冻结版本/证据 | 当次核查能确认 | 明确不能推出 |
| --- | --- | --- | --- |
| alpha 软件配置 | `4861141fdc7c7acd253671acf5abdd55b77b779e`；[控制设计](https://github.com/pollen-robotics/microduck/blob/4861141fdc7c7acd253671acf5abdd55b77b779e/docs/design/robotd-design.md)、[bus.rs](https://github.com/pollen-robotics/microduck/blob/4861141fdc7c7acd253671acf5abdd55b77b779e/duck-control/src/bus.rs)、本地关节表 | 15 个软件关节位置、XL330 系列、Radxa 范围与 NP-F550 等已有资料事实；没有逐件序列标识 | 不补成 XL330-M288-T；软件 ID 不映射为 STL 序号；控制范围不是机械硬限位 |
| walk 模型 | `cb70b792312d559a4da09064d92009079671815f`；[XML](https://github.com/pollen-robotics/microduck_rl/blob/cb70b792312d559a4da09064d92009079671815f/src/mjlab_microduck/robot/microduck/robot_walk.xml)、38 个原始 STL | 70 个视觉使用项、14 hinge；来源节点层级、局部参考位姿、轴/模型限位；网格外形 AABB | 不推导实际采购数量、物理连接、打印材料；模型中的 Pi Zero 2 W/NP-F970 不替换 alpha 型号 |
| HAT C1 板级参考 | `88d51faf7f5fcc845d2e3b42d4f05ebb98b963b9`；[原厂 BOM](https://github.com/pollen-robotics/elec_RPI_Robot_HAT/blob/88d51faf7f5fcc845d2e3b42d4f05ebb98b963b9/production/ASE01187-C1_elec_RPI_Robot_HAT_BOM.csv)、本地 PDF/STEP 及译表 | C1 板身份；相关连接器位号/原始标识；BOM与位置表是不同层次；STEP是板级外形参考 | 不认定 alpha 安装该 C1；封装名不能自动补为厂商完整 MPN；不从 STEP 节点计采购量 |
| 视频样机 | [原视频](https://pollen-robotics.com/assets/microduck/gallery/balance-recovery.mp4)，本地收集日期 2026-09-23 | 原媒体存在、摘要可核对，保留为单独证据域 | 未对视频做当次核查内部身份/装配验收观察；不生成隐藏连接或 PhysicalItem |

当时的 draft.1 机器图记录跨域 `corresponds_to: unknown` 和 `gap.correspondence`。v2 重新摄入资料时仍须保留尚未确认的对应及其影响，不能因移除旧类型而删掉问题。没有同一实机制造版本的证据，不能通过名称、外形相似或关节数量绕过这一门。

### 3.1 原件与量测复核

- ZIP 的 56 个文件当次核查逐字节核对，报告逐项给摘要与 equal_to_local；未更改原件。
- XML 摘要为 `80fc4424ed71e430ec4919110dfdb5c714dc1c4e1138e1832a16865cf31eb8c8`。网格/使用项/hinge 由 XML/CSV 解析计数，不由旧 README 复制计数。
- 所有 38 STL 的 AABB 从 binary STL 顶点计算，保存 calculated 主张。它们仅描述原网格坐标尺寸，不替代目录规格、配合公差或实物测量。
- editor-sandbox 的现有索引报告 6,237 个 geometry-only 接口、9,536 条量测、0 个 logical-ready、0 个完整协议；这是读取该索引的声明，不是当次核查重建全索引或复验整包。
- 当次核查从 CMP-000094 中选取 `x≈0.0115 m` 平面侧的 4 个不同模型孔口，使用原三角面请求与原始 STL 独立重放 `measure_geometry`；结果与冻结记录相同。报告保留请求 ID、feature ID、当前量测器摘要和最大拟合误差（约 0.85 μm）。**该误差是拟合误差，不是制造公差。**
- 这 4 个孔共享稳定 Feature 身份，多个 Interface 引用它们；未提供 manufacturer 允许的孔子集/载荷/紧固规则，因此所有真实选孔授权查询仍返回 unknown。

### 3.2 补充的外购目录、CAD 与采购链

已主动查找/核对，而非构造 URL：

| 对象 | 一手链接与取得内容 | 关联与限制 |
| --- | --- | --- |
| ROBOTIS XL330-M288-T | [原厂手册](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/)，实际取得 HTML；目录列 18 g、20×34×26 mm、Engineering Plastic；网页修订未注明，访问 2026-11-02 | 独立精确目录定义；经单位归一化保存；只做 alpha XL330 的候选，不向系列继承这些值 |
| 官方购买项 | [ROBOTIS AMERICA 产品页](https://robotis.us/products/dynamixel-xl330-m288-t)，实际取得 HTML；SKU `902-0163-000`，目录包装含一个舵机，销售地区页面注明美洲 | 精确 Offer 指 M288-T；不记录为已购买，不确认 alpha 选型，不把页面 shipping weight 混为规范质量 |
| 官方 PDF / STEP 入口 | 手册发现并点击 [PDF入口](https://www.robotis.com/service/download.php?no=1986)、[STEP入口](https://www.robotis.com/service/download.php?no=1987) | 保留下载入口与核查层级；若只取得中转页，不称已读取尺寸图正文或 CAD；没有从入口猜孔位/公差 |
| JST EH 连接器 | [JST 官方 EH PDF](https://www.jst-mfg.com/product/pdf/eng/eEH.pdf)，实际下载六页并渲染查看第 3 页的 Housing/Header 表 | 可确认目录 EHR-3、三位、2.5 mm 间距；原厂材料族按表可查，但当次核查未把所有表格规格移植到实机 |
| 名称差异 | ROBOTIS 手册写 EHR-03 / B3B-EH-A / SEH-001T-P0.6；当前 JST 图表给 EHR-3 和 B3B-EH 系列表达 | 保留 `gap.connector-suffix`；未无证归一为完全相同采购变体，未填现场线束退出力/锁定结论 |
| Radxa Zero 3W | [官方产品页](https://radxa.com/products/zeros/zero3w/)、[官方硬件文档](https://docs.radxa.com/zero/zero3/hardware-design)、[官方 Product Brief](https://dl.radxa.com/zero3/docs/hw/3w/radxa_zero_3w_product_brief.pdf) 已检索核对入口 | 产品页提供 Approved Partners，但 alpha 的容量/板修订未确定；不造精确购买项，也不把某个经销变体当 alpha 事实 |

包内螺钉清单只证明该销售包装的供应内容，不能证明 Microduck 支架实际用了其中哪颗，也不能推出 TAP 的牙型、螺距、等级或安装扭矩。来源未确认的数值不填写。

### 3.3 制造资料查找及许可

查阅了官方主仓库、模型固定 README 与官方硬件公开问题 [issue #168](https://github.com/pollen-robotics/microduck/issues/168)（2026-08-27 提出，维护者 2026-09-03 回应）。该维护者说明软件公开而硬件不是公开硬件制造包。当次核查未从官方资料取得对应 alpha 的完整打印工程、整机制造 BOM 或机械工艺。**这只说明当次核查所核查来源的限制，不能证明互联网任何地方均无资料。**

固定模型 [README License](https://github.com/pollen-robotics/microduck_rl/blob/cb70b792312d559a4da09064d92009079671815f/README.md#license) 将三维文件单独标为 Creative Commons BY-SA-NC，未写许可版本；不能按软件 Apache 2.0 或其他网站的新版许可补齐。社区复刻可以是独立设计证据，但不能替代官方 alpha 修订。

## 4. 贯穿案例覆盖：不得以合成替代真实

| 用户要求的案例 | Microduck 实际完成程度 | 合成/实验验证 | 阻断判断 |
| --- | --- | --- | --- |
| 舵机支架两孔、三孔、对角 | 4 个模型孔口重放、特征独立且共享；无安装许可 | SELECT 2/3、中心反向向量选对角、孔映射 | 哪种孔组可承担真实连接 |
| 不同子集连不同部件 | 无来源确认真实两个支架及其紧固件 | 完整 cfg.disjoint：同一 servo 的两孔+两孔分别接两个支架；四颗独立螺栓/垫圈/螺母，选孔许可与资源检查 | 真实接口并用条件、载荷和装配关系 |
| 多层板+螺栓+垫圈+螺母 | 模型有加强板外形，但真实叠层和紧固件未确认 | 完整超边、头/三层板/垫圈/螺母、各自定义/使用项和螺纹主张 | 啮合、扭矩、完整紧固工艺 |
| 轴孔/凸凹 | 来源模型有关节和外形；无确认机械配合公差 | 正例、轴过大反例、公差未知 | 实机配合、保持与退出 |
| 卡扣对齐/插入/锁定 | 不由 pcb_locker 等文件名认定卡扣协议 | 合成 align→insert→lock→unlock→withdraw，禁止跳过插入 | 变形、路径、锁定条件及现场确认 |
| 线缆连接器机械配合 | 原厂目录 EH 参数与命名差异有据；未确认实机配对/线束 | 键位匹配、错键、缺键位 | 精确配对、保持/解锁/退出；电路不在范围 |
| 含活动轴复合件 | walk 的 14 个源关节及限位独立保存 | 带内部 revolute 的合成组合；拒绝简单 DOF 相加 | 实机内部结构与约束后 DOF |
| 拆卸/重新组合 | 公开资料只有局部软件识别说明；不是拆装工艺 | 库存身份保持、连接删除后的分裂、重新装回；失败不应用成功效果 | 真实拆卸先决条件与观察 |
| 外购规格/原厂/采购 | 精确 M288-T 目录与官方店闭合；alpha 型号仍是系列 | 身份/Offer 类型门 | 具体 alpha 子型号、Radxa 变体、其他外购物料 |
| 打印制造 | 38 个原件/摘要/单位及尺寸计算；motor_support 制造 draft | 合成 FFF 参数/次加工/验收引用；不宣称 qualified | 材料/方向/参数/配合公差/强度/验收 |
| 初始→目标机械任务 | Task 与阻断知识闭合，feasible=unknown；不是因缺少预制 Plan | 合成初始库存→目标连接；Plan 仅是检验操作绑定与组合的测试夹具 | 真实规格/前置/验收不足，不能签发 Microduck 真实可行/SOP/安全结论 |

## 5. 旧实验图的可追溯路径（不是当前类型模板）

以下 ID 均来自冻结的 draft.1 图，只用于解释历史核查，可在原 Git 版本复核，**不是 v2 的记录或要求新知识经过 usage/position/Query/Gap 层**。

真实目录路径：`offer.xl330 → part.catalog.xl330-m288-t → prop.catalog.* → ev.robotis/src.robotis`；`candidate_for → part.alpha.servo → usage.alpha.left_knee → pos.alpha.left_knee → task.alpha.reassemble → gap.identity/mount/...`。因此可回答“候选精确型号从哪里获得”，同时准确拒绝“它已确认装在 alpha”。

模型几何路径：`usage.walk.* → part.walk.xl330 → geom.xl330 → src.mesh.xl330`，`feature.walk.* → if.walk.* → q.walk.* → gap.mount → task.alpha.reassemble`。真实连接/紧固件缺失不由源刚体组补造。

合成操作检查围绕 `task.synthetic`、`cfg.initial`、`op.connect` 与 `con.stack` 的绑定，追溯 `participants/fastener_stacks/interface_bindings → use.* → part.* → prop.*`，再检查预测配置与 `state.tight` 目标。`plan.synthetic` 只提供一个消费接口测试夹具，不是这条知识链必须经过的实体，也不是智能体生成算法或真实工艺的证据。观察 `obs.photo → obsdef.photo → q.accept` 可支持可见对齐，但请求 torque 返回 unknown；每层回溯至明确 synthetic 证据。cfg.disjoint 是同一定义在另一配置内的双支架完整夹具，不混入 Microduck。

上述路径说明旧版关联结构，复核须使用 Git 历史中的原输入与工具。**真实 Microduck 的事实链在机械授权、连接件、制造及实机验收处仍中断；旧机器引用闭合不代表 v2 或现实语义链完备。**

## 6. draft.4 怎样复用这些证据

- 目录规格与购买页继续提供可复用规格/购买选项，不要求创造一件实物 Part；alpha 子型号未确认的结论不变。
- alpha 软件标识回归其来源资料，不再定义 FunctionalPosition。walk 的 occurrence、body、hinge 须逐项审查哪些是 model Part、局部框架或纯来源节点；不据统计数量创建实物或采购量。
- 已量测的孔口可支持特征定位和几何条件；接口方式的子集许可、并用、连接件和完成标准没有来源时仍未知。旧软件预约 capacity=1 不是可以迁移的产品规格。
- 迁移时用 InterfaceConnection 的局部作用表达有依据的装配，螺栓/垫圈/螺母通过各自接口参与；没有实际连接依据时，参考位姿不能直接成为已接合或已完成的状态。机械、工程、任务和完成分别判断。
- 四个资料域的对应未确认、连接器命名差异、打印工艺和实物验收缺口继续保留在来源关联及构建报告；不需要新建 reasoning/assurance 模块才能承认缺项。

draft.4 的局部连续性只说明作用关系的延续；旧证据保持原对象、配置和时间，新判断按几何、定义、工况和模型依赖分别复核。本次没有新增 Microduck 实物、商品、孔位、螺纹、扭矩、材料或制造参数，也没有宣称新版机器图已经闭合。逐项迁移要求见 [迁移说明](hardware-ontology-migration.md)。
