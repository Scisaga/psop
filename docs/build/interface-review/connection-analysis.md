# 连接审查机制分析台账（1.11）

2026-11-07，起点 `9f714f6e21f59b0c86f83dfc637cda2b319f2191`。本台账记录实际
代码、冻结研究输入、正式发布及下文的 API/页面/三维验收。产物存在不等于
机械接合或工程验收通过。

根因是原 `relationship_investigation` 只解释手工整理的 relation_studies，211条
connection_reviews 没有进入该链路；调查记录只挂在首个 Part。髋部六条审查的
定位/保持/运动均为通用描述，未把已存在的具体孔组、轴颈、轴承内壁或中间件
组织成可理解的机制解释。最新缓存提交没有改这条关系链。

新 `connection_analysis.py` 只用于新剖面1.11，原1.10解释器、Schema和包保留。
流程是原审查→双方有限局部配对→机制候选→实际证据审查→有依据假设/具体待证
结果→独立漏项接受→发布。没有局部依据时坐标为null，不用首个特征或原点代替。
安装定义、参考配合、假设、已接合和工程确认分别保存。

| 髋部原审查后缀 | 具体结论 | 发布证据阶段 |
| --- | --- | --- |
| `e42fab2d8700637e` | 髋Y向Ø2.4四孔对应舵机`cd6d`负X侧Ø1.6四孔；PCD12 mm、四轴/全组距、约0.05 mm有限间隔及厂商穿板图支持螺钉夹持。 | supported_hypothesis；真实螺纹/螺钉/保持/活动区未知 |
| `926a5beb2c028185` | 髋X向另一组Ø2.4四孔对应舵机`9ffe`；同样是独立正交轴的螺钉夹持解释。扩口不能统一补成承压面。 | supported_hypothesis；实际装入侧/承座/保持/限位未知 |
| `27d56794bd7c8a86` | 髋Y向Ø16轴颈与轴承`47a9`完整Ø16内壁同轴、有限重叠约1.75 mm；Ø16.4是口部倒角。 | 已调查缺证：名义定位/单向肩端承接可解释，公差/环归属/抗拔未证 |
| `c2e8a8093a4b8563` | 髋X向Ø16轴颈与轴承`bb34`内壁相对；修正原审查只引用Ø22外壁和端面的失焦。 | 已调查缺证：第二条正交支承候选，不能合成单一固定关系 |
| `d22c650fc9abdaca` | 髋Ø16轴颈与支承件Ø19孔有约2.05 mm有限间隔、径向差1.5 mm；直接定位不互补。真实中间轴承构成三件支承语境。 | 已调查缺证；Ø19孔不能径向压配Ø22外圈，端面挡肩/完整保持待证 |
| `f81f10dc6482cb07` | yaw2roll与髋只有包围盒线索；全部有限圆柱检查未找到轴距≤0.15 mm且间隔≤5 mm的直接配对。 | 已调查缺证：保留明确排除范围与间接机构替代，不能虚构螺钉/卡扣 |

每条的双方位置、具体结构、四类角色、必要第三件、支持/反证、替代解释、缺项
和下一步见[完整实查原文](../../../device-materials/interface-review/references/hip-connection-studies.md)
及[结构化六条与全覆盖](connection-analysis-coverage.json)。另一髋实例的六条
分别核对共同参考位姿；只复用同SHA原网格截面，没有逐孔独立配准。

实际从全部70实例、211已有审查筛出35对具有多个有限小孔对应的具体调查入口。
保留原三条假设，新增40对实查（两髋12条和其他孔组）；新增12条四孔螺钉假设，
涵盖此前无人工安装定义的踝部、喙部、偏航横滚件、颈俯仰件等。
双通过孔、多个轴段/侧别或缺承接依据的组保留具体insufficient结论。

正式发布包的精确计数为：

- 211条审查结论：43条已调查，其中15条有依据假设、28条缺证；168条仍未调查。
- 15条假设＝原3条＋新12条；45条实际调查记录＝原5条＋新40条。
- 70实例全部有覆盖行：[CSV](connection-analysis-coverage.csv) / [JSON](connection-analysis-coverage.json)。24实例参与假设，34实例参与缺证实查，66实例仍有尚未调查关系；这些集合相互重叠，不能相加当完成率。
- 另12对有限提议尚未进入旧连接审查：公开双方源位置、有限测量和具体下一步。包括加强板Ø19与髋轴颈Ø16/连杆Ø6的间隔，以及HAT/主控Ø2.7通孔的7.32 mm轴向间隔；这些需要中间轴承/隔柱或实际承接证据。仅平面/开口轴投影的提议保留明确测量限制。
- 原449个几何区域仍仅27个reviewed、420个auto_screened、2个unreviewed；所有Part均未宣称穷尽结构/功能调查。

独立原STL复核实际执行了37个髋/舵机/轴承核心截面和192个额外部件对截面；
新输入247个有限内壁注解全部在产物中定位。核心轴颈为外向法线，内孔为内向
法线；原三角、闭合性和半径残差保留。大圆离散半径残差约7.6 μm是网格离散
误差，不能当制造公差。复核不修改原网格：

```powershell
python -B device-materials/interface-review/independent_sections.py --annotations device-materials/interface-review/microduck-connection-analysis.json
python -B device-materials/interface-review/review_connection_sources.py
```

冻结输入[JSON](../../../device-materials/interface-review/microduck-connection-analysis.json)
SHA-256为`bba52e040b28eef00ac6ed5ca9a2764430ecf5728402c78328e8a8a59455e062`；
工具`3.0.0-draft.12`，剖面`psop.hardware.source-model/1.11`，prepare目录为
`build/connection-analysis/work-final-1`，工具摘要为
`f61d0edfe48d7b2cef32cbc445a6f51cf9e8b75003a89c8a20138624c9c5af6f`。
原assembly JSON及厂家include的checkout CRLF被确认仅为换行差异后恢复精确原件
字节，SHA分别为`1a6f193caa17c6384b2f0d31c1bf2b0785d0d5fc6721ad5e4f60bd57d8eb0093`
和`ea5859ff3975edf15a823a8f4c9f8ba6adcdc9981a65f8b219641a9950f67740`。
没有改声明摘要以迎合换行。

独立接受分母为冻结原三条关系期望和新增7个具体结果期望（六对左髋＋左踝），
不是生产器候选数。语义验收要求具体双方、局部结构、已执行方法、四类角色、
机制/反证/缺项；删除假设或退化成通用next_actions，即使重算覆盖仍失败。
本轮聚焦37项Build单元回归和新完整Schema检查已通过；实际发布包上的遗漏突变、
API、页面和3D验收由发布步骤另行记录。

剩余未完成的是168条关系的功能调查、12对未进入旧审查的原提议、未审查非圆结构
和遮挡区域，以及所有假设的真实紧固件/环归属、公差、材料、保持、载荷、限位和
连续路径。固定资料没有对应机械修订的分体CAD、逐孔装配和机械BOM；已有原件
支持有界假设，不能据此声称实机已接合或工程通过。

## 正式发布与实际工作台验收

已沿 `prepare → finalize → validate → register` 发布并选中新快照，未临时改包。
冻结输入 SHA、工具摘要见上文；发布记录位于
`build/stability-review/{finalize,validate,registration}.json`。
同一冻结工作目录再次finalize到独立、未注册的输出也通过校验，80个文件
逐字节相同，包摘要一致：[确定性实测](../../../build/stability-review/reproducibility.json)。

| 字段 | 正式加载值 |
| --- | --- |
| 知识版本 | `2.0.0-connection-analysis.1` |
| 剖面 | `psop.hardware.source-model/1.11` |
| Snapshot ID | `dkp-84f6829a25a82fefaf1d` |
| 包摘要 | `84f6829a25a82fefaf1da6cc00b399088a5db6e41923b4074c39a08d1988b6db` |
| 文件 | `build/microduck/source-1.11/microduck-connection-analysis.dkp` |
| 服务 | `http://127.0.0.1:8780`，实际提供最终生产构建 |

[实际 API、历史保持及漏项验收](../../../build/stability-review/release-acceptance.json)
重新读取注册表、manifest、view、knowledge 和实际文件。70个源实例及位姿、
几何/拓扑分析集合、原安装定义、原三条假设均与原不可变包相同；68项既有
原来源的字节和SHA相同。历史1.9与1.10两个快照及摘要保留。
独立验收故意删除左踝应有假设后，即使重算覆盖，仍检出
`EXPECT-97e1e2f7a5a627de`；把调查降成通用next_actions也失败。

API、CLI知识查询和页面共同消费上述版本/摘要。接口页依次区分安装定义及
参考配合、支持的假设、已调查缺证、尚未调查候选和原始依据。六对髋部审查
已分别打开并实际查看，显示双方实例标识、源局部位置与参考装配位置、具体
结构、四类角色及来源，并保留双向定位；没有新增已确认Interface。
[六对页面和3D截图及文本](../../../build/stability-review/relations/after/checks.json)
保存于同目录。左踝没有人工安装定义，其四孔假设另做两端定位回归。

## 三个孔位的实际视觉结论

右外壳Y42/Z52.5、X−25.5/Y−9.5台阶孔，以及髋X17.5/Z−6，均保存同相机
五层对照：原逐面网格、展示法向、孔口轮廓、全部覆盖层、正常显示；另检查
角度和缩放。最终35张捕获来自上述正式快照，实际查看了层级图及对照图。
[源、相机、拓扑、像素与查看记录](../../../build/stability-review/geometry/acceptance.json)
区分了以下结论：

- 孔口约72段离散边和部分外唇三角尖片来自原STL。三处没有发现重复三角、断边或非流形；平滑法向不能消除实际轮廓。
- 保留原35°/10nm展示法向策略。源网格与展示法向层前后像素一致；没有移动顶点、改变孔径、删除台阶或替换原拓扑。
- 共面的轮廓线会发生深度竞争；新增2μm展示深度偏置，保留depthTest，关闭线层depthWrite。三处最终像素差分别104/129/171，集中在边界；45个WebGL深度正反对照检查了遮挡泄漏。

固定视角前后对照：
[右壳Y向孔](../../../build/stability-review/geometry/after-release/right-y42-z52-comparison.png)、
[右壳台阶孔](../../../build/stability-review/geometry/after-release/right-x25-y9-comparison.png)、
[髋部孔](../../../build/stability-review/geometry/after-release/hip-x17-z6-comparison.png)。
这是覆盖层的有限修复，外唇真实不规则仍明显可见，不能宣称毛刺完全消除。

## 透明查看的帧级结论

旧实现9个目标采样，120ms一次遮挡检查，每次直接切整件材质。原记录中
旋转阶段真实透明集合改变41次，交替操作10次；51次变化全部对应最新射线
结果。示例遮挡命中9→0→6→0；全部流程517次检测，单次37.7–178.6ms。
排序变化是独立渲染因素，不能把它与集合变化混算。

最终保留alpha混合和原透明度、透明源depthWrite=false；相机手势/阻尼期间
保持集合及源部件相对排序，停稳180ms后重新按实际相机深度排序。进入需
至少2个命中持续160ms，退出需零命中持续420ms；检测周期仍为120ms，稳定
后不重复射线。诊断只在显式启用时记录逐帧相机、材料、绘制顺序及射线。

[正式8780完整记录](../../../build/stability-review/transparency/final/summary.json)：
旋转13.6597s、59.52FPS，缩放15.7329s、60.00FPS，二者集合变化均为0，
共有透明源的相对绘制顺序也没有翻转。交替操作有2次停稳后的必要更新；
另测不同孔位、恢复和清除选择，70件材质恢复正确，pageerror为0。
[两个关系及单孔整圈/四方向记录](../../../build/stability-review/transparency/source-order-stable-alpha/summary.json)
各旋转15–16s，12个停稳方向的实际绘制顺序都与独立相机空间深度相符。
原始逐帧和逐件材料详见相邻`frames.json`，
[审查及失败方案历史](../../../build/stability-review/transparency/review.json)保留原因。

多层alphaToCoverage试验曾在真实关系页面造成发白和条纹，已撤回，不能用
其反转绘制顺序的零像素差作为最终通过证据。最终同视角画面已重新查看。
当前策略在连续旋转中可能让新进入视线、尚未淡化的实体暂时挡住目标；停稳
后更新可见性。没有声称移动期间所有方向都始终无遮挡。

最终生产构建的完整浏览器回归为50通过、2跳过（没有登记对应的历史1.8/旧平面
快照），没有失败用例；涵盖六条审查逐项来源/角色/双向定位、无人工定义的左踝、
API知识一致、旧版浏览、局部孔选择、参考对端、示意件、分享及导出。
[机器结果与日志索引](../../../build/stability-review/browser-final-summary.json)
保留Playwright实际`passed`状态以及PowerShell合流Node颜色警告导致的外层
NativeCommandError说明。Build聚焦37项、API7项、模拟CLI5项及展示法向/稳定
策略的回归另已通过。测试计数没有替代上述实际图像和逐帧验收。
