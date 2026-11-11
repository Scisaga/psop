# 本件连接部位目录：实施与验收记录

目标：打开部件即可区分局部部位、选择真实成员、定位本件或对端；调查报告按需打开。保留源几何、拓扑、研究身份和历史包。

## 基线与调用链

- HEAD：`264e78567f620e01eb097be40fe44fc5ced9c97c`；开始时工作区干净。仅 `docs/ppt/AGENTS.md` 存在，本轮路径不在其作用域内。
- 服务：`127.0.0.1:8780`，`scripts/serve.mjs` 生产构建。开始时本机登记默认 1.10；本轮显式登记、加载已有 1.11（`dkp-84f6829a25a82fefaf1d`）固定对照。目录问题在该新知识包中确实存在。
- 数据：原 STL → features / topology-witnessed logical_holes / structure_candidates → 调查 participants 的有限结构引用 → installation_hypotheses 与 connection_review_findings → MountingInspector / ConnectionReviewInspector → resolveGeometry → SceneCanvas 的源三角高亮。
- 缺陷：按 Part 对字典索引研究，覆盖局部关系；报告与正式定义数组驱动重复卡片；默认展开第一份假设；selectGeometry 同时要求聚焦，选择与相机/局部透明耦合；原始同轴搜索组合没有用途分类；查阅来源与支持证据混用；无直接互补结构的记录仍标定位受支持。

## 左髋已有研究映射

| 本件部位（源局部） | 有限成员 | 对端实例 | 研究记录 |
| --- | --- | --- | --- |
| X 向四孔组 | 4 × Ø2.4 mm，PCD 12 mm | `9ffe9d5bcd6bc13a` 舵机 | `review-926a5beb2c028185` |
| Y 向四孔组 | 4 × Ø2.4 mm，PCD 12 mm | `cd6d48fccc95df41` 舵机 | `review-e42fab2d8700637e` |
| Y 向轴颈 | Ø16 mm 有限外圆柱面 | `47a950fbb3d0e416` 轴承 | `review-27d56794bd7c8a86` |
| X 向轴颈 | Ø16 mm 有限外圆柱面 | `bb34e925e25e29f6` 轴承 | `review-c2e8a8093a4b8563` |

`review-d22c650fc9abdaca` 排除直接 Ø16/Ø19 径向配合，保留三件支承语境；`review-f81f10dc6482cb07` 未取得直接互补结构，属于关联调查。两项都不能成为另一个直接连接部位。

## 实施决定

- 复用现有安装定义、孔道和有限结构，建立工作台视图适配层，不创建第二套机械 Interface。
- 仅为现有研究端点补稳定引用、局部配对用途和逐结论证据用途；源摘要进入身份，标签、位置格式、排序和证据文字不进入身份。
- 视觉沿用工作台字体、颜色和边线。360 px 面板采用紧凑目录行；选择后展示单个部位的成员与对端；完整分析复用可关闭的对话框。只有外层面板滚动。
- 选择仅改变局部标注；定位按钮显式调用已有局部查看；对端采用实际局部端点并保留返回位置。

## 目录与关系身份

`connection-sites.ts` 只适配已有 `mounting_interfaces`、`mounting_sites`、`logical_holes`、有限结构、参考装配、小柱配合和已调查关系，不发布另一种机械 Interface。一个成员使用已被拓扑见证的孔道、有限特征或明确的源三角集合；两个入口侧别共享孔道，断开的同轴壁不因位置相近而合并。

部位身份绑定所属 Part、源摘要和排序后的物理成员身份。研究字典改为 Part 对到多条研究的索引，记录身份、局部端点和构型分别保留。文案、浮点显示、输入顺序和证据增补不进入部位身份。

声明的可选孔池与参考装配实际对应的子集分开。只有明确的 reference mount 与完全一致的实际成员，才能将该研究挂回已有孔池；不同局部端点不会误并。同一部位的竞争解释在证据窗口中比较。原始审查对应多个部位时提供选择，具体研究按钮保留该研究身份。

## 操作与证据

- 默认目录直接显示部位名称、源局部方向、成员/尺寸、可读对端实例和资格。其他有限几何作为用途未定线索继续可达。
- 当前部位页显示成员、可能对端、机制范围和关键未决条件。无依据的最少选孔数量不套用舵机壳体规则。
- 选择只更新局部源三角/特征高亮；定位显式进入可恢复的局部查看。载入期间的定位请求排队，完成后使用所选有限部位。
- 查看和定位对端均使用实际局部端点；返回恢复原部位、相机、隔离/隐藏设置和是否处于局部查看。成员分享链接保持同一身份。
- 几何页、报告中的具体端点和源三角拾取可反查目录。歧义公开候选；明确配合上下文可定位到对应成员。
- 完整角色、反证、替代解释、调查动作、原始审查/假设、来源、坐标及内部 ID 放入可关闭的证据分析窗口，保留原记录身份。
- 证据用途独立记录 support / counterevidence / retrieval，缺失依据单列。每条引用绑定实际结论和来源位置；板级 BOM/README 留作检索记录，缺图纸/螺纹模型不算反证。无直接互补结构的关系不声称直接定位有几何支持。
- 支持当前解释、已排除配对、未决备选与原始搜索分开，后两者不会被当作部位成员。
- 仅源几何的有限孔壁、外圆柱面使用几何名称；没有具体用途依据时，不自动称为安装孔或已知轴颈。

## 现场验收与画面对照

[完整画面对照与操作记录](../../../build/connection-sites-review/report.html) 包含原尺寸图片、相机、选择身份、源结构、对端实例及实际服务/构建 SHA。

| 检查对象 | 实际结果与记录 |
| --- | --- |
| 左髋 `fa9ee2f71faafb88` | 两个四孔组与两个轴颈分别可选；逐孔仅高亮该成员；本件定位、对应舵机局部、返回、正交孔组、两轴颈与轴承对端、具体证据均已执行。[逐步记录](../../../build/connection-sites-review/operations/fb88-operations.json) |
| 右髋 `c7eeeac0a640d191` | 重复完整流程，使用右侧独立实例及对端身份。[逐步记录](../../../build/connection-sites-review/operations/d191-operations.json) |
| 正式用途定义与纯几何部件 | 同一目录/成员组件；已声明用途仍标接合未确认，纯几何仍标用途待调查。[对象记录](../../../build/connection-sites-review/operations/regression-objects.json) |
| 左踝 | 无人工正式定义也可浏览四孔、对端和原关系；普通查看往返不开启局部查看，保持原相机及隔离。[往返状态](../../../build/connection-sites-review/operations/quiet-peer-return.json) |
| 右外壳、连杆、右大腿、舵机 | 既有孔口/壁、两侧八入口/四孔道、参考双孔子集、长槽、四孔与双孔分组、小柱配合、紧固示意、待验证方案、深链和源证据继续可用。 |
| 真实画布拾取 | 独立 STL 射线击中源三角 `12913`，反查 X 孔组的正确成员；画布和目录一致。[画面/拾取记录](../../../build/connection-sites-review/picking/source-triangle-pick.json) |

同视角对照：相机 `0.30,-0.32,0.23,0,0,0.105`，桌面 1600×900、详情 360 px；另有 1100×800 窄布局。修改前使用 `264e785` 前端与显式 1.11 快照，修改后使用真实生产构建与新 1.12。截图脚本未注入隐藏内容的样式。

- [修改前 1600×900](../../../build/connection-sites-review/before/hip-1600x900.png) / [修改后 1600×900](../../../build/connection-sites-review/after/hip-1600x900.png)
- [修改前 1100×800](../../../build/connection-sites-review/before/hip-1100x800.png) / [修改后 1100×800](../../../build/connection-sites-review/after/hip-1100x800.png)

## 测试与独立反例

最终日志与命令核验见[验收数据](../../../build/connection-sites-review/verification.json)及[原始日志](../../../build/connection-sites-review/logs/browser.txt)。

| 检查 | 结果 |
| --- | --- |
| 浏览器全套 | 54 通过；2 个历史页面样例因本机未登记 1.2/1.8 而跳过。冻结 1.9 的读取另有通过的实际页面用例。 |
| 目录、成员与身份 | 8 通过：同 Part 对多部位、同部位竞争解释、顺序/文案不漂移、孔道侧别去重、断开壁不误合、独立成员删除失败、明确子集与上下文。 |
| Build 关联回归 | 30 通过。新增局部身份/证据反例单独 5 通过（与前项部分重叠）。 |
| API / 缓存 | 7 / 7 通过。 |
| 遮挡透明与源法线 | 6 通过；保持原渲染稳定性修复。 |
| 独立源几何 | 37 个原件截面检查通过；247/247 独立标注、两髋 8 个必需局部部位无缺失。删除必需成员，即使保留原几何并重算统计也失败。 |
| 证据语义 | 无直接互补结构不标直接定位支持；BOM/README 不进机械支持；未确认假设不产生实际接合；被排除组合不成为成员。 |
| 作者流程 | 重新执行新版调查作者，输出输入 SHA 完全一致；遇到同 Part 对多研究但缺少明确记录范围时拒绝静默选第一条。 |

主要复查命令：`npm run build`、`npx playwright test`、`node --test scripts/connection-sites.test.mjs`（工作台目录），以及 `python -B -m unittest discover -s skills/psop-build/tests -p 'test_connection*.py' -v`。当前研究入口 `build/connection-analysis/research_author.py` 委托新版证据修订，旧几何作者逐字节冻结于 `research_author_v11.py`，默认运行不会重写旧输入或其来源记录。画面和拾取脚本位于工作台 `scripts/capture_connection_sites.mjs`、`scripts/check_connection_pick.mjs`；`build/connection-sites-review/record_verification.mjs` 核对服务返回的前端字节与本地构建、包摘要和历史文件 SHA 后生成对照页。

## 发布与实际运行

- 工作台：`http://127.0.0.1:8780`，生产 `dist`，应用版本 `0.2.0`；实际 JS/CSS 文件名和 SHA 记录于验收数据，API 与前端使用同一新快照。
- 新知识版本：`2.0.0-connection-sites.1`；剖面 `psop.hardware.source-model/1.12`；Build `3.0.0-draft.13`。
- 快照：`dkp-8857e0482824621ff8da`。
- 包摘要：`8857e0482824621ff8da5ba2c7b8da13f8641ea8c3c10961ed52b3d238993ba9`。
- 包目录：`build/microduck/source-1.12/microduck-connection-sites.dkp/`。
- 输入：`device-materials/interface-review/microduck-connection-sites.json`（1.3），SHA `ec7666a1bad2c8b380a4dbe0d32775230cb70bb89d76c15e172f698a1605d133`。
- 新包依次 prepare → finalize → validate → register。旧 1.11 包、旧输入与 Schema 保留原义；旧解释器由基线逐字节复制。STL 文件与新包逐项 SHA 相同。[完整验证](../../../build/connection-sites-review/package-validation.json)

本轮必需的产品操作项已完成。两个未登记历史快照的页面用例没有执行；实物螺钉选用数、螺纹、旋入深度、活动区归属及双向轴向保持仍属未取得的证据，不升级为已经安装或机械通过。四个重点部位是独立必需样例，并非整件或整机接口总数。
