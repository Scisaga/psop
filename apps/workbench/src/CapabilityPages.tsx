import { useState } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Box, Boxes, Check, CircleHelp, ClipboardCheck, Database, FileText, FlaskConical, Image, Layers3, LockKeyhole, Move3D, Package, ScanEye, Workflow } from 'lucide-react';
import type { DeviceWorkspace, KnowledgeSnapshot, PrototypeData } from './types';
import { isMechanismProfile } from './mechanics-model';
import { BuildInvestigationCoverage } from './InvestigationInspector';
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
        <div className="cap-snapshot-actions"><button className="bp-button" onClick={onOpenOverview}><Boxes size={15} />浏览设备模型<ArrowUpRight size={13} /></button><button className="bp-text-button" onClick={onOpenSources}><FileText size={14} />查看 {data.meta.counts.sources} 份来源</button></div>
      </section>
      <section className="cap-capabilities-panel"><header className="cap-section-heading"><div><h2>快照能力</h2><p>依照包内声明展示实际覆盖范围。</p></div><CircleHelp size={16} /></header>
        {capabilities.length ? <div className="cap-capability-list">{capabilities.map(([name, capability]) => <div key={name}><div><strong>{!isMechanismProfile(data) && ['interface_analysis', 'connection_candidates'].includes(name) ? name === 'interface_analysis' ? '历史几何分组 · 未按机制复评' : '历史几何配对观测 · 未按机制复评' : capabilityLabel[name] || name.replaceAll('_', ' ')}</strong><span className={`cap-state is-${capability.status}`}>{({ complete: '已实现', partial: '部分支持', unavailable: '未提供' })[capability.status]}</span></div>{(capability.description || capability.limitations?.length) && <p>{capability.description || capability.limitations?.join('；')}</p>}</div>)}</div> : <div className="cap-inline-empty"><ClipboardCheck size={23} /><strong>当前快照未提供能力声明</strong><p>模型与原件可以浏览，额外的机械或工程能力仍需明确记录。</p></div>}
      </section>
    </div>
    <BuildInvestigationCoverage data={data} />
    <section className="cap-history-panel"><header className="cap-section-heading"><div><h2>已登记的知识版本</h2><p>切换版本会同步更新当前设备的模型、知识与来源。</p></div><span className="cap-count">{workspace.snapshots.length}</span></header><div className="cap-history-scroll"><table><thead><tr><th>版本</th><th>生成时间</th><th>来源 / 对象</th><th>内容摘要</th><th /></tr></thead><tbody>{workspace.snapshots.map(item => <tr key={item.id} className={item.id === snapshot.id ? 'is-current' : ''}><td><strong>{item.packageVersion}</strong><small>{item.packageId}</small></td><td>{dateLabel(item.createdAt)}</td><td>{item.counts.sources} / {item.counts.parts}</td><td><code title={item.packageDigest}>{item.packageDigest.slice(0, 16)}…</code></td><td>{item.id === snapshot.id ? <span className="cap-current"><Check size={13} />当前</span> : <button className="bp-text-button" onClick={() => onSelectSnapshot(item.id)}>打开版本<ArrowRight size={13} /></button>}</td></tr>)}</tbody></table></div></section>
    <div className="cap-footnote"><Workflow size={16} /><p>这里呈现已发布的真实知识快照。网页构建作业服务尚未接入；新版本由 psop-build 构建、校验后登记到设备工作区。</p></div>
  </div>;
}

const SIMULATE_TABS = [
  { id: 'assembly', label: '模拟装配', icon: Move3D, title: '在独立会话中组合设备部件', description: '取件、移动、旋转、连接与拆卸由场景引擎验证，保存的会话与知识快照分别管理。', missing: '装配执行服务尚未接入', detail: '当前没有可打开的模拟会话。设备总览中的爆炸图用于浏览来源装配。', inputs: ['固定知识快照', '来源几何与已确认接口'], outputs: ['装配配置与操作记录', '约束结果与会话回放'] },
  { id: 'scenes', label: '场景与视图', icon: Image, title: '为部件和组合生成可追踪的观测', description: '使用同一套场景与渲染能力，组织相机、背景、光照和遮挡，记录视图与监督信息。', missing: '批量场景与渲染服务尚未接入', detail: '当前没有渲染批次或合成观测。生成结果经过审核后可供 Compile 组织训练语料。', inputs: ['部件或装配配置', '相机与渲染计划'], outputs: ['多视角图像与监督信息', '渲染配置与来源链'] },
  { id: 'models', label: '模型测试', icon: ScanEye, title: '在固定场景中检验模型和协作链', description: '选择 Compile 发布的模型版本，运行可重复的场景测试，比较预测和评判标签。', missing: '模型推理与场景评测服务尚未接入', detail: '当前没有可用模型、测试运行或评测报告。模型输入与模拟器内部评判状态分别管理。', inputs: ['固定模型与推理配置', '独立测试场景'], outputs: ['预测结果与评测报告', '待审核的失败及纠错候选'] },
] as const;

const COMPILE_TABS = [
  { id: 'datasets', label: '训练语料', icon: Database, title: '围绕设备知识组织多类训练材料', description: '引用来源资料和 Simulate 的场景观测，审核样本与标注，并固定数据集版本及划分。', missing: '尚无已登记的数据集', detail: '语料构建服务尚未接入。后续可组织检测、关系、语音术语及现场帮助样本。', inputs: ['来源媒体与设备知识', '场景观测及审核记录'], outputs: ['版本化数据集', '标注、划分与来源链'] },
  { id: 'experiments', label: '训练实验', icon: FlaskConical, title: '分别记录每个模型的训练运行', description: '同一设备可开展多个训练目标和对照实验，每次运行固定输入、配置和执行环境。', missing: '尚无训练实验或运行', detail: '训练执行服务尚未接入，不会从此页面启动后台训练。', inputs: ['数据集与基础模型版本', '训练配置和环境'], outputs: ['训练记录与诊断文件', '模型检查点'] },
  { id: 'models', label: '模型产物', icon: Package, title: '保存可定位、可比较的模型版本', description: '统一登记检测、关系、语音和现场帮助模型；基础、导入和训练模型分别保留来源。', missing: '尚无已登记的模型', detail: '当前未加载权重或推理服务。模型产物登记后可在 Simulate 中选择并测试。', inputs: ['基础模型或训练运行', '权重与依赖信息'], outputs: ['固定版本的模型产物', '推理配置与使用范围'] },
  { id: 'evaluations', label: '评估记录', icon: ClipboardCheck, title: '追踪单模型与协作链的独立评估', description: '关联 Simulate 测试运行与独立真实评测，保留指标口径、数据版本和问题样本。', missing: '尚无模型评估记录', detail: '评估服务尚未接入。失败和人工纠正先作为候选记录，审核后进入新的数据或模型版本。', inputs: ['模型与测试数据版本', '测试运行与实际预测'], outputs: ['评估报告与对照结果', '待审核的改进候选'] },
] as const;

export function CapabilityPage({ mode, workspace, snapshot, onOpenOverview }: ContextProps & { mode: 'simulate' | 'compile' }) {
  const tabs = mode === 'simulate' ? SIMULATE_TABS : COMPILE_TABS;
  const [selected, setSelected] = useState<string>(tabs[0].id);
  const tab = tabs.find(item => item.id === selected) || tabs[0];
  const Icon = tab.icon;
  return <div className="bp-page cap-page">
    <header className="bp-page-heading"><div><h1>{mode === 'simulate' ? 'Simulate' : 'Compile'} <span className="cap-title-label">{mode === 'simulate' ? '模拟实验' : '语料与模型'}</span></h1><p>{mode === 'simulate' ? '围绕当前设备组织装配、场景观测与模型测试。' : '围绕同一设备管理语料、训练运行、模型版本和评估。'}</p></div><span className="cap-state is-unavailable"><LockKeyhole size={12} />执行服务未接入</span></header>
    <Context workspace={workspace} snapshot={snapshot} />
    <section className="cap-mode-panel"><div className="cap-tabs" role="tablist" aria-label={mode === 'simulate' ? '模拟能力' : '编译能力'}>{tabs.map(item => <button role="tab" aria-selected={item.id === tab.id} className={item.id === tab.id ? 'active' : ''} onClick={() => setSelected(item.id)} key={item.id}><item.icon size={16} />{item.label}</button>)}</div>
      <div className="cap-mode-intro"><span className="cap-mode-symbol"><Icon size={27} strokeWidth={1.4} /></span><div><h2>{tab.title}</h2><p>{tab.description}</p></div></div>
      <div className="cap-execution-empty"><span className="cap-empty-symbol"><Icon size={35} strokeWidth={1.2} /></span><h3>{tab.missing}</h3><p>{tab.detail}</p><button className="bp-button" onClick={onOpenOverview}><Boxes size={15} />浏览当前设备<ArrowUpRight size={13} /></button></div>
      <div className="cap-flow"><div><span>输入</span>{tab.inputs.map(item => <p key={item}>{item}</p>)}</div><ArrowRight size={19} /><div><span>产物</span>{tab.outputs.map(item => <p key={item}>{item}</p>)}</div></div>
    </section>
    <div className="cap-footnote"><LockKeyhole size={15} /><p>当前设备与知识版本在切换能力时保持一致。执行服务接入后，作业、会话及产物将登记到此设备工作区。</p></div>
  </div>;
}
