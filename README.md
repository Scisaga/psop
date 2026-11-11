# PSOP

**Physical Standard Operation Procedure · 设备知识、3D 装配与模型研发工作台**

PSOP 把设备资料、三维部件、装配知识和来源证据组织到同一个工作台。一个工作区对应一台设备，Build、Simulate、Compile 围绕同一份设备知识协作。

[产品结构](#产品结构) · [快速开始](#快速开始) · [当前能力](#当前能力) · [开发与验证](#开发与验证) · [文档导航](#文档导航)

![Microduck 三维参考装配、结构树与对象详情](docs/assets/screenshots/workbench-overview.png)

*Microduck 工作区实景，采集于 2026-11-07。截图保留当时的界面与数据版本，当前能力见下文。*

## 产品结构

**工作台提供统一界面，设备工作区保存业务上下文，三技能在所选设备中按任务独立调用。** 同一套技能与执行器可用于多个设备。

![统一工作台、设备工作区、三技能及各自产物的分层结构](docs/assets/diagrams/workbench-structure.svg)

Build 发布 **DKP 设备知识快照**；Simulate 组织**场景、观测与报告**；Compile 组织**数据集、模型与评测**。工作区登记各类产物及其输入、版本引用，工作台提供检索、展示与交互。

场景、语料、模型和报告在 DKP 之外独立版本化。后续通过场景观测、模型测试和审核后的纠错候选衔接数据闭环，详细交接见[系统设计](docs/architecture/system-design.md)。图中展示产品职责，实际接入进度见[当前能力](#当前能力)。

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

打开 **http://127.0.0.1:8780/**，选择设备工作区与知识版本。在**设备总览**中浏览模型、接口和来源，切换到 **Simulate** 可手动装配或点击左下角的**自动组装**。

Windows 检出仓库后，也可直接双击根目录的[启动工作台.cmd](启动工作台.cmd)。启动器优先使用本机已准备的 Node，准备工作区、构建并打开页面；服务已运行时直接打开页面。默认端口固定为 8780，`--no-browser` 可关闭自动打开页面。更多运行选项见[工作台开发说明](apps/workbench/README.md#运行)。

<details>
<summary>工作区更新与发布包</summary>

已有工作区会复用登记内容。需要按当前代码重新生成知识时，在仓库根目录执行：

```powershell
python -B apps/workbench/scripts/prepare_workspace.py --fresh
```

这会创建并登记新快照。运行当前工作台无需保留整套开发快照，旧版本可从登记表及本地发布目录清理。

当前 DKP `2.0.0-capabilities.10` 以 [Git LFS 归档和版本摘要](releases/microduck/2.0.0-capabilities.10/release.json) 保存。首次准备工作区会校验并自动还原最新发布；解包目录、构建临时目录和本机登记表被忽略。源码、冻结研究输入和正式验收证据继续纳入 Git，分类见[版本管理与发布工件](apps/workbench/README.md#版本管理与发布工件)。

</details>

## 当前能力

实现状态核对于 **2026-11-11**。当前示例设备为 Microduck，知识基线为 `source-model/1.15`。

| 入口 | 当前可用内容与边界 |
| --- | --- |
| 模型浏览 | 真实 STL 参考装配、部件拾取、爆炸展开、隐藏与隔离、透明、剖切和视图恢复 |
| 知识与证据 | 查询部件、有限几何、安装孔位、规则及本体类型，按需定位 XML、CSV、装配说明和原始资料 |
| 几何与连接 | 从原始网格发现本件有限孔、锥面、平面和复合轮廓；分别查看潜在能力、功能接口、来源参考关系和跨件条件候选 |
| 设备与版本 | 工作区与快照切换，分享链接和视图导出保留对象、版本、相机及局部查看状态 |
| Build | 通过 `prepare → freeze → finalize → validate → register` 构建、冻结、校验并登记数据型 DKP |
| Simulate | 真实部件交互装配、接口预览、连续组装、拆分归位及整机自动组装；支持多方案保存、撤销重做和共享资源占用检查 |
| Compile | 已有语料、实验、模型和评测入口；数据集发布、训练与推理执行器待接入 |

### Simulate 三维装配与自动组装

[![Simulate 连接、拆分与自动组装实录](docs/simulate/evidence/simulate-demo.gif)](docs/html/assets/workbench-simulate-demo.webm)

*工作台实录节选：外壳连接、拆分、撤销与整机自动组装。动图加速循环播放，点击可查看原视频。*

Simulate 读取 DKP 中的真实网格、接口和参考关系，在三维桌面上完成散件摆放、连续装配、拆分和成品还原。

- **交互装配**：拾取、拖动、轴向移动、旋转与精确坐标输入；兼容对象高亮，拖近后通过连接卡片预览接口和安装方向。组合整体移动，拆分后较小一侧寻找桌面空位，释放的接口可继续使用。
- **自动组装**：按所选参考构型保留正确组合，依据退出路径与阻挡关系安排工序，逐件转运、预装轴承与子组合并完成总成。支持暂停、1×／2×／4×、跳过和可选视角跟随，播放期间可自由观察。
- **方案与恢复**：新建、复制、重命名及切换方案，完整操作自动保存；连接、拆分、自动组装和恢复拆散均可撤销／重做。保留最近 100 步历史，支持刷新恢复与断线重试；场景状态保存在 DKP 包外。

详细操作见[工作台使用指南](docs/workbench.md#buildsimulate-和-compile)，真实数据与浏览器检查见 [Simulate 验收记录](docs/simulate/verification.md)。当前检查覆盖终态几何和有限采样的装配过程；动力学、连续路径的完备认证、工程承载验证与模型测试仍待接入。

### 装配判定与设计保真

新方案和自动还原默认使用**来源原装构型**，工程推断的几何协调构型可选。切换构型只改变后续装配目标，保留已有位姿与连接；点击“按此构型还原”才执行自动组装。

已有原装关系的接触与重叠保留实际测量并允许装配编辑。刚性网格交集作为几何观测，结合弹性让位、过盈、预紧、软接触及制造与装配补偿解释；不据此直接否决装配或移动原设计。成员、尺寸、接口、共享孔道、闭环、台面和新增无关障碍另行检查。

**几何观测、操作资格与力学验证状态分别记录。** 缺少材料参数或变形求解器不直接禁止虚拟装配，操作允许与参考演示也不代表力学验证通过。完整规则见[装配判定与设计保真](docs/architecture/assembly-judgment-policy.md)。

<details>
<summary>当前知识基线与安装接口示例</summary>

| 项目 | 当前版本或规模 |
| --- | --- |
| Build 工具 | `3.0.0-draft.23` |
| 知识剖面 / 数据封套 | `psop.hardware.source-model/1.15` / `psop.dkp/2.0-draft.1` |
| DKP 发布 | `2.0.0-capabilities.10` |
| Microduck 知识 | 70 个部件实例、38 份几何资产、411 项接口（其中 257 项功能接口）、145 条参考关系 |
| 机械语义目标 | [硬件本体 draft.4](docs/architecture/hardware-ontology.md) |

Build 从原始网格发现本件有限几何，分开表达潜在能力、有依据的功能接口、原配置参考关系与位姿无关的跨件候选，通过独立原件要求验收。部件和候选详情按需加载，当前结论直接引用原件位置，历史审查证据单独保留。

![本件接口目录的历史操作示例](build/assembly-review/default-1600x900.png)

1.15 的右侧按“几何与能力”“原装配”“兼容候选”分别查看；尚未绑定功能接口的有限几何也可搜索、选择和定位。功能接口保留逐成员选择及选孔规则，参考关系保留具体对端；候选显示局部匹配和待确认条件，查看依据时才打开原件。上图保留此前本件接口目录的操作示例。

舵机两个端盘四孔、两个壳体孔侧和壳体承座分别组织。两侧可共享同一物理孔道，但入口方向和实际选用分别保存；四孔组不会顺带选择支承外圆。头部舵机的固定壳体通过支架承槽和下壳承托定位，支架自身孔组连接下壳；“原装配用法”解释这条安装链，并列出对应部件的未决问题。参考配合与实物紧固资格分别标注。

当前包为全部 70 个实例发布逐件用法审查，分开表达用途、对端、几何与紧固状态，将未决假设纳入跟进。左右髋双孔、电机支架两侧轴承承座、外壳阶梯孔与舵机接收位、眼环三凸耳与面板三通槽、镜头座径向入口及 PCB 锁扣定位耳均已补录；右外壳约 0.5 mm 来源错位与眼环尚未明确的防脱工艺分别保留。

相关记录：[原装状态复核](docs/build/reference-connection-status.md) · [安装补录结果](docs/installation-followup.md) · [原装配安装接口全量复核](docs/original-installation-audit.md) · [装配判定优化记录](docs/assembly-judgment-optimization.md) · [首次发布记录](docs/build-capabilities-release.md)。

</details>

## 开发与验证

| 路径 | 用途 |
| --- | --- |
| [apps/workbench](apps/workbench/README.md) | 前端、本地读取服务、启动器与浏览器测试 |
| [psop-build](skills/psop-build/SKILL.md) | 来源摄入、知识分析、DKP 发布和验证 |
| [psop-simulate](skills/psop-simulate/SKILL.md) | 三维交互装配、自动组装、构型选择、接口占用及方案恢复 |
| [psop-compile](skills/psop-compile/SKILL.md) | 语料、多模型训练和评测编排 |
| [packages/assembly](packages/assembly/psop_assembly/engine.py) | 共享选择规则与刚性孔组推理 |
| [device-materials](device-materials) | 原始资料、装配说明与支持来源，大型资料使用 Git LFS |

在仓库根目录运行 Python 测试，在工作台目录运行前端与集成检查：

```powershell
python -B -m unittest discover -s skills/psop-build/tests -v
python -B -m unittest discover -s packages/assembly/tests -v
cd apps/workbench
npm run build
npm run test:api
npm run test:simulate
npm run test:e2e
```

浏览器测试使用本机 Chrome，先准备 Microduck 工作区。需要特定历史快照的用例只在登记了对应版本时运行，其余用例验证当前数据与交互。更多检查与截图脚本见[工作台开发说明](apps/workbench/README.md#验证与截图)。

## 文档导航

| 阅读目的 | 入口 |
| --- | --- |
| 使用工作台 | [操作指南](docs/workbench.md) |
| 理解产品与数据边界 | [系统设计](docs/architecture/system-design.md) · [设备工作区](docs/architecture/device-workspace.md) · [DKP 数据合同](docs/architecture/device-knowledge-package.md) |
| 构建设备知识 | [Build 使用说明](docs/build/device-knowledge-build.md) · [连接还原](docs/build/connection-reconstruction.md) |
| 查看装配能力与验证 | [Simulate 设计](docs/simulate/simulate-design.md) · [验收记录](docs/simulate/verification.md) · [判定与设计保真](docs/architecture/assembly-judgment-policy.md) |
| 了解模型研发规划 | [Compile 设计](docs/compile/compile-design.md) |
| 查找其他资料 | [文档目录](docs/README.md) |
