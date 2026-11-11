# PSOP 静态官网

直接打开 [index.html](index.html)，或将整个 `docs/html` 目录部署到静态服务器。页面无构建步骤、外部 CDN、网络字体及运行时 API 依赖。

新版面向工程与研发团队，采用当前工作台的朱红折带标识、浅色青绿界面与深色三维装配展示。内容依次介绍统一工作台、设备知识与来源、真实装配操作、应用方向、研究案例和本地使用入口。

## 产品与素材基线

- 当前产品截图来自实际运行的 PSOP 前后端与 Microduck `2.0.0-capabilities.10`，包含 70 个部件实例和 38 份几何资产。截图中的知识版本、来源构型、页面路由、内容摘要及源码状态见 [采集记录](assets/workbench-capture.json)。
- Build 通过 CLI 构建、校验并登记知识包，网页展示已发布快照。Simulate 已实现交互装配与独立方案保存。Compile 展示语料、实验、模型和评估的组织方向，执行服务尚未接入。
- 装配录像为当前工作台实录，约 30 秒。前半段用白色头部上壳与橙色下壳展示原装三点闭合、拆分及撤销；通过原生可见性控件隐藏其余 68 个部件，近景保留合拢与分开后的停顿。后半段保留另一独立方案中的整机自动还原，两段引用同一知识快照。没有修改原始网格或配合变换，也没有合成运动。剪去了计算等待及部分中间过程；自动还原使用界面原有的 4× 档位。近景的独立方案、准备位姿、操作修订及截图见[补录记录](assets/workbench-connection-capture.json)。
- 官网 3D 查看器默认静止展示来源原装构型，支持拖拽、方向键旋转、展开滑杆和复位。保留来源几何、颜色和矩阵；展开偏移不表示已认证拆装路径。WebGL 或本地依赖不可用时保留静态模型与展开图片。
- EG 和 Microduck AR 是教学交互；安装过程照片为既有生成示意。机械臂 AR 录像及 240 组受控实验属于历史机械臂研究，不能作为当前 Microduck 实测结果。25 页 PDF 标为历史研究方案。

装配解释遵循[装配判定与设计保真](../architecture/assembly-judgment-policy.md)：原装接触重叠保留测量与关系，不单凭刚性网格交集否定装配或修改设计；几何观测、操作资格和工程验证分别表达。

所有资源的分类、来源、大小与 SHA-256 见 [资源清单](assets/sources.json)。三维模型来源与授权见 [3D 清单](assets/3d/sources.json)。

## 本地预览与品牌同步

在仓库根目录运行，使用已安装的 Node.js 或工作台启动器所用的内置 Node：

```powershell
node scripts/serve-homepage.mjs
node scripts/generate-brand-icons.mjs --homepage-only
```

预览地址为 `http://127.0.0.1:8796/`，支持视频字节范围请求；可通过 `--port` 换端口。品牌同步只复制现有母版及图标到官网，不重导出工作台 PNG。要修改品牌母版并完整重导出，仍使用原来的 `node scripts/generate-brand-icons.mjs`。

浏览器图片放大、视频和文档均由访客主动触发。装配 WebM 与历史 AR MP4 独立管理，初始页面不请求视频或 PDF；离屏或后台暂停播放。EG、AR 默认收起，旧 `#execution`、`#field`、`#evidence` 链接继续可用。

## 更新真实截图与录像

需要工作台依赖、可读取的已登记 Microduck 知识包、本机 Chrome，以及 Playwright 的 FFmpeg。首次准备录屏工具：

```powershell
node apps/workbench/node_modules/playwright/cli.js install ffmpeg
node scripts/capture-homepage.mjs --video
node scripts/capture-homepage-connection.mjs
node scripts/prepare-homepage-video.mjs --edit docs/html/assets/workbench-video-edit.json
node scripts/sync-homepage-sources.mjs
```

采集脚本在 `.runtime/homepage-capture` 创建独立登记表和方案，默认启动 8795 端口的临时服务，退出时关闭服务。不会连接用户正在使用的工作台服务，也不改写用户登记表、知识包或保存方案。

截图输出本地 WebP；原始录像保存在忽略的 `.runtime` 中。头部近景补录使用独立的 `.runtime/homepage-connection` 登记表和 8798 临时服务，同样不写入用户方案。视频准备脚本使用浏览器原生 VP9 编码，再使用 Playwright FFmpeg 写入可寻址的 WebM 元数据。

[剪辑清单](assets/workbench-video-edit.json)分别登记两个原录像、SHA-256、采集记录、选段秒数和字幕。当前前半段为头壳补录的 9.6–18.9、21.1–24.3 秒，剪去拆分后的镜头调整；后半段为原整机录制的 94–102、118–127.5 秒。时间码经过原片解码画面核对，采集记录中的墙钟事件时间包含页面初始化，不能直接作为视频时间码。重新采集后必须检查各分镜，并将清单中的文件路径、摘要和秒数更新到新录像；过期摘要会阻止误剪。`--edit` 可指定其他清单；已登记清单时省略参数会重用该清单。单录像仍支持 `--segments 起点:终点,起点:终点`。原始录像不随静态官网发布；成片、两份采集记录和剪辑清单均保存在官网资源目录。

## 验收

```powershell
node scripts/verify-homepage.mjs
```

验收复用工作台的 Playwright 与本机 Chrome，临时静态服务默认使用 8797 端口。检查文件直开和 HTTP、6 档响应式宽度、标签页与弹窗焦点、原始 3D 结构、EG 条件汇合、AR、录像播放与懒加载、无 JavaScript / WebGL / 依赖失败降级、旧链接及素材摘要。结果写入 [validation.json](validation.json)，预览图来自实际浏览器：

- [桌面首屏](preview.png)
- [手机首屏](preview-mobile.png)
- [完整页面](preview-full.png)
- [EG 演示](eg-preview.png)

源码入口为页面 HTML、主题样式及 `scripts/` 下的首页增强、教学演示和三维查看器。历史研究 PDF、模型与录像在本轮中保持原义。
