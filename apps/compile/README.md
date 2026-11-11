# 旧独立 Compile UI 已退役

统一产品入口已迁至 [apps/workbench](../workbench/README.md)。一个设备工作区内组织 Build、Simulate 和 Compile；不再为每个 DKP 生成或维护独立工作台代码。

本目录原有静态页面、样例与投影脚本基于旧 core／DKP App 合同，不是 v2 DKP 的消费者，也不是真实训练器、模型加载器或推理服务。它们不属于新运行入口，不再指导准备旧 DKP 或启动独立 HTTP 预览。历史界面与实现可通过 Git 历史查阅。

新边界见 [Compile 设计](../../docs/compile/compile-design.md)、[psop-compile 技能](../../skills/psop-compile/SKILL.md) 与 [统一系统设计](../../docs/architecture/system-design.md)。真实语料生成、训练、模型执行和评测后端仍待实现。
