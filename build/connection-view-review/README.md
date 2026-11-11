# 喙部高亮、确认状态与参考连接件验收

2026-11-08。实际工作台 `http://127.0.0.1:8780/`，知识 `2.0.0-assembly.3`，剖面 `psop.hardware.source-model/1.14`。

## 修正结果

| 问题 | 当前行为 |
| --- | --- |
| 曲面出现细长金色三角与毛刺 | 完整有限特征在源网格单次绘制中着色；离散曲面见证使用完整圆形标记，可见锚点才显示，背面或遮挡时隐藏 |
| 确定的喙部—舵机接口标成“可能” | 本轮用户确认单独作为新依据，连接改为 `declared`，界面显示“已确定”；原几何与旧证据原文保留 |
| 接口用途与紧固参数混成一个状态 | 对端已确定；实际选孔、螺钉数量、规格、旋入深度及实物紧固状态仍分别待核 |
| 爆炸图没有连接件 | 喙部登记四条可选螺钉参考路径；显式选一孔显示一条示意，整组选择不自动生成四件 |

入口由有限孔壁明确的 high 端确定，向内为源局部 −X；没有把壁中心或成员 +X 方向误当螺钉入口。图形杆仅画至对端接收孔入口，不伪造螺纹、真实长度或旋入深度。示意不进入 70 个源 Part 的数量或真实物料清单。

“沿接口轴查看”同时显示喙部与指定舵机，以共同轴组织本端、接收端和连接件的显示偏移。普通选择不移动相机或改变透明状态；关闭连接件后，对端往返也保持关闭。带相机的分享链接恢复局部查看与所选参考路径。

## 实际画面与操作

- 同相机曲面对照：[修正前](before-soft_cover_support.png) / [修正后](after-soft_cover_support.png)。视图 JSON 及 [高亮操作记录](highlight-final-operations.json) 记录相机、旋转、缩放、单孔及背面隐藏检查。
- [四孔高亮](after-bores.png) / [单成员高亮](after-bores-single-member.png)：只改变所选源面，不叠加共面填充网格。
- [装配示意](connection-assembled.png) / [沿轴展开](connection-exploded.png) / [复原](connection-restored.png)。
- [真实三维拾取](connection-canvas-picked.png)、[对应舵机孔](connection-receiver.png)、[返回原连接](connection-returned.png)、[分享刷新](connection-shared-refreshed.png)。
- [关闭后对端返回](connection-hidden-returned.png) 保持隐藏，手动打开后才恢复显示。
- [完整连接操作记录](connection-operations.json) 含世界坐标、实际相机、鼠标点击位置及导出视图。0%→100%→0% 复原通过；头位于入口外，三点轴线残差约 `2.49e-12 m`。
- [共享实例检查](shared-instance-check.json)：未选舵机的 84,666 个像素前后零变化。

图片均由生产页面生成并实际查看，没有用测试 CSS 隐藏碎片或额外面板。曲面圆环可辨，转至背面隐藏；旋转及缩放没有发现本轮黑色毛刺或串色，页面错误为空。

## 验证与版本

- [4 项新增实际操作](connection-view-tests.txt)、[18 项原操作回归](regression-tests.txt) 通过。
- [39 项前端模型、渲染、API及缓存检查](node-tests.txt)、[16 项目录反例](catalog-tests.txt)、[9 项路径反例](path-tests.txt)、[11 项 Build 检查](build-tests.txt) 通过。
- [空闲测量](idle-performance.json)：曲面标记及连接件爆炸两种状态，静止两秒实际重绘均为 0；知识视图为 1,879,810 字节。可运行 `node build/connection-view-review/measure-idle.mjs` 复查。
- [实际服务与前端资产 SHA](runtime.json)、[新包验证](validation-new.json)、[旧包验证](validation-old.json)。

新包按 prepare → finalize → validate → register 发布：快照 `dkp-6a841fcb9cb028ba2c63`，摘要 `6a841fcb9cb028ba2c63df67cfd35c43f30e95374fb6f6bc314b7332160789e8`。旧 catalog/1、1.13 Schema、知识包及原始 STL 保持原字节。

本轮先登记喙部四条可选路径；没有声明整机紧固件已补齐，也未将参考图形升级为已安装螺钉。
