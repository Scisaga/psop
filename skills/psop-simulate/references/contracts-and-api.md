# Simulate v2 查询与运行边界

2026-11-06（Asia/Shanghai）。共享选择/刚性匹配引擎提供本地有界查询，权威场景写入API尚未实现。旧core、CMP/PORT/IFC和旧/api/v1不恢复。

## 实际CLI

```powershell
python -B skills/psop-simulate/scripts/psop_simulate.py doctor
python -B skills/psop-simulate/scripts/psop_simulate.py query --help
```

查询支持显式assembly definition及已验证DKP中的Part；完整参数以help为准。输出JSON保留输入血缘、选择/映射/构型/角色与各阶段能力。需要保存产物时指定新输出位置，不改DKP。

1.4～1.8 的真实查询返回已发布的安装孔位、来源声明的组合规则与标准参考对应；固定 package digest 和 reference Configuration，报告静态知识范围，不宣称已经执行安装或搜索所有替代方案。真实数据缺功能定义时返回 unknown 与可核对几何，不造螺钉或已保持状态。受控定义须声明来源/合成范围、角色和组合约束；合成结果不登记为真实设备事实。

1.5 的实体柱位置保留 Feature 身份且无虚构孔道；未知选用数量、侧别和机制字段保持 unknown。读取已确认位置不等于具备新姿态搜索或物理动作执行能力；缺少规则也不等于该位置不可安装。

1.6 还保留 pair_screenings、connection_reviews 及相关 circular_openings、passage_hypotheses、supplemental_components 的实际范围。广相外不代表不能安装；只有几何证据、项目推断或厂商一般图时，保持机制与四维结果仍待核定。示意件不作为已有连接件自动绑定，不为填充方案虚构实物 Part。

1.6 的 installation_definitions 返回有来源的部分安装定义，保留其状态与未知规则；functional_interfaces 保持空，不把这些记录称为已满足完整资格的 Interface。modes 仅携带静态来源规则，不因此执行选孔、替代方案枚举或物理动作。1.4／1.5 的历史查询输出保持原合同。

1.7 另返回 pin_hole_fits：来源配置中的 reference_pair、一一柱孔映射、有限插入及径向间隙，status=source_pose_geometric_fit、inference_scope=installation_location_only。定位仅 geometric_support，保持、承载及四维结果 unknown；两成员不成为选用规则。外侧圆洞用途未知，不参与柱孔定位依据。补全件 usage=reference_connector 仍为未绑定参考连接件；unverified_alternative 不进入当前保持 role_paths，厂商轴心螺钉／压盖仅属后者。查询不由这些记录产生已固定标签，1.6 历史查询输出及原包保持冻结。

共同输入与语义见[装配接口与方案](../../../docs/architecture/assembly-interfaces.md)，共享机器定义位于packages/assembly。几何匹配通过不代表完整mechanical/engineering/Task/completion通过，路径/变形/动作支持独立报告。

## 后续权威动作

统一工作台当前读取API不是模拟写入API。动作服务将固定工作区、知识、配置/会话及状态修订，检查类型化动作后返回声明范围内的accepted/rejected/unknown及事件；幂等、冲突、取消和恢复有独立语义。

模拟状态、方案、查询结果、路径与测试记录位于包外工作区。ghost只是预览，不能直接改矩阵冒充权威状态提交。模型建议与用户操作经过同一检查链，隐藏答案只供监督和评测。

1.8 参考连接件的 insertion 保留外侧入口、头下基准、杆向、目标与有限壁段；finite_geometry=pass 只说明显式假设的图形一致，连续路径未评估、保持未知，不成为实物方向或装配完成标签。
