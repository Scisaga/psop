---
name: psop-build
description: 为设备工作区构建数据型 DKP，摄入原件及装配依据，识别有限孔腔并逐对还原定位、保持和中间件，发布可追溯连接审查与明确标记的补全示意，由统一工作台读取。
---

# PSOP Build v2

2026-11-06（Asia/Shanghai）。工具 `3.0.0-draft.9`，默认知识剖面 `psop.hardware.source-model/1.8`，封套 `psop.dkp/2.0-draft.1`，目标为[硬件本体 draft.4](../../docs/architecture/hardware-ontology.md)。

Build 生产不可变知识、来源、证据、几何、索引与 Schema，不生成设备专属 App，也不直接写工作台会话。一个设备工作区可以登记多个 DKP，工作区与包目录不同。

## 先确定知识层与产出范围

先按[完整连接还原](../../docs/build/connection-reconstruction.md)逐对说明部件怎样安装、靠谁定位和保持，再读取[原子特征、参数化接口与装配方案](../../docs/architecture/assembly-interfaces.md)；实现字段和发布校验见 [v2 合同](references/v2-contract.md)。

推导与呈现遵守[规则、绑定、操作和显示的一致性](../../docs/architecture/assembly-interfaces.md#9-规则绑定操作和显示的一致性)。按机制角色定义能力，分别记录可选成员与规则、本次绑定、操作假设及实际成立的作用；几何分组、部件对或一个参考解不能替代这几层。穿层螺栓等多参与者作用链不强制简化为两个对象的一一孔映射。

- 有限面、孔壁与轴壁是 Feature；阶梯孔多段壁不增加逻辑孔数，通道两端也不重复计孔。孔道合并需要拓扑连续见证。
- 安装孔位按作用入口寻址，引用孔道、具体端口、进入方向和功能依据。四条双入口孔道可以提供八个安装孔位，两侧仍共享底层有限通道，不能复制为独立占用资源。
- 安装位置也可以是同一 Part 上的实体柱。依据源法向、闭合端面及有限壁辨认内孔与外柱；带拔模斜度的柱不能因旧圆柱筛选条件被漏掉，也不能将圆轮廓一律解释为孔。柱位置引用其 Feature，不伪造 hole_ref 或 portal_ref。
- 孔阵列是带成员和测量框架的几何模式。齐孔、孔轴有限配合和面投影交叠是固定配置中的参考观测，不直接登记为 Interface。
- Interface 需要机制、角色、有限特征、互补条件和功能依据。参数化方式引用可寻址孔位，以选择和组合规则生成 S；同侧、邻接、至少包含一对与完整选孔集合分别表达，不为每个双孔子集复制接口。
- 标准装配中的具体孔位对应、参考配置和连接件角色属于 Build 交付。结合功能说明复核共同位姿、孔距和孔轴；孔壁有间隔不等于无法由连接件关联，不用全局近接阈值代替装配规则。
- 孔口方向、柱轴、法向、连接件局部轴、装入方向和显示偏移按各自角色及 Frame 解释。孔位对应不授予装入侧／承座／有效长度依据；不得从近侧孔口、角色名称或列表顺序直接生成螺钉头尾，也不以统一取反修复所有连接。
- 补建件即使标为示意，也应符合它显式声明的承座、目标和有限穿入关系。生成前按[方向与有限路径](../../docs/build/connection-reconstruction.md#方向与有限路径的核对)核对；不足时保留未绑定要求或独立假设，不能让图形替代方向、保持或实物证据。重放与独立几何／角色检查分别验收，不能让同一错误生成器自证正确。
- 来源功能或功能结构规则未核定时，保留 Feature／模式／观测并记录缺项，不用 candidate 标签或机制字符串补造资格。运动区域未核定时只发布测量 Frame，不自动把整个源网格认作单一机械刚性区域。
- 来源确认了安装位置、但未确认机制或最少选用数量时，发布该范围内的安装知识并将剩余字段明确标为 unknown。不能用统一空状态抹掉位置，也不能借用另一个孔组的双孔规则。
- 几何条件、机械条件、工程批准、Task 和完成分别表达；开放清单未列的组合保持 unknown。选孔不等于已经接合，也不等于连接已完成。

## 当前 Microduck 构建

输入为原始材料 ZIP、固定版本和 SHA 的官方 MJCF，以及显式传入的装配知识说明。保留原始 58 份来源、38 个 STL、70 个 model 域 visual 对象及 XML／CSV／STL 证据；说明另作来源登记，固定字节摘要及适用修订。

1.7 保留安装孔位、参考映射、有限几何与逐对审查，新增 `pin_hole_fits`。大腿柱孔配合的具体成员、组距、有限插入和间隙读取发布记录及[样板分析](../../docs/build/connection-reconstruction.md#右大腿样板)，不把示例标签或尺寸硬编码为通用规则。该配合仅支持安装定位用途推断，保持和承载仍 unknown；两成员参考分组不成为最少数量或完整选用规则。

外侧 Ø5.5 mm 圆洞仅保留有限几何及共轴观测，用途 unknown，不能称为装饰或默认主安装接口。用户指出接口漏项不等于确认小柱功能；大洞居中、面投影或厂商示例都不能替代本设备的固定依据。

Microduck 的“两个方向可安装、同侧相邻至少双孔”仅适用于原说明限定的壳体安装族。上方四孔与附近舵机阵列在来源 qpos0 有约 45° 相位差，不伪造逐孔参考映射，也不据此断言其他构型无法安装。标准参考关系不等于运行中已接合；连接保持、路径、运动区域与工程结果仍独立报告。

说明引用的厂商文档随输入逐字节锁定并作为独立来源。厂商一般装配结构不等于 Microduck 用法确认；原话、项目推断和标准件资料分别标记。缺 STL 时允许有依据的参数化补建。补全件保持 synthetic／illustrative_unconfirmed／not_confirmed BOM；`usage=reference_connector` 仅表示有来源参考路径中的未绑定连接件，`unverified_alternative` 表示未核实替代示例。轴心螺钉／压盖属于后一类，默认不显示，不进入当前保持角色，也不产生 Simulate 已固定标签。

拟合误差不是制造公差；壁长不是允许旋入深度；整块源面面积与投影交叠面积都不直接成为承压／接触面积。普通壳面不因贴合获得支承功能，源 body／hinge 不成为机械连接白名单。

1.8 对参考连接件新增 insertion：将“从支架外侧穿向壳体”明确标为 illustrative_hypothesis，按源孔口法向、目标方向、有限壁段和示意杆长独立检查一致性；不支持的条件不生成错误实体。修复 1.7 近侧入口造成的方向缺陷，旧包保留原样。检查不证明实物装入侧、螺纹、材料接触、连续路径或保持。

## 执行与验证

Python 3.11+，几何构建仅用标准库。首次联网取得固定 XML；已有原件可传 `--xml`，摘要仍必须匹配。命令在仓库根目录运行：

```powershell
python -B skills/psop-build/scripts/psop_build.py doctor
python -B skills/psop-build/scripts/psop_build.py prepare --input device-materials/microduck-official-materials.zip --assembly-knowledge device-materials/microduck-assembly-knowledge.json --work build/microduck/source-1.8/work --device-id microduck --device-name Microduck
python -B skills/psop-build/scripts/psop_build.py finalize --work build/microduck/source-1.8/work --output build/microduck/source-1.8/microduck.dkp --version 2.0.0-connector-direction.1
python -B skills/psop-build/scripts/psop_build.py validate --dkp build/microduck/source-1.8/microduck.dkp
node apps/workbench/scripts/workspaces.mjs register --dkp build/microduck/source-1.8/microduck.dkp --workspace microduck
```

prepare／finalize 要求新目录；输入、定义和工具被固定，发布前核验 Schema、引用、来源字节与确定性重放，再原子发布。校验器拒绝补写几何到功能接口、伪造保持、重封摘要后的测量篡改，以及未声明文件。共享选择／匹配代码与 Schema 也纳入工具血缘。

运行 `python -B -m unittest discover -s skills/psop-build/tests -v`。交付报告包路径、版本、摘要、能力、覆盖、缺项和验证结果；能打开网页不构成机械验收。需要新的功能依据时经新输入和发布版本处理，不能直接编辑冻结包。

## 旧分类与消费

已发布 v2 的 1.0～1.6 保持原字节及重放合同，显式读取不恢复旧 core、CMP／PORT／IFC 或 DKP v1。1.1／1.2 曾将自动几何组称作接口；这个统计口径已撤回，工作台仅按历史几何浏览。1.3 缺少安装说明时的空功能数组也不覆盖新输入提供的知识。1.6 曾将共轴大洞与轴心补全件关联；读取时保留历史记录并说明其为未核实解释，不能沿用为当前固定依据。

来源参考观测可用于几何研究；已知安装映射可以提供其声明范围内的孔位配对监督，须保留输入依据和已知解范围。未核定观测不能作为已紧固标签，未见组合不能自动作为失败标签。Simulate 消费 Build 知识，维护具体试装、局部接合与路径状态；无需重新识别标准参考关系。
