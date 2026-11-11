# 工作台实景截图

这些配图来自运行中的 PSOP 前后端与 Microduck `source-model/1.8`，拍摄日期为 2026-11-07。模型、孔位、证据及页面内容均来自实际 DKP。

| 文件 | 展示内容 |
| --- | --- |
| [workbench-overview.png](workbench-overview.png) | 设备工作区、参考装配、结构树与对象详情 |
| [workbench-interfaces.png](workbench-interfaces.png) | 舵机／连杆孔位对应、局部查看及参考紧固路径示意 |
| [workbench-evidence.png](workbench-evidence.png) | 部件知识定位到 XML 原件与相关行 |
| [capture.json](capture.json) | 实际快照、包摘要、页面上下文及截图文件摘要 |

先启动工作台，再在 `apps/workbench` 目录执行：

```powershell
node scripts/capture_docs.mjs
```

脚本使用本机 Chrome 与实际 UI 控件，读取当前登记的 Microduck 快照，覆盖这三张正式配图并更新来源记录。可以通过 `PSOP_SCREENSHOT_URL` 指向其他可访问的工作台地址。

图中的爆炸偏移、透明和金色补全件属于显示状态。示意件保留未确认标记；截图不作为实际安装、真实物料或机械验证证据。
