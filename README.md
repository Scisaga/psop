# PSOP

**Physical Standard Operation Procedure · 设备知识、3D 装配与模型研发工作台**

PSOP 把设备资料、三维部件、装配知识和来源证据组织到同一个工作台。一个工作区对应一台设备，Build、Simulate、Compile 围绕同一份设备知识协作。

![Microduck 三维参考装配、结构树与对象详情](docs/assets/screenshots/workbench-overview.png)

*Microduck 工作区实景：70 个模型实例、38 份几何资产、62 份来源。上图采集于 2026-11-07；下述实现状态核对于 2026-11-11。*

## 当前能力

| 能力 | 当前可用内容 |
| --- | --- |
| 3D 工作台 | 真实 STL 参考装配、部件拾取、爆炸展开、隐藏与隔离、透明、剖切和视图恢复 |
| 知识与证据 | 查询部件、几何、安装孔位、规则及本体类型，联动定位 XML、CSV、装配说明和原始资料 |
| 几何与连接能力 | 从原始网格发现本件有限孔、锥面、平面和复合轮廓，分别查看潜在方式、功能接口、来源参考关系和跨件条件候选 |
| 原始依据 | 当前结论直接引用原件位置，文本按需加载；历史审查证据单独保留 |
| 设备与版本 | 工作区与快照切换，分享链接和视图导出保留对象、版本、相机及局部查看状态 |
| Build | 通过 `prepare → freeze → finalize → validate → register` 构建、冻结、校验并登记数据型 DKP |
| Simulate 交互装配 | 沉浸式三维场景、真实部件拖动与旋转、兼容对象高亮、接口预览、连续组装与拆分归位 |
| Simulate 自动组装 | 按所选参考构型整理散件、预装轴承及子组合、逐件避让与路径重放，支持暂停、倍速和自由观察 |
| 装配方案与判定 | 多方案自动保存、撤销重做、恢复拆散、共享资源占用，以及分别记录几何观测、操作资格与力学状态 |

当前主线为 Build `3.0.0-draft.23`、知识剖面 `psop.hardware.source-model/1.15`、封套 `psop.dkp/2.0-draft.1`，机械语义目标为[硬件本体 draft.4](docs/architecture/hardware-ontology.md)。Build 从原始网格发现本件有限几何，分开表达潜在能力、有依据的功能接口、原配置参考关系与位姿无关的跨件候选，通过独立原件要求验收；部件和候选详情按需加载。当前包 `2.0.0-capabilities.10` 为 70 个实例发布 257 项功能接口、145 条参考关系及逐件用法审查。本版分开表达用途、对端、几何与紧固状态，并将全部未决假设纳入跟进，见[原装状态复核](docs/build/reference-connection-status.md)。此前七项安装复核见[安装补录结果](docs/installation-followup.md)。默认保留来源原装构型，工程推断的几何协调构型可选，历史审查保留原义。见[Build 使用说明](docs/build/device-knowledge-build.md)、[装配判定优化记录](docs/assembly-judgment-optimization.md)和[首次发布记录](docs/build-capabilities-release.md)。

[原装配安装接口全量复核](docs/original-installation-audit.md)发现的左右髋双孔及电机支架两侧轴承承座已补录。新增外壳阶梯孔与舵机接收位、眼环三凸耳与面板三通槽、镜头座径向入口及 PCB 锁扣定位耳；右外壳的约 0.5 mm 来源错位与眼环尚未明确的防脱工艺分别保留。

Simulate 的三维交互装配与自动组装功能已完成，操作、真实数据与浏览器验收见 [Simulate 验收记录](docs/simulate/verification.md)。Compile 的数据集发布、训练和推理仍待接入执行器。工作台显示实际能力状态。

## Simulate 三维装配与自动组装

[![Simulate 连接、拆分与自动组装实录](docs/simulate/evidence/simulate-demo.gif)](docs/html/assets/workbench-simulate-demo.webm)

*工作台实录节选：外壳连接、拆分、撤销与整机自动组装。动图加速循环播放，点击可查看原视频。*

Simulate 读取同一份 DKP 的真实网格、接口和参考关系，在三维桌面上完成散件摆放、连续装配、拆分和成品还原。当前 Microduck 工作区包含 **70 个部件、38 份来源网格、411 项接口**。

- **交互装配**：支持拾取、拖动、轴向移动、旋转和精确坐标输入。兼容对象与组合以金色轮廓高亮，拖近后弹出连接卡片；悬停预览接口和安装方向，点击就绪方式完成连接。组合整体移动，拆分后较小一侧自动寻找桌面空位，释放的接口可继续使用。
- **自动组装**：按所选参考构型保留正确组合、拆开不一致的连接，依据退出路径与阻挡关系安排工序，逐件转运、轴承轴向预装、子组合对接并完成总成。演示留在当前工作台，支持暂停、1×／2×／4×、跳过和可选视角跟随，播放期间仍可自由旋转、平移和缩放。
- **方案与恢复**：支持新建、复制、重命名及切换方案，每次完整操作自动保存。连接、拆分、自动组装和恢复初始拆散均可撤销／重做；方案保留最近 100 步历史，刷新可恢复，断线后可重试待确认操作。场景状态保存在 DKP 包外，不改写设备知识。
- **参考构型**：新方案及自动还原默认使用来源原装构型，可选工程推断的几何协调构型。切换构型只改变后续装配目标，保留已有位姿与连接；点击“按此构型还原”才执行自动组装。
- **装配判定**：原装接触与重叠保留实际测量，不因刚性网格交集直接否决装配或移动原设计。几何观测、操作资格和力学状态分别记录；成员、尺寸、接口及共享孔道占用、闭环、台面和新增无关障碍穿入仍独立检查，接触显示与障碍判定参数可按方案配置。

启动工作台后选择 **Simulate**，可拖近兼容对象手动连接，也可点击左下角的**自动组装**查看整机还原。详细操作见[工作台使用指南](docs/workbench.md#buildsimulate-和-compile)，判定原则见[装配判定与设计保真](docs/architecture/assembly-judgment-policy.md)。

当前检查覆盖终态几何和有限采样的装配过程。动力学、连续路径的完备认证、工程承载验证与模型测试仍待后续接入；参考演示与操作允许状态不代表力学验证通过。

## 看懂安装接口

![本件接口目录](build/assembly-review/default-1600x900.png)

1.15 的右侧按“几何与能力”“原装配”“兼容候选”分别查看；尚未绑定功能接口的有限几何也可搜索、选择和定位。功能接口保留逐成员选择及已有选孔规则，参考关系保留具体对端；候选显示局部匹配和待确认条件，查看依据时才打开原件。上图保留此前本件接口目录的操作示例。

舵机两个端盘四孔、两个壳体孔侧和壳体承座分别组织。两侧可共享同一物理孔道，但入口方向和实际选用分别保存；四孔组不会顺带选择支承外圆。头部舵机的固定壳体通过支架承槽和下壳承托定位，支架自身孔组连接下壳；“原装配用法”直接解释这条安装链，并列出对应部件的未决问题。参考配合与实物紧固资格分别标注。

完整操作见[工作台使用指南](docs/workbench.md)，机械分析见[连接还原](docs/build/connection-reconstruction.md)。

## 快速开始

需要 **Node.js 22.12+、Python 3.11+、Git LFS**。首次安装依赖和获取固定的 Microduck 补充 XML 需要联网。

```powershell
git lfs install
git clone --branch main https://github.com/Scisaga/psop.git
cd psop
git lfs pull
cd apps/workbench
npm ci
npm run prepare:workspace
npm run build
npm start
```

打开 **http://127.0.0.1:8780/**。Windows 可直接双击仓库根目录的[启动工作台.cmd](启动工作台.cmd)：优先使用本机已准备的 Node，未运行时准备工作区、构建并启动，已运行时直接打开页面。默认端口固定为 8780，不会自动改用其他端口；`--no-browser` 可关闭自动打开页面。原 [apps/workbench 启动入口](apps/workbench/启动工作台.cmd) 继续可用。

已有工作区会复用登记内容。需要按当前代码重新生成知识时，在仓库根目录执行：

```powershell
python -B apps/workbench/scripts/prepare_workspace.py --fresh
```

这会创建并登记新快照。开发过程产生的旧知识版本可以从登记表及本地发布目录清理，运行当前工作台无需保留整套开发快照。

当前 DKP `2.0.0-capabilities.10` 在 [releases](releases/microduck/2.0.0-capabilities.10/release.json) 中以一个 Git LFS 归档和版本摘要保存。首次准备工作区时会校验并自动还原最新发布，解包目录、构建临时目录和本机登记表被忽略。源码、冻结研究输入和正式验收证据继续纳入 Git，具体分类见[版本管理与发布工件](apps/workbench/README.md#版本管理与发布工件)。

## 工作台、工作区与三技能

![统一工作台、设备工作区、三技能及各自产物的分层结构](docs/assets/diagrams/workbench-structure.svg)

**工作台是统一界面与交互框架，设备工作区是围绕一个设备的业务上下文，三技能是在这个上下文中使用的能力。** 同一套技能与执行器可用于多个设备，三种能力按任务独立调用。

Build 发布 DKP 知识快照；Simulate 形成场景、观测和测试报告；Compile 组织数据集、模型及评测工件。工作台统一组织这些产物的检索、展示与交互。场景、语料、模型和报告在 DKP 之外独立版本化，并通过明确的输入与版本引用关联。

数据闭环通过产物衔接：场景观测进入语料，训练后的模型回到场景测试，报告与纠错候选经审核驱动后续数据或知识修订。场景与渲染使用共用执行底座，Compile 也可按数据计划调用；详细交接见[系统设计](docs/architecture/system-design.md)。图表达产品组织，实现进度见上方能力表。

## 仓库入口

| 路径 | 用途 |
| --- | --- |
| [apps/workbench](apps/workbench/README.md) | 前端、本地读取服务、启动器与浏览器测试 |
| [psop-build](skills/psop-build/SKILL.md) | 来源摄入、知识分析、DKP 发布和验证 |
| [psop-simulate](skills/psop-simulate/SKILL.md) | 三维交互装配、自动组装、构型选择、接口占用及方案恢复 |
| [psop-compile](skills/psop-compile/SKILL.md) | 语料、多模型训练和评测编排 |
| [packages/assembly](packages/assembly/psop_assembly/engine.py) | 共享选择规则与刚性孔组推理 |
| [device-materials](device-materials) | 原始资料、装配说明与支持来源，大型资料使用 Git LFS |
| [docs](docs/README.md) | 操作指南、架构、机械语义与数据合同 |

## 开发与验证

在仓库根目录运行 Python 测试，在工作台目录运行前端与集成检查：

```powershell
python -B -m unittest discover -s skills/psop-build/tests -v
python -B -m unittest discover -s packages/assembly/tests -v
cd apps/workbench
npm run build
npm run test:api
npm run test:e2e
```

浏览器测试使用本机 Chrome，先准备 Microduck 工作区。需要特定历史快照的用例只在登记了对应版本时运行，其余用例直接验证当前数据与交互。

继续阅读：[工作台使用指南](docs/workbench.md) · [系统设计](docs/architecture/system-design.md) · [DKP 数据合同](docs/architecture/device-knowledge-package.md) · [文档目录](docs/README.md)。
