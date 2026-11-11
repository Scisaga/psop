# PSOP 技术资料与 Microduck 案例依据

本次内容调整：2026-10-15。模型产品与日期沿用已存资料，查阅日期见原记录；本次没有重新核查产品发布日期。对应 [逐页稿](script.md) 的设备能力、领域语音与实现边界。

## 第 2 页：2026 年代表性进展

| 页面节点 | 可核对的事件 | 官方直接来源与定位 |
| --- | --- | --- |
| **2026.01.14 · YOLO26 正式发布** | Ultralytics 正式发布目标检测系列；2025 年已有先行介绍，此处不写技术首次出现 | [Ultralytics 官方公告](https://www.ultralytics.com/news/ultralytics-redefines-state-of-the-art-vision-ai-with-yolo26)：正文日期 January 14, 2026，首段说明正式发布。 |
| **2026.01.29 · Qwen3-ASR 开源模型发布** | 发布 Qwen3-ASR 0.6B／1.7B 与独立强制对齐模型；不是将先前云 API 的时间改写成今年 | [Qwen 官方仓库](https://github.com/QwenLM/Qwen3-ASR)：News 中 2026.1.29 发布记录。该栏另记 2026.6.26 原生 Transformers 支持。 |
| **2026.04.02 · Gemma 4 发布** | E2B／E4B 面向端侧，支持原生音频输入、图像和视频；可按任务继续训练 | [Google 官方公告](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)：标题下 Apr 02, 2026；Industry-leading capabilities and mobile-first AI，以及 Vision and audio、E2B and E4B 段。 |
| **2026.06.05 · Gemma 4 QAT 检查点发布** | 推出量化感知训练检查点，进一步降低边缘部署内存需求 | [Google 官方 QAT 公告](https://blog.google/innovation-and-ai/technology/developers-tools/quantization-aware-training-gemma-4/)：标题下 Jun 05, 2026；开头说明当天发布新检查点。与 4 月首次发布放在同一卡，不混成同一次事件。 |
| **2026.06.01 · Cosmos 3 发布** | 世界模型、视觉推理与动作预测在同一体系结合；Super／Nano 当时可用，Edge 当时仍为 coming soon | [NVIDIA 官方新闻稿](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx)：June 01, 2026；开头与 Availability 段。 |
| **2026.07.20 · Cosmos 3 Edge 发布** | 当天发布面向设备端推理的 Edge 模型；与 6 月 Cosmos 3 发布分开标注 | [NVIDIA SIGGRAPH 官方公告](https://blogs.nvidia.com/blog/siggraph-news-2026/)：July 20, 2026；Now Openly Available, NVIDIA Cosmos 3 Edge 段，及前文 released today。 |
| **2026.09.11 · RelateAnything 预印本首次提交** | Maëlic Neau 的开放词表关系预测模型；不是目标检测器 | [作者论文 arXiv:2609.12552](https://arxiv.org/abs/2609.12552)：v1 为 11 Sep 2026 07:57:41 UTC；[官方项目页](https://maelic.github.io/RelateAnythingProject/)。日期仅表示预印本首次提交。 |
| **2026.10.02 · Muse Gadgets SDK 官方仓库初始提交** | 只采用官方仓库初始提交的 UTC 日期，不推断仓库公开、服务或商业开放时间 | [Meta 官方仓库](https://github.com/facebookincubator/muse-gadget-sdk)；[初始提交 7e7123e](https://github.com/facebookincubator/muse-gadget-sdk/commit/7e7123e2815d3e7e3c0f2ca330f576290ae6a6a9)；[该提交 API](https://api.github.com/repos/facebookincubator/muse-gadget-sdk/commits/7e7123e2815d3e7e3c0f2ca330f576290ae6a6a9)。 |

Muse 初始提交标题为 `Initial commit`，`commit.committer.date` 为 `2026-10-02T19:00:42Z`，无父提交；仓库 API 的 `created_at` 为 `2026-10-02T18:21:23Z`。页面采用记录的 UTC 日期，不混用北京时间翌日。Git 时间不能单独证明仓库何时从私有变成公开，故不写“首次公开发布”。

这些是**今年代表性产品与研究进展**，不是世界模型、模型微调、语音识别、目标检测或端侧推理的技术起源。用户要求转向今年后，主讲页不再将 2025 年的 Cosmos 初代、Gemma 3n 或 FunctionGemma 作为时间轴主体。

## 官方 Logo／banner 来源

已下载至 [reference-products-2026](assets/reference-products-2026/README.md)，逐图来源、事件、校验值、尺寸和权利说明见 [manifest.json](assets/reference-products-2026/manifest.json)。

- **YOLO26：**Ultralytics 正式发布公告使用的品牌横幅；从 WebP 无损转为 PNG，像素一致性已校验。
- **RelateAnything：**2026 作者项目页的官方 `og:image` 关系预测示例，保留原图底部摄影署名；与官方仓库的社交预览图一致。
- **Qwen3-ASR：**官方 README 直接引用的产品 Logo；另保留一张官方介绍图备查。
- **Gemma 4：**Google 发布页的 `og:image` 品牌图，原始 PNG。
- **Cosmos 3：**NVIDIA 新闻稿末尾明确链接的 [官方新闻配图附件](https://www.globenewswire.com/NewsRoom/AttachmentNg/03777613-6abd-429d-9bc8-04a680e087d4)，页面标明 Source: NVIDIA CORPORATION。
- **Muse Gadgets：**Meta 仓库 README 引用的设备横排图，下载地址固定到仓库提交 `1d2cb5af1cc3c412eedf8b08b49d3876a1eba956`。

用户明确要求真实产品图标／banner；保留原图形态与厂商署名，不使用 AI 重绘，也不将厂商宣传图当作本项目现场成果。标识与相关图像权利归相应厂商或权利人；代码／模型许可不能自动视为品牌图像许可，Muse 还包含头像素材等例外。

## 目标检测、关系预测与 EG 的职责

[RelateAnything 官方 README](https://github.com/Maelic/RelateAnything/blob/main/README.md) 的 Deployment 说明模型接收外部区域且自身不检测对象。输入为图片、区域以及推理时指定的关系词表；输出为带分数的 `(subject, relation, object)`，可区分空间与语义关系。区域可由检测器、分割器或人工提供；显示示例中的类别标签并非模型必需输入。开放关系词表不等于已经完成设备领域微调。

| 能力 | 数据与职责 | 在 PSOP 中的设计用途 |
| --- | --- | --- |
| 目标检测／分割 | 现场图片、领域类别与框／掩码标注；定位对象区域 | 找到构件、层面、工装和异常候选区域，适配遮挡、光照与设备差异 |
| RelateAnything 关系预测 | 图片、外部区域、关系词表；生成关系候选及分数 | 描述对象之间的空间／语义关系，供任务层进一步核对 |
| EG 任务推理 | 术语、对象、关系、当前步骤、条件与操作记录 | 将观察与适用依据联系起来，提出复核、补证或后续步骤；审核轨迹组织为训练监督 |

“语音并行输入；图像 → 目标检测区域 → RelateAnything 关系候选 → EG 核对”是本项目的**集成设计推论**，不是上述模型已经验证的设备闭环。检测到某物或预测两物相邻，均不证明安装、适配或操作结果合格。检测按领域类别、遮挡与光照评测，关系按人工标注关系和独立场景评测，任务按工程条件、异常恢复及审核结果评测。

本页引用的是 **Maëlic Neau 的 2026 RelateAnything**。[EvolvingLMMs-Lab 早期同名项目](https://github.com/EvolvingLMMs-Lab/RelateAnything) 是 SAM 掩码与 OpenPSG 关系分析的另一实现，不混用作者、图像或时间。

## 领域语音微调与热词上下文分别做什么

[Qwen3-ASR 官方微调指南](https://github.com/QwenLM/Qwen3-ASR/blob/main/finetuning/README.md) 支持用音频路径和目标转写组成的 JSONL 样例继续训练。输入包含音频与文字，训练形成新检查点。

[Qwen 官方模型卡](https://huggingface.co/Qwen/Qwen3-ASR-0.6B-hf) 分别给出 Context / hotwords 和 Training / fine-tuning：前者在请求中用 `prompt` 提供词汇及背景，影响转写偏好；后者计算训练损失并反向传播。

| 路径 | 输入与动作 | 在 PSOP 中的设计用途 |
| --- | --- | --- |
| **领域语音微调** | 真实录音、审核转写、设备与噪声条件；更新模型权重 | 学习设备操作、专名、型号及其在真实语音中的表达 |
| **任务热词／上下文** | 推理时给出当前对象、步骤、型号候选词；不更新权重 | 在当前任务范围内减少术语歧义；不能保证绝对正确 |
| **EG 任务对齐** | 当前步骤、对象、条件、观察及专家纠正 | 提供词域与语料审核上下文，把语音结果关联到任务状态 |

EG 不是声学模型，纯文本 EG 不能代替音频训练。普通任务微调、语音微调与热词配置也不是同一个技术动作。页面表达研发方案，不写“已精准识别设备术语”或虚构增益。

评测设计应分别观察词项准确率、型号完整匹配率、整体转写误差与任务状态识别，并按说话人、设备与噪声条件保留独立测试。与第 14 页固定模型、增减 Runtime 的任务实验分开。

## Microduck 本地资料与教学案例

本地 [build 知识包](../../../build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/README.md)、[任务事实](../../../build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/kb/tasks/task-definitions.jsonl)与[知识 App](../../../build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/apps/build/index.html)提供可追溯的设备资料。任务 TSK-000006 为“单个替换舵机的软件识别”，TSK-000008 为“软件与传感器逐项检查”；review.decision=proposed，verification=document，指向软件与文档支持的事实，具体实机状态仍需检查。

教学设备 MD-01、任务 MD-SERVO-CHECK-01 / Rev.A、步骤 S03 和关节 J01 是统一演示标签。现有识别记录与缺失复检记录用于解释对象绑定、证据查询和 Runtime 保持状态。具体 EG、三维操作、标注与模型监督为教学及界面原型。

软件身份识别与默认运动，不等同于机械零位标定或安装验收。检测框可定位可见部件，关系模型可提供区域关系候选；设备总线身份、复检反馈和完成条件从对应工具、资料和审核记录取得。

设备外形使用知识包内 `SRC-000048 / robot_walk.xml` 和其 38 个 STL 部件、70 个视觉实例。装配变换采用来源矩阵，颜色采用 XML 材质，保留鸭形头壳、镜头、外露颈部舵机、躯干与腿部连接件。装配配置为 `walk-model-reference / qpos0 / DEV-000003`，与 alpha 软件任务的配置身份分别记录。

[Pollen Robotics 官方照片资料](https://pollen-robotics.com/microduck/press-kit/)作为外观对照；本地保存[实物近景](assets/generated/microduck/official-closeup.webp)和[多款实物外观](assets/generated/microduck/official-squad.webp)，分别来自官方站点 `assets/microduck/gallery/closeup.webp` 和 `assets/microduck/squad.webp`。照片保留原图字节及来源，具体款式与来源模型可能存在版本差异。

设备知识图使用部件拆解及来源连线；关节复检图使用局部放大、整机定位和检查记录流程。两者由 [本地 SVG 工具](tools/build_case_visuals.py)分别构建，嵌入来源装配渲染。

第 19 页及移动端使用[安装过程示意](assets/generated/microduck/installation-process.png)：双手正在对齐髋部舵机与连接件，螺丝刀在紧固位置，腿脚组件尚未装回。该场景由内置 imagegen 参考官方实物照片与来源模型生成，完整提示词见[生成记录](assets/generated/microduck/installation-imagegen-record.json)。它用于表达正在操作的步骤，现场检查记录另行取得。

## simulate 与已有实现

[simulate 设计](../../simulate/simulate-design.md)定义可交互、可验证、可回放的虚拟操作环境。[实现状态](../../../skills/psop-simulate/references/implementation-status.md)记录既有合成装配、Three.js 视图与确定性回放基础。本版 [Microduck 沙盒](prototypes/simulate.html)使用来源部件展示安装顺序：准备、对齐、安装、固定连接和复检。阶段切换改变髋腿组件的显示位置，保留来源装配矩阵；显示变换与操作记录是教学设计，最终仍等待实际工具返回与验收。

设备动力学、硬件接口、真实工具返回、模型训练与发布分别需要验证。目标平台使用知识图谱和 EG 对齐作业，知识与任务经过审核更新，模型经过独立评测发布，再按适用版本分发。

## 既有证据与价值核算

第 14 页保留原机械臂组装受控实验的数字、折线和 240 个配对；只统一展示中的 PSOP 名称。该实验衡量任务机制增量，Microduck 的具体操作与训练效果需另行评测。第 20 页为已有机械臂 AR 演示；播放时长以本地媒体为准。

[经济模型](economics-model.json)按交付准备、现场、服务质量及复用分项核算；参数未填时不计算 ROI。新增检查、远程指导、复核、维护和训练计入成本。社会价值通过任务完成质量、独立操作训练时间及经验证资产复用评估。

## 解决方案视觉参考

第 5–13 页参考本地[视觉稿第 11–19 页](../../ppt/视觉稿/)的系统接入、方案定位、客户自助、工程师协同、服务闭环、能力扩展、试点验收、规模复制和产品愿景。按当前 PSOP 16:9 版式重绘文字、流程、表格与状态；品牌和设备例子统一为 PSOP / Microduck。源文件名作为页序依据，源图片印刷页码不作为当前页码。

上述九页为解决方案设计与验证计划。系统对接、服务完成率、成本收益和自主执行均需按设备与任务验证，不作为已经取得的实测结果；图表不复用原视觉稿中的未验证完成状态。几何、安装过程和移动端的来源继续遵循本页 Microduck 案例说明。

## 首页任务 EG 概览

首页[教学 EG 模块](tools/cover_task_eg.py)使用 13 个状态 / 动作节点和 13 条有向边，将细分安装操作合并为“对齐安装”，保留设备 / 任务绑定、身份与复检两路核验及条件汇合。当前 token 停在待对齐，身份通过、复检通过和最终输出均为空。该图为首页概览；细化步骤、取证和异常处理在工作台中展开，概览映射与当前状态随模块元数据记录。

透明[安装装备视图](assets/generated/microduck/cover-installation.png)使用同一 walk 来源的 70 个实例，只对 17 个左髋腿链实例施加阶段 2 显示变换；保留来源装配矩阵，导出安装接口和移动关节的屏幕投影。首页 SVG 据此绘制方向箭头；手机画面的 AR 标记注册到既有安装过程示意的紧固位置。
