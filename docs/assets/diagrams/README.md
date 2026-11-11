# 架构图

## 当前产品结构

[workbench-structure.svg](workbench-structure.svg) 为原生 SVG，供项目 README 与[系统设计](../../architecture/system-design.md)共用。文件中的容器、文字、图标和连接线均可直接编辑。

图分开表达四类对象：统一工作台、设备工作区、三技能能力入口、各自的版本化产物。容器体现业务组织，向下箭头标明各技能产出；它不把工作台列作 DKP 的下游产品，也不把 DKP 视为全部工作区数据。

三技能之间的知识、观测、数据集、模型与报告交接在系统设计的表格中单独说明。图中的能力是产品职责，实现进度由能力表说明。

画布为 1200 × 1000，采用工作台的雾白、石墨和矿物青。文本保留为 SVG 文字，未使用外部图片、字体下载或脚本。

## 历史展示图

以下两张 SVG 使用旧串行流程、DKP profile 和包内 App 等表达，保留为历史展示材料：

- [logical-architecture.svg](logical-architecture.svg)
- [capability-lifecycle.svg](capability-lifecycle.svg)

当前机械与数据边界以[硬件本体](../../architecture/hardware-ontology.md)和 [DKP v2](../../architecture/device-knowledge-package.md)为准。
