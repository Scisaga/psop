"""Independent finite raw-triangle reference contact inventory, not interface discovery."""
import argparse, collections, gzip, hashlib, json, math, struct, sys, time
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dkp',type=Path,default=Path('build/microduck/source-1.15/microduck-capabilities-9.dkp'))
parser.add_argument('--output',type=Path,default=Path('.runtime/original-installation-audit/planar-review.json'))
parser.add_argument('--maximum-gap-mm',type=float,default=.6)
args=parser.parse_args()
if not 0 < args.maximum_gap_mm <= 2:parser.error('maximum gap must be within (0, 2] mm')
ROOT=args.dkp.resolve(strict=True)
OUT=args.output.resolve()
if OUT.is_relative_to(ROOT):parser.error('Audit output must be outside the immutable DKP')
OUT.parent.mkdir(parents=True,exist_ok=True)
GAP=args.maximum_gap_mm/1000
PRUNE_GAP=max(GAP,.000251)+.00001
START=time.perf_counter()
scene=json.loads((ROOT/'indexes/scene.json').read_text(encoding='utf-8'))
authored=json.loads((ROOT/'sources/SRC-MD-ASSEMBLY-CATALOG.json').read_text(encoding='utf-8'))
parts={p['id']:dict(p) for p in scene['parts']}
if any(any(abs(s-1)>1e-12 for s in p['scale']) for p in parts.values()):raise ValueError('This reference audit requires unit source scales')
for p in scene.get('reference_alignment',{}).get('placements',[]):parts[p['part_ref']]['position']=p['position']

def sub(a,b):return [x-y for x,y in zip(a,b)]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def length(a):return math.sqrt(dot(a,a))
def unit(a):return [x/length(a) for x in a]
def rotate(q,v):
 x,y,z,w=q;a,b,c=v
 return [(1-2*(y*y+z*z))*a+2*(x*y-z*w)*b+2*(x*z+y*w)*c,2*(x*y+z*w)*a+(1-2*(x*x+z*z))*b+2*(y*z-x*w)*c,2*(x*z-y*w)*a+2*(y*z+x*w)*b+(1-2*(x*x+y*y))*c]
def world(p,v):return [x+y for x,y in zip(p['position'],rotate(p['quaternion'],[x*y for x,y in zip(v,p['scale'])]))]
def bounds(vs):return [[min(v[k] for v in vs),max(v[k] for v in vs)] for k in range(3)]
def near(a,b,gap):return all(a[k][0]<=b[k][1]+gap and b[k][0]<=a[k][1]+gap for k in range(3))
def cross2(a,b):return a[0]*b[1]-a[1]*b[0]
def intersect(a,b):
 if cross2(sub(b[1],b[0]),sub(b[2],b[0]))<0:b=list(reversed(b))
 poly=list(a)
 for p,q in zip(b,b[1:]+b[:1]):
  if not poly:return 0.
  output=[];edge=sub(q,p)
  for start,end in zip(poly,poly[1:]+poly[:1]):
   ds=cross2(edge,sub(start,p));de=cross2(edge,sub(end,p));inside=ds>=-1e-16
   if inside:output.append(start)
   if inside!=(de>=-1e-16):
    t=ds/(ds-de);output.append([x+t*(y-x) for x,y in zip(start,end)])
  poly=output
 return abs(sum(cross2(a,b) for a,b in zip(poly,poly[1:]+poly[:1])))/2 if len(poly)>=3 else 0.

mesh_cache={};geometries={};source_locks={}
for p in parts.values():
 raw=(ROOT/p['geometryUrl']).read_bytes();sha=hashlib.sha256(raw).hexdigest();source_locks[p['geometryUrl']]=sha
 if sha not in mesh_cache:
  faces=[]
  for i in range(struct.unpack_from('<I',raw,80)[0]):
   values=struct.unpack_from('<12fH',raw,84+i*50);vs=[values[j:j+3] for j in (3,6,9)]
   nv=cross(sub(vs[1],vs[0]),sub(vs[2],vs[0]));area=length(nv)/2
   if area>1e-14:faces.append((i,vs,unit(nv),area))
  mesh_cache[sha]=faces
 groups=collections.defaultdict(list);allvs=[]
 for i,vs,n,area in mesh_cache[sha]:
  wvs=[world(p,v) for v in vs];wn=unit(rotate(p['quaternion'],n));allvs.extend(wvs)
  key=tuple(round(v/1e-5) for v in wn)+(round(dot(wn,wvs[0])/2e-7),)
  groups[key].append({'id':i,'vertices':wvs,'normal':wn,'area':area,'bounds':bounds(wvs)})
 regions=[]
 for ts in groups.values():
  area=sum(t['area'] for t in ts)
  if area<2e-6:continue
  vs=[v for t in ts for v in t['vertices']];normal=ts[0]['normal'];origin=ts[0]['vertices'][0]
  if any(abs(dot(sub(v,origin),normal))>2e-6 for v in vs):continue
  regions.append({'normal':normal,'origin':origin,'area_m2':area,'triangles':ts,'bounds':bounds(vs)})
 geometries[p['id']]={'bounds':bounds(allvs),'regions':regions}
print(json.dumps({'stage':'raw_regions','parts':len(parts),'meshes':len(mesh_cache),'regions':sum(len(g['regions']) for g in geometries.values())}),flush=True)

ix={i['id']:i for i in authored['catalog']['interfaces']};fs={f['id']:f for f in authored['catalog']['features']}
claimed=collections.defaultdict(set)
for i in ix.values():
 for m in i['members']:
  for ref in m['feature_refs']:claimed[i['owner_ref']].update(fs[ref]['geometry']['triangle_indices'])
existing=collections.defaultdict(list)
for c in authored['catalog']['connections']:
 owners=sorted({ix[e['interface_ref']]['owner_ref'] for e in c['endpoints']})
 if len(owners)==2:existing[tuple(owners)].append(c['id'])

observations=[];pair_checks=[]
for ai,a in enumerate(sorted(parts)):
 for b in sorted(parts)[ai+1:]:
  ga,gb=geometries[a],geometries[b]
  if not near(ga['bounds'],gb['bounds'],PRUNE_GAP):
   pair_checks.append({'owner_refs':[a,b],'status':'no_nearby_source_bounds_for_planar_review'});continue
  count=0
  for ar in ga['regions']:
   for br in gb['regions']:
    if not near(ar['bounds'],br['bounds'],PRUNE_GAP) or dot(ar['normal'],br['normal'])>-.999999:continue
    gap=dot(sub(br['origin'],ar['origin']),ar['normal'])
    if gap<-.000251 or gap>GAP+1e-9:continue
    normal=ar['normal'];helper=min(([1,0,0],[0,1,0],[0,0,1]),key=lambda v:abs(dot(v,normal)));u=unit(cross(normal,helper));v=cross(normal,u)
    projected=[]
    for region in (ar,br):
     projected.append([(t['id'],[[dot(sub(p,ar['origin']),d) for d in (u,v)] for p in t['vertices']],t['bounds']) for t in region['triangles']])
    area=0.;idsa=set();idsb=set()
    for ti,ta,tbounds in projected[0]:
     for ui,tb,ubounds in projected[1]:
      if not near(tbounds,ubounds,PRUNE_GAP):continue
      if any(max(p[k] for p in ta)<min(p[k] for p in tb) or max(p[k] for p in tb)<min(p[k] for p in ta) for k in (0,1)):continue
      value=intersect(ta,tb)
      if value<1e-12:continue
      area+=value;idsa.add(ti);idsb.add(ui)
    if area<.5e-6:continue
    count+=1
    observations.append({'owner_refs':[a,b],'source_paths':[parts[a]['geometryUrl'],parts[b]['geometryUrl']],'normal_a':normal,
      'gap_m':gap,'finite_projected_overlap_m2':area,'source_triangle_indices':[sorted(idsa),sorted(idsb)],
      'region_bounds_m':[ar['bounds'],br['bounds']],
      'functional_triangle_coverage':[len(idsa&claimed[a])/len(idsa),len(idsb&claimed[b])/len(idsb)],'existing_reference_connection_refs':existing.get((a,b),[])})
  pair_checks.append({'owner_refs':[a,b],'status':'finite_observations' if count else 'no_parallel_finite_overlap_in_declared_window','count':count})
 if ai%10==0:print(json.dumps({'stage':'pairs','completed_parts':ai,'observations':len(observations)}),flush=True)
report={'schema':'psop.raw-reference-surface-review/1','source_package_digest':json.loads((ROOT/'manifest.json').read_text())['package_digest'],
 'configuration_ref':scene['reference_alignment']['configuration_ref'],'method':'Raw source STL triangle normals, world reference transforms, actual finite projected polygon intersection; source AABBs only prune reference observation work, never compatibility candidates',
 'parameters':{'plane_normal_bin':1e-5,'plane_offset_bin_m':2e-7,'minimum_region_area_m2':2e-6,'minimum_overlap_m2':.5e-6,'gap_range_m':[-.000251,GAP]},
 'limits':['Only nearby opposed finite planar regions; curved/key/elastic structures need separate review','Overlap is a geometric observation, not a physical contact, fixing or functional-interface declaration'],
 'configuration_placements':[{'owner_ref':p['id'],'position':p['position'],'quaternion':p['quaternion']} for p in sorted(parts.values(),key=lambda p:p['id'])],
 'source_locks':source_locks,'parts':[{'id':p['id'],'mesh':p['meshKey'],'reviewed_triangle_count':len(mesh_cache[source_locks[p['geometryUrl']]]),'retained_planar_regions':len(geometries[p['id']]['regions'])} for p in parts.values()],
 'pair_checks':pair_checks,'observations':observations,'seconds':time.perf_counter()-START}
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'ok':True,'observations':len(observations),'pairs':len(pair_checks),'seconds':report['seconds'],'output':str(OUT)}))
