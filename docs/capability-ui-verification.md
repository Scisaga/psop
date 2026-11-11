# Build 能力库工作台验收

本页保留首次能力库的对照基线。当前 `.4` 的全部 70 个实例用法说明、243 项功能接口、7 项未决问题及对端导航实查见[原装配完整性复查](reference-use-completeness.md)和[浏览器记录](../build/reference-use-review/audit.json)。

验收对象是同一版工作台上的两个已登记 DKP 快照。界面数据来自包内登记资产，不读取构建工作目录，也不在浏览器重新匹配几何。

## 复现方法

在 `apps/workbench` 目录使用现有 Node、Python 和 Chrome 环境，先构建前端，再运行：

```powershell
$env:PSOP_PYTHON = (Resolve-Path '.runtime/python/python.exe').Path
& '.runtime/node-v22.23.4-win-x64/node.exe' scripts/capture_capabilities.mjs `
  --before dkp-6a841fcb9cb028ba2c63 `
  --after dkp-aed80087d09929af30eb `
  --out ../../.runtime/capability-ui-review
```

脚本使用真实注册 API、真实包资产和 Chrome，输出截图与 `measurements.json`。每个快照使用新的浏览器 context，窗口为 1600×1000，另检查 1100×900 无页面横向溢出。来源模型、所选左外壳及展开比例保持一致。

脚本发起的第一次 API 读取耗时单列记录。服务已预热两个不可变快照；该结果不代表首次运行完整包语义校验的耗时。初始模型就绪与部件完整几何就绪分开计时。计时是本机单次观测，不作为统计分位数或跨机器性能承诺。

## 必须成立的交互

- 左外壳本地 XY=(25.5, −9.5) mm 的 Z 向阶梯孔保留两个独立实测有限段：Ø2.2 的 Z≈40.559…42.5 mm，以及 Ø5 的 Z≈42.5…45.021 mm。检查对象必须来自 `mesh_measurement`，具有测量方法与原三角支撑，排除禁止参与候选的旧参考别名。
- 两段均能按 Feature ID 搜索、选择和单独定位；普通选择保持相机位置与目标不变，只有显式定位按钮执行相机飞行。
- 通过原装配所有参考连接的端点两两组合排除既有配对后，选择一个含标准连接件要求的新部件对，读取其已发布候选、规格条件和未知项。
- 候选对端按需加载完整部件知识。选择对端 Feature 保留原 WebGL canvas，不重取 STL，不移动相机。
- 对象形式的部件对模板处置记录可以查看。未知条件以中文展示，原始几何比较和资源、坐标框架记录可展开核查。
- 静止并结束相机飞行后，一秒新增渲染不超过两帧；页面没有未处理的 JavaScript 错误。

## 真实包观测

2026-11-08 的最终记录保存在 [measurements.json](../build/capability-review/measurements.json)。旧包 digest 为 `6a841fcb9cb028ba2c63df67cfd35c43f30e95374fb6f6bc314b7332160789e8`，新包 digest 为 `aed80087d09929af30eb845764705dda5885425446fecf72bc26110c85e8838f`。

| 项目 | 1.14 · `2.0.0-assembly.3` | 1.15 · `2.0.0-capabilities.1` |
| --- | ---: | ---: |
| API view 解码后 JSON 字节 | 1,879,810 | 1,897,696 |
| 已预热 API 读取 | 141.2 ms | 85.5 ms |
| 页面进入至模型就绪 | 1,679.2 ms | 1,502.9 ms |
| 页面进入至左外壳完整几何就绪 | 无该分片界面 | 1,506.1 ms |
| 浏览器初次 STL 请求 | 38 | 38 |
| settled 后一秒新增渲染 | 0 | 0 |
| 页面未处理 JavaScript 错误 | 0 | 0 |

浏览器只读取三个 gzip 详情：左外壳、一个部件对和对端左踝部件，压缩字节共 272,817；三者响应均为 `Content-Encoding: gzip`。左外壳详情的 182 条 Feature 占 161,898 压缩字节、851,463 解码后字节。Feature 数是有限记录数，包含参考别名和复合表示，不等于物理孔数。

| 验收孔段 | 有限 Z 范围（本地 mm） | 源三角数 | 可见源面取样 | 显式定位 |
| --- | --- | ---: | ---: | ---: |
| Ø2.2 | 40.559348…42.500000 | 180 | 16 / 16 | 475.4 ms |
| Ø5 | 42.500000…45.021433 | 99 | 16 / 16 | 433.8 ms |

两条 Feature ID 分别为 `feature:78156b29446e9a422675:geometry:1168ea080ffa51178542` 和 `feature:78156b29446e9a422675:geometry:8e06e0f84fc1c747ab50`。实际截图逐张检查后确认金色所选内孔壁、台阶壁可辨认：[Ø2.2](../build/capability-review/after-vertical-2.2.png)、[Ø5](../build/capability-review/after-vertical-5.png)。

本次发现并修正了旧定位逻辑的一个前提：它把圆孔轴的负方向当作观察入口。独立测量轴没有入口符号约定，因此可能从被壳面遮挡的一侧观察。新版只在显式定位新测量 Feature 时，从正反轴和少量斜视中，用原三角的首个射线命中选择有可见源面片的相机。零可见见证时回退整件视图并提示旋转或剖切；未知源区域检查实际显示的见证三角。这个选择只改善显示，不声明孔道畅通、实际入口或装入路径。

新配对 `pair:de76dc6622b6acca81ac` 是左踝部件 `part:microduck:07e507f1e9297aa3` 与左外壳 `part:microduck:e27cbdd6c07a264e`；原参考连接没有这两个端点的配对。点击到六类已发布候选出现用时 144.6 ms。配对详情为 32,241 压缩字节、633,783 解码后字节。[候选截图](../build/capability-review/after-new-pair.png) 显示穿层螺栓、螺母及按需垫圈要求，杆径上界按显示精度去重，精确值保留在几何记录中。连接件实际规格、长度、叠层、螺母承座、保持和共同运动归属继续待确认。

跨端选择并加载左踝部件用时 178.0 ms，新增 STL 请求为 0。两孔普通选择和候选跨端选择的相机位置、目标变化均为 0，原 WebGL canvas 保留；跨端后静置一秒新增渲染为 0。1100×900 截图也已实际检查，没有页面横向溢出。

## 回归检查

| 检查 | 已通过的范围 |
| --- | --- |
| TypeScript 与生产构建 | `tsc --noEmit`、Vite production build |
| 能力数据与资产测试 | 13 项，覆盖包根相对路径、快照隔离、不可变 hydration、失败重试、目录与详情分离、有限对应分页、1.15 入口、gzip API、实际源面可见侧和零可见回退合同 |
| 新版完整界面流程 | `tests/capability-library.spec.ts`：未绑定接口的几何、潜在方式、独立搜索、候选详情、模板处置记录、对端加载、相机与 canvas 保留 |
| 原有实际包操作 | 四项旧 E2E：舵机逐孔、已确定喙部、参考路径沿轴、局部查看中展开 |
| 大资产目录缓存 | 2415 对详情＋70 件详情的合法目录能复用校验；未登记文件和同长度篡改仍被拒绝 |

gzip 资产测试通过真实 HTTP `fetch().json()` 解码登记的 `.json.gz`，同时验证响应的压缩字节长度、完整 SHA 校验、HEAD 和 Range 行为。它还确认普通 STL 继续支持字节范围读取。生产构建保留现有大 chunk 与 Lucide `use client` 提示，没有构建错误。

历史 E2E 使用显式版本环境变量，避免默认选择的新版影响旧合同断言；执行后恢复测试覆写的旧审查截图，注册目录仍选中新版：

```powershell
$env:PSOP_TEST_SNAPSHOT = 'dkp-6a841fcb9cb028ba2c63'
& '.runtime/node-v22.23.4-win-x64/node.exe' node_modules/@playwright/test/cli.js test `
  tests/assembly.spec.ts tests/connection-view.spec.ts tests/explosion.spec.ts `
  --grep '舵机逐孔|已确定喙部|参考路径沿轴|局部查看中展开' --workers=1
```

本次界面验证不求解新姿态，不验证整体碰撞、装入路径、保持方式、制造配合或承载。旧快照没有跨件兼容目录，因此不存在可与新版候选展开耗时比较的旧值。
