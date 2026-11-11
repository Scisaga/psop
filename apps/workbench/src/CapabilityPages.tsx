import { useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Box, Boxes, Check, CircleHelp, ClipboardCheck, Database, FileText, FlaskConical, Image, Layers3, LockKeyhole, Move3D, Package, ScanEye, Workflow } from 'lucide-react';
import type { DeviceWorkspace, KnowledgeSnapshot, PrototypeData } from './types';
import './capabilities.css';

interface ContextProps {
  data: PrototypeData;
  workspace: DeviceWorkspace;
  snapshot: KnowledgeSnapshot;
  onOpenOverview: () => void;
}

function Context({ workspace, snapshot }: Pick<ContextProps, 'workspace' | 'snapshot'>) {
  return <div className="cap-context"><Box size={14} /><span>{workspace.name}</span><span className="cap-context-divider" /><Layers3 size={14} /><span>{snapshot.packageVersion}</span></div>;
}

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
};
const capabilityLabel: Record<string, string> = {
  source_registry: '来源登记', source_model_projection: '参考模型投影', hardware_knowledge: '机械知识子集',
  engineering_validation: '工程验证', path_validation: '路径验证', training_data: '训练语料',
  geometric_analysis: '几何分析', interface_analysis: '接口机制分析', connection_candidates: '机制连接候选',
  source_intake: '来源摄入', source_integrity: '来源完整性', scene_projection: '源模型装配投影',
  source_model: '来源模型', model_knowledge: '模型对象知识', knowledge: '知识结构', mechanical_validation: '机械验证',
  ontology_validation: '本体检查', physical_simulation: '物理模拟', canonical_14_views: '规范多视图',
  reference_mounting: '参考安装关系', connection_review: '连接分析', supplemental_components: '连接件与待验证方案示意',
  structure_investigation: '结构主动调查', independent_review: '独立标注与区域审查',
  assembly_catalog: '装配接口目录', assembly_interfaces: '装配接口目录', source_geometry: '局部源几何',
  part_capabilities: '部件几何与潜在能力', compatibility_candidates: '跨件几何兼容候选', geometry_coverage: '全网格处置覆盖',
  cross_part_candidates:'跨件几何兼容候选',reference_assembly:'原装配关系',variant_design_execution:'自由组装与变体执行',
};
const capabilityDescriptions:Record<string,string>={
  part_capabilities:'发布有限实测几何、共享物理资源、潜在连接方式及尚未参数化的源区域；范围以独立审查记录为准。',
  cross_part_candidates:'全部不同来源实例对均已按声明的局部几何模板检查并记录处置；未知规格和适用条件继续保留。',
  reference_assembly:'保留有依据的原装配用途和参考构型中的冲突，并与潜在兼容候选分别查看。',
  variant_design_execution:'Build 已发布可消费的几何与能力。交互试装、变体求解和构型保存尚未实现。',
};

export function BuildPage({ data, workspace, snapshot, onSelectSnapshot, onOpenOverview, onOpenSources }: ContextProps & {
  onSelectSnapshot: (snapshotId: string) => void;
  onOpenSources: () => void;
}) {
  const capabilities = Object.entries(data.meta.capabilities ?? {});
  const downloadReference = () => {
    const reference = { schema: 'psop.workbench.snapshot-reference/1.0', workspaceId: workspace.id, deviceId: workspace.deviceId,
      packageId: snapshot.packageId, packageVersion: snapshot.packageVersion, packageDigest: snapshot.packageDigest,
      ontologyVersion: snapshot.ontologyVersion, snapshotId: snapshot.id };
    const url = URL.createObjectURL(new Blob([JSON.stringify(reference, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'knowledge-snapshot-reference.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  return <div className="bp-page cap-page">
    <header className="bp-page-heading"><div><h1>Build <span className="cap-title-label">知识构建</span></h1><p>查看设备知识包、来源与能力声明，追踪每次发布的固定版本。</p></div><button className="bp-button" onClick={downloadReference}><ArrowDownToLine size={15} />导出快照引用</button></header>
    <Context workspace={workspace} snapshot={snapshot} />
    <div className="cap-build-grid">
      <section className="cap-snapshot-panel">
        <header className="cap-section-heading"><span className="cap-section-symbol"><Package size={21} /></span><div><h2>当前知识快照</h2><p>{snapshot.packageId}</p></div><span className="cap-state is-complete"><Check size={12} />已加载</span></header>
        <dl className="cap-facts">
          <div><dt>设备工作区</dt><dd>{workspace.name}</dd></div><div><dt>知识版本</dt><dd>{snapshot.packageVersion}</dd></div>
          <div><dt>生成时间</dt><dd>{dateLabel(snapshot.createdAt)}</dd></div><div><dt>数据合同</dt><dd>{data.meta.dkpSchema}</dd></div>
          <div><dt>本体目标</dt><dd>{snapshot.ontologyVersion}</dd></div><div><dt>校验结果</dt><dd>{data.meta.validation ? data.meta.validation.valid ? '通过声明的校验剖面' : '未通过' : '快照未提供校验报告'}</dd></div>
          {data.meta.validation?.profile && <div><dt>校验剖面</dt><dd>{data.meta.validation.profile}</dd></div>}
        </dl>
        <div className="cap-digest"><span>内容摘要 · SHA-256</span><code>{snapshot.packageDigest}</code></div>
        <div className="cap-snapshot-actions"><button className="bp-button" onClick={onOpenOverview}><Boxes size={15} />浏览设备模型<ArrowUpRight size={13} /></button><button className="bp-text-button" onClick={onOpenSources}><FileText size={14} />查看 {data.meta.counts.sources} 份来源</button>{data.assembly?.capability_index?.review_path&&<a className="bp-text-button" href={data.assembly.capability_index.review_path} target="_blank" rel="noreferrer"><ClipboardCheck size={14}/>查看几何与候选覆盖记录</a>}</div>
      </section>
      <section className="cap-capabilities-panel"><header className="cap-section-heading"><div><h2>快照能力</h2><p>依照包内声明展示实际覆盖范围。</p></div><CircleHelp size={16} /></header>
        {capabilities.length ? <div className="cap-capability-list">{capabilities.map(([name, capability]) => <div key={name}><div><strong>{capabilityLabel[name] || name.replaceAll('_', ' ')}</strong><span className={`cap-state is-${capability.status}`}>{({ complete: '已实现', partial: '部分支持', unavailable: '未提供' })[capability.status]}</span></div>{(capability.description || capability.limitations?.length) && <p>{data.assembly?.capability_index&&capabilityDescriptions[name]||capability.description || capability.limitations?.join('；')}</p>}</div>)}</div> : <div className="cap-inline-empty"><ClipboardCheck size={23} /><strong>当前快照未提供能力声明</strong><p>模型与原件可以浏览，额外的机械或工程能力仍需明确记录。</p></div>}
      </section>
    </div>
    <section className="cap-history-panel"><header className="cap-section-heading"><div><h2>已登记的知识版本</h2><p>切换版本会同步更新当前设备的模型、知识与来源。</p></div><span className="cap-count">{workspace.snapshots.length}</span></header><div className="cap-history-scroll"><table><thead><tr><th>版本</th><th>生成时间</th><th>来源 / 对象</th><th>内容摘要</th><th /></tr></thead><tbody>{workspace.snapshots.map(item => <tr key={item.id} className={item.id === snapshot.id ? 'is-current' : ''}><td><strong>{item.packageVersion}</strong><small>{item.packageId}</small></td><td>{dateLabel(item.createdAt)}</td><td>{item.counts.sources} / {item.counts.parts}</td><td><code title={item.packageDigest}>{item.packageDigest.slice(0, 16)}…</code></td><td>{item.id === snapshot.id ? <span className="cap-current"><Check size={13} />当前</span> : <button className="bp-text-button" onClick={() => onSelectSnapshot(item.id)}>打开版本<ArrowRight size={13} /></button>}</td></tr>)}</tbody></table></div></section>
    <div className="cap-footnote"><Workflow size={16} /><p>这里呈现已发布的真实知识快照。网页构建作业服务尚未接入；新版本由 psop-build 构建、校验后登记到设备工作区。</p></div>
  </div>;
}

const COMPILE_TABS = [
  { id: 'datasets', label: '训练语料', icon: Database, title: '围绕设备知识组织多类训练材料', description: '引用来源资料和 Simulate 的场景观测，审核样本与标注，并固定数据集版本及划分。', missing: '尚无已登记的数据集', detail: '语料构建服务尚未接入。后续可组织检测、关系、语音术语及现场帮助样本。', inputs: ['来源媒体与设备知识', '场景观测及审核记录'], outputs: ['版本化数据集', '标注、划分与来源链'] },
  { id: 'experiments', label: '训练实验', icon: FlaskConical, title: '分别记录每个模型的训练运行', description: '同一设备可开展多个训练目标和对照实验，每次运行固定输入、配置和执行环境。', missing: '尚无训练实验或运行', detail: '训练执行服务尚未接入，不会从此页面启动后台训练。', inputs: ['数据集与基础模型版本', '训练配置和环境'], outputs: ['训练记录与诊断文件', '模型检查点'] },
  { id: 'models', label: '模型产物', icon: Package, title: '保存可定位、可比较的模型版本', description: '统一登记检测、关系、语音和现场帮助模型；基础、导入和训练模型分别保留来源。', missing: '尚无已登记的模型', detail: '当前未加载权重或推理服务。模型产物登记后可在 Simulate 中选择并测试。', inputs: ['基础模型或训练运行', '权重与依赖信息'], outputs: ['固定版本的模型产物', '推理配置与使用范围'] },
  { id: 'evaluations', label: '评估记录', icon: ClipboardCheck, title: '追踪单模型与协作链的独立评估', description: '关联 Simulate 测试运行与独立真实评测，保留指标口径、数据版本和问题样本。', missing: '尚无模型评估记录', detail: '评估服务尚未接入。失败和人工纠正先作为候选记录，审核后进入新的数据或模型版本。', inputs: ['模型与测试数据版本', '测试运行与实际预测'], outputs: ['评估报告与对照结果', '待审核的改进候选'] },
] as const;

export function CapabilityPage({ workspace, snapshot, onOpenOverview }: ContextProps & { mode: 'compile' }) {
  const tabs = COMPILE_TABS;
  const [selected, setSelected] = useState<string>(tabs[0].id);
  const tab = tabs.find(item => item.id === selected) || tabs[0];
  const Icon = tab.icon;
  return <div className="bp-page cap-page">
    <header className="bp-page-heading"><div><h1>Compile <span className="cap-title-label">语料与模型</span></h1><p>围绕同一设备管理语料、训练运行、模型版本和评估。</p></div><span className="cap-state is-unavailable"><LockKeyhole size={12} />执行服务未接入</span></header>
    <Context workspace={workspace} snapshot={snapshot} />
    <section className="cap-mode-panel"><div className="cap-tabs" role="tablist" aria-label="编译能力">{tabs.map(item => <button role="tab" aria-selected={item.id === tab.id} className={item.id === tab.id ? 'active' : ''} onClick={() => setSelected(item.id)} key={item.id}><item.icon size={16} />{item.label}</button>)}</div>
      <div className="cap-mode-intro"><span className="cap-mode-symbol"><Icon size={27} strokeWidth={1.4} /></span><div><h2>{tab.title}</h2><p>{tab.description}</p></div></div>
      <div className="cap-execution-empty"><span className="cap-empty-symbol"><Icon size={35} strokeWidth={1.2} /></span><h3>{tab.missing}</h3><p>{tab.detail}</p><button className="bp-button" onClick={onOpenOverview}><Boxes size={15} />浏览当前设备<ArrowUpRight size={13} /></button></div>
      <div className="cap-flow"><div><span>输入</span>{tab.inputs.map(item => <p key={item}>{item}</p>)}</div><ArrowRight size={19} /><div><span>产物</span>{tab.outputs.map(item => <p key={item}>{item}</p>)}</div></div>
    </section>
    <div className="cap-footnote"><LockKeyhole size={15} /><p>当前设备与知识版本在切换能力时保持一致。执行服务接入后，作业、会话及产物将登记到此设备工作区。</p></div>
  </div>;
}
