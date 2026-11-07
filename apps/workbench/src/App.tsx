import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, ArrowDownToLine, ArrowUpRight, Blend, BookOpen, Box, Boxes, Check,
  ChevronDown, ChevronRight, CircleHelp, Copy, Cpu, Eye, EyeOff, FileText,
  Focus, FolderTree, Grid2X2, Layers3, Link2, LoaderCircle, Maximize2, Menu,
  MousePointer2, Network, PanelLeftClose, PanelRightClose, RotateCcw, Scan,
  Scissors, Search, Settings2, Tags, Workflow, X, FlaskConical, Move3D,
} from 'lucide-react';
import SceneCanvas, { type CameraPose, type SceneHandle } from './SceneCanvas';
import { BrandMark } from './BrandMark';
import { useInspectorResize } from './useInspectorResize';
import { EvidenceDialog, KnowledgePage, OntologyPage, SourcesPage } from './Pages';
import { BuildPage, CapabilityPage } from './CapabilityPages';
import { ConnectionReviewPage } from './ConnectionReviews';
import { GeometryInspector, MechanicsInspector, MechanicsSummary, featureSummary } from './MechanicsInspector';
import { descriptorFeatures, featuresFor, installationSelection, isAlternativeSupplement, supplementAlternativeKeys, isMechanismProfile, isMountingProfile, mountingSiteName, observationLabel, qualifiedConnections, referenceMountsFor, resolveGeometry, routeSelection, selectionQueryKey } from './mechanics-model';
import { GROUP_LABELS, KIND_LABELS, type DeviceWorkspace, type GeometrySelection, type Page, type PrototypeData } from './types';

const NAV = [
  { id: 'explorer', label: '设备总览', icon: Boxes },
  { id: 'knowledge', label: '知识浏览', icon: Network },
  { id: 'connections', label: '连接审查', icon: Link2 },
  { id: 'ontology', label: '本体定义', icon: BookOpen },
  { id: 'sources', label: '来源资料', icon: FileText },
  { id: 'build', label: 'Build 构建', icon: Workflow },
  { id: 'simulate', label: 'Simulate 模拟', icon: Move3D },
  { id: 'compile', label: 'Compile 训练', icon: FlaskConical },
] as const;
const GROUPS = ['head', 'torso', 'left-leg', 'right-leg'];
type View = 'iso' | 'front' | 'right' | 'top';

function savedContext(): { workspace?: string; snapshot?: string; page?: Page } {
  try { return JSON.parse(localStorage.getItem('psop.workbench.context') || '{}'); }
  catch { return {}; }
}

function initialRoute() {
  const [rawPage, query] = location.hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  const stored = savedContext();
  const requestedWorkspace = params.get('workspace');
  const useStoredSnapshot = !requestedWorkspace || requestedWorkspace === stored.workspace;
  const amount = Number(params.get('explode') ?? 0);
  const coordinates = params.get('camera')?.split(',').map(Number);
  const camera: CameraPose | null = coordinates?.length === 6 && coordinates.every(n => Number.isFinite(n) && Math.abs(n) < 10000)
    && Math.hypot(...coordinates.slice(0, 3).map((n, i) => n - coordinates[i + 3])) > 0.000001
    ? { position: coordinates.slice(0, 3) as CameraPose['position'], target: coordinates.slice(3) as CameraPose['target'] } : null;
  return {
    page: (NAV.some(n => n.id === rawPage) ? rawPage : NAV.some(n => n.id === stored.page) ? stored.page : 'explorer') as Page,
    workspace: requestedWorkspace || stored.workspace || '',
    snapshot: params.has('snapshot') ? params.get('snapshot') || '' : useStoredSnapshot ? stored.snapshot || '' : '',
    source: params.get('source'),
    evidence: params.get('evidence') || undefined,
    part: params.get('part'),
    selection: routeSelection(params),
    inspectorTab: (['overview', 'geometry', 'interfaces', 'relations', 'evidence'].includes(params.get('detail') || '') ? params.get('detail') : null) as 'overview' | 'geometry' | 'interfaces' | 'relations' | 'evidence' | null,
    inspection: params.get('inspection') === '1',
    activeAlternativeIds: [...new Set((params.get('alternatives') || '').split(',').filter(Boolean))],
    supplementReviewIds: params.has('fastenerReviews') ? [...new Set((params.get('fastenerReviews') || '').split(',').filter(Boolean))] : null,
    explosion: Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0,
    view: (['iso', 'front', 'right', 'top'].includes(params.get('view') || '') ? params.get('view') : 'iso') as View,
    camera,
    hiddenIds: (params.get('hidden') || '').split(',').filter(Boolean),
    isolateId: params.get('isolate'),
    labels: params.get('labels') !== '0',
    grid: params.get('grid') !== '0',
    normals: params.get('normals') === '1',
    clipping: params.get('clip') === '1',
    xray: params.get('xray') === '1',
    showSupplemental: params.get('supplements') === '1' || params.get('showSupplementals') === '1',
  };
}

function IconButton({ title, active, children, onClick, className = '' }: {
  title: string; active?: boolean; children: ReactNode; onClick: () => void; className?: string;
}) {
  return <button className={`icon-button ${active ? 'is-active' : ''} ${className}`} title={title} aria-label={title} aria-pressed={active} onClick={onClick}>{children}</button>;
}

function Dialog({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('input, button, a')?.focus(), 30);
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && ref.current) {
        const nodes = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, select:not([disabled]), textarea, a[href], [tabindex="0"]')];
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`dialog ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <div className="dialog-header"><h2>{title}</h2><IconButton title="关闭" onClick={onClose}><X size={18} /></IconButton></div>
      {children}
    </div>
  </div>;
}

export default function App() {
  const route = useMemo(initialRoute, []);
  const [data, setData] = useState<PrototypeData | null>(null);
  const [error, setError] = useState('');
  const [workspaces, setWorkspaces] = useState<DeviceWorkspace[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [workspaceId, setWorkspaceId] = useState(route.workspace);
  const [snapshotId, setSnapshotId] = useState(route.snapshot);
  const [page, setPage] = useState<Page>(route.page);
  const [selectedId, setSelectedId] = useState<string | null>(route.part);
  const [geometrySelection, setGeometrySelection] = useState<GeometrySelection | null>(route.selection);
  const [explosion, setExplosion] = useState(route.explosion);
  const [view, setView] = useState<View>(route.view);
  const [ontologyType, setOntologyType] = useState('Part');
  const [treeSearch, setTreeSearch] = useState('');
  const [treeMode, setTreeMode] = useState<'structure' | 'category'>('structure');
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['torso']));
  const [hiddenIds, setHiddenIds] = useState<string[]>(route.hiddenIds);
  const [isolateId, setIsolateId] = useState<string | null>(route.isolateId);
  const [showLabels, setShowLabels] = useState(route.labels);
  const [showGrid, setShowGrid] = useState(route.grid);
  const [showGeometryNormals, setShowGeometryNormals] = useState(route.normals);
  const [clipping, setClipping] = useState(route.clipping);
  const [xray, setXray] = useState(route.xray);
  const [showSupplemental, setShowSupplemental] = useState(route.showSupplemental);
  const [supplementReviewIds, setSupplementReviewIds] = useState<string[] | null>(route.supplementReviewIds);
  const [activeConnectionAlternativeIds, setActiveConnectionAlternativeIds] = useState<string[]>(route.activeAlternativeIds);
  const [inspectionActive, setInspectionActive] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'geometry' | 'interfaces' | 'relations' | 'evidence'>(route.inspectorTab || (route.selection ? installationSelection(route.selection) ? 'interfaces' : 'geometry' : 'overview'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [treeVisible, setTreeVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const inspectorLayout = useInspectorResize({ treeVisible, inspectorVisible });
  const [sceneReady, setSceneReady] = useState(false);
  const [modal, setModal] = useState<'search' | 'about' | 'versions' | null>(null);
  const [globalQuery, setGlobalQuery] = useState('');
  const [sourceDialog, setSourceDialog] = useState<{ sourceId: string; evidenceId?: string } | null>(route.source ? { sourceId: route.source, evidenceId: route.evidence } : null);
  const [toast, setToast] = useState('');
  const [projectMenu, setProjectMenu] = useState(false);
  const sceneRef = useRef<SceneHandle>(null);
  const pendingFocus = useRef(false);
  const pendingGeometryFocus = useRef<GeometrySelection | null>(route.camera ? null : route.selection);
  const pendingCamera = useRef<CameraPose | null>(route.camera);
  const bookmarkCamera = useRef<CameraPose | null>(route.camera);
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const workspace = workspaces.find(item => item.id === workspaceId);
  const snapshot = workspace?.snapshots.find(item => item.id === snapshotId);
  const workspaceName = workspace?.name || data?.meta.title || '设备工作区';
  const referenceComponents = useMemo(() => data?.analysis?.supplemental_components?.filter(item => !isAlternativeSupplement(data, item)) ?? [], [data]);
  const alternativeComponents = useMemo(() => data?.analysis?.supplemental_components?.filter(item => isAlternativeSupplement(data, item)) ?? [], [data]);
  const allFastenerReviewIds = useMemo(() => [...new Set(referenceComponents.map(item => item.review_ref))], [referenceComponents]);
  const visibleFastenerReviewIds = showSupplemental ? supplementReviewIds ?? allFastenerReviewIds : [];

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/workspaces', { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error(`工作区目录读取失败（HTTP ${r.status}）`);
      return r.json();
    }).then((result: { workspaces: DeviceWorkspace[] }) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.workspaces)) throw new Error('工作区目录格式不完整。');
      setWorkspaces(result.workspaces); setCatalogLoaded(true);
      const preferred = route.workspace ? result.workspaces.find(item => item.id === route.workspace) : result.workspaces[0];
      if (!preferred) {
        if (route.workspace) setError('此链接中的设备工作区尚未登记，请选择一个可用工作区。');
        return;
      }
      const preferredSnapshot = route.snapshot && preferred.snapshots.find(item => item.id === route.snapshot);
      setWorkspaceId(preferred.id);
      setSnapshotId(preferredSnapshot ? preferredSnapshot.id : preferred.selectedSnapshotId || preferred.snapshots[0]?.id || '');
      if (route.snapshot && !preferredSnapshot && route.workspace === preferred.id) {
        setSnapshotId(''); setError('此链接中的知识版本尚未登记，请选择一个可用版本。');
      }
    }).catch(e => { if (e.name !== 'AbortError') { setError(e.message); setCatalogLoaded(true); } });
    return () => controller.abort();
  }, [route]);

  useEffect(() => {
    if (!catalogLoaded || !workspaceId || !snapshotId) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { controller.abort(); setError('知识快照校验超过等待时间，请重试并检查本地服务。'); }, 330000);
    const started = Date.now();
    setLoadingSeconds(0);
    const progress = window.setInterval(() => setLoadingSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    setData(null); setError(''); setSceneReady(false);
    fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/snapshots/${encodeURIComponent(snapshotId)}/view`, { signal: controller.signal }).then(async r => {
      if (!r.ok) {
        const failure = await r.json().catch(() => null);
        throw new Error(`知识快照读取失败：${failure?.error || `HTTP ${r.status}`}`);
      }
      return r.json();
    }).then((result: PrototypeData) => {
      if (controller.signal.aborted) return;
      if (result.meta?.inputKind !== 'dkp' || !Array.isArray(result.parts) || !Array.isArray(result.sources)) throw new Error('当前输入不是受支持的 DKP 知识投影。');
      const requested = geometrySelection?.kind === 'interface' && !isMechanismProfile(result) ? { ...geometrySelection, kind: 'legacy_group' as const } : geometrySelection;
      const activeGeometry = resolveGeometry(result, requested);
      setData(result);
      setGeometrySelection(activeGeometry ? requested : null);
      if (!activeGeometry) pendingGeometryFocus.current = null;
      else if (requested?.kind === 'legacy_group') { pendingGeometryFocus.current = requested; setInspectorTab('geometry'); }
      setSelectedId(id => activeGeometry?.ownerRef || (result.parts.some(p => p.id === id) ? id : result.parts.find(p => p.meshKey === 'xl330')?.id || result.parts[0]?.id || null));
      setHiddenIds(ids => ids.filter(id => result.parts.some(p => p.id === id)));
      setIsolateId(id => result.parts.some(p => p.id === id) ? id : null);
      setSourceDialog(value => value && result.sources.some(item => item.id === value.sourceId) ? value : null);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { window.clearTimeout(timeout); window.clearInterval(progress); });
    return () => { window.clearTimeout(timeout); window.clearInterval(progress); controller.abort(); };
  }, [catalogLoaded, workspaceId, snapshotId]);

  useEffect(() => { document.title = `${workspaceName} · ${NAV.find(item => item.id === page)?.label || '工作台'} · PSOP`; }, [workspaceName, page]);

  useEffect(() => {
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!catalogLoaded || !workspaceId) return;
    const query = new URLSearchParams();
    query.set('workspace', workspaceId);
    if (snapshotId) query.set('snapshot', snapshotId);
    if (selectedId) query.set('part', selectedId);
    if (geometrySelection) query.set(selectionQueryKey(geometrySelection), geometrySelection.id);
    query.set('explode', explosion.toFixed(2));
    query.set('detail', inspectorTab);
    if (sceneRef.current?.getInspectionState().active) query.set('inspection', '1');
    query.set('view', view);
    if (hiddenIds.length) query.set('hidden', hiddenIds.join(','));
    if (isolateId) query.set('isolate', isolateId);
    if (!showLabels) query.set('labels', '0');
    if (!showGrid) query.set('grid', '0');
    if (showGeometryNormals) query.set('normals', '1');
    if (clipping) query.set('clip', '1');
    if (xray) query.set('xray', '1');
    query.set('supplements', showSupplemental ? '1' : '0');
    if (supplementReviewIds !== null) query.set('fastenerReviews', supplementReviewIds.join(','));
    if (activeConnectionAlternativeIds.length) query.set('alternatives', activeConnectionAlternativeIds.join(','));
    if (bookmarkCamera.current) query.set('camera', [...bookmarkCamera.current.position, ...bookmarkCamera.current.target].map(n => n.toFixed(7)).join(','));
    if (sourceDialog) { query.set('source', sourceDialog.sourceId); if (sourceDialog.evidenceId) query.set('evidence', sourceDialog.evidenceId); }
    history.replaceState(null, '', `#${page}?${query}`);
    try { localStorage.setItem('psop.workbench.context', JSON.stringify({ workspace: workspaceId, snapshot: snapshotId, page })); } catch { /* Context links remain available when local storage is disabled. */ }
  }, [catalogLoaded, workspaceId, snapshotId, page, selectedId, geometrySelection, explosion, view, hiddenIds, isolateId, showLabels, showGrid, showGeometryNormals, clipping, xray, showSupplemental, supplementReviewIds, activeConnectionAlternativeIds, inspectorTab, inspectionActive, sourceDialog]);

  useEffect(() => {
    function sync() {
      const r = initialRoute(); pendingCamera.current = r.camera; bookmarkCamera.current = r.camera;
      setWorkspaceId(r.workspace); setSnapshotId(r.snapshot);
      setPage(r.page); setSelectedId(r.part); setExplosion(r.explosion); setView(r.view);
      setGeometrySelection(r.selection); pendingGeometryFocus.current = r.camera ? null : r.selection;
      if (r.inspectorTab) setInspectorTab(r.inspectorTab);
      else if (r.selection) setInspectorTab(installationSelection(r.selection) ? 'interfaces' : 'geometry');
      setHiddenIds(r.hiddenIds); setIsolateId(r.isolateId); setShowLabels(r.labels); setShowGrid(r.grid); setClipping(r.clipping); setXray(r.xray);
      setShowGeometryNormals(r.normals);
      setShowSupplemental(r.showSupplemental); setSupplementReviewIds(r.supplementReviewIds); setActiveConnectionAlternativeIds(r.activeAlternativeIds);
      setSourceDialog(r.source ? { sourceId: r.source, evidenceId: r.evidence } : null);
      if (sceneRef.current && r.camera) requestAnimationFrame(() => { if (r.inspection && r.selection) sceneRef.current?.focusGeometry(r.selection); sceneRef.current?.setCameraPose(r.camera!); });
    }
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const el = event.target as HTMLElement;
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setModal('search'); return; }
      if (editing || modal || sourceDialog) return;
      if (event.key === '/') { event.preventDefault(); setModal('search'); }
      if (event.key === '?') setModal('about');
      if (event.key === 'Escape') { setIsolateId(null); setProjectMenu(false); }
      if (page !== 'explorer') return;
      if (event.key.toLowerCase() === 'f') { if (geometrySelection) sceneRef.current?.focusGeometry(geometrySelection); else sceneRef.current?.focusSelected(); }
      if (event.key.toLowerCase() === 'e') setExplosion(v => v > 0 ? 0 : 0.7);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [modal, sourceDialog, page, geometrySelection]);

  const selected = data?.parts.find(p => p.id === selectedId) ?? null;
  const selectedGeometry = data ? resolveGeometry(data, geometrySelection) : null;
  useEffect(() => {
    if (data && geometrySelection?.kind === 'interface' && !isMechanismProfile(data)) {
      const historical = { ...geometrySelection, kind: 'legacy_group' as const };
      if (resolveGeometry(data, historical)) { setGeometrySelection(historical); pendingGeometryFocus.current = historical; setInspectorTab('geometry'); return; }
    }
    if (data && geometrySelection && (!selectedGeometry || selectedGeometry.ownerRef !== selectedId)) { setGeometrySelection(null); pendingGeometryFocus.current = null; }
    if (geometrySelection?.kind === 'site' && selectedGeometry?.authority === 'geometry_only') setInspectorTab('geometry');
  }, [data, selectedId, geometrySelection, selectedGeometry?.ownerRef]);
  const filteredParts = useMemo(() => {
    const q = treeSearch.toLocaleLowerCase().trim();
    return data?.parts.filter(p => !q || `${p.name} ${p.id} ${p.meshKey} ${p.body} ${KIND_LABELS[p.kind]}`.toLocaleLowerCase().includes(q)) ?? [];
  }, [data, treeSearch]);
  const searchParts = useMemo(() => {
    const q = globalQuery.trim().toLocaleLowerCase();
    return data?.parts.filter(p => !q || `${p.name} ${p.id} ${p.meshKey} ${KIND_LABELS[p.kind]}`.toLocaleLowerCase().includes(q)).slice(0, 8) ?? [];
  }, [data, globalQuery]);
  const searchSources = useMemo(() => {
    const q = globalQuery.trim().toLocaleLowerCase();
    return q ? data?.sources.filter(s => `${s.title} ${s.id} ${s.text ?? ''}`.toLocaleLowerCase().includes(q)).slice(0, 4) ?? [] : [];
  }, [data, globalQuery]);
  const searchGeometry = useMemo(() => {
    const q = globalQuery.trim().toLocaleLowerCase();
    if (!q || !data?.analysis) return [];
    const analysis = data.analysis;
    const ownerName = (id: string) => data.parts.find(part => part.id === id)?.name || id;
    const records: { selection: GeometrySelection; title: string; detail: string }[] = [
      ...(analysis.installation_hypotheses ?? []).map(item => ({ selection: { kind: 'installation_hypothesis' as const, id: item.id, ownerRef: item.participants[0]?.part_ref }, title: item.title, detail: `待验证安装假设 · ${item.participants.map(participant => ownerName(participant.part_ref)).join(' ↔ ')} · ${item.mechanism.summary}` })),
      ...(analysis.connection_review_findings ?? []).map(item => ({ selection: { kind: 'connection_review' as const, id: item.review_ref, ownerRef: item.participants[0]?.part_ref }, title: item.title, detail: `${item.work_status === 'investigated' ? '已调查' : '待调查'} · ${item.participants.map(participant => ownerName(participant.part_ref)).join(' ↔ ')} · ${item.mechanism_candidates.map(candidate => candidate.summary).join(' ')} · ${item.findings.join(' ')}` })),
      ...(analysis.structure_candidates ?? []).map(item => ({ selection: { kind: 'structure' as const, id: item.id, ownerRef: item.owner_ref }, title: '局部结构', detail: `${ownerName(item.owner_ref)} · ${item.geometry.type} · ${item.function_status === 'unknown' ? '功能待证' : item.function_status === 'installation_hypothesis_available' ? '有依据的安装假设' : '有安装用途依据'} · ${analysis.review_coverage?.independent_features.matches.filter(match => match.candidate_refs.includes(item.id)).map(match => match.id).join(' / ') || ''} · ${item.id}` })),
      ...(analysis.review_regions ?? []).map(item => ({ selection: { kind: 'review_region' as const, id: item.id, ownerRef: item.owner_ref }, title: '区域审查', detail: `${ownerName(item.owner_ref)} · ${item.label} · ${item.review_status}` })),
      ...(analysis.pin_hole_fits ?? []).map(item => ({ selection: { kind: 'pin_fit' as const, id: item.id, ownerRef: item.participants.find(participant => participant.role === 'pin_carrier')!.part_ref }, title: '小柱与壳体孔配合', detail: `${item.measurements.member_count} 对原子成员 · 保持方式未知` })),
      ...(analysis.mounting_sites ?? []).filter(item => item.status !== 'geometry_candidate').map(item => ({ selection: { kind: 'site' as const, id: item.id, ownerRef: item.owner_ref }, title: `${mountingSiteName(item)} ${item.label}`, detail: `${ownerName(item.owner_ref)} · ${item.status === 'project_inferred' || item.assertion_refs.includes('thigh-integral-mounting-pins') ? '用途推断，待核实' : '已声明安装用途'}` })),
      ...(analysis.connection_reviews ?? []).map(item => ({ selection: { kind: 'connection_review' as const, id: item.id, ownerRef: item.participants[0]?.part_ref }, title: '连接审查 · 定位、保持与运动', detail: item.participants.map(part => ownerName(part.part_ref)).join(' ↔ ') })),
      ...(analysis.supplemental_components ?? []).map(item => ({ selection: { kind: 'supplement' as const, id: item.id }, title: `${item.label} · 补全示意`, detail: `${item.id} · 未确认 BOM` })),
      ...(analysis.circular_openings ?? []).map(item => ({ selection: { kind: 'opening' as const, id: item.id, ownerRef: item.owner_ref }, title: '真实有限圆形开口', detail: `${ownerName(item.owner_ref)} · Ø${(item.geometry.radius_m * 2000).toFixed(2)} mm` })),
      ...(analysis.passage_hypotheses ?? []).map(item => ({ selection: { kind: 'passage' as const, id: item.id, ownerRef: item.owner_ref }, title: '变半径有限内腔', detail: `${ownerName(item.owner_ref)} · ${item.opening_refs.length} 个有限入口` })),
      ...(analysis.reference_mounts ?? []).map(item => ({ selection: { kind: 'mount' as const, id: item.id, ownerRef: item.participants[0]?.part_ref }, title: '标准参考装配 · 双孔对应', detail: item.participants.map(p => ownerName(p.part_ref)).join(' ↔ ') })),
      ...(analysis.slot_features ?? []).map(item => ({ selection: { kind: 'slot' as const, id: item.id, ownerRef: item.owner_ref }, title: '长槽有限开口', detail: `${ownerName(item.owner_ref)} · ${(item.geometry.width_m * 1000).toFixed(2)} × ${(item.geometry.length_m * 1000).toFixed(2)} mm` })),
      ...(analysis.logical_holes ?? []).map(item => ({ selection: { kind: 'hole' as const, id: item.id, ownerRef: item.owner_ref }, title: item.kind === 'stepped_bore' ? '阶梯孔几何' : '逻辑孔几何', detail: `${ownerName(item.owner_ref)} · ${featureSummary(featuresFor(data, item.wall_feature_refs))}` })),
      ...(analysis.feature_patterns ?? []).map(item => ({ selection: { kind: 'pattern' as const, id: item.id, ownerRef: item.owner_ref }, title: `${item.logical_hole_refs.length} 孔几何阵列`, detail: `${ownerName(item.owner_ref)} · ${item.geometry.rotational_symmetry_order} 阶几何对称` })),
      ...(analysis.reference_observations ?? []).map(item => ({ selection: { kind: 'observation' as const, id: item.id, ownerRef: item.participants[0]?.part_ref }, title: observationLabel(item.kind), detail: item.participants.map(p => ownerName(p.part_ref)).join(' ↔ ') })),
      ...analysis.features.map(item => ({ selection: { kind: 'feature' as const, id: item.id, ownerRef: item.owner_ref }, title: item.geometry.type === 'plane' ? '有限源面片' : '圆柱壁几何特征', detail: `${ownerName(item.owner_ref)} · ${featureSummary([item])}` })),
    ];
    return records.filter(item => `${item.selection.id} ${item.title} ${item.detail}`.toLocaleLowerCase().includes(q)).slice(0, 6);
  }, [data, globalQuery]);

  const notify = useCallback((text: string) => setToast(text), []);
  const copy = useCallback(async (value: string, success = '已复制') => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement('textarea'); area.value = value;
        area.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(area); area.select();
        const copied = document.execCommand('copy'); area.remove();
        if (!copied) throw new Error('copy unavailable');
      }
      notify(success);
    }
    catch { notify('浏览器未允许复制，请在地址栏复制当前链接'); }
  }, [notify]);
  const openSource = useCallback((sourceId: string, evidenceId?: string) => { setSourceDialog({ sourceId, evidenceId }); setModal(null); }, []);
  const selectPart = useCallback((id: string) => {
    pendingFocus.current = true;
    pendingGeometryFocus.current = null; setGeometrySelection(null);
    setSelectedId(id); setIsolateId(null); setPage('explorer'); setModal(null); setInspectorVisible(true);
    setHiddenIds(ids => ids.filter(hiddenId => hiddenId !== id));
    setTreeSearch('');
  }, []);
  const selectScenePart = useCallback((id: string) => { setSelectedId(id); if (id !== selectedId) { setGeometrySelection(null); pendingGeometryFocus.current = null; } }, [selectedId]);
  function selectGeometry(selection: GeometrySelection, detail: 'auto' | 'interfaces' | 'geometry' = 'auto') {
    if (!data) return;
    const item = resolveGeometry(data, selection);
    if (!item) return;
    const resolved = { ...selection, ownerRef: item.ownerRef };
    pendingGeometryFocus.current = resolved; pendingFocus.current = false; pendingCamera.current = null; bookmarkCamera.current = null;
    setSelectedId(item.ownerRef); setGeometrySelection(resolved); setInspectorTab(detail !== 'auto' ? detail : installationSelection(selection) && item.authority !== 'geometry_only' ? 'interfaces' : 'geometry'); setInspectorVisible(true); setPage('explorer');
    setHiddenIds(ids => ids.filter(id => id !== item.ownerRef));
    setIsolateId(current => current && current !== item.ownerRef ? null : current);
    if (selection.kind === 'supplement') {
      const component = data.analysis?.supplemental_components?.find(component => component.id === selection.id);
      if (component && isAlternativeSupplement(data, component)) {
        setActiveConnectionAlternativeIds(current => [...new Set([...current, ...supplementAlternativeKeys(data, component)])]);
      } else if (component) {
        setSupplementReviewIds(current => !showSupplemental ? [component.review_ref] : current === null ? null : [...new Set([...current, component.review_ref])]);
        setShowSupplemental(true);
      }
    }
    setTreeSearch(''); setModal(null);
  }
  function toggleConnectionFasteners(reviewId: string) {
    const next = new Set(visibleFastenerReviewIds);
    if (next.has(reviewId)) next.delete(reviewId); else next.add(reviewId);
    setSupplementReviewIds([...next]); setShowSupplemental(next.size > 0);
  }
  function toggleAllFasteners() { setSupplementReviewIds(null); setShowSupplemental(value => !value); }
  function hideConnectionAlternatives(keys = activeConnectionAlternativeIds) {
    const component = geometrySelection?.kind === 'supplement' ? data?.analysis?.supplemental_components?.find(item => item.id === geometrySelection.id) : undefined;
    if (data && component && supplementAlternativeKeys(data, component).some(key => keys.includes(key))) {
      pendingGeometryFocus.current = null; setGeometrySelection(null); sceneRef.current?.restoreInspection();
    }
    setActiveConnectionAlternativeIds(current => current.filter(key => !keys.includes(key)));
  }
  function selectConnectionAlternative(reviewId: string, alternativeId: string) {
    const review = data?.analysis?.connection_reviews?.find(item => item.id === reviewId);
    const alternative = review?.alternatives.find(item => item.id === alternativeId);
    if (!alternative) return;
    const key = `${reviewId}::${alternativeId}`;
    if (activeConnectionAlternativeIds.includes(key)) { hideConnectionAlternatives([key]); return; }
    const component = data?.analysis?.supplemental_components?.find(item => alternative.component_refs.includes(item.id));
    if (component) selectGeometry({ kind: 'supplement', id: component.id, ownerRef: selectedId || undefined }, 'interfaces');
    else setActiveConnectionAlternativeIds(current => [...new Set([...current, key])]);
  }
  function selectInterface(id: string) { selectGeometry({ kind: 'interface', id }); }

  useEffect(() => { if (selected) setOpenGroups(prev => new Set([...prev, treeMode === 'structure' ? selected.group : selected.kind])); }, [selected, treeMode]);
  useEffect(() => {
    const timer = window.setTimeout(() => document.querySelector('.tree-row.selected')?.scrollIntoView({ block: 'nearest' }), 80);
    return () => clearTimeout(timer);
  }, [selectedId, treeMode]);
  const ready = useCallback(() => {
    setSceneReady(true);
    window.setTimeout(() => {
      if (pendingCamera.current) { const restored = initialRoute(); if (restored.inspection && restored.selection) sceneRef.current?.focusGeometry(restored.selection); sceneRef.current?.setCameraPose(pendingCamera.current); pendingCamera.current = null; }
      else if (pendingGeometryFocus.current) { sceneRef.current?.focusGeometry(pendingGeometryFocus.current); pendingGeometryFocus.current = null; }
      else sceneRef.current?.setView(initialRoute().view);
      if (pendingFocus.current) { sceneRef.current?.focusSelected(); pendingFocus.current = false; }
    }, 0);
  }, []);
  useEffect(() => { if (page === 'explorer') setSceneReady(false); }, [page]);
  useEffect(() => {
    if (page === 'explorer' && sceneReady && pendingFocus.current) {
      const frame = requestAnimationFrame(() => { sceneRef.current?.focusSelected(); pendingFocus.current = false; });
      return () => cancelAnimationFrame(frame);
    }
  }, [page, selectedId, sceneReady]);
  useEffect(() => {
    if (page === 'explorer' && sceneReady && geometrySelection && pendingGeometryFocus.current === geometrySelection) {
      const frame = requestAnimationFrame(() => {
        if (pendingGeometryFocus.current === geometrySelection) { sceneRef.current?.focusGeometry(geometrySelection); pendingGeometryFocus.current = null; }
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [page, geometrySelection, sceneReady]);

  function setSceneView(next: View) { bookmarkCamera.current = null; setView(next); sceneRef.current?.setView(next); }
  function toggleHidden(id: string) { setHiddenIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]); }
  function toggleGroup(group: string) { setOpenGroups(prev => { const next = new Set(prev); next.has(group) ? next.delete(group) : next.add(group); return next; }); }
  function chooseContext(nextWorkspace: DeviceWorkspace, nextSnapshotId = nextWorkspace.selectedSnapshotId || nextWorkspace.snapshots[0]?.id || '') {
    if (workspaceId === nextWorkspace.id && snapshotId === nextSnapshotId) { setProjectMenu(false); setModal(null); return; }
    pendingCamera.current = null; bookmarkCamera.current = null; pendingFocus.current = false;
    pendingGeometryFocus.current = null; setGeometrySelection(null);
    setData(null); setError('');
    if (workspaceId !== nextWorkspace.id) setSelectedId(null);
    setSourceDialog(null); setModal(null); setProjectMenu(false);
    setTreeSearch(''); setGlobalQuery(''); setHiddenIds([]); setIsolateId(null); setExplosion(0.32); setView('iso');
    setClipping(false); setXray(false); setShowSupplemental(false); setSupplementReviewIds(null); setActiveConnectionAlternativeIds([]); setShowLabels(true); setShowGrid(true); setInspectorTab('overview'); setSceneReady(false);
    setShowGeometryNormals(false);
    if (workspaceId !== nextWorkspace.id) setOpenGroups(new Set(['torso']));
    setWorkspaceId(nextWorkspace.id); setSnapshotId(nextSnapshotId);
  }
  function openInterfaceDefinition() { setOntologyType('Interface'); setPage('ontology'); }
  function copyViewLink() {
    const url = new URL(location.href);
    const query = new URLSearchParams(url.hash.split('?')[1]);
    const camera = sceneRef.current?.getCameraPose();
    bookmarkCamera.current = camera ?? null;
    if (sceneRef.current?.getInspectionState().active) query.set('inspection', '1'); else query.delete('inspection');
    if (camera) query.set('camera', [...camera.position, ...camera.target].map(n => n.toFixed(7)).join(','));
    url.hash = `explorer?${query}`;
    history.replaceState(null, '', url);
    void copy(url.href, '当前视角与展示状态链接已复制');
  }
  function downloadManifest() {
    if (!data) return;
    const content = { kind: 'psop.workbench.view/1.0', workspaceId, packageId: data.meta.packageId, packageVersion: data.meta.packageVersion, packageDigest: data.meta.packageDigest, snapshotId, sourceCommit: data.meta.sourceCommit, selectedId, geometrySelection, explosion, view, camera: sceneRef.current?.getCameraPose(), hiddenIds, isolateId, showLabels, showGrid, showGeometryNormals, clipping, xray, showSupplementals: showSupplemental, supplementReviewIds, activeConnectionAlternativeIds, inspection: sceneRef.current?.getInspectionState(), supplementalDisplay: sceneRef.current?.getSupplementalDisplay() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'device-view.json'; a.click(); URL.revokeObjectURL(url);
    notify('视图记录已导出到本机');
  }
  function resetScene() { setActiveConnectionAlternativeIds([]); sceneRef.current?.restoreInspection(); setShowGeometryNormals(false); setGeometrySelection(null); pendingGeometryFocus.current = null; setHiddenIds([]); setIsolateId(null); setExplosion(0); setClipping(false); setXray(false); setSceneView('iso'); sceneRef.current?.fitAll(); }

  if (!data || !workspace || !snapshot) return <div className="startup"><BrandMark className="startup-mark" /><h1>PSOP 工作台</h1>{error ? <><p role="alert">{error}</p><small>请核对工作区服务及所选知识版本，再重新加载。</small></> : !catalogLoaded ? <><p>正在读取设备工作区</p><LoaderCircle size={18} className="spin" /></> : !workspaces.length ? <><p>尚无设备工作区</p><small>登记首个设备的 DKP 后，即可浏览知识并使用三个技能的能力。</small></> : !workspace?.snapshots.length ? <><p>此设备尚无知识版本</p><small>由 psop-build 发布并登记 DKP 后，工作台会显示可用内容。</small></> : <><p>正在打开 {workspaceName}</p><LoaderCircle size={18} className="spin" /><small>读取所选 DKP 的知识、来源与模型资产</small></>}
    {catalogLoaded && workspaces.length > 0 && <div className="startup-contexts">{workspaces.map(item => <button className="button secondary" key={item.id} onClick={() => chooseContext(item)}><Box size={14} />{item.name}<small>{item.snapshots.length} 个版本</small></button>)}{workspace && <select aria-label="选择知识版本" value={snapshotId} onChange={event => chooseContext(workspace, event.target.value)}><option value="" disabled>选择可用知识版本</option>{workspace.snapshots.map(item => <option key={item.id} value={item.id}>{item.packageVersion}</option>)}</select>}</div>}
    {!error && workspace && snapshot && loadingSeconds >= 10 && <small role="status">首次打开或内容更新后会校验模型完整性，可能需要几分钟。已等待 {loadingSeconds} 秒；完成后再次打开会更快。</small>}
    {(error || (catalogLoaded && !data)) && <button className="button primary" onClick={() => location.reload()}>重新加载目录</button>}
  </div>;

  const groups = treeMode === 'structure' ? [...new Set([...GROUPS, ...data.parts.map(part => part.group)])] : Object.keys(KIND_LABELS);
  const associated = selected ? data.parts.filter(p => p.body === selected.body && p.id !== selected.id) : [];
  const associatedJoint = selected ? data.joints.find(j => j.body === selected.body) : null;
  const currentNav = NAV.find(n => n.id === page)!;
  const modelSource = data.sources.find(source => source.format.toLowerCase() === 'xml' && data.parts.some(part => part.sourceIds.includes(source.id)));

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className="sidebar" aria-label="主导航">
      <div className="brand"><BrandMark /><div className="brand-copy"><strong>PSOP</strong><span>工作台</span></div><IconButton title={sidebarCollapsed ? '展开导航' : '收起导航'} className="collapse-nav" onClick={() => setSidebarCollapsed(v => !v)}><PanelLeftClose size={15} /></IconButton></div>
      <div className="project-switcher-wrap"><button className="project-switcher" onClick={() => setProjectMenu(v => !v)} aria-label="选择设备工作区" aria-expanded={projectMenu}><span className="project-icon"><Box size={19} /></span><span><strong>{workspaceName}</strong><small>设备工作区</small></span><ChevronDown size={14} /></button>
        {projectMenu && <div className="project-popover workspace-popover"><span className="popover-label">设备工作区 · {workspaces.length}</span>{workspaces.map(item => <button key={item.id} className={item.id === workspaceId ? 'is-selected' : ''} onClick={() => chooseContext(item)}><Box size={17} /><span>{item.name}<small>{item.snapshots.length} 个知识版本</small></span>{item.id === workspaceId && <Check size={16} />}</button>)}<div className="workspace-version-picker"><label htmlFor="workspace-version">当前设备的知识版本</label><select id="workspace-version" aria-label="选择知识版本" value={snapshotId} onChange={event => chooseContext(workspace, event.target.value)}>{workspace.snapshots.map(item => <option key={item.id} value={item.id}>{item.packageVersion} · {item.packageDigest.slice(0, 8)}</option>)}</select></div><p>工作区保留设备的知识、场景与模型版本。</p></div>}
      </div>
      <div className="nav-caption">设备知识</div>
      <nav aria-label="设备知识">{NAV.slice(0, 5).map(n => <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => { setPage(n.id); setProjectMenu(false); }} title={n.label} aria-current={page === n.id ? 'page' : undefined}><n.icon size={18} /><span>{n.label}</span>{n.id === 'sources' && <small>{data.meta.counts.sources}</small>}</button>)}</nav>
      <div className="nav-caption stage-nav-caption">设备能力</div>
      <nav aria-label="三个技能">{NAV.slice(5).map(n => <button key={n.id} className={`nav-item stage-nav-item ${page === n.id ? 'active' : ''}`} onClick={() => { setPage(n.id); setProjectMenu(false); }} title={n.label} aria-current={page === n.id ? 'page' : undefined}><n.icon size={18} /><span>{n.label}</span>{n.id !== 'build' && <span className="stage-pending-dot" title="执行服务待接入" />}</button>)}</nav>
      <div className="sidebar-space" />
      <div className="sidebar-reference"><span className="reference-dot" /><div><strong>v2 知识快照</strong><small>来源与版本分别追踪</small></div><IconButton title="查看知识版本" onClick={() => setModal('versions')}><CircleHelp size={14} /></IconButton></div>
      <button className="sidebar-help" onClick={() => setModal('about')} title="工作台说明与快捷键"><CircleHelp size={17} /><span>工作台说明与快捷键</span><span className="keycap">?</span></button>
      <div className="sidebar-footer"><span className="local-avatar">{workspaceName.slice(0, 1)}</span><span><strong>本地工作区</strong><small>{snapshot.packageVersion}</small></span><span className="online-dot" /></div>
    </aside>

    <main className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button onClick={() => setSidebarCollapsed(v => !v)} aria-label="切换导航" className="top-menu"><Menu size={18} /></button><span>设备工作区</span><ChevronRight size={13} /><button onClick={() => setPage('explorer')}>{workspaceName}</button><ChevronRight size={13} /><strong>{currentNav.label}</strong></div><div className="topbar-actions"><button className="global-search-trigger" onClick={() => setModal('search')}><Search size={15} /><span>搜索知识与资料</span><kbd>Ctrl K</kbd></button><span className="topbar-divider" /><button className="prototype-tag" onClick={() => setModal('about')}><span />统一工作台</button><IconButton title="工作台说明" onClick={() => setModal('about')}><CircleHelp size={17} /></IconButton></div></header>

      {workspace.selectedSnapshotId && snapshot.id !== workspace.selectedSnapshotId && <div className="snapshot-context-notice"><Layers3 size={13} /><span>正在查看保留版本 {snapshot.packageVersion}。工作区当前版本：{workspace.snapshots.find(item => item.id === workspace.selectedSnapshotId)?.packageVersion}</span><button onClick={() => chooseContext(workspace, workspace.selectedSnapshotId)}>打开工作区当前版本<ArrowUpRight size={12} /></button></div>}
      {page === 'explorer' ? <>
        <div className="workspace-heading"><div className="workspace-title"><span className="workspace-device-icon"><Boxes size={23} /></span><div><h1>{workspaceName} <button className="version-chip" onClick={() => setModal('versions')}>{snapshot.packageVersion}<ChevronDown size={11} /></button></h1><p>从部件出发，连接设备知识与原始依据。</p></div></div><div className="workspace-heading-actions">{modelSource && <button className="button subtle source-heading-action" onClick={() => openSource(modelSource.id)}><FileText size={15} />装配来源<ArrowUpRight size={13} /></button>}<button className="button secondary export-view" onClick={downloadManifest}><ArrowDownToLine size={15} />导出视图</button><button className="button primary" onClick={copyViewLink}><Link2 size={15} /><span>复制视图链接</span></button></div></div>
        <div ref={inspectorLayout.workbenchRef} style={inspectorLayout.workbenchStyle} className={`workbench inspector-resizable ${!inspectorLayout.effectiveTreeVisible ? 'tree-closed' : ''} ${!inspectorVisible ? 'inspector-closed' : ''} ${inspectorLayout.stacked ? 'inspector-stacked' : ''}`} data-inspector-width={Math.round(inspectorLayout.width)} data-inspector-preferred-width={inspectorLayout.preferredWidth}>
          {inspectorLayout.effectiveTreeVisible && <section className="structure-panel" aria-label="部件结构">
            <div className="panel-title"><span><FolderTree size={15} />模型结构</span><IconButton title="收起模型结构" onClick={() => setTreeVisible(false)}><PanelLeftClose size={14} /></IconButton></div>
            <div className="structure-tabs"><button className={treeMode === 'structure' ? 'active' : ''} onClick={() => setTreeMode('structure')}>按场景分组</button><button className={treeMode === 'category' ? 'active' : ''} onClick={() => setTreeMode('category')}>按部件类别</button></div>
            <div className="tree-search"><Search size={14} /><input ref={searchRef} value={treeSearch} onChange={e => setTreeSearch(e.target.value)} placeholder="查找部件或 ID" aria-label="查找部件或 ID" />{treeSearch && <button aria-label="清除部件搜索" onClick={() => setTreeSearch('')}><X size={13} /></button>}</div>
            <div className="tree-root"><Boxes size={15} /><strong>{workspaceName}</strong><span>{filteredParts.length}</span></div>
            <div className="tree-scroll">{groups.map(group => {
              const items = filteredParts.filter(p => (treeMode === 'structure' ? p.group : p.kind) === group);
              if (!items.length) return null;
              const open = !!treeSearch || openGroups.has(group);
              return <div className="tree-group" key={group}><button className="tree-group-button" onClick={() => toggleGroup(group)} aria-expanded={open}><ChevronRight size={13} className={open ? 'rotated' : ''} /><span className={`group-dot group-${group}`} /><strong>{treeMode === 'structure' ? GROUP_LABELS[group] || data.parts.find(part => part.group === group)?.groupLabel || group : KIND_LABELS[group as keyof typeof KIND_LABELS]}</strong><small>{items.length}</small></button>
                {open && <div className="tree-items">{items.map(part => <div key={part.id} className={`tree-row ${selectedId === part.id ? 'selected' : ''} ${hiddenIds.includes(part.id) ? 'hidden-part' : ''}`}><button className="tree-select" onClick={() => selectScenePart(part.id)} onDoubleClick={() => sceneRef.current?.focusSelected()} title={`${part.name} · ${part.id}`}><span className="tree-row-branch" />{part.kind === 'actuator' ? <Settings2 size={13} /> : part.kind === 'electronics' ? <Cpu size={13} /> : <Box size={13} />}<span>{part.name}</span><small>{part.id.slice(-2)}</small></button><button className="tree-visibility" title={hiddenIds.includes(part.id) ? '显示部件' : '隐藏部件'} aria-label={`${hiddenIds.includes(part.id) ? '显示' : '隐藏'} ${part.id}`} onClick={() => toggleHidden(part.id)}>{hiddenIds.includes(part.id) ? <EyeOff size={12} /> : <Eye size={12} />}</button></div>)}</div>}
              </div>;
            })}{!filteredParts.length && <div className="tree-empty"><Search size={22} /><strong>没有匹配的部件</strong><p>试试“舵机”、XL330 或部件 ID。</p><button onClick={() => setTreeSearch('')}>清除搜索</button></div>}</div>
            <div className="tree-footer"><span className="tiny-dot" />{data.meta.counts.parts} 个模型可视实例<span title="不代表采购数量">ⓘ</span></div>
          </section>}

          <section className="viewport" ref={viewportRef} aria-label={`${workspaceName} 3D 工作区`}>
            {data.parts.length > 0 ? <SceneCanvas key={`${workspaceId}:${snapshotId}`} ref={sceneRef} data={data} selectedId={selectedId} selection={geometrySelection} hiddenIds={hiddenIds} isolateId={isolateId} explosion={explosion} showLabels={showLabels} showGrid={showGrid} showGeometryNormals={showGeometryNormals} clipping={clipping} xray={xray} showSupplemental={showSupplemental} supplementReviewIds={supplementReviewIds} activeConnectionAlternativeIds={activeConnectionAlternativeIds} onInspectionChange={state => setInspectionActive(state.active)} onSelect={selectScenePart} onSelectSupplement={id => selectGeometry({ kind: 'supplement', id })} onReady={ready} /> : <div className="viewport-no-model"><Box size={37} strokeWidth={1.2} /><strong>当前知识版本没有可显示的模型</strong><p>来源和知识仍可从左侧导航浏览。</p></div>}
            {!!data.analysis?.supplemental_components?.length && <button className={`supplement-visibility-notice ${showSupplemental ? 'is-visible' : ''} ${geometrySelection ? 'with-selection' : ''}`} aria-label="切换参考连接件示意" aria-pressed={showSupplemental} onClick={toggleAllFasteners}><Layers3 size={12} /><span>参考连接件 · {showSupplemental ? supplementReviewIds === null ? `${referenceComponents.length} 件参考示意` : `${visibleFastenerReviewIds.length} 处连接` : '已隐藏'}<small>未确认 BOM</small></span>{showSupplemental ? <Eye size={12} /> : <EyeOff size={12} />}</button>}
            <div className="viewport-context">{!inspectorLayout.effectiveTreeVisible && !inspectorLayout.autoCollapseTree && !inspectorLayout.stacked && <IconButton title="展开模型结构" onClick={() => setTreeVisible(true)}><FolderTree size={17} /></IconButton>}<span className="context-label"><span className="online-dot" />来源参考配置</span><span className="context-dot">/</span><span>qpos0</span></div>
            <div className="viewport-top-actions"><button className="view-selector" onClick={() => setSceneView(view === 'iso' ? 'front' : view === 'front' ? 'right' : view === 'right' ? 'top' : 'iso')}><Box size={14} />{view === 'iso' ? '透视视图' : view === 'front' ? '正视图' : view === 'right' ? '右视图' : '俯视图'}<ChevronDown size={11} /></button>{!inspectorVisible && <IconButton title="展开知识详情" onClick={() => setInspectorVisible(true)}><PanelRightClose size={16} /></IconButton>}</div>
            {isolateId && <div className="isolation-notice"><Eye size={13} />正在隔离选中部件<button onClick={() => setIsolateId(null)}>显示全部<X size={12} /></button></div>}
            {selectedGeometry && <div className={`interface-location-notice ${isolateId ? 'with-isolation' : ''}`}><Focus size={13} /><span>{selectedGeometry.title} · 本件金色 / 对端蓝色</span>{descriptorFeatures(data, selectedGeometry).some(feature => feature.geometry.type === 'plane') && <IconButton className="interface-normal-toggle" title={showGeometryNormals ? '隐藏几何法线' : '显示几何法线'} active={showGeometryNormals} onClick={() => setShowGeometryNormals(value => !value)}><ArrowUpRight size={14} /></IconButton>}<button title="清除几何标注" aria-label="清除几何标注" onClick={() => { setGeometrySelection(null); pendingGeometryFocus.current = null; }}><X size={12} /></button></div>}
            {activeConnectionAlternativeIds.length > 0 && <button className="alternative-visibility-notice" aria-label="关闭待验证方案示意" onClick={() => hideConnectionAlternatives()}>待验证方案 · {activeConnectionAlternativeIds.length} 项 · 关闭示意<X size={12} /></button>}
            <div className="viewport-tools"><IconButton title="适应全部模型" onClick={() => sceneRef.current?.fitAll()}><Scan size={17} /></IconButton><IconButton title="聚焦选中部件 (F)" onClick={() => geometrySelection ? sceneRef.current?.focusGeometry(geometrySelection) : sceneRef.current?.focusSelected()}><Focus size={17} /></IconButton><span /><IconButton title="仅显示选中部件" active={!!isolateId} onClick={() => setIsolateId(v => v ? null : selectedId)}><Eye size={17} /></IconButton><IconButton title="切换部件标签" active={showLabels} onClick={() => setShowLabels(v => !v)}><Tags size={17} /></IconButton><IconButton title="切换透明显示" active={xray} onClick={() => setXray(v => !v)}><Blend size={17} /></IconButton><IconButton title="切换剖切" active={clipping} onClick={() => setClipping(v => !v)}><Scissors size={17} /></IconButton><IconButton title="切换参考网格" active={showGrid} onClick={() => setShowGrid(v => !v)}><Grid2X2 size={17} /></IconButton><span /><IconButton title="重置场景" onClick={resetScene}><RotateCcw size={17} /></IconButton><IconButton title="切换全屏" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else viewportRef.current?.requestFullscreen().catch(() => notify('当前浏览器未允许全屏')); }}><Maximize2 size={17} /></IconButton></div>
            <div className="explosion-dock"><span className="explode-icon"><Layers3 size={18} /></span><div className="explode-value"><strong>爆炸视图</strong><span>{Math.round(explosion * 100)}%</span></div><input type="range" min="0" max="100" value={Math.round(explosion * 100)} aria-label="爆炸展开程度" style={{ '--range-progress': `${explosion * 100}%` } as React.CSSProperties} onChange={e => setExplosion(Number(e.target.value) / 100)} /><button title="复原装配 (E)" aria-label="复原装配" onClick={() => setExplosion(0)}><RotateCcw size={14} /></button><div className="explode-presets"><button className={explosion === 0 ? 'active' : ''} onClick={() => setExplosion(0)}>装配</button><button className={explosion >= 0.6 ? 'active' : ''} onClick={() => setExplosion(0.72)}>展开</button></div></div>
            <div className="viewport-bottom"><span><MousePointer2 size={12} />拖动旋转<span className="hint-divider" />滚轮缩放<span className="hint-divider" />右键平移</span><span className="viewport-scale">模型单位 m</span></div>
          </section>

          {inspectorVisible && <aside className="inspector" aria-label="对象知识详情">{inspectorLayout.separator}<div className="panel-title"><span><Box size={15} />对象详情</span><IconButton title="收起对象详情" onClick={() => setInspectorVisible(false)}><PanelRightClose size={14} /></IconButton></div>
            {selected ? <><div className="object-heading"><div className={`object-symbol kind-${selected.kind}`}>{selected.kind === 'actuator' ? <Settings2 size={25} /> : selected.kind === 'electronics' ? <Cpu size={25} /> : <Box size={25} />}</div><div><span className="object-kind">{KIND_LABELS[selected.kind]}</span><h2>{selected.name}</h2><button className="object-id" onClick={() => copy(selected.id, '对象 ID 已复制')}>{selected.id}<Copy size={11} /></button></div></div><div className="object-badges"><span className="badge teal">模型对象</span><span className="badge neutral">来源已定位</span></div>
              <div className="inspector-tabs" role="tablist" aria-label="对象详情分类">{([['overview', '概览'], ['geometry', '几何'], ['interfaces', '接口'], ['relations', '关联'], ['evidence', '证据']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={inspectorTab === id} className={inspectorTab === id ? 'active' : ''} onClick={() => setInspectorTab(id)}>{label}{id === 'evidence' && <small>{selected.evidenceIds.length}</small>}</button>)}</div>
              <div className="inspector-body" key={`${selected.id}-${inspectorTab}`}>
                {inspectorTab === 'overview' && <><section className="detail-section"><h3>对象信息<span>Part</span></h3><dl className="fact-list"><div><dt>对象域</dt><dd>模型 model</dd></div><div><dt>场景分组</dt><dd>{selected.groupLabel}</dd></div><div><dt>来源刚体</dt><dd>{selected.body}</dd></div><div><dt>几何来源</dt><dd title={selected.meshKey}>{selected.meshKey}.stl</dd></div></dl></section><section className="detail-section"><h3>参考位姿<span>世界坐标</span></h3><div className="coordinate-row">{selected.position.map((n, i) => <div key={i}><span className={`axis-label axis-${i}`}>{['X', 'Y', 'Z'][i]}</span><strong>{(n * 1000).toFixed(2)}</strong><small>mm</small></div>)}</div><p className="field-help">来源模型零位构型，展示偏移单独计算。</p></section><MechanicsSummary data={data} part={selected} selection={geometrySelection} onSelectGeometry={selectGeometry} onSelectPart={selectPart} onOpenSource={openSource} onOpenVersions={() => setModal('versions')} onOpenDetails={() => setInspectorTab('geometry')} onOpenInterfaces={() => setInspectorTab('interfaces')} /><section className="detail-section"><h3>可追溯来源<span>{selected.sourceIds.length} 份</span></h3><div className="source-mini-list">{selected.sourceIds.map(id => { const source = data.sources.find(s => s.id === id); if (!source) return null; return <button key={id} onClick={() => openSource(id, selected.evidenceIds.find(eid => data.evidence.find(e => e.id === eid)?.sourceId === id))}><span className="file-format">{source.format}</span><span>{source.title}</span><ArrowUpRight size={12} /></button>; })}</div></section><div className="scope-note"><CircleHelp size={14} /><p>{data.meta.scope}</p></div></>}
                {inspectorTab === 'geometry' && <GeometryInspector data={data} part={selected} selection={geometrySelection} onSelectGeometry={selectGeometry} onSelectPart={selectPart} onOpenSource={openSource} onOpenVersions={() => setModal('versions')} />}
                {inspectorTab === 'interfaces' && <MechanicsInspector data={data} part={selected} selection={geometrySelection} onSelectGeometry={selection => selectGeometry(selection, 'interfaces')} onInspectRawGeometry={selection => selectGeometry(selection, 'geometry')} onToggleConnectionFasteners={toggleConnectionFasteners} visibleFastenerReviewIds={visibleFastenerReviewIds} activeConnectionAlternativeIds={activeConnectionAlternativeIds} onSelectConnectionAlternative={selectConnectionAlternative} onOpenConnectionReviews={() => setPage('connections')} onSelectPart={selectPart} onOpenSource={openSource} onOpenVersions={() => setModal('versions')} onTransparentInspect={() => setXray(true)} onExplodeInspect={() => setExplosion(.72)} />}
                {inspectorTab === 'relations' && <><section className="detail-section"><h3>机械关系<span>候选与确认分别保存</span></h3>{data.analysis ? <><dl className="fact-list"><div><dt>机制连接候选</dt><dd>{qualifiedConnections(data).filter(item => item.endpoint_refs.some(endpoint => endpoint.part_ref === selected.id)).length}</dd></div><div><dt>已确认连接</dt><dd>{data.analysis.interface_connections?.length ?? 0}</dd></div>{isMountingProfile(data) && <div><dt>已知参考装配</dt><dd>{referenceMountsFor(data, selected.id).length}</dd></div>}</dl><button className="mechanics-detail-link" onClick={() => setInspectorTab('interfaces')}>查看接口机制依据<ChevronRight size={12} /></button></> : <p className="field-help">该版本尚未分析，请从知识版本中选择带接口分析的快照。</p>}</section><section className="detail-section"><h3>来源模型关系<span>不代表机械连接</span></h3><div className="relation-chain"><span><FolderTree size={14} />{selected.body}</span><ChevronDown size={13} /><strong><Box size={14} />{selected.name}</strong><small>来源归属，不代表机械连接</small></div></section>{associatedJoint && <section className="detail-section"><h3>所属刚体的模型关节</h3><button className="joint-reference" onClick={() => openSource(associatedJoint.sourceId)}><Activity size={17} /><span><strong>{associatedJoint.label}</strong><small>{associatedJoint.name}</small></span><ArrowUpRight size={13} /></button><dl className="fact-list"><div><dt>类型</dt><dd>{associatedJoint.type}</dd></div><div><dt>模型范围</dt><dd>{associatedJoint.range.map(n => (n * 180 / Math.PI).toFixed(1)).join(' ~ ')}°</dd></div></dl><p className="field-help">模型参数不直接证明实物机械限位。</p></section>}<section className="detail-section"><h3>同一来源刚体的部件<span>{associated.length}</span></h3>{associated.slice(0, 10).map(p => <button className="related-part" key={p.id} onClick={() => selectScenePart(p.id)}><Box size={14} /><span>{p.name}</span><ChevronRight size={12} /></button>)}{!associated.length && <p className="field-help">当前来源刚体没有其他可视部件。</p>}</section></>}
                {inspectorTab === 'evidence' && <><div className="evidence-intro"><span className="reference-dot" /><p>每项映射都保留原件与具体位置。点击查看对应内容。</p></div>{selected.evidenceIds.map(id => { const evidence = data.evidence.find(e => e.id === id); const source = data.sources.find(s => s.id === evidence?.sourceId); if (!evidence || !source) return null; return <button className="evidence-card" key={id} onClick={() => openSource(source.id, evidence.id)}><div><span className="file-format">{source.format}</span><ArrowUpRight size={14} /></div><strong>{evidence.title}</strong><p>{source.title}</p><small>{evidence.lineStart ? `第 ${evidence.lineStart}${evidence.lineEnd && evidence.lineEnd !== evidence.lineStart ? `–${evidence.lineEnd}` : ''} 行` : evidence.row ? `数据行 ${evidence.row}` : '原件与内容摘要'}<Check size={11} /></small></button>; })}<p className="field-help">这些证据支持包内的来源模型映射，不构成实物装配验收。</p></>}
              </div><div className="inspector-footer"><button className="button secondary" onClick={() => geometrySelection ? sceneRef.current?.focusGeometry(geometrySelection) : sceneRef.current?.focusSelected()}><Focus size={14} />{geometrySelection ? '定位所选几何' : '在场景中聚焦'}</button><IconButton title="复制对象链接" onClick={() => copy(location.href, '对象链接已复制')}><Link2 size={15} /></IconButton></div></> : <div className="inspector-empty"><MousePointer2 size={29} /><strong>选择一个部件</strong><p>从模型或左侧结构中选择，查看知识和来源。</p></div>}
          </aside>}
        </div>
        <footer className="statusbar"><span><span className={sceneReady ? 'online-dot' : 'loading-dot'} />{!data.parts.length ? '当前无模型几何' : sceneReady ? '模型已就绪' : '正在载入几何'}<i />{data.meta.counts.geometries} 份几何<i />{data.meta.counts.parts} 个可视实例{(data.analysis?.supplemental_components?.length || 0) > 0 && <><i /><span className="supplement-status-count">{referenceComponents.length} 件参考连接示意 / {alternativeComponents.length} 件方案示意</span></>}</span><button onClick={() => setModal('versions')}><Layers3 size={12} />{data.meta.snapshot}<ChevronRight size={11} /></button></footer>
      </> : <div className="page-content">{page === 'connections' && <ConnectionReviewPage data={data} onSelectGeometry={selectGeometry} />}{page === 'knowledge' && <KnowledgePage data={data} onSelectPart={selectPart} onOpenSource={openSource} />}{page === 'ontology' && <OntologyPage initialType={ontologyType} onSelectInterface={selectInterface} onSelectGeometry={selectGeometry} onOpenVersions={() => setModal('versions')} data={data} onSelectPart={selectPart} onOpenSource={openSource} />}{page === 'sources' && <SourcesPage data={data} onSelectPart={selectPart} onOpenSource={openSource} />}{page === 'build' && <BuildPage data={data} workspace={workspace} snapshot={snapshot} onSelectSnapshot={id => chooseContext(workspace, id)} onOpenOverview={() => setPage('explorer')} onOpenSources={() => setPage('sources')} />}{(page === 'simulate' || page === 'compile') && <CapabilityPage key={`${workspaceId}:${snapshotId}:${page}`} mode={page} data={data} workspace={workspace} snapshot={snapshot} onOpenOverview={() => setPage('explorer')} />}</div>}
    </main>

    {sourceDialog && <EvidenceDialog data={data} sourceId={sourceDialog.sourceId} evidenceId={sourceDialog.evidenceId} onClose={() => setSourceDialog(null)} onSelectPart={id => { selectPart(id); setSourceDialog(null); }} />}
    {modal === 'search' && <Dialog title="搜索知识与资料" onClose={closeModal} className="search-dialog"><div className="command-input"><Search size={20} /><input autoFocus value={globalQuery} onChange={e => setGlobalQuery(e.target.value)} placeholder="部件、孔径、几何 ID，或资料内容…" aria-label="全局搜索" onKeyDown={e => { if (e.key === 'Enter') { if (searchParts[0]) selectPart(searchParts[0].id); else if (searchGeometry[0]) selectGeometry(searchGeometry[0].selection); } }} /><kbd>Esc</kbd></div><div className="command-results"><div className="command-section-title">{globalQuery ? '匹配部件' : '从一个部件开始'}<span>{searchParts.length}</span></div>{searchParts.map(p => <button className="command-result" key={p.id} onClick={() => selectPart(p.id)}><span className="command-result-icon"><Box size={17} /></span><span><strong>{p.name}</strong><small>{p.groupLabel} / {p.meshKey}</small></span><code>{p.id}</code><ArrowUpRight size={14} /></button>)}{searchGeometry.length > 0 && <><div className="command-section-title">几何证据<span>{searchGeometry.length}</span></div>{searchGeometry.map(item => <button className="command-result" key={item.selection.id} onClick={() => selectGeometry(item.selection)}><span className="command-result-icon"><Focus size={17} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={14} /></button>)}</>}{searchSources.length > 0 && <><div className="command-section-title">来源资料<span>{searchSources.length}</span></div>{searchSources.map(s => <button className="command-result" key={s.id} onClick={() => openSource(s.id)}><span className="command-result-icon"><FileText size={17} /></span><span><strong>{s.title}</strong><small>{s.path}</small></span><ArrowUpRight size={14} /></button>)}</>}{!searchParts.length && !searchSources.length && !searchGeometry.length && <div className="command-empty"><Search size={28} /><strong>没有找到相关内容</strong><p>试试“舵机”“轴承”“XL330”或具体来源名称。</p></div>}</div><div className="command-footer"><span>Enter 打开首个匹配对象</span><span>{workspaceName} · {snapshot.packageVersion}</span></div></Dialog>}
    {modal === 'versions' && <Dialog title="设备知识版本" onClose={closeModal} className="scope-dialog"><div className="scope-dialog-body"><span className="badge teal">{workspaceName} · {snapshot.packageVersion}</span><h3>同一设备，多个可追踪的知识版本。</h3><p>{data.meta.scope}</p><label className="dialog-version-picker">选择知识版本<select aria-label="选择知识版本" value={snapshotId} onChange={event => chooseContext(workspace, event.target.value)}>{workspace.snapshots.map(item => <option value={item.id} key={item.id}>{item.packageVersion} · {item.packageDigest.slice(0, 12)}</option>)}</select></label><div className="scope-rows"><div><Boxes size={20} /><span><strong>来源模型</strong><small>{data.meta.counts.geometries} 份几何、{data.meta.counts.parts} 个可视对象、{data.meta.counts.joints} 个来源关节</small></span><Check size={16} /></div><div><FileText size={20} /><span><strong>原始资料</strong><small>{data.meta.counts.sources} 份来源，{data.meta.counts.evidence} 条定位依据</small></span><span className="badge neutral">范围分别保存</span></div></div><dl className="fact-list"><div><dt>知识包</dt><dd>{data.meta.packageId}</dd></div><div><dt>数据合同</dt><dd>{data.meta.dkpSchema}</dd></div><div><dt>本体目标</dt><dd>{data.meta.ontologyVersion}</dd></div><div><dt>内容摘要</dt><dd><button className="inline-copy" title={data.meta.packageDigest} onClick={() => copy(data.meta.packageDigest)}>{data.meta.packageDigest.slice(0, 16)}…<Copy size={12} /></button></dd></div></dl><button className="button primary" onClick={() => { setPage('build'); setModal(null); }}><Workflow size={15} />查看知识发布记录<ArrowUpRight size={14} /></button></div></Dialog>}
    {modal === 'about' && <Dialog title="关于 PSOP 工作台" onClose={closeModal} className="about-dialog"><div className="about-body"><div className="about-brand"><BrandMark /><div><h3>PSOP 工作台</h3><p>围绕设备组织知识、模拟与模型能力</p></div></div><p>一个工作区对应一个设备。Build 发布版本化 DKP，工作台读取知识与资产；Simulate 和 Compile 在同一工作区中组织场景、语料、模型及评测。当前已接入 DKP 知识浏览，模拟与训练执行服务仍待接入。</p><h4>键盘与鼠标</h4><div className="shortcut-list"><div><span>搜索当前知识版本</span><kbd>Ctrl K</kbd></div><div><span>聚焦选中部件</span><kbd>F</kbd></div><div><span>展开 / 复原模型</span><kbd>E</kbd></div><div><span>退出部件隔离</span><kbd>Esc</kbd></div><div><span>旋转 / 平移 / 缩放</span><small>左键 / 右键 / 滚轮</small></div></div><div className="about-scope"><Check size={15} />浏览不改写已发布知识包；未接入的执行能力单独标明。</div></div></Dialog>}
    {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
  </div>;
}
