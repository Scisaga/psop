# PSOP 与 SKYSOP 介绍材料

这里维护 PSOP 的 16 页主稿、调整分析、旧版介绍，以及面向航空工业的 SKYSOP 独立参赛稿。逐页文字作为新版制作依据，旧版 SVG 与图片作为复用素材。

| 用途 | 入口 |
| --- | --- |
| 阅读 SKYSOP 航空参赛版 | [16 页逐页稿](skysop/script.md)：按创新性、可行性、实用性组织；[评分与素材说明](skysop/README.md) |
| 浏览与下载 SKYSOP 幻灯片 | [16 页 SVG 总览与放映](skysop/slides/index.html) · [全部 SVG](skysop/slides/skysop-svg-slides.zip) · [缩略图](skysop/slides/contact-sheet.png) |
| 浏览 SKYSOP 素材 | [18 项素材索引](skysop/assets/index.html)：既有设计参考、原始实验与 25 秒 Demo；[增材场景与高保真界面](skysop/assets/generated/v3/index.html) |
| 阅读与修改 PSOP 新版 | [16 页逐页文字稿](current/script.md)：本页判断、屏幕正文、版面构图、素材与口径 |
| 播放 AR 演示短版 | [25 秒机械臂安装 Demo](current/assets/ar-demo-25s.mp4)：供新版第 11 页使用，保留原音与原有画面提示 |
| 查看完整 AR Demo | [机械臂安装原片](legacy/机械臂安装.mp4)：约 2 分 20 秒，已有 AR 端演示 |
| 了解调整方向 | [调整分析](adjustment-analysis.md)：三阶段主线、手机／AR 现场闭环与早期调整建议；最终页序以新版主稿为准 |
| 阅读旧版介绍 | [19 页高清 PDF](legacy/deck.pdf) |
| 用 PowerPoint 放映 | [静态 PPTX](legacy/deck.pptx) |
| 查看与修改文字 | [原版逐页稿](legacy/script.md)：完整保留正文、口述、版面构图、视觉逻辑与素材说明 |
| 查看与修改版面 | [SVG 总览](legacy/slides/index.html)：19 张独立 SVG |
| 查看与复用效果图 | [PNG 图片总览](legacy/images/index.html)：SVG 中实际使用的 15 张 imagegen 原图 |

```text
presentations/
├── README.md
├── adjustment-analysis.md
├── skysop/
│   ├── script.md           # 航空工业参赛逐页稿
│   ├── README.md           # 评分对应、领域迁移与素材说明
│   ├── economics-assumptions.md # 研发、现场、质量与培训价值测算
│   ├── economics-model.json     # 测算输入与结果
│   ├── slides/             # 16 页 SVG、总览、缩略图与下载包
│   ├── tools/              # SVG 与高保真界面生成、渲染检查脚本
│   ├── prototypes/         # build / compile / simulate / mobile / expert 界面
│   └── assets/             # 素材索引、来源清单、设计素材与当前产物截图
├── current/
│   ├── script.md           # 新版 16 页文字与构图方案
│   └── assets/
│       └── ar-demo-25s.mp4 # 第 11 页使用的 25 秒 AR 演示
└── legacy/
    ├── deck.pdf
    ├── deck.pptx
    ├── script.md
    ├── 机械臂安装.mp4       # 已有 AR Demo 完整原片
    ├── slides/             # index.html 和 19 张 SVG
    └── images/             # index.html 和 15 张 imagegen PNG
```

旧版采用 2026-09-14 的 19 页内容。PDF、PPTX、SVG 和一份完整原逐页稿均保持原件。`images/` 中的 15 张 PNG 从 SVG 嵌入数据提取，并与原 imagegen 素材核对一致；同一张图在多页使用时只保留一份。它们是概念效果图，便于后续改稿和复用。PPTX 为整页图片，改字和改版面应从逐页稿与 SVG 开始。

PSOP 新版放在 `current/`，维护一份主稿及对应演示素材。目前已生成逐页文字稿与 25 秒 AR 演示短版，尚未生成新版 SVG、PPTX 或全稿旁白视频。短版从原片选择部件高亮、步骤提示、双手装配和眼镜展示四段，剪辑区间记录在主稿第 11 页。旧版留在 `legacy/` 供对照，过程报告与临时文件不放入介绍材料目录。

PSOP 新版介绍先讲 AI 行业趋势与设备服务问题，第 5 页前置旧版第 8 页的量化实验，第 7–8 页突出类 Colored Petri Net 的 EG 表达及其驱动的任务对齐微调与蒸馏。build、compile、simulate 和手机／AR 原型围绕机械臂场景展开，Microduck 用于展示真实 build 产物，末四页集中说明应用适配、客户收益、盈利潜力和社会价值。主稿保留 [PSOP 已有的手机与现场运行基础](https://github.com/servforce/psop)，并区分已有成果、原型设计与测算假设；本轮不展开逐页口述与讲述节奏。