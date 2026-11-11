# Simulate 会话与 API

2026-11-11。运行入口为工作台本地服务，类型定义见 [simulate-types.ts](../../../apps/workbench/src/simulate-types.ts)，服务实现见 [simulate-store.mjs](../../../apps/workbench/scripts/simulate-store.mjs)。

**装配资格优先遵循[装配判定与设计保真](../../../docs/architecture/assembly-judgment-policy.md)。** 不能把刚性网格交集直接作为装配的否决条件，也不应为了消除交集就认定需要移动或修改原设计。普通连接分别返回几何观测、操作资格和未计算力学状态。

## 会话和图

持久化格式为 `psop.simulation.session/1`。位置单位为米，朝向为归一化四元数；界面显示毫米和角度。

会话新增 `reference_configuration_ref` 与版本化 `assembly_policy`，公开可用 `reference_configurations`。新方案默认来源原装；旧方案优先采用已保存设置、参考还原报告或一致的连接构型引用，否则回到来源目标；加载不会移动现有实例。配置和策略与位姿、连接一起进入原子保存、撤销、重做、复制及幂等回执。

预览和连接新增 `assembly_assessment: {schema, decision, reasons, configuration_ref, policy_digest, mechanics}`。`decision` 为 `allow/allow_with_note/block`；前两者均映射外层 `ready`。`geometry` 保留实际状态和逐双件 `observations`；`mechanics.status: not_evaluated`。资源与闭环、选孔、台面错误单独说明，不能将 `interference` 伪写成 `clear`。

| 对象 | 内容 |
| --- | --- |
| SimulationSession | 场景 ID、名称、工作区、快照、包摘要、revision、实例、连接、历史和请求回执 |
| PartInstance | `instance:<Part ID>`、来源 Part、世界 position 和 quaternion |
| Connection | 双方实例、接口、成员与资源键，候选、匹配、配置和姿态修正来源，relative_transform、接口局部 anchors、geometry、conditions |
| AssemblyGroup | 从连接图派生的连通分量，不单独持久化 |
| ConnectionCandidate | 移动成员与目标成员、双方接口、B→A 关系、锚点、方向分支和试装条件 |
| ConnectionPreview | 对应场景修订、候选 ID、ready／blocked／unresolved、完整移动组终态或具体失败原因 |
| ReferenceAssemblyReport | 成品参考配置、保留／拆除连接数、参考连接／来源结构数、未核定标记；进入历史与复制 |
| AutomaticAssemblyOperation | 瞬时演出步骤、每组刚性目标、章节、焦点、时长和参考报告；重载不自动重播 |

内部 `past`、`future` 保存完整位姿和连接；公开 `history` 只返回操作标签。接口占用与组合均由有效连接派生。接口、成员特征及物理资源键均以实例 ID 隔离，防止通过别名或另一入口重复使用孔道。

## HTTP 接口

`GET /health` 返回工作台状态、`simulate.commands`、`policy_schema` 与 `assessment_schema`。客户端执行自动组装前须确认列表包含 `auto_assemble`；旧服务缺少此字段时显示重启提示，不写入待确认草稿或发送不支持的命令。更新服务代码后须重新启动对应进程，并核对原端口的能力和实际静态资源。

统一前缀：

```text
/api/workspaces/:workspace/snapshots/:snapshot/simulate/sessions
```

| 方法及后缀 | 请求 | 返回 |
| --- | --- | --- |
| GET / | 无 | `{sessions: SceneSummary[]}` |
| POST / | `{request_id, name?, copy_from?}` | 新场景；同请求 ID 返回已有场景 |
| GET /:session | 无 | 会话、公开历史、局部包围盒、固定 table 尺寸 |
| POST /:session/candidates | `{expected_revision, instance_id, target_instance_id?}` | 可用候选、全部接口及其 related 关联对象、占用、complete 和 blocked_count |
| POST /:session/candidates | `{expected_revision, scope: "scene"}` | 全场已纳入组合、仍有方式、已无可用方式或条件未完成；不把选中对象的空列表当作全场结束 |
| POST /:session/preview | `{expected_revision, candidate_id, moving_instance_id, target_instance_id, diagnostics?}` | 检查状态、终态 poses、checked_pairs、原因和耗时 |
| POST /:session/commands | 见下表 | 已保存会话、新 revision、table；拆分另含 operation 归位结果 |

命令共同携带 `expected_revision` 与 `request_id`：

| type | 补充字段 | 行为 |
| --- | --- | --- |
| move | instance_id、pose: {position, quaternion} | 对该实例所在组合应用同一世界变换 |
| connect | candidate_id、moving_instance_id、target_instance_id | 重新验证，原子提交整组终态和一条试装连接 |
| disconnect | connection_id | 删除该边、释放占用；较大子组合留在原处，较小一侧按包围盒寻找最近桌面空位并平移归位；相同数量保留目标侧，仍连通不移动 |
| reset | 无 | 清除全部连接，按固定 DKP 重新生成初始拆散排布；释放资源，保留身份、名称和之前历史，整体一步可撤销 |
| auto_assemble | mode: "reference" | 按来源／修正成品构型纠正连接，保留正确组合；原子保存成品参考、一步历史及演出计划 |
| set_reference_configuration | configuration_ref | 改变后续连接及还原的目标构型，保留当前位姿和连接 |
| set_assembly_policy | assembly_policy | 设置 `psop.assembly-policy/1`，版本 1，`minor_contact_volume_mm3`、`unrelated_obstacle_depth_m` 为非负有限数 |
| undo／redo | 无 | 恢复完整位姿与连接 |
| rename | name | 修改名称，不进入装配撤销历史 |

`table` 根据来源库存的初始排布固定，移动对象不会改变台面尺寸。拆分 `operation` 返回 `placed`、`still_connected` 或 `no_space`，及移动／保留实例 ID；`placed` 包含共同 translation 和 12mm 间隙。归位避让所有其他实例、隐藏库存、工具保留区和 15mm 台面边距。没有空间保留当前姿态。拆分与归位的前后完整状态进入同一历史项；动画只显示已保存结果。

`reset` 与新建共用当前确定性平放规则：按来源网格尺寸选择较低的库存朝向，同高时优先让实际较大的边界平面朝下，重新计算包围盒并留出间距。此布局不沿用薄片和轴承在整机中的竖装姿态，不从已经移动的位姿推算，也不删除场景文件或清空撤销历史。既有方案的加载和复制保持保存的姿态；显式 reset 后可一步撤销，准确恢复旧的竖放或手动摆放。写入失败不改变原状态；撤销和重做恢复完整位姿、连接与派生占用。

`auto_assemble` 是用户主动选择的成品参考演示。目标仅来自 DKP 部件位姿与已发布 `reference_alignment.placements`，按真实包围盒居中并落在台面。以来源接口／实际成员和目标相对位姿判定可保留连接；其余连接拆除。优先使用有明确成员且与目标一致的参考关系，检查接口与共享资源互斥；补足连通性时只使用来源模型显式刚性节点及父子层级，保存 `source_structure_ref`、`source_body_refs`，端点 `interface_ref: null`、空成员及空资源，不伪造机械配合。

新增参考边 `status: reference`、`geometry.status: not_evaluated`，记录独立操作资格和未计算力学状态；`reference_assembly` 明确记录所选构型。已有连接保留其原始几何记录。独立运动工作线程读取完整来源实体，用有限表面采样、实体射线和播放复核评估过程，`process_check` 与连接资格、终态几何和力学认证分别记录；不把允许参考归位写成实体／工程通过。来源结构不完整或循环时拒绝整次操作，写入失败保留原状态。

返回的 `operation.type: auto_assemble` 包含纠错、逐件整理、子组合预装和总成安装步骤。每个 motion 发布完整 `waypoints: [{at, position, quaternion}]`、整组终态及 `path_check`，客户端严格重放共同刚性变换，不猜测接入方向或增加弧线。当前工作台内播放，鼠标始终可旋转／平移／缩放；可选跟随视角在鼠标操作时解除，结束保持用户视角。暂停、倍速和镜头不写修订。跳过或刷新恢复已提交终态，撤销恢复开始前完整构型及报告。普通移动／连接／拆分／reset 清除完成报告，撤销恢复。来源结构参考可拆分，空接口不生成占用键。

工序来自全部件的反向退出搜索，而不是全机统一按类型排序；子组合内部使用 `preassemble`，主总成使用 `join`。轴承 `insertion` 保存发布轴线与具体成员引用，最后入座段同轴且不旋转。先将退出包络移到明确空位，再绕过其他库存转运；抬高工位支持下方入口和嵌套预装，子组合接入保持内部刚性。

封闭组合阻挡工序时可临时打开：`access_opened_connection_ids` 与错误连接的 `removed_connection_ids` 分别记录，最终保留正确连接 ID。报告记录部件、轴承、子组合、动作数量、采样间距、来源接触余量与回放采样结果。完整来源网格不变，已有原装接触按测得深度保留，新的途中穿入另记。找不到有据可依的刚性路径时标记 `presentation: reference_handoff`、`path_check.status: reference_only`，显隐交接到来源构型，不绘制不透明实体穿过障碍。按用户要求界面不显示待核工艺提示，内部记录不删除、不改成物理通过。

运动工作线程串行、按包摘要、所选构型及保留组缓存，最多保留两份网格上下文；180 秒超时保持场景不变。所有编排步骤使用相同播放函数逐段加密采样并检查台面，完成后才原子提交。采样与保守包围盒绕行不构成连续碰撞检测的完备证明，`geometry.status` 和力学状态不因此改成通过。

同一场景的命令串行执行。重复请求先查询回执，返回原结果；相同 ID 不允许用于不同内容。修订不一致或接口失效返回 409；无效姿态及几何阻挡返回 422；保存失败返回 503。请求要求同源 JSON，最大 64 KiB。

## 终态变换与检查

装配操作资格、刚性几何观测和力学结果独立记录。原装关系与合格接口接触直接允许虚拟操作，较大原装重叠保留记录且无需额外确认。材料和变形数据缺失不直接禁止虚拟装配。默认 `0.01 mm³` 是接触显示筛选，默认 `0.1 mm` 是新增/加深无关障碍的采样深度门槛；均不代表制造公差。

读取 Build 已发布的完整通用接口分支，以及带明确配置引用的原装参考连接。修正参考姿态仅采用 DKP 发布的 reference_alignment 变换与检查引用，保留原始配置。实际选孔／成员为空时保留关联并返回 unresolved；不把接口全部成员作为默认选孔。不使用动画画面的偏移。固定目标成员 A：

```text
movingWorld = targetWorld × publishedRelative
groupDelta = movingWorld × inverse(currentMovingWorld)
```

对移动组合全部成员应用 groupDelta。相同组合增加连接时只验证当前构型一致性，不改变内部位姿。

检查移动组与场景中所有其他实例，并检查台面。包围盒只排除明显分离；潜在重叠复用 Build 的完整实体内核。通用候选直接参与配合的双件复用其明确发布的已核定分支；原装／修正参考的直接配合双件仍进行完整实体检查，额外成员同样进入实体检查。非单位源缩放的额外实体检查返回未评估。

最多两个常驻 Node/WASM 几何进程，单次 15 秒超时。刚性缓存键包含双件几何摘要、相对变换、算法及诊断版本；操作缓存另绑定包、会话修订、候选、构型和策略摘要。超时或未计算允许带说明试装，但不缓存为测量通过，也不长期缓存操作判定。实体检查不进入浏览器主线程。

深度诊断 `psop.solid-contact-diagnostics/1` 返回交集分量、A 局部坐标系、有限源表面采样的三角距离、源三角索引及相对表面三角索引。该深度是采样估计。无关部件按操作前后结果比较，已有穿入不加深或正在退出时不拦截；体积极小也不能隐藏实质新增穿入。

## 保存和恢复

文件位于登记表同级的包外目录：

```text
state/<workspace-hash>/simulate/<snapshot-hash>/<package-digest>/<session>.json
```

临时文件写完后原子替换，失败保留上一份完整状态。最近 100 步及 100 份请求回执随场景保存。复制仅继承当前位姿、连接和配置，清空撤销与回执历史。

浏览器在提交前保存待确认命令。断线后保留相同请求 ID，刷新可恢复重试；若服务端已提交，回执阻止重复建立连接。409 时读取最新状态，不自动覆盖另一个标签页的修改。DKP 切换后不迁移旧方案，装配操作不改包内文件。

### 按需接触深度

普通原装预览先读取/测量体积，不等待详细采样；`preview` 请求可加 `diagnostics: true`。展开几何详情后请求深度，期间保持原有 ready 结果和可连接按钮。详细采样超时则复用已经测得的体积，附 `diagnostics.status: not_evaluated`，不将体积改成未知或伪造深度。完整的详细结果可由同修订的 connect 复用；过期修订的异步结果不更新当前预览。
