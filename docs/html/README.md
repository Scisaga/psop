# PSOP 静态主页

直接打开 [index.html](index.html)。整个 `docs/html` 目录也可放到任意静态服务器，无构建步骤、无 CDN、无后端依赖。

页面基于 [PSOP v2 slides](../presentations/v2/slides/index.html) 的产品与解决方案叙事；视觉节奏参考 [Graphite](https://graphite.com/)，使用独立的 PSOP 品牌、Microduck 素材与页面实现。

- **真实 3D 爆炸图**：38 个来源网格、70 个装配实例。自动展开与归位、拖拽旋转、键盘旋转、滑杆及复位。
- **EG 执行过程**：token 沿实际连接路径流转，缺少复检记录时暂停；补充教学记录后，双输入汇合才能进入下一步。
- **AR 场景演示**：目标标记注册到安装位置，依次演示对象识别、对齐安装与等待复检；另有点击后加载的原机械臂 AR 视频。
- **响应式与辅助访问**：键盘标签页、移动端导航、原生对话框、清晰的焦点反馈；尊重“减少动态效果”设置，离屏或后台暂停核心动画。

`assets/psop-overview.pdf` 是当前 25 页方案的本地副本；PDF 与视频均在点击后使用。核心图片使用本地 WebP。三维模型包在设备展示进入视口时载入。

产品界面、Microduck EG 与安装指导是交互原型或教学示例；安装过程照片为既有生成示意。240 组配对实验与 AR 视频来自机械臂工作，未表述为 Microduck 实测。资源出处与摘要见 [assets/sources.json](assets/sources.json)；三维模型与 Three.js 授权见 [assets/3d/sources.json](assets/3d/sources.json)。

源文件：`index.html`、`styles.css`、`scripts/main.js`、`scripts/demos.js`、`scripts/microduck-3d.js`。

品牌图标采用互扣的双轨闭环：任务经核验推进，审核后的经验回到下一次任务与模型学习。透明矢量与 favicon 分别位于 `assets/brand/psop-mark.svg`、`assets/brand/psop-favicon.svg`。

EG 图使用精密环形状态节点、语义小图标、窄门动作节点与分层标注，保持 13 个节点及 13 条执行路径。可独立导出的矢量图在 `assets/eg-refined.svg`；网站使用同一图的内联结构与 `eg-refined.css`，token 与核验逻辑仍由 `scripts/demos.js` 管理。
