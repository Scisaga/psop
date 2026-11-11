export interface OntologyField {
  key: string;
  label: string;
  type: string;
  description: string;
}

export interface OntologyType {
  key: string;
  label: string;
  group: '装配主干' | '空间与运动' | '条件与任务' | '来源与依据';
  description: string;
  section: string;
  relation: string;
  note: string;
  fields: OntologyField[];
}

const field = (key: string, label: string, type: string, description: string): OntologyField => ({key, label, type, description});

export const ONTOLOGY_TYPES: OntologyType[] = [
  {
    key: 'Specification', label: '可复用规格', group: '装配主干', section: '4.2 属性、采购与制造',
    description: '描述型号或设计修订的可复用资料，包含属性、几何及接口模板；规格本身不参与装配。',
    relation: 'Part → specification_ref → Specification',
    note: '来源中的系列名与外形文件名不自动确认准确子型号；采购、制造和实物属性按证据范围保存。',
    fields: [field('revision', '规格修订', 'Versioned definition', '固定适用型号、修订与资料版本。'), field('properties', '属性主张', 'Scoped claim[]', '区分 design、nominal、measured、calculated 和 assumed。'), field('geometry_refs', '几何依据', 'Source reference[]', '保存源文件、单位、摘要和用途。'), field('manufacturing', '制造描述', 'Scoped requirement', '工艺、材料、关键尺寸与验收按用途补齐，不从 STL 推断。')],
  },
  {
    key: 'Part', label: '部件', group: '装配主干', section: '3. 对象、身份与关系',
    description: '直接参与装配的具体部件对象。同规格的两个部件拥有独立身份；移动、拆下或成为备件不改变身份。',
    relation: 'Part → Interface → InterfaceConnection',
    note: '当前模型对象由来源 XML 映射，域为 model；不将模型实例视作实物身份，机械能力按包内声明解释。',
    fields: [field('id', '稳定身份', 'Identifier', '名称、文件名和采购 SKU 不替代对象身份。'), field('domain', '对象域', 'model | physical | synthetic', '模型、实物与合成对象分别表达。'), field('specification_ref', '可复用规格', 'Reference', '共享规格不合并不同部件的身份。'), field('interfaces', '装配接口', 'Interface[]', '描述本部件可以发生的机械相互作用。'), field('rigid_segments', '局部刚性区域', 'RigidSegment[]', '内部空间归属，不增加装配身份。')],
  },
  {
    key: 'Interface', label: '接口', group: '装配主干', section: '7. 接口、连接方式与候选',
    description: '某一部件对外发生装配或机械相互作用的能力描述，关联特征、框架、机制、条件与依据。',
    relation: 'Part owns Interface · Interface references Feature',
    note: '原始材料没有完整、已确认的机械接口规格；当前快照不从外形虚构接口许可。',
    fields: [field('part_ref', '所属部件', 'Part reference', '接口恰有所属部件。'), field('frame_ref', '接口框架', 'Frame reference', '空间定义绑定可解析的局部框架。'), field('methods', '连接方式', 'Method[]', '每种方式分别保存角色、特征选择、机械条件与工程要求。'), field('evidence_refs', '依据', 'Evidence[]', '保留版本、来源与适用范围。')],
  },
  {
    key: 'InterfaceConnection', label: '具体接口连接', group: '装配主干', section: '8. 具体接口连接与局部状态',
    description: '某个配置内选定端点之间的具体关联，可以包含多条贯穿路径、接触或啮合关系。',
    relation: 'Configuration → InterfaceConnection → bindings / couplings / stacks',
    note: '来源模型树不是已确认机械连接图。未标注具体端点与机制时，不补造真实连接。',
    fields: [field('bindings', '端点绑定', 'Binding[]', '具体 Part、Interface、方式、角色和特征。'), field('couplings', '局部作用', 'Coupling[]', '确定谁与谁以什么机制发生作用。'), field('stacks', '有序叠层', 'Stack[]', '每条路径独立记录贯穿、承压与承接。'), field('local_states', '局部状态', 'Scoped condition[]', '局部保持、完成与整体汇总分别判断。')],
  },
  {
    key: 'Configuration', label: '组合配置', group: '装配主干', section: '9. 配置、分支与状态来源',
    description: '冻结版本的部件、关系、构型和依据快照，可同时容纳分离部件、部分装配及多个组合。',
    relation: 'Configuration → Parts / Connections / Coordinates',
    note: '当前 3D 展示为 robot_walk.xml 的模型参考零位；爆炸偏移属于视图，不改来源构型。',
    fields: [field('parts', '参与部件', 'Part reference[]', '固定实际使用的部件描述修订。'), field('placements', '独立放置', 'Pose[]', '与运动坐标和求解结果区分权威来源。'), field('composition', '组成与暴露', 'Composition', '物理成员关系及内部接口映射。'), field('continuity_map', '局部连续性', 'Continuity[]', '替换连接后逐项复核局部作用和证据依赖。')],
  },
  {
    key: 'ConnectionMethod', label: '连接方式', group: '装配主干', section: '7.1 接口描述可发生的作用及其条件',
    description: 'Interface 内可引用、可参数化的能力结构，定义本方角色、特征选择、对方要求及转换条件。',
    relation: 'Interface → Method → Mechanism / Conditions / Transitions',
    note: '连接方式属于接口内部结构，不是额外的装配使用身份；相同方式名称也不构成匹配证明。',
    fields: [field('mechanism_ref', '作用机制', 'Mechanism reference', '引用共同作用关系与角色语义。'), field('feature_selection', '特征选择', 'Finite selection expression', '从有限特征集选择并映射，保留原始身份。'), field('mechanical_conditions', '机械条件', 'Condition[]', '接触、进入、保持、路径、占用和运动分别判断。'), field('engineering_requirements', '工程要求', 'Requirement[]', '规格、载荷和工艺与机械可发生性分别保存。'), field('transitions', '状态转换', 'Transition[]', '机械前置、局部变化、不变量与完成条件。')],
  },
  {
    key: 'Mechanism', label: '机制字典', group: '装配主干', section: '7.2 机制字典与双方互补',
    description: '定义角色名称、共同作用关系和参数含义，由接口方式提供本方的特征、参数和适用依据。',
    relation: 'Complementary roles → Coupling constraints',
    note: '通孔、外螺纹和内螺纹承担不同角色。双方条件共同检查，模板名称相同不等于已接合。',
    fields: [field('roles', '互补角色', 'Typed role[]', '明确各参与者承担的作用。'), field('parameters', '参数', 'Typed quantity[]', '几何、状态和使用参数均有单位与语义。'), field('constraint_modes', '约束模式', 'Conditional constraint[]', '按局部状态激活声明范围内的约束。')],
  },
  {
    key: 'Frame', label: '坐标框架', group: '空间与运动', section: '5.2 坐标系与变换约定',
    description: '可引用的空间参照，明确语义所有者、运动依附与位姿数值表达，三者分别承担职责。',
    relation: 'Frame — attached_to → RigidSegment',
    note: 'MJCF 的 wxyz 四元数在数据准备时转换为 xyzw；变换仍保持来源模型的右手坐标与米单位。',
    fields: [field('owner_ref', '语义所属', 'Part | Environment', '说明该框架由谁定义。'), field('attached_to', '运动依附', 'RigidSegment reference', '决定框架随谁运动。'), field('pose.expressed_in', '数值参照', 'Frame reference', '位姿在哪个框架表达，不决定机械依附。'), field('motion_ref', '运动生成关系', 'MotionDefinition reference', '引用既有生成关系，不额外重复驱动。')],
  },
  {
    key: 'RigidSegment', label: '局部刚性区域', group: '空间与运动', section: '5.2 坐标系与变换约定',
    description: '一个 Part 内部用于几何和运动归属的刚性区域，例如舵机外壳与输出区域。',
    relation: 'Part → RigidSegment → Frame / Geometry',
    note: '来源 body 的模型分组不直接等同于实物可拆零件或 draft.4 刚性区域。',
    fields: [field('key', '区域键', 'Local key', '在所属 Part 内稳定可解析。'), field('geometry_refs', '所属几何', 'Geometry reference[]', '视觉、碰撞与测量用途分别说明。'), field('motion_ref', '相对运动', 'MotionDefinition reference', '区域之间的相对变换由唯一生成方式定义。')],
  },
  {
    key: 'Feature', label: '有限几何特征', group: '空间与运动', section: '5.3 特征必须指向有限几何',
    description: '带有限作用区域、方向和版本依据的孔、轴、面、螺纹或槽等结构。',
    relation: 'Feature → Frame + finite Geometry',
    note: 'STL 外形可浏览不代表已识别制造特征。未取得的孔径、螺纹与公差保持未知。',
    fields: [field('frame_ref', '所属框架', 'Frame reference', '确保坐标和方向可以计算。'), field('geometry', '有限作用区域', 'Analytic | CAD | Mesh region', '孔道长度、面边界和作用段须明确。'), field('direction', '有向语义', 'Unit vector', '无向同轴不替代有向插入要求。'), field('fit_error', '识别误差', 'Quantity', '不与制造公差或求解容差混用。')],
  },
  {
    key: 'MotionDefinition', label: '内部运动', group: '空间与运动', section: '6. 部件内部运动',
    description: '定义框架或局部区域之间的参数化相对运动，保存坐标、轴、零位及各类范围。',
    relation: 'Parent Frame → Motion(q) → Child Frame',
    note: '原型可查看来源模型 hinge 定义；模型运动范围不自动成为实物机械硬限位。',
    fields: [field('type', '运动类型', 'fixed | revolute | prismatic | …', '按定义映射坐标到变换。'), field('axis', '运动轴', 'Vector + Frame reference', '必须说明轴在哪个框架表达。'), field('coordinates', '坐标定义', 'Typed coordinate[]', '包含单位、周期性及坐标域。'), field('ranges', '范围与依据', 'Scoped range[]', '来源模型、设计区间与实物限位分别保存。')],
  },
  {
    key: 'Condition', label: '条件与判定', group: '条件与任务', section: '13. 条件表达、判定结果与证据',
    description: '附着于规格、方式、连接、操作或任务的有类型条件，使用稳定键和确定的操作数。',
    relation: 'Condition → applicability + Truth3 + evaluation_status',
    note: '规范的逻辑规则可以浏览；本原型没有运行通用机械条件求值器。',
    fields: [field('applicability', '适用性', 'applicable | not_applicable | unknown', '由明确 guard 决定，不适用不能伪装为通过。'), field('value', '真假', 'true | false | unknown', '普通逻辑只消费三值，不把计算状态变成额外真假值。'), field('evaluation_status', '计算状态', 'evaluated | not_evaluated | unsupported | failed', '描述谓词求值，不混入 guard 的求值状态。'), field('support_refs', '支持与依赖', 'Reference[]', '禁止循环自证，结果随依赖版本变化重新判断。')],
  },
  {
    key: 'Operation', label: '可复用操作', group: '条件与任务', section: '12. 操作、纠正与引导接口',
    description: '可复用的机械变化或检查语义，引用接口转换及局部关系，区分机械前置与工程推荐。',
    relation: 'Operation → Transition + Roles + Local effects',
    note: '本原型只读展示定义；不执行真实硬件操作，也不生成运行时计划。',
    fields: [field('roles', '参与角色', 'Typed binding[]', '部件、接口、局部关系及必要工具。'), field('transition_ref', '转换引用', 'Method transition reference', '不复制另一套连接协议。'), field('preconditions', '机械前置', 'Condition[]', '检查路径、占用、保持和限位。'), field('effects', '预期局部效果', 'Conditional effect[]', '预期效果不等于已经发生的事实。')],
  },
  {
    key: 'Task', label: '任务目标', group: '条件与任务', section: '11. 任务目标、偏差与等价装配',
    description: '定义可接受配置的集合，包括目标条件、持续要求、工程及证据要求与替代规则。',
    relation: 'Task → acceptable Configurations + acceptance expression',
    note: '来源手册是过程参考；没有完整机械前置与验收依据时，不构造已确认 SOP。',
    fields: [field('goal', '目标条件', 'Typed expression', '不要求预先存在某个具体连接。'), field('invariants', '持续要求', 'Scoped condition[]', '区分当前配置、路径和过程历史。'), field('alternatives', '可接受替代', 'Alternative rule[]', '是否允许身份置换、替代孔组和整体变换须明确。'), field('acceptance', '验收表达式', 'all_required | any_alternative', '历史 always 的反例不能被后续纠正覆盖。')],
  },
  {
    key: 'Source', label: '来源资料', group: '来源与依据', section: '4. 开源资料、规格与还原范围',
    description: '用于支持知识的固定资料，保存项目版本、字节摘要、定位方式、许可和支持范围。',
    relation: 'Source → Locator → supported knowledge',
    note: 'alpha、模型快照与 HAT C1 分别保留范围；同名器件不自动建立跨版本对应。',
    fields: [field('origin', '原始出处', 'URL + project revision', '保存明确提交或发布版本。'), field('digest', '内容摘要', 'SHA-256', '用于完整性校验，不替代对象身份。'), field('scope', '适用范围', 'Scoped description', '来源能够证明什么，不证明什么。'), field('authorization', '用途依据', 'Authorization record', '公开可下载不自动授予所有派生用途。')],
  },
  {
    key: 'Claim', label: '属性主张', group: '来源与依据', section: '4.2 属性、采购与制造',
    description: '附着于实际对象的带范围属性值或要求，保存值的性质、条件、来源及不确定性。',
    relation: 'Object property → Claim → Evidence',
    note: '同一条件下的相互冲突主张需要保留。观测、模型计算和资料标称值不通过任意覆盖合并。',
    fields: [field('value', '有类型的值', 'Typed value + unit', '保证单位、维度和有效范围一致。'), field('nature', '值的性质', 'design | nominal | measured | calculated | assumed', '来源与计算地位明确区分。'), field('conditions', '适用条件', 'Scope / Condition[]', '指出对象、配置、工况或时间。'), field('support_refs', '来源支持', 'Evidence reference[]', '每项主张引用实际能支持它的片段或计算结果。')],
  },
  {
    key: 'Continuity', label: '局部连续性', group: '来源与依据', section: '3.3 局部连续性与证据复用',
    description: '配置之间精确到局部作用的映射，说明持续、重新建立或修改，并逐项复核状态和证据依赖。',
    relation: '(Configuration, Connection, Local key) → continuity_map → new reference',
    note: '它是配置迁移中的支持结构。绑定相同不自动证明持续，局部作用持续也不意味着载荷等结论仍然有效。',
    fields: [field('from_ref / to_ref', '精确引用', 'Scoped local reference', '定位两份快照中的局部作用、路径或端点。'), field('relation', '关系性质', 'continuous | same_binding_reestablished | modified', '不可分局部作用的持续映射必须一对一。'), field('process_basis', '过程依据', 'Evidence reference[]', '说明检查范围内作用未被解除。'), field('dependency_review', '依赖复核', 'Per-condition decision[]', '逐条件决定重用、重算、失效或未知。')],
  },
  {
    key: 'Evidence', label: '证据与定位', group: '来源与依据', section: '13.5 证据范围与状态更新',
    description: '为某一明确对象和条件提供支持的来源定位及依赖，保留原始记录和当前适用理由。',
    relation: 'Knowledge claim → Evidence → Source fragment',
    note: '当前证据用于查看模型来源、索引和原文；不作为真实夹紧、预紧力或实物验收证明。',
    fields: [field('source_ref', '来源引用', 'Source reference', '必须能恢复具体版本。'), field('locator', '精确位置', 'Page | Row | Text | XML node', '定位到实际支持片段，不只指向整份文档。'), field('scope', '支持范围', 'Object + condition + configuration', '证据不会自动转移给替换后的零件。'), field('dependencies', '依赖', 'Revision reference[]', '保持历史证据不变，当前支持关系另行复核。')],
  },
];
