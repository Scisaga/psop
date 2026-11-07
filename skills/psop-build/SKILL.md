---
name: psop-build
description: 从设备原始资料和全部件清单主动发现并调查局部连接结构，记录有限几何、功能依据与未决动作，以独立源模型标注验收覆盖，发布可追溯的数据型 DKP 供工作台读取。
---

# PSOP Build v2

2026-11-07（Asia/Shanghai）。工具 `3.0.0-draft.12`，默认知识剖面 `psop.hardware.source-model/1.11`，封套 `psop.dkp/2.0-draft.1`，机械语义目标为[硬件本体 draft.4](../../docs/architecture/hardware-ontology.md)。

Build 生产不可变知识、来源、证据、几何、索引与 Schema，不生成设备专属 App，不写工作台会话。一个设备工作区可以登记多个 DKP。

## 默认调查流程

调查从全部件和原始资料开始，不等待用户逐个指出孔、槽或连接件。参考[完整连接还原](../../docs/build/connection-reconstruction.md)、[原子特征与装配规则](../../docs/architecture/assembly-interfaces.md)和[v2 合同](references/v2-contract.md)。

1. **核对实际环境。** 检查适用 AGENTS.md、分支、HEAD、已有改动，以及本次调用的技能、脚本与输入路径。核对工作区选中包的版本、摘要和 URL 中的 snapshot；历史选择可能仍在读取旧包。仓库和安装技能不一致时明确实际调用者，保留已有工作及历史包。
2. **枚举并初筛全部件。** 运行 `doctor` 和 `prepare`。默认生成 `work/investigation.json`：包括全部 Part 实例、几何源 SHA、资产、位置、源 body、资料引用、原网格法向区域及待调查结构。首次研究可不传调查输入；先读取这个文件，再决定后续检查。相同几何可复用提取，实例位置、可能对端和运动归属分别核查。
3. **先发现结构，再解释功能。** 用原 STL/CAD 和隔离、内外/背面多视图、透明、剖切或局部放大复核孔、槽、柱、台阶、卡扣及遮挡区域。给可观察结构稳定编号、源三角面或边界及局部位置；不预填无依据的孔数、尺寸或用途。自动检测不支持时保留具体区域、限制与替代方法，不能静默省略，也不能强行升级成接口。
4. **主动寻找具体证据。** 对未解释结构检查本地 BOM、图纸、装配说明、照片、相邻件和中间件，并按具体缺项查对应修订的上游项目及厂商资料。保留实际 URL、型号/修订、原件 SHA、支持的结论、冲突和真实阻塞。参考装配只支持已知构型；无对端或未对齐不代表永久不能安装。厂商通用图不证明本设备用法。
5. **逐项执行，形成关系解释。** 按“选取未完成结构 → 实际调查 → 形成具体判断 → 写入证据 → 检查结果 → 继续下一项”循环，不在生成清单后结束。同时从已有 `connection_reviews` 进入，读取实际参与者、局部特征、role_paths、替代方案、缺项及中间件，不能把审查数量当接口数。对每个重点部位核对具体对端、有限轴段、直径与全部组距、结构互补、共同构型和必要第三件；逐项解释定位、保持、限位与运动，保存反证及替代机制。几何邻近仍为 geometry_only，不能改名为接口。有实际检查与机制证据但缺公差/载荷时，保留有范围的 supported_hypothesis，不等到工程确认才记录已经得到支持的知识。
6. **独立验收结果与覆盖。** 从原始模型、明确几何条件和独立机制资料制定 source-SHA 绑定的结构与关系期望，不复制生产输出作为分母。逐区域区别 auto_screened、reviewed、unreviewed、blocked；遍历网格、全 Part 对筛查或通用 gap 都不是审查完成。至少用另一类此前无声明的部件验证通用性。故意删除应有关系或退化为通用 next_actions，即使重算统计和 manifest 也应失败；缺证样例应保留几何和具体缺项。分别统计几何截面、候选、安装假设、安装定义与工程确认，不混成完成率。
7. **冻结输入并贯通消费。** 将已执行调查、独立标注和来源记录作为 `--investigation` 显式输入；1.11 用 `psop.interface-investigation/1.2`，保留原 relation_studies/expected_relations，并增加 connection_review_studies/expected_review_findings 与多部件 relation_contexts。原件以相对 capture_path 和 SHA 固定。功能声明仍经 `--assembly-knowledge` 单独摄入。更新依据后重新 prepare 到新目录，再 finalize、validate 和登记工作台。确认能从具体部位进入关系、查看依据并跳转对端，而不只看到候选数量。finalize/validate 只消费冻结输入并确定性重放，不联网、调用模型或产生新知识。

工作状态与证据状态分开：`work_status=not_investigated` 表示尚未执行对应功能调查，自动 stop_reason、几何 reviewed 或空 next_actions 都不能改变它；`investigated + insufficient` 必须有已实际读取的来源、执行方法、具体发现与缺证；`supported_hypothesis` 另须有具体对端、机制、分角色解释及支持/反对证据。unknown 不是跳过仍可执行分析的出口。完成一个容易的孔不能将整件标成已调查完毕。

## 数据与证据边界

- 有限壁、面和开口是几何；同轴或邻近不自动确认通道连通、功能、螺纹、保持或承载。孔道两端/阶梯壁不重复计逻辑孔，合并需要拓扑见证。实体柱引用自身 Feature，不伪造孔或端口。
- Interface 需要机制、角色、有限特征、互补条件及功能依据。安装位置、允许选择规则、参考实际配对与已接合集合分别保存。来源未确认的机制、最少选用数量和运动区域保持 unknown，不把整个源 body 当物理刚性连接。
- 结构候选保留源 SHA、局部坐标、原三角、拟合误差/角覆盖和处置去向。局部测量随实例位姿变换；显示爆炸、相机和局部透明不改变权威测量。
- 定位、保持、运动和中间件分别调查。装入侧、承座、方向与有限路径需要各自依据；示意件的头位/杆轴也须符合它声明的假设。重放和独立检查分别验收。
- 原件声明、直接测量、项目推断、安装定义和工程验证分层。未知用途的真实结构不能从几何层消失；有来源和停止理由的待证项可以部分交付，未审查区域继续公开。

## 执行与验证

Python 3.11+，几何构建仅用标准库。命令在仓库根目录运行，首次取得固定 XML 可联网；已有原件传 `--xml`，摘要仍须匹配。prepare/finalize 使用新目录。可运行的 Microduck 命令、独立原模型复核及本轮缺项见[设备样例与调查结果](../../docs/build/interface-review/source-review.md)及[构建指南](../../docs/build/device-knowledge-build.md)。设备历史尺寸和纠错见[案例说明](references/microduck-case-notes.md)。

```powershell
python -B skills/psop-build/scripts/psop_build.py doctor
python -B -m unittest discover -s skills/psop-build/tests -v
```

发布核验 Schema、来源字节、引用、独立标注/关系接受要求及确定性重放后原子完成；更换输入或工具须重新准备。共享 assembly 代码与 Schema 也进入工具血缘。1.0～1.10 保留原 Schema、算法和字节，不能原地扩写或将历史解释提升为当前事实。1.11 的 `connection_review_findings` 为每条已有审查保留局部线索与工作阶段；只有实际冻结研究可标 investigated，几何配对不自动形成假设。无局部依据时位置必须为空，不能用 Part 的首个特征或原点伪造定位。全 Part 覆盖同时公开尚未进入旧审查的有限对端提议。

交付包路径、剖面/版本/摘要、实际检查范围、样例前后对照和可定位未决项。在仓库既有构建任务记录处维护简短目标、关键决定、完成项和下一步。工作台或查询工具必须能定位新结构、依据和待证原因；页面打开、同算法重放及测试总数本身均不构成独立漏项验收。
