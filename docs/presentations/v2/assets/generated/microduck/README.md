# Microduck 案例素材

本目录统一使用 `MD-01 / MD-SERVO-CHECK-01 Rev.A / S03 / J01`。安装预演和移动端展示部件尚在安装、身份待核对、复检待补充；识别与复检子任务另展示“识别记录已有、复检记录缺失”的教学状态。完成条件仍需对应工具记录。

| 文件 | 用途与来源 |
| --- | --- |
| official-closeup.webp / official-squad.webp | Pollen Robotics 官方实物照片，保留原字节及来源 |
| model-assembled.png | 本地 walk 来源 STL / XML 组成的装配渲染 |
| model-exploded.png | 来源部件拆解视图，用于解释部件与知识关系 |
| cover-build-exploded.png | 首页专用来源几何爆炸图，分离头壳、颈、躯干外壳、腿与脚；保留全部 70 实例和来源装配矩阵 |
| cover-installation.png | 首页透明安装装备视图；阶段 2 对齐髋部组件，记录安装接口和移动关节的投影位置 |
| model-joint-detail.png | 髋部舵机与连接件的局部渲染 |
| microduck-overview.svg | 来源装配与教学任务标注 |
| device-knowledge.svg | 拆解后的部件、配置与来源关系 |
| microduck-joint.svg | 关节局部放大、整机定位和识别复检流程 |
| installation-process.png | 参考真实外观生成的安装过程：双手对齐舵机、螺丝刀固定、腿脚尚未装回 |
| installation-imagegen-record.json | 内置 imagegen 的完整提示词、外观参考与生成用途记录 |
| task-checks.svg | 对象绑定、识别与复检记录检查 |
| learning-trace.svg | 状态、观察、动作与反馈对齐为学习样本 |
| ui-build.png / ui-compile.png / ui-simulate.png / ui-mobile.png | 本版交互原型的浏览器截图 |
| cover-simulate.png | 安装预演原型的裁剪视窗，显示待安装组件、目标位置与方向提示 |
| sim-step-01.png 至 sim-step-05.png | 五步安装预演的浏览器截图，来源组件随步骤改变显示位置 |
| installation-step-checks.json | 各步骤画面、部件位置与来源矩阵保留检查 |
| prototype-render-checks.json | 截图、布局与 JavaScript 检查 |
| sandbox-checks.json | 五步安装位置、操作回放、部件选择和异常分支检查 |

设备几何使用[本地 Microduck 知识包](../../../../../../build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp/package.yaml)的 walk 来源装配：38 个 STL，70 个视觉实例，保留原部件形状、变换和材质。官方外观对照来自 [Pollen Robotics 照片资料](https://pollen-robotics.com/microduck/press-kit/)。软件任务来自 alpha 资料，其定义为 proposed / document；几何参考与软件版本分别绑定，具体 EG 和实机反馈仍需独立验证。

[素材总览](index.html) · [素材清单](manifest.json) · [材料说明](../../../README.md) · [SVG 生成工具](../../../tools/build_case_visuals.py)
