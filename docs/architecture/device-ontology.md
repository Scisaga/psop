# 设备本体旧草案路径已退役

当前机械语义唯一入口是 [PSOP 硬件本体定义](hardware-ontology.md)，目标 psop.hardware/2.0-draft.4。本路径原先承载的平行设备本体草案已退役，旧正文通过 Git 历史查阅，不维护另一套核心对象、五值判断或身份层。

v2 同时废弃旧 core／CMP／PORT／IFC 与旧 DKP profile。新 Build 以 draft.4 为目标发布数据型 DKP，由统一工作台读取；本轮只实现来源模型子集，不等于完整本体求值。

见 [系统设计](system-design.md)、[DKP v2](device-knowledge-package.md)、[重建边界](hardware-ontology-migration.md) 与 [验证状态](hardware-ontology-validation.md)。
