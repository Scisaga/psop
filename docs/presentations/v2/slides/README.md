# PSOP · 25 页 SVG

[PDF 阅读版](../psop-v2.pdf) · [总览与放映](index.html) · [整套缩略图](contact-sheet.png) · [全部 SVG](psop-svg-slides.zip) · [仿真控制台](../prototypes/simulate.html)

画布 1600 × 900，16:9。主案例为 Microduck 舵机更换、安装指导与识别复检：设备 `MD-01`、任务 `MD-SERVO-CHECK-01 / Rev.A`、关节 `J01`、节点 `S03`。安装预演和现场入口展示正在安装、身份待核对、复检待补充；识别与复检子任务另展示身份已记录、复检待补充的状态。

- 第 1–4 页：设备任务主视觉、模型能力、设备操作问题与三工作台分工。
- 第 5–13 页：解决方案，依次展示系统集成、定位、客户自助、工程师协同、服务连续性、服务能力、试点验证、推广复制与设备 AI 工程师。根据视觉稿文件第 11–19 页重新绘制原生 SVG，文件号与新演示页号分别记录。
- 第 15、16、17 页：build 组织设备知识，compile 编译识别与复检 EG，simulate 预演部件准备、对齐、安装、固定连接和复检步骤。
- 第 18、19 页：端侧感知与 Runtime 核验，以及正在安装的手机 / AR 现场入口。
- 第 22、23 页：操作轨迹进入知识审核与领域模型学习，设备知识、EG、领域模型与验证经验连接模型、工具、终端和人员。
- 第 24、25 页：围绕安装、使用、维护、培训与服务说明经济与社会价值，并给出可核验指标。

第 14 页保留机械臂组装的 240 次完整配对实验，第 20 页保留已有机械臂 AR 视频。Microduck 工作台、EG、三维任务与训练示例为教学原型；设备控制效果、复检判据和训练收益需独立验证。

每页图像已内嵌，SVG 可独立打开。正文、实验图、EG 与技术图保留矢量。字体 Microsoft YaHei / Noto Sans CJK SC / Arial；PDF 嵌入字体。HTML 支持 ← / →、Esc；第 20 页播放原 AR 视频，SVG / PDF 显示静态帧。

[逐页稿](../script.md) · [页面清单](manifest.json) · [验证记录](validation.json) · [案例素材](../assets/generated/microduck/README.md) · [经济核算](../economics-assumptions.md)

页面源为 `tools/pages_01_08.py`、`pages_09_16.py`、`solutions_11_14.py`、`solutions_15_19.py`、`edge_runtime_page.py`、`learning_platform_pages.py`。builder 将旧页面函数统一重编号，并记录解决方案视觉源文件的 SHA。原型由 `build_prototypes.py`、HTML / CSS 与 `engineering-sandbox.js` 生成。复现方法见 [材料说明](../README.md)。图形、任务记录与仿真反馈为示例，不能当作真实设备复检结果。

ZIP 含 25 张 SVG、manifest、validation 与离线说明；视频、HTML 与交互工作台使用仓库完整目录。原 16 页交付保存在工作区的 `.psop/v2-16-checkpoint/`。
