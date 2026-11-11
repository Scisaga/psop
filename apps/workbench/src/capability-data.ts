import type { CompatibilityIndex, CompatibilityPairDetail, CompatibilityPairSummary, PartCapabilities, PrototypeData } from './types';

const requests = new Map<string, Promise<unknown>>();
const MAX_CACHED_ASSETS = 96;

/** Resolve package-relative references against the selected snapshot, never the page URL. */
export function capabilityAssetUrl(data: PrototypeData, entry: string): string {
  const explicit = data.assembly?.capability_index?.asset_base;
  const geometry = data.parts.find(part => part.geometryUrl.includes('/assets/'))?.geometryUrl;
  const base = explicit || (geometry ? geometry.slice(0, geometry.indexOf('/assets/') + 8) : '');
  if (!base || !base.startsWith('/api/workspaces/') || !base.endsWith('/assets/')) throw new Error('此快照没有可读取的能力资产入口。');
  const mounted = entry.startsWith(base);
  const relative = mounted ? entry.slice(base.length) : entry;
  if (!relative || relative.startsWith('/') || relative.includes('\\') || relative.includes('?') || relative.includes('#') || /^[a-z]+:/i.test(relative)) throw new Error('能力资产路径必须位于当前知识快照中。');
  let pieces = relative.split('/');
  if (mounted) {
    try { pieces=pieces.map(decodeURIComponent); } catch {throw new Error('能力资产路径编码无效。');}
  }
  if (pieces.some(piece => !piece || piece === '.' || piece === '..' || /[%\u0000/\\]/.test(piece))) throw new Error('能力资产路径包含无效目录。');
  return base + pieces.map(encodeURIComponent).join('/');
}

async function readAsset(data: PrototypeData, entry: string, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new DOMException('能力读取已取消。', 'AbortError');
  const url = capabilityAssetUrl(data, entry);
  const key = data.meta.packageDigest + ':' + url;
  let pending = requests.get(key);
  if (!pending) {
    pending = fetch(url).then(async response => {
      if (!response.ok) throw new Error(`能力详情读取失败（HTTP ${response.status}）。`);
      return response.json();
    }).catch(error => { requests.delete(key); throw error; });
    requests.set(key, pending);
    if (requests.size > MAX_CACHED_ASSETS) requests.delete(requests.keys().next().value!);
  }
  const result = await pending;
  if (signal?.aborted) throw new DOMException('能力读取已取消。', 'AbortError');
  return result;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('能力详情不是有效对象。');
  return value as Record<string, unknown>;
}

export async function loadPartCapabilities(data: PrototypeData, ownerRef: string, signal?: AbortSignal): Promise<PartCapabilities | null> {
  const entry = data.assembly?.capability_index?.parts[ownerRef];
  if (!entry) return null;
  const detail = object(await readAsset(data, entry.path, signal));
  if (detail.schema !== 'psop.part-capabilities/1' || detail.owner_ref !== ownerRef || !Array.isArray(detail.features) || !Array.isArray(detail.interfaces)) throw new Error('部件能力详情与当前部件不一致。');
  if ([...detail.features, ...detail.interfaces].some(item => !item || item.owner_ref !== ownerRef)) throw new Error('部件能力详情包含其他部件的几何。');
  return detail as unknown as PartCapabilities;
}

export function mergePartCapabilities(data: PrototypeData, detail: PartCapabilities): PrototypeData {
  if (!data.assembly || data.assembly.loaded_capability_parts?.includes(detail.owner_ref)) return data;
  if (!data.parts.some(part => part.id === detail.owner_ref)) throw new Error('能力详情所属部件不在当前快照中。');
  const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]) => [...new Map([...existing, ...incoming].map(item => [item.id, item])).values()];
  return {
    ...data,
    evidence: mergeById(data.evidence, detail.evidence ?? []),
    assembly: {
      ...data.assembly,
      features: mergeById(data.assembly.features, detail.features),
      interfaces: mergeById(data.assembly.interfaces, detail.interfaces),
      connections: mergeById(data.assembly.connections, (detail.reference_connections ?? []).filter(item => item.endpoints?.every(endpoint => typeof endpoint.interface_ref === 'string'))),
      loaded_capability_parts: [...(data.assembly.loaded_capability_parts ?? []), detail.owner_ref],
    },
  };
}

export async function loadCompatibilityIndex(data: PrototypeData, signal?: AbortSignal): Promise<CompatibilityIndex | null> {
  const path = data.assembly?.capability_index?.compatibility.index_path;
  if (!path) return null;
  const result = object(await readAsset(data, path, signal));
  if (!['psop.compatibility-index/1','psop.compatibility-index/2'].includes(String(result.schema)) || !Array.isArray(result.pairs)) throw new Error('兼容候选目录格式不完整。');
  return result as unknown as CompatibilityIndex;
}

export async function loadCompatibilityPair(data: PrototypeData, pair: CompatibilityPairSummary, signal?: AbortSignal): Promise<CompatibilityPairDetail> {
  const result = object(await readAsset(data, pair.path, signal));
  if (!['psop.compatibility-pair/1','psop.compatibility-pair/2'].includes(String(result.schema)) || !Array.isArray(result.owner_refs) || !Array.isArray(result.candidates) || result.owner_refs.length !== 2 || result.owner_refs.some((owner, index) => owner !== pair.owner_refs[index])) throw new Error('兼容候选详情与所选部件对不一致。');
  return result as unknown as CompatibilityPairDetail;
}
