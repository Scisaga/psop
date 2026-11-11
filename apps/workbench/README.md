# PSOP 统一工作台

工作台管理多个设备工作区，读取 Build 发布的 DKP，提供模型、有限几何、连接能力、本体和来源的联动浏览。当前使用 Build `3.0.0-draft.23` / `psop.hardware.source-model/1.15`：原始网格发现、本件潜在能力、有依据的功能接口、原配置参考关系与跨件条件候选分别表达。原装配页直接显示逐部件用法、承槽/挡面等具体安装链与未决项。默认保留来源原装构型，工程推断的协调构型可选；刚性求交作为几何观测，装配编辑资格与力学验证分别记录。部件和候选详情按需加载；选择不移动相机，定位进入可恢复的局部查看。1.0～1.14 继续按原合同读取。实现状态核对于 2026-11-11，见[装配判定优化记录](../../docs/assembly-judgment-optimization.md)、[接口完整性复查](../../docs/reference-use-completeness.md)与[首次发布记录](../../docs/build-capabilities-release.md)。

![Microduck 设备工作区](../../docs/assets/screenshots/workbench-overview.png)

操作说明见[工作台使用指南](../../docs/workbench.md)。本页说明运行、数据与开发方式。

品牌标识采用朱红色「折叠空间」，用于左上角、启动页、关于窗口和 favicon。SVG 母版、各尺寸图标及原始选定方案统一位于 [assets/brand](../../assets/brand/README.md)。修改母版后，在仓库根目录运行 `node scripts/generate-brand-icons.mjs` 同步工作台静态资源。

## 运行

需要 Node.js 22.12+、Python 3.11+。大型原始资料使用 Git LFS；检出仓库后执行 `git lfs pull`。首次准备 Microduck 会下载固定版本的补充 XML。

Windows 双击仓库根目录的[启动工作台.cmd](../../启动工作台.cmd)或本目录的[启动工作台.cmd](启动工作台.cmd)，两者均优先使用本机已准备的 Node。也可从本目录执行：

```powershell
node scripts/launch.mjs
```

启动器安装缺少的依赖、复用或准备设备工作区、构建并打开 **http://127.0.0.1:8780/**。服务已经运行时直接打开页面，不重复构建或启动进程。默认固定使用 8780，端口被其他服务占用时显示错误，不自动换端口。`--no-browser` 关闭自动打开页面。后端代码更新后仍需重启服务才能加载新代码。

启动和知识包校验使用同一套 Python 选择规则：优先采用 `PSOP_PYTHON` 指定的解释器；Windows 下其次使用本机已有的 `.runtime/python/python.exe`；否则使用系统 `python`。直接重启服务也沿用此规则，避免误调用 Windows 的 Microsoft Store 占位程序。

更新 `scripts/serve.mjs` 或装配服务代码后，需要重启正在运行的服务进程；重新构建前端不会刷新后端内存。自动组装会先检查 `/health` 的 `simulate.commands`，避免新页面向旧服务发送不支持的命令。

自动组装的全部件工序由独立 Node 工作线程推导：反向退出搜索、嵌套预装、逐件避让和实际播放路径复核。原装接触深度单独保留；有限采样不是连续路径或力学认证。默认在当前工作台和当前视角播放，鼠标可旋转／平移／缩放，左下进度条提供可选视角跟随；待核工艺提示不展示，内部来源与结果保留。检查记录见 [Simulate 验收](../../docs/simulate/verification.md)。

首次打开某个版本会完整校验来源并重放几何，可能需要数分钟。通过结果保存在仓库 `.runtime/dkp-validation/`；重启服务后先核对完整文件清单、每个文件的 SHA-256、校验工具、Python 与依赖版本，身份未变时复用结果。包或校验工具变化后重新校验，读取每份资产时仍核对其字节。启动页等待超过 10 秒会说明校验原因并显示等待时间；失败时显示服务返回的具体原因。

手动启动：

```powershell
npm ci
npm run prepare:workspace
npm run build
npm start
```

前端开发使用 `npm run dev`。可信局域网可用 `node scripts/launch.mjs --bind <本机具体IP>`，通过 `--port` 指定端口。当前服务没有账户和公网部署配置。

## 设备工作区和版本

`prepare:workspace` 调用实际 Build CLI，摄入原始材料、可选装配说明和独立要求，依次执行 `prepare → freeze → finalize → validate → register`。已有工作区会复用；分阶段命令和缓存/冻结规则见[Build 使用说明](../../docs/build/device-knowledge-build.md)。

当前 `2.0.0-capabilities.10` DKP 以 [Git LFS 归档和版本记录](../../releases/microduck/2.0.0-capabilities.10/release.json) 保存，完整解包目录留在本机并被忽略。首次准备时优先复用已登记工作区和本机发布包，否则校验最新归档 SHA-256 并自动还原，再通过正常登记校验；`--fresh` 仍从输入完整构建。历史发布文档中的路径和摘要保留为来源记录，不表示旧目录仍存在；正式审查证据继续保留。新增安装接口、三凸耳对应、外壳孔对端及未决项的核实结果见[本轮记录](../../docs/installation-followup.md)。

```powershell
# 生成并登记新快照
python -B scripts/prepare_workspace.py --fresh

# 登记已有包，相对路径以当前工作目录为基准
node scripts/workspaces.mjs register --dkp ../../build/<设备>/<包>.dkp --workspace <工作区ID>

# 创建空设备工作区并检查目录
node scripts/workspaces.mjs create --id <工作区ID> --device-id <设备ID> --name <设备名称>
node scripts/workspaces.mjs list
```

登记表在仓库根目录 `workspaces/registry.json`，留在本机。当前工作台仅登记最新版 `2.0.0-capabilities.10`，默认快照为 `dkp-c9a2c6afd8358f836d0f`。包包含 8,703 项有限几何、411 项接口（257 项功能接口）、145 条参考关系，为全部 70 个实例发布用法审查。新版分开表达原装用途、对端、几何和紧固细节，全部未决假设进入跟进，见[原装状态复核](../../docs/build/reference-connection-status.md)。接口匹配与局部承座规则见[接口分析与核对](../../docs/build/interface-analysis-policy-2.md)，此前工程未决项见[安装复核](../../docs/installation-followup.md)。来源和协调构型的关系见[装配判定优化记录](../../docs/assembly-judgment-optimization.md)，历史头部推断依据见[合理修正记录](../../docs/reference-assembly-repair.md)。运行工作台不要求登记全部开发快照。

读取层识别 source-model/1.0～1.15 的显式合同，旧包继续使用各自的 Schema 与解释器，不补写新几何、能力或候选。历史合同兼容不恢复旧 core、旧面板引擎或包内 App。

## 主要交互

| 区域 | 当前行为 |
| --- | --- |
| 设备与版本 | 切换工作区及实际登记快照，跨页面沿用上下文 |
| 结构树与 3D | 拾取、隐藏、隔离、透明、剖切、爆炸／复原与视角控制 |
| 对象详情 | 概览、几何、接口、关联、证据；几何按位置组织组成、尺寸及关系，原始数组按需展开；支持拖拽及键盘调宽 |
| 几何与能力 | 搜索全部本件有限几何、尺寸和潜在方式；用途未知仍可选择和定位，功能接口另保留成员规则 |
| 原装配 | 查看来源配置中的具体接口和对端，保留实际对应子集及依据 |
| 兼容候选 | 从本件或全部部件对查找位姿无关的局部匹配，按需加载双方几何、连接件要求与未知条件 |
| 证据与调查 | 按需查看具体结论、原始定义/假设、角色、支持/反证/检索、缺证和来源位置；机械资格分别保留 |
| 局部查看 | 普通选择只更新高亮；显式定位本件或对端才进入局部查看，可返回原部位及视图 |
| 来源定位 | 打开原始 XML、CSV、说明、PDF 或图片，定位相关行与断言 |
| 分享与导出 | 保留设备、版本、对象、相机、显隐和局部检查状态 |
| 三技能 | Build 展示实际发布信息；Simulate 提供三维自由装配、自动组装成品参考演出与方案保存；Compile 保留待接入能力说明 |

详情栏最小 320px、默认 380px、最大 640px，受画布可用空间约束；双击分隔条复原，窄屏采用纵向布局。

爆炸视图先保留同一刚体内舵机的相对位置，沿薄壁、关节及来源层级展开支架、轴承和外壳，再整体分离头部与左右腿等分支。下级组件跟随父件接口处的部件；腿部连杆与舵机保持高度关系，踝部、脚体和脚底按竖直方向分层。布局检查实际世界包围盒，间距随模型尺寸缩放；“展开”和快捷键 E 使用 100% 展开，滑杆可查看中间状态。展开与复原会沿当前观察方向适应可见模型，不修改来源位置；展开方向是浏览用的几何启发式，不表示已验证的拆装路径。

1.8 的参考螺钉从同一连杆孔道的外侧入口朝壳体目标绘制，并记录有限方向假设。未核实替代方案需要显式启用。实际规格、装入方式、保持与承载按证据分别标注；爆炸偏移、透明和高亮属于浏览状态。

## 数据与 API

工作台生成 DKP 的显示投影，知识与资产保持包内身份。目录读取核验 manifest 元数据；选择内容时完整验证并重放来源，资产读取继续检查字节和 SHA-256。

| GET 路径 | 内容 |
| --- | --- |
| `/api/workspaces` | 工作区、快照与默认选择 |
| `/api/workspaces/:id/snapshots/:snapshot/view` | 通用显示投影 |
| `/api/workspaces/:id/snapshots/:snapshot/knowledge` | 结构化设备知识 |
| `/api/workspaces/:id/snapshots/:snapshot/manifest` | 发布清单、摘要与能力 |
| `/api/workspaces/:id/snapshots/:snapshot/assets/:path` | 登记资产，支持范围读取 |

知识和资产 API 保持只读，登记通过本地 CLI。Simulate 的场景、候选、预览和装配命令通过 `/api/workspaces/:workspace/snapshots/:snapshot/simulate/sessions` 执行，详见[会话与 API](../../skills/psop-simulate/references/contracts-and-api.md)。方案保存到登记表同级的 `state/`，按工作区、快照和包摘要隔离，不改写 DKP。批量渲染、训练、推理和模型测试尚无执行器。

## 验证与截图

先准备 Microduck 工作区，浏览器测试使用本机 Chrome：

```powershell
npm run build
npm run test:api
npm run test:simulate
npm run test:simulate:real
npm run test:validation-cache
node --test scripts/source-display-normals.test.mjs
npm run test:e2e
node scripts/capture_docs.mjs
```

最后一个命令需要运行中的工作台服务，会重建[正式截图及来源记录](../../docs/assets/screenshots/README.md)。正式文档截图和 `build/` 中的构建验收产物随 Git 发布；本机运行缓存、测试临时输出及依赖仍被忽略。

右壳两处选孔的固定相机矩阵可用 `node scripts/capture_interface_selection.mjs before` 和 `node scripts/capture_interface_selection.mjs after` 保存到 `build/interface-selection/`；第三个参数可指定已登记快照，`PSOP_CAPTURE_BASE_URL` 可指定服务地址。首次捕获冻结实际显示投影，后续沿用同一源位置、相机及显示状态。仅保存截图不构成视觉验收，需实际查看并与[已复核对照](../../docs/build/interface-review/verification.md)比较。

端到端测试直接读取所选 DKP。单版本工作区也可运行，只有需要多个或特定历史快照的用例按登记情况跳过。

Simulate 的浏览器验收使用 `npx playwright test --config playwright.simulate.config.ts tests/simulate.spec.ts`，自动在 8792 端口启动独立服务，登记和场景保存在 `.runtime/simulate-e2e/`，不会将测试方案写入用户工作区。真实数据操作、截图及性能记录见[Simulate 验收](../../docs/simulate/verification.md)。

## 版本管理与发布工件

Git 保留能够解释和重建结果的输入、实现及审查记录；运行中反复产生的展开副本和临时目录留在本机。完整 DKP 用单个 LFS 归档保存，避免每次发布出现数千条新增文件。

| 内容 | 存放与版本管理 |
| --- | --- |
| 前后端源码、Schema、测试、截图采集脚本、依赖锁文件 | 正常纳入 Git；未跟踪的 `.mjs`、`.tsx`、`.py` 不应按扩展名忽略 |
| 装配目录、独立要求、冻结原三角观察与研究输入 | `device-materials/assembly/` 等，纳入 Git；即使由脚本生成，也参与来源摘要和构建验收。历史路径 `build/v2/cache/microduck-reference.xml` 是固定来源输入，明确保留 |
| 原始大型材料压缩包 | `device-materials/*-official-materials.zip`，按已声明路径使用 Git LFS；本轮补齐 Microduck 的 LFS 规则，不改写既有历史 |
| 当前完整 DKP | `releases/<设备>/<版本>/*.dkp.zip` 使用 Git LFS；相邻 `release.json` 保留包身份、来源、归档 SHA-256 和文件数 |
| 解包 DKP、prepare/finalize 工作目录、发布中间目录和下载缓存 | `build/` 中对应目录被忽略；可以还原或重新生成，不作为另一份发布源码提交 |
| 正式验收报告、文档引用的截图和冻结对照 | 保留现有 `build/*-review/` 等引用；新增临时重跑输出应写入 `.runtime/` 或被忽略的测试输出目录 |
| 固定版本的离线几何内核 | `skills/psop-build/scripts/vendor/manifold-3d/` 连同许可证及 `SOURCE.json` 纳入 Git；这是执行依赖，不是本机缓存 |
| Node/Python 运行时、`node_modules`、前端 `dist`、工作区登记、测试视频/trace、日志、视图导出、验证缓存 | `.runtime/`、`workspaces/`、应用已有忽略目录；不提交本机状态 |

不要整体忽略 `build/` 或所有 JSON/图片：其中已有可追溯审查材料和文档依赖。历史演示视频、PDF 等大文件仍保持原路径；后续可将重复媒体整理到统一资产目录，使用 LFS 或发布附件，迁移时同步更新引用。

生成新发布归档前先完成正常 DKP 校验，再在仓库根目录运行：

```powershell
python -B scripts/archive_dkp.py --dkp build/<设备>/<剖面>/<包>.dkp
```

归档工具逐项核对 manifest 中的大小和 SHA-256，拒绝覆盖已有版本；它不替代 Build 的完整机械与来源校验。恢复时检查归档和 manifest 摘要、设备及包身份，拒绝路径越界和覆盖已有目录。新机器先运行 `git lfs pull`；工作区准备脚本会自动恢复归档，无需人工复制数千个文件。

已被普通 Git 跟踪的 Microduck 原始材料在提交这组整理时，可用 `git add --renormalize -- device-materials/microduck-official-materials.zip` 转为 LFS 指针；新增规则不会自动缩小过去的 Git 历史。本轮没有重写历史或上传发布工件。

建议把待提交改动拆成仓库整理与归档、Build 与机械数据、工作台交互、文档与验收证据几组。取消跟踪旧临时目录只删除 Git 索引记录，保留本地文件；既有旧 DKP 的删除记录也应作为清理提交保留。
