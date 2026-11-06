# PSOP

**Physical Standard Operation Procedure**

PSOP 围绕设备构建可追踪知识、可验证场景和专属模型能力。v2 采用一套统一工作台管理多个设备工作区；Build、Simulate、Compile 在选定设备工作区内协作。

> 架构边界更新：2026-11-05（Asia/Shanghai）。旧 core/1.1.0、CMP／PORT／IFC、DKP v1 和包内独立 App 合同退出 v2。历史实现通过 Git 历史查阅，新主线不提供兼容读取或旧 App 换肤入口。

> 连接还原更新：2026-11-06（Asia/Shanghai）。Build 工具 3.0.0-draft.9 默认发布 source-model/1.8，固定原件、装配说明与厂商支持资料，交付有限几何、柱孔配合、逐对连接审查及分类补全示意。1.0～1.7 原包及合同保持冻结；不恢复旧 core／DKP v1 兼容。

## 工作台、工作区与技能

- **统一工作台**是通用软件，提供设备切换、版本上下文、知识与来源浏览，以及三个技能的作业和交互入口。
- **设备工作区**是围绕一个设备的长期业务容器。例如 Microduck 工作区可以登记多个知识快照、模拟会话、渲染批次、数据集、模型和评测版本。
- **技能与执行器**负责实际工作。Build 生产设备知识包；Simulate 提供装配、场景、渲染和测试能力；Compile 组织语料、训练和模型产物。界面与 Agent 都通过相应执行服务操作。
- **DKP**是不可变、版本化的数据交付物。一个设备工作区可以引用多个 DKP，工作区不等于某个包目录。

~~~mermaid
flowchart LR
    A[设备原始材料] --> B[Build]
    B --> K[数据型 DKP 快照]
    K --> W[设备工作区 / 统一工作台]
    K --> S[Simulate 场景与观测]
    K --> C[Compile 语料与训练]
    S -->|视图与监督候选| C
    C -->|固定模型版本| S
    S -->|评测与纠错候选| C
~~~

## 当前实现范围

| 能力 | v2 状态与限制 |
| --- | --- |
| 统一工作台 | 入口位于 [apps/workbench](apps/workbench/README.md)，联动安装孔位、规则、参考对应、槽开口、对端与来源；原始几何仍可独立查询 |
| Build | [psop-build](skills/psop-build/SKILL.md) 使用 prepare → finalize → validate；1.7 发布柱孔有限配合、用途分离的连接审查和补全示意，保留有限孔腔及已有参考映射 |
| 机械语义 | 唯一目标为 [psop.hardware/2.0-draft.4](docs/architecture/hardware-ontology.md)；新包固定定义及摘要。子集结构校验不等于完整本体求值、路径或工程验证 |
| Simulate | 提供显式定义／已验证DKP的有界查询；共享选孔与刚性孔组匹配为 partial，物理动作、路径、渲染和模型执行仍 unavailable |
| Compile | 工作台提供语料、训练、模型和评测的组织位置；真实训练、推理及模型测试闭环尚未实现 |

Microduck 的原件、真实 STL、孔道、安装孔位、槽开口和参考关系可以浏览、查询和重放。显式[装配知识说明](device-materials/microduck-assembly-knowledge.json)保存用户确认与项目解释：舵机壳体四条孔道对应两侧八个安装孔位，按同侧邻接规则选用，并记录与腿部连杆的标准双孔对应。参考配对通过模型几何复核；螺纹、旋入深度、实际紧固、完整活动框架和工程认证不由此补造。same_source_body／source_joint 本身仍不证明物理连接。连杆上方四孔的位置与未知选用规则分别展示；大腿每两根小柱与同台舵机 B2／B3 壳体孔的有限配合支持安装定位推断，轴向保持和承载仍未知。外侧 Ø5.5 mm 大洞用途未知，不默认当主接口，也不称装饰；源对齐或面投影不补成已保持关系。

连接还原过程见[从部件邻接到完整连接还原](docs/build/connection-reconstruction.md)。全部部件对的广相范围与逐处定位／保持审查分别记录；1.7 按实际柱孔配合组织双方特征和缺项。厂商通用装配图独立锁定为输入；轴心螺钉／压盖仅为未核实替代示例，默认不显示，不进入当前保持链。所有补全示意与来源实例、确定 BOM 分开，不产生 Simulate 已固定标签。

共同规则见[原子特征、参数化接口与装配方案](docs/architecture/assembly-interfaces.md)：安装孔位分别寻址、关联共享孔道，接口以参数 S 选择成员。Build 交付标准参考关系，Simulate 消费知识并维护新的试装及接合状态。几何、用户声明、参考复核与物理／工程结果分别表达，不为每个子集复制接口，不把未见组合直接判错。

## 启动统一工作台

Windows 双击 [启动工作台.cmd](apps/workbench/启动工作台.cmd)。默认地址为 http://127.0.0.1:8780/。依赖、联网准备与其他方式见 [工作台说明](apps/workbench/README.md)。

~~~powershell
cd apps/workbench
npm ci
npm run prepare:workspace
npm run build
npm start
~~~

工作台读取已校验的 v2 DKP，不从原始 ZIP 独立抽取另一份设备知识，不加载旧 DKP 内的 HTML。任务、当前选择和会话记录保存在包外工作区。

已有快照不会原地升级。在仓库根目录运行 `python -B apps/workbench/scripts/prepare_workspace.py --fresh` 摄入装配说明，发布并登记新 1.8 快照。历史自动接口只按历史几何查看，不能计作新资格；1.6 的大洞及轴心示意件关联保留为历史未核实解释。数量、覆盖与未解析类型以快照为准。

## 独立构建数据包

在仓库根目录使用新的工作目录与发布目录，命令不覆盖已有发布物：

~~~powershell
python skills/psop-build/scripts/psop_build.py prepare --input device-materials/microduck-official-materials.zip --assembly-knowledge device-materials/microduck-assembly-knowledge.json --work build/microduck-v2-source-1.8/work --device-id microduck --device-name Microduck
python skills/psop-build/scripts/psop_build.py finalize --work build/microduck-v2-source-1.8/work --output build/microduck-v2-source-1.8/microduck.dkp --version 2.0.0-connector-direction.1
python skills/psop-build/scripts/psop_build.py validate --dkp build/microduck-v2-source-1.8/microduck.dkp
node apps/workbench/scripts/workspaces.mjs register --dkp build/microduck-v2-source-1.8/microduck.dkp --workspace microduck
~~~

构建命令及机器字段以 [Build 技能](skills/psop-build/SKILL.md) 和随代码提供的 Schema 为准。新 DKP 只含知识、来源、证据、资产、索引与验证元数据，不打包工作台前端。

## 设计入口

1. [PSOP 硬件本体定义](docs/architecture/hardware-ontology.md)：机械语义。
   [装配接口与方案](docs/architecture/assembly-interfaces.md)落实原子孔、参数化选择和多条局部路径。
2. [统一工作台与三技能系统设计](docs/architecture/system-design.md)：工作区与闭环。
3. [DKP v2 数据合同](docs/architecture/device-knowledge-package.md)：包、版本、引用和能力声明。
   [设备工作区与读取接口](docs/architecture/device-workspace.md)说明多设备、快照登记与上下文。
4. [Build](docs/build/device-knowledge-build.md)、[Simulate](docs/simulate/simulate-design.md)、[Compile](docs/compile/compile-design.md)。
5. [本体实施与退役边界](docs/architecture/hardware-ontology-migration.md)、[验证状态](docs/architecture/hardware-ontology-validation.md)。
6. [文档目录](docs/README.md)。

来源、知识和仿真结果保留各自证明范围。模型只接收规定的观察输入，隐藏状态只供标签与评测；合成结果不能替代独立真实现场测试。
