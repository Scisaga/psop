# PSOP：设备任务、现场执行与技能学习

本目录维护 **25 页主幻灯片**、可交互工作台，以及面向实习生与零基础读者的学习材料。统一案例为 **Microduck 舵机更换、安装指导与识别复检**；产品技术主线为 build → compile → simulate → Runtime → 经审核的学习与版本更新。

| 入口 | 内容 |
| --- | --- |
| [主幻灯片总览与放映](slides/index.html) | 25 页、1600 × 900；第 20 页可播放已有 AR 演示 |
| [PDF 阅读版](psop-v2.pdf) | 静态、16:9、可选择文字、嵌入字体 |
| [SVG 下载包](slides/psop-svg-slides.zip) | 独立矢量页面、清单与离线说明 |
| [逐页文字稿](script.md) | 页面判断、屏幕内容、构图与事实依据 |
| [交互工作台](prototypes/index.html) | build、compile、simulate 与移动端原型 |
| [学习手册](PSOP-实习生与零基础学习手册.md) | AI 基础、四类模型、任务系统、训练与评测 |
| [65 页学习课件文字稿](PSOP-实习生与零基础学习课件-逐页文字稿.md) | 教学插图对应的逐页解释与练习 |
| [教学 SVG](PSOP-教学SVG插图/index.html) | 65 页原生矢量插图 |
| [案例素材](assets/index.html) | Microduck 来源装配、官方外观照片、任务图及原实验依据 |
| [资料与实现依据](industry-sources.md) | 模型资料、本地设备知识包与验证边界 |
| [经济核算](economics-assumptions.md) | 设备服务的工时、质量、复用与成本框架 |
| [幻灯片检查](slides/validation.json) / [教学内容检查](PSOP-教学SVG插图/content-checks.json) | 页面布局、索引、代码示例与内容一致性 |

## 主幻灯片页序

1. PSOP｜理解设备状态，指导操作与验证
2. 2026：模型能力正在进入设备现场
3. 设备任务，需要回答具体的操作问题
4. 一套设备知识，形成可运行与可学习的任务
5. 连接既有系统，贯通现场服务执行
6. 面向设备服务执行的 AI 工程系统
7. 客户拍摄设备，获得逐步操作指导
8. 工程师接续上下文，协同判断与维修
9. 从扫码到服务完成，保持同一设备上下文
10. 让服务能力随设备覆盖持续扩展
11. 从一款设备、三至五项任务开始验证
12. 从试点到同系列与存量设备复制
13. 让每台设备拥有持续学习的 AI 工程师
14. PSOP 更适配设备领域任务
15. build：把部件、连接与操作依据组织起来
16. compile：把识别与复检条件编译为 EG
17. simulate：预演设备安装步骤
18. 端侧先理解现场，Runtime 始终掌握状态
19. 手机与 AR：让现场观察进入设备任务
20. 机械臂装配实证，支撑现场交互能力迁移
21. 已有产品与实证，支撑设备任务持续研发
22. 经验证的设备操作，持续更新知识与任务模型
23. 设备知识与任务资产，连接模型、工具和现场
24. 以全生命周期成本，衡量设备服务的经济价值
25. 让设备操作经验成为可传承、可验证的能力

第 5–13 页为解决方案章节，参考[视觉稿第 11–19 页](../../ppt/视觉稿/)重新绘制；正文、流程、对照表与状态为独立 SVG 对象。其后连接三工作台、Runtime、现场实证和价值评估。

## 统一案例与证据

`MD-01` 是教学设备标识，`MD-SERVO-CHECK-01 / Rev.A` 是教学任务版本，`S03` 是当前操作标签，`J01` 是目标关节标签。simulate 展示部件准备、支架对齐、舵机安装、固定连接和复检的安装顺序；现场手机展示安装进行中。识别与复检子任务使用“识别记录已有、复检记录缺失”的教学状态，Runtime 保持待验证。这些标识、几何阶段、EG 与记录用于原型及教学，不代表某台实机已经验证。

真实资料来自本地 [Microduck build 知识包](../../../build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/README.md)和[知识 App](../../../build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/apps/build/index.html)。其中“单个替换舵机的软件识别”等任务目前为 proposed / document：可追溯的软件资料事实，尚未完成具体 EG 发布与实机验证。软件识别、默认运动与机械安装验收分别核验。

首页以连续主视觉呈现 build 爆炸结构、安装与核验 EG 概览、透明安装装备与 AR / 移动端使用示例；当前步骤为对齐髋部支架。设备外形依据本地 `robot_walk.xml` 和 38 个 STL 部件、70 个视觉实例重建，并与 [Pollen Robotics 官方外观照片](https://pollen-robotics.com/microduck/press-kit/)对照。工作台保留原部件几何、来源装配矩阵和颜色；安装演示单独使用显示变换表达准备、对齐与连接。知识图展示拆解后的部件及来源关系，复检图展示目标关节局部与检查记录。几何资料为 walk 来源参考，软件任务来自 alpha 资料，两者分别记录适用范围。原机械臂 Runtime 实验和 AR 视频保留各自来源。Microduck 的任务、训练与设备接入效果需另行评测。

## 本地生成与检查

在仓库根目录使用 Python 环境安装 `Pillow playwright pymupdf fonttools`，并执行 `python -m playwright install chromium`。浏览器可用 `PSOP_BROWSER` 指定。

```powershell
python docs/presentations/v2/tools/build_microduck_model.py
python docs/presentations/v2/tools/render_microduck_model.py
python docs/presentations/v2/tools/build_case_visuals.py
python docs/presentations/v2/tools/build_prototypes.py
python docs/presentations/v2/tools/render_prototypes.py
python docs/presentations/v2/tools/render_installation_steps.py
python docs/presentations/v2/tools/validate_sandbox.py
python docs/presentations/v2/tools/build_svg.py
python docs/presentations/v2/tools/render_svg.py --slides docs/presentations/v2/slides --output .psop/v2-render
python docs/presentations/v2/tools/export_pdf.py --checks .psop/v2-pdf-checks
python docs/presentations/v2/tools/build_teaching_microduck.py --render
```

桌面原型为 1680 × 720，移动端为 430 × 800。SVG 保留原生文字与图形；PDF 为静态阅读版，视频在 HTML 放映中播放。教学插图的重建入口见 `tools/build_teaching_microduck.py`。输出入口和页面清单以本目录当前文件为准。
