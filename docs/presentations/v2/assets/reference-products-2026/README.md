# 2026 年官方产品视觉素材

核查与下载：2026-10-06。用于 PSOP 第 2 页的今年技术进展。用户明确要求真实产品图标／banner；本目录保存厂商官方原图，未通过 AI 重绘、改造或冒充项目素材。

| 文件 | 产品与节点 | 官方来源 | 使用建议 |
| --- | --- | --- | --- |
| [qwen-asr.png](qwen-asr.png) | Qwen3-ASR，2026.01.29 开源发布 | [Qwen 官方仓库](https://github.com/QwenLM/Qwen3-ASR) | 原图 Logo；浅底完整展示 |
| [qwen-asr-overview.png](qwen-asr-overview.png) | Qwen3-ASR 官方介绍图 | [Qwen 官方仓库](https://github.com/QwenLM/Qwen3-ASR) | 信息较多，留作备查 |
| [gemma4.png](gemma4.png) | Gemma 4，2026.04.02 发布 | [Google 官方公告](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) | 官方品牌图；黑底完整展示 |
| [cosmos3.png](cosmos3.png) | Cosmos 3，2026.06.01 发布 | [NVIDIA 新闻稿](https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Launches-Cosmos-3-the-Open-Frontier-Foundation-Model-for-Physical-AI/default.aspx) | 官方宣传视觉；新闻稿直接链接到图片下载 |
| [muse-gadget.png](muse-gadget.png) | Muse Gadgets SDK，2026.10.02 官方仓库初始提交 | [Meta 官方仓库](https://github.com/facebookincubator/muse-gadget-sdk) | 设备横排；浅底完整展示 |
| [yolov26.png](yolov26.png) | YOLO26，2026.01.14 正式发布 | [Ultralytics 官方公告](https://www.ultralytics.com/news/ultralytics-redefines-state-of-the-art-vision-ai-with-yolo26) | 官方蓝色品牌横幅；完整展示 |
| [relateanything.png](relateanything.png) | RelateAnything（Maëlic Neau），2026.09.11 预印本首次提交 | [作者项目页](https://maelic.github.io/RelateAnythingProject/) · [论文](https://arxiv.org/abs/2609.12552) | 官方关系预测演示图，非 Logo；完整保留底部署名 |

全部图片已解码并人工查看，确认为 PNG 图像，不是 HTML、占位页或重命名的其它文件类型。除 YOLO26 外均保留原始下载字节。YOLO26 官方横幅源文件为 WebP，为嵌入 SVG 转为 PNG；已逐像素验证解码后的 RGBA 内容相同，没有裁切、缩放、合成或 AI 修改。清单包含分辨率、SHA-256、源页面与原始下载 URL。

**署名**：Qwen Team / Alibaba Cloud；Google / Google DeepMind；NVIDIA Corporation；Meta Platforms, Inc. and affiliates；Ultralytics；Maëlic Neau。产品名称、Logo、形象及图片相关权利归原厂商或相应权利人。仓库代码许可不能自动等同品牌图片许可；Muse 仓库明确包含头像素材等例外，图中设备形象作为官方发布画面整体引用，不单独提取角色使用。

[manifest.json](manifest.json) 保存逐图权利说明、事件标签、使用方式与来源。模型或 SDK 的存在不代表 PSOP 已集成，也不表示厂商对 PSOP 背书。完整时间依据与语音定制方法见 [行业资料](../../industry-sources.md)。

RelateAnything 图片为作者项目页 `og:image`，与官方仓库 `assets/social_preview.png` 字节一致。图中摄影原作为 Subhrajyoti07 的 [A horse rider in Maidan , Kolkata.jpg](https://commons.wikimedia.org/wiki/File:A_horse_rider_in_Maidan_,_Kolkata.jpg)，使用 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)；关系可视化由 Maëlic Neau 发布。原图底部署名保留，未作改动，引用时完整展示。[作者逐图署名清单](https://github.com/Maelic/RelateAnything/blob/06766fdf56752ca535fc9b971fca99ce563676d0/assets/reel/credits.json)是图片来源依据。

2026 年 RelateAnything 接收图片与外部对象区域，输出带分数的关系三元组；自身不检测对象。它可以衔接 YOLO 等检测器、分割器或人工提供的 regions。它与 [EvolvingLMMs-Lab 的 2023 年同名 RAM 演示](https://github.com/EvolvingLMMs-Lab/RelateAnything)不是同一实现，不能交换使用图片、作者、时间或技术说明。产品展示与设备操作场景之间仍需领域数据和独立评测，不表示项目已完成集成。
