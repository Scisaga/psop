"""Curate Microduck reference-use corrections from the independent raw review.

Device-specific semantic input authoring, never a generic geometry detector.
Replay requires an explicit archived capabilities.3 baseline. Normal catalog
maintenance uses author_microduck.py with the retained current package.
"""
import argparse
from collections import defaultdict
from copy import deepcopy
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'skills/psop-build/scripts'))
from psop_build_v2.assembly_catalog import validate_input
from psop_build_v2 import mechanics as m

TARGET=REPO/'device-materials/microduck-assembly-interfaces.json'
DIRECTORY=Path(__file__).resolve().parent

def read(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(raw):return hashlib.sha256(raw).hexdigest()
def write(p,value):p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def upsert(rows,item):
 for i,old in enumerate(rows):
  if old['id']==item['id']:rows[i]=item;return item
 rows.append(item);return item
def owner(short):return 'part:microduck:'+short
def iid(part,key):return 'interface:assembly:'+part.rsplit(':',1)[-1]+':'+key
def cid(part,key):return 'connection:assembly:'+part.rsplit(':',1)[-1]+':'+key

def main(base, surface_review):
 BASE=Path(base).resolve(strict=True)
 if read(BASE/'manifest.json')['package_version']!='2.0.0-capabilities.3':
  raise ValueError('Historical reference-use authoring requires the archived capabilities.3 baseline')
 scene=read(BASE/'indexes/scene.json');parts={p['id']:p for p in scene['parts']};sources={s['id']:s for s in scene['sources']}
 value=read(TARGET);catalog=value['catalog'];before=read(BASE/'sources/SRC-MD-ASSEMBLY-CATALOG.json')['catalog']
 raw_review=read(Path(surface_review))
 corrected={p['part_ref']:p for p in scene.get('reference_alignment',{}).get('placements',[])}
 raw_review['configuration_placements']=[{'owner_ref':p['id'],'position':corrected.get(p['id'],p)['position'],'quaternion':p['quaternion']} for p in sorted(scene['parts'],key=lambda p:p['id'])]
 raw_review_path=DIRECTORY/'reference-surface-observations.json';write(raw_review_path,raw_review)
 details={p['id']:json.loads(gzip.decompress((BASE/scene['assembly']['capability_index']['parts'][p['id']]['path']).read_bytes())) for p in scene['parts']}
 measured={p:[f for f in d['features'] if f.get('basis')=='mesh_measurement'] for p,d in details.items()}
 original_interfaces={i['id']:i for i in before['interfaces']}
 pairs=defaultdict(list)
 for observation in raw_review['observations']:pairs[tuple(observation['owner_refs'])].append(observation)
 evidence_id='evidence:assembly:reference-use:raw-functional-review'
 upsert(value['evidence'],{'id':evidence_id,'sourceId':'SRC-MD-ASSEMBLY-CATALOG','kind':'source-geometry',
  'title':'70 个来源实例的壳体承接、定位和原装用法复核',
  'excerpt':'独立遍历原始 STL 有限面区并核对功能结构。区分端盘传动、壳体承托/限位、孔组紧固、轴承支承及仅留隙邻接；原装配关系不以孔壁计数或三角面覆盖率代替。尺寸为源网格测量，未补造螺钉规格、夹紧力或路径验证。'})
 witnesses=[];new_connections=[];body_members={};body_pairs={};feature_map={}
 def clone(f,key):
  identity='feature:assembly:'+f['owner_ref'].rsplit(':',1)[-1]+':'+key
  item={k:deepcopy(f[k]) for k in ('owner_ref','geometry_source_ref','geometry_digest','kind','geometry')};item['id']=identity
  upsert(catalog['features'],item);feature_map[identity]=item;return item
 def surface(f):return clone(f,'use_surface_'+f['id'].rsplit(':',1)[-1])
 def interface(part,key,name,summary,members,note,purpose=None):
  identity=iid(part,key)
  item={'id':identity,'owner_ref':part,'key':key,'name':name,'purpose':purpose or name,'geometry_summary':summary,
   'members':[{**x,'id':identity+':'+x['key']} for x in members],
   'selection':{'kind':'unspecified'},'origin':'project_inference','evidence_refs':[evidence_id],'note':note}
  for member in item['members']:member.pop('key')
  return upsert(catalog['interfaces'],item)
 def member(key,label,fs):
  weights=[max(f['geometry'].get('area_m2',1.),1e-12) for f in fs];total=sum(weights)
  return {'key':key,'label':label,'feature_refs':[f['id'] for f in fs],
   'position':[sum(f['geometry']['origin'][k]*w for f,w in zip(fs,weights))/total for k in range(3)],
   'direction':fs[0]['geometry'].get('normal',fs[0]['geometry'].get('axis'))}
 def connection(part,key,name,mechanism,basis,a,am,b,bm,note):
  item={'id':cid(part,key),'name':name,'mechanism':mechanism,'basis':basis,
   'endpoints':[{'interface_ref':a['id'],'member_refs':[a['id']+':'+k for k in am]},
                {'interface_ref':b['id'],'member_refs':[b['id']+':'+k for k in bm]}],
   'evidence_refs':[evidence_id],'note':note}
  upsert(catalog['connections'],item);new_connections.append(item);return item
 def matching(part,indices,normal=None):
  ts=set(indices);found=[]
  for f in measured[part]:
   g=f['geometry']
   if g['type']!='plane' or not ts.intersection(g['triangle_indices']):continue
   if normal is not None and m._dot(g['normal'],normal)<.9999:continue
   found.append(f)
  covered={t for f in found for t in f['geometry']['triangle_indices']}
  missing=sorted(ts-covered)
  if missing:
   # Preserve the exact clipped material when a strict analytic plane partition
   # leaves tessellation slivers in a residual region. Never fill the region.
   raw=(BASE/parts[part]['geometryUrl']).read_bytes();points=[];normals=[]
   for index in missing:
    values=struct.unpack_from('<12fH',raw,84+index*50);vs=[values[j:j+3] for j in (3,6,9)];points.extend(vs)
    normals.append(m._cross(m._sub(vs[1],vs[0]),m._sub(vs[2],vs[0])))
   nv=[sum(v[k] for v in normals) for k in range(3)];le=m._length(nv);assert le>0
   sid=next(sid for sid in parts[part]['sourceIds'] if sources[sid]['url']==parts[part]['geometryUrl'])
   found.append({'id':'raw-region:'+sha(json.dumps(missing).encode())[:20],'owner_ref':part,
    'geometry_source_ref':sid,'geometry_digest':'sha256:'+sources[sid]['digest'],'kind':'surface_region',
    'geometry':{'type':'source_region','origin':[sum(v[k] for v in points)/len(points) for k in range(3)],
     'normal':[v/le for v in nv],'triangle_indices':missing}})
  return found
 def add_witness(interface_ref,part,indices):
  witnesses.append({'interface_ref':interface_ref,'owner_ref':part,'triangle_indices':sorted(set(indices)),'minimum_coverage':1.})

 # Six casing sides are a capability of every source servo, independently of
 # its original mate. Split positive-X material remains two actual face patches.
 dimensions=[(0,-.0115,-1,'x_minus','壳体 X−侧面'),(0,.0115,1,'x_plus','壳体 X+侧肩面'),
  (1,-.010,-1,'y_minus','壳体 Y−大面'),(1,.010,1,'y_plus','壳体 Y+大面'),
  (2,-.0245,-1,'z_minus','壳体 Z−端面'),(2,.0095,1,'z_plus','壳体 Z+端面')]
 body_features={}
 for part in (p['id'] for p in scene['parts'] if p['meshKey']=='xl330'):
  members=[];body_members[part]={};body_features[part]={}
  for axis,coordinate,sign,key,label in dimensions:
   fs=[f for f in measured[part] if f['geometry']['type']=='plane' and
     f['geometry']['normal'][axis]*sign>.999999 and abs(f['geometry']['origin'][axis]-coordinate)<2e-7]
   assert fs,(part,key)
   cloned=[surface(f) for f in fs];members.append(member(key,label,cloned));body_members[part][key]=cloned;body_features[part][key]=fs
  body=interface(part,'servo_body_seating','壳体承托与限位接口','23 × 20 × 34 壳体外形 · 六侧有限面',members,
   '壳体外形承接能力与端盘四孔、壳体 A/B 侧安装孔分别保留。有限壁面可用于承托和止挡；不把普通面自动认定为固定，也不推定摩擦预紧。')
  for key,fs in body_members[part].items():add_witness(body['id'],part,[t for f in fs for t in f['geometry']['triangle_indices']])

 # Restrict promotion to known stator mounts and the separately inspected
 # dual-servo head cradle. Moving end-disk neighbors remain observations.
 allowed=set()
 for c in before['connections']:
  for e in c['endpoints']:
   i=original_interfaces[e['interface_ref']]
   if i['key'] in {'servo_housing_a','servo_housing_b'}:
    peer=next(original_interfaces[x['interface_ref']]['owner_ref'] for x in c['endpoints'] if x['interface_ref']!=i['id'])
    allowed.add((i['owner_ref'],peer))
 head_servos=[owner('50f0c376d01bb0c1'),owner('96e22c7fa2b976d3')];support=owner('986b5adf27910138');lower=owner('52fdcacf474a463f');top=owner('82d68e991b23c2a3');face=owner('afa52198f7fad203')
 allowed.update((p,h) for p in head_servos for h in (support,lower))
 current_interfaces=lambda:{i['id']:i for i in catalog['interfaces']}
 for servo,host in sorted(allowed):
  rows=[];source_pair=tuple(sorted([servo,host]));side=source_pair.index(servo)
  for o in pairs.get(source_pair,[]):
   indices=set(o['source_triangle_indices'][side]);key=next((k for k,fs in body_features[servo].items() if indices<=set(t for f in fs for t in f['geometry']['triangle_indices'])),None)
   if key is not None:rows.append((o,key))
  if not rows:continue
  keys=list(dict.fromkeys(k for _,k in rows));peer_members=[]
  for key in keys:
   indices={t for o,k in rows if k==key for t in o['source_triangle_indices'][1-side]}
   fs=[surface(f) for f in matching(host,indices)];peer_members.append(member(key,'承接'+next(d[4] for d in dimensions if d[3]==key),fs))
  label='喙部舵机' if servo==head_servos[0] else '头部横滚舵机' if servo==head_servos[1] else '舵机'
  hi=interface(host,'servo_body_'+servo.rsplit(':',1)[-1]+'_seat',label+'壳体承座与限位',
   str(len(keys))+' 向有限承接面 · 与安装孔分开',peer_members,
   '按有限承托、端部止挡及侧肩解释壳体定位，保留设计间隙。固定须结合该支架/壳体原有连接；不据单一贴靠面宣称已夹紧。')
  for o,key in rows:add_witness(hi['id'],host,o['source_triangle_indices'][1-side])
  bi=current_interfaces()[iid(servo,'servo_body_seating')]
  is_corrected=host==lower and servo in head_servos
  c=connection(servo,'body_seating_'+host.rsplit(':',1)[-1],label+'壳体与'+parts[host]['name']+'承接',
   '壳体有限面承托、端部止挡与侧壁限位','hypothesis' if is_corrected else 'source_fit',bi,keys,hi,keys,
   ('来源位置有已记录的小偏差；修正配置恢复承托关系。' if is_corrected else '来源有限面及真实边界支持本方壳体承接。')+
   '壳体安装孔、端盘传动孔和这些承托面是不同接口；紧固选孔、规格与保持条件分别保留。')
  body_pairs[(servo,host)]={'interface':hi,'connection':c,'rows':rows}

 # The facial plate is registered in the lower shell and retained by the
 # closed shell arrangement; adjacent optical envelopes are not screw mounts.
 face_connections=[]
 for host,key,name in [(lower,'face_lower_registration','面部件下部槽口定位'),(top,'face_upper_registration','面部件上部槽口配合')]:
  pair=tuple(sorted([face,host]));side=pair.index(face);rows=pairs[pair];f_members=[];h_members=[]
  for j,o in enumerate(rows):
   af=[surface(f) for f in matching(face,o['source_triangle_indices'][side])];bf=[surface(f) for f in matching(host,o['source_triangle_indices'][1-side])]
   f_members.append(member('region_'+str(j+1),'边缘定位面 '+str(j+1),af));h_members.append(member('region_'+str(j+1),'槽口承接面 '+str(j+1),bf))
  fi=interface(face,key,name,'有限边缘与槽口 · 保留设计间隙',f_members,'面部件边缘进入头壳定位区，须结合上下壳闭合解释；不把侧壁间隙当作错误或已夹紧证据。')
  hi=interface(host,key,name+'承座','有限槽口与承接面',h_members,'独立于闭合螺钉孔的板边承接结构。')
  for o in rows:add_witness(fi['id'],face,o['source_triangle_indices'][side]);add_witness(hi['id'],host,o['source_triangle_indices'][1-side])
  keys=['region_'+str(j+1) for j in range(len(rows))]
  c=connection(face,key,name,'板边与有限槽口的复合定位','hypothesis' if host==lower else 'source_fit',fi,keys,hi,keys,
   '有限边缘/侧壁有相应投影范围；约0.2 mm侧向设计间隙与靠面分别表达。闭壳限位不等于已核定预紧力。')
  face_connections.append((host,c,rows,fi,hi))

 # Publish the actual shell seam independently of its three screw receivers.
 closure=read(REPO/'build/reference-alignment-review/closure-planes.json')
 shell_rows=[row for row in closure['opposed_finite_contact_pairs'] if abs(row['after_gap_mm'])<.00002]
 shell_interfaces={}
 for part,field in [(top,'feature_a_ref'),(lower,'feature_b_ref')]:
  lookup={f['id']:f for f in measured[part]};members=[]
  for j,row in enumerate(shell_rows):
   f=surface(lookup[row[field]]);members.append(member('seam_'+str(j+1),'有限闭合面 '+str(j+1),[f]))
  shell_interfaces[part]=interface(part,'head_shell_seam','头壳有限闭合与承接面','五组闭合面 · 与闭合孔分开',members,
   '上游参考平移使这些实际有限面重叠；工程推断修正后恢复名义贴合。台阶设计间隙不强行消除。')
  for row in shell_rows:add_witness(shell_interfaces[part]['id'],part,next(w['triangle_indices'] for w in row['witnesses'] if w['feature_ref']==row[field]))
 seam=connection(lower,'head_shell_seam','上下头壳有限闭合面','有限闭合面落座与边缘承接','hypothesis',shell_interfaces[top],['seam_'+str(j+1) for j in range(len(shell_rows))],shell_interfaces[lower],['seam_'+str(j+1) for j in range(len(shell_rows))],
  '原始来源约0.2 mm偏移与修正配置分别保留；这些面提供闭合基准，原有三处闭合孔另行表达。')

 # The knee output pattern was present as an Interface but had no Connection.
 # The 45-degree source phase is not a hole-spacing or stator-mount mismatch.
 for servo,leg in [(owner('4cf80d5a57c8cb04'),owner('638f29b46b322e64')),(owner('7038a050dbc33fb0'),owner('7f4fefc3c6de90f1'))]:
  ix=current_interfaces();si=ix[iid(servo,'servo_end_minus')];li=ix[iid(leg,'upper_servo_four_holes')]
  connection(leg,'knee_output_drive','膝部端盘与小腿上端四孔','PCD12 四孔端盘传动，安装相位约45°','source_assembly',si,[],li,[],
   '来源关节拓扑、同轴支承及相同孔组几何支持膝部传动对端；qpos0 的孔组相位约差45°，保持为端盘安装相位条件，不逐孔独立配准，不编造共同装配姿态或实际螺钉数量。')

 # A simplified speaker box only establishes a witnessed placement/contact
 # hypothesis. It cannot supply absent tabs, adhesive or screw geometry.
 speaker=owner('22f2cd114e324ec5');roll=head_servos[1];obs=pairs[tuple(sorted([speaker,roll]))][0];side=obs['owner_refs'].index(speaker)
 fs=[surface(f) for f in matching(speaker,obs['source_triangle_indices'][side])]
 spi=interface(speaker,'proxy_contact_face','包络贴靠面（固定方式待核）','简化外形面 · 约507 mm²投影重叠',[member('contact','来源包络贴靠面',fs)],
  '仅有六面包络和来源放置关系；没有可确认的卡扣、螺孔或胶接工艺，不声称扬声器已固定。')
 bi=current_interfaces()[iid(roll,'servo_body_seating')]
 speaker_connection=connection(speaker,'proxy_contact','扬声器包络与横滚舵机壳面贴靠候选','有限包络贴靠；固定方式未知','hypothesis',spi,['contact'],bi,['y_plus'],
  '原始来源的水平相向面名义贴靠，有限投影约506.9 mm²；这只解释放置位置，实际安装结构和保持方式仍缺失。')
 add_witness(spi['id'],speaker,obs['source_triangle_indices'][side])

 # Extend the existing correction with independently checked neighboring faces.
 adjustment_path=DIRECTORY/'reference-adjustments.json';adjustments=read(adjustment_path);action=adjustments['actions'][0]
 presentation=adjustments['presentation'];constraints=action['constraints']
 def adjustment_connection(c,checks):
  update={'connection_ref':c['id'],'basis':'inferred_fit','check_refs':checks,
   'note':'修正配置下有限承接面已复核；原始来源位置及其冲突单独保留。结构角色已明确，实际紧固规格、预紧及路径仍按各自依据核定。'}
  for j,x in enumerate(presentation['connections']):
   if x['connection_ref']==c['id']:presentation['connections'][j]=update;break
  else:presentation['connections'].append(update)
 def contact_constraint(identity,af,bf,minimum):
  item={'id':identity,'role':'neighbor','kind':'plane_contact','feature_a_ref':af,'feature_b_ref':bf,'target_gap_m':0.,'minimum_overlap_area_m2':minimum}
  upsert(constraints,item);return identity
 adjustment_connection(body_pairs[(head_servos[0],lower)]['connection'],['servo-bottom-seating'])
 def canonical_pair(o):
  aa=matching(o['owner_refs'][0],o['source_triangle_indices'][0]);bb=matching(o['owner_refs'][1],o['source_triangle_indices'][1])
  return max(aa,key=lambda f:len(set(f['geometry']['triangle_indices'])&set(o['source_triangle_indices'][0]))),max(bb,key=lambda f:len(set(f['geometry']['triangle_indices'])&set(o['source_triangle_indices'][1])))
 pair=body_pairs[(roll,lower)];row=next(o for o,key in pair['rows'] if key=='y_minus' and abs(o['gap_m'])<2e-8);af,bf=canonical_pair(row)
 adjustment_connection(pair['connection'],[contact_constraint('head-roll-servo-bottom-seating',af['id'],bf['id'],.5*row['finite_projected_overlap_m2'])])
 seam_checks=[]
 for j,row in enumerate(shell_rows):seam_checks.append(contact_constraint('head-shell-seam-'+str(j+1),row['feature_a_ref'],row['feature_b_ref'],.5*row['area_mm2']*1e-6))
 adjustment_connection(seam,seam_checks)
 for host,c,rows,fi,hi in face_connections:
  if host!=lower:continue
  row=next(o for o in rows if abs(o['gap_m'])<2e-8);af,bf=canonical_pair(row)
  adjustment_connection(c,[contact_constraint('face-lower-registration-seating',af['id'],bf['id'],.5*row['finite_projected_overlap_m2'])])
 # Lock all newly checked owners' source bytes as well as the original locks.
 all_features={f['id']:f for d in details.values() for f in d['features']}
 for check in constraints:
  for k in ('feature_a_ref','feature_b_ref'):
   sid=all_features[check[k]]['geometry_source_ref'];adjustments['source_locks'][sid]=sources[sid]['digest']
 write(adjustment_path,adjustments)

 # Independent expected functional inventory: frozen authored baseline plus
 # this raw-source semantic review, never counts from a new producer run.
 ix=current_interfaces();connections={c['id']:c for c in catalog['connections']};part_reviews=[]
 general={
  'motor_support':'该支架同时承接喙部、头部横滚两颗舵机的壳体，通过有限端面、侧壁及肩面定位；支架自身四孔接口连接头部下壳，与舵机端盘四孔是两回事。',
  'bottom_head_shell':'下壳承接两颗头部舵机、喙部支承轴承和两侧横滚轴承，提供面部件定位槽及闭壳承接面；支架安装孔、上下壳闭合孔分别表达。',
  'top_head_shell':'上壳通过闭合孔与下壳连接，有限闭合面提供落座基准，槽口与面部件边缘配合；舵机附近的留隙面不自动成为固定连接。',
  'face_part':'面部件边缘由下壳槽口定位并与上壳槽口配合；眼环平环在正面承接，板件通过四角安装区与其关联。',
  'speaker':'输入只提供扬声器六面包络，来源位置贴靠头部横滚舵机壳面。已明确其几何位置，但实际固定结构尚未给出。',
  'm12_lens_holder':'镜头座主孔承接镜筒，两个安装孔保留独立能力；输入缺少可确认的相机板安装对端，不能把附近主控板包络当作已匹配对端。',
  'lens':'镜筒与 M12 镜头座主孔配合；穿过面部视口属于光学/通行关系，不能当作额外固定。',
  'banana_pcb_locker':'锁扣通过自身安装孔与电源支架关联；被锁持板件及真实夹持过程在当前输入中没有完整几何。',
  'power_support':'电源支架安装于躯干底座，承接电池并提供锁扣安装区；电池导向与保持条件分别审查。',
  'np_f970':'电池包络由电源支架承接，导向侧壁与拔模轮廓已保留；源名称不作为电池型号、锁止或电气插接规格确认。',
  'noenoeil':'眼环背部平环与面部承座配合；三个凸耳已作为有限几何保留，其与对端缺口的完整锁止映射尚未核定。',
  'left_shell':'外壳闭合区与右壳关联，颈部端盘孔组保留原装配对端；新增竖孔、台阶和导向区域不能因用途未明而删除。',
  'right_shell':'外壳闭合区与左壳关联，颈部端盘孔组保留原装配对端；新增竖孔、台阶和导向区域不能因用途未明而删除。',
 }
 open_by_mesh={
  'speaker':['仅有简化包络，实际螺孔、卡扣或其他固定工艺未提供。'],
  'm12_lens_holder':['双孔安装所需的相机板对端几何未提供，具体孔映射仍未确定。'],
  'banana_pcb_locker':['被锁持板件的完整几何和实际夹持方式缺失。'],
  'noenoeil':['三个凸耳与对端缺口的完整对应和保持方式尚未确定。'],
  'left_shell':['新增竖孔及部分非圆导向结构的具体原装选用尚未全部核定。'],
  'right_shell':['新增竖孔及部分非圆导向结构的具体原装选用尚未全部核定。'],
 }
 by_part_connections=defaultdict(list)
 for c in connections.values():
  for p in {ix[e['interface_ref']]['owner_ref'] for e in c['endpoints']}:by_part_connections[p].append(c)
 for part in scene['parts']:
  p=part['id'];interfaces=[i for i in ix.values() if i['owner_ref']==p];cs=by_part_connections[p];open_items=list(open_by_mesh.get(part['meshKey'],[]))
  if p==owner('6b884b140f6e283c'):open_items.append('头部偏航轴承外圈的具体承座/挡面尚未明确；内外圈能力均保留。')
  if p==head_servos[0]:summary='X−端盘四孔驱动喙部；壳体装入电机支架的有限承槽，由两端止挡、大面和侧肩定位，下侧由头部下壳承托。支架以自身四孔安装接口连接下壳，形成夹置结构；不是用舵机 A/B 侧四孔直接连接支架。'
  elif p==roll:summary='X−端盘与头部偏航/横滚传动件关联；舵机壳体由电机支架的有限承槽定位，头部下壳从相对侧承托。轴承支承、端盘传动和壳体安装分别表达。扬声器包络贴靠不等于其固定工艺已确认。'
  elif part['meshKey']=='xl330':
   hosts=sorted({parts[h]['name'] for servo,h in body_pairs if servo==p});driven=sorted({parts[ix[e['interface_ref']]['owner_ref']]['name'] for c in cs for e in c['endpoints'] if ix[e['interface_ref']]['owner_ref']!=p and any(ix[x['interface_ref']]['key'].startswith('servo_end_') for x in c['endpoints'] if ix[x['interface_ref']]['owner_ref']==p)})
   summary='壳体通过自身安装孔及有限承接面与'+('、'.join(hosts) or '原有安装座')+'关联；端盘传动对端为'+('、'.join(driven) or '来源尚未明确的结构')+'。壳体固定、端盘传动与轴承支承分开，保留安装相位及实际选孔条件。'
  elif part['meshKey'] in general:summary=general[part['meshKey']]
  else:
   roles='；'.join(dict.fromkeys(i['name'] for i in interfaces));peers=sorted({parts[ix[e['interface_ref']]['owner_ref']]['name'] for c in cs for e in c['endpoints'] if ix[e['interface_ref']]['owner_ref']!=p})
   summary='本件原装角色：'+roles+'。具体关联：'+'、'.join(peers)+'；有限承接面、孔组与轴向支承分别记录，未由零件邻近关系推定固定。'
  ds=[]
  for i in interfaces:
   linked=[c for c in cs if any(e['interface_ref']==i['id'] for e in c['endpoints'])]
   state='reference_conflict_recorded' if linked and all(c['basis']=='incompatible' for c in linked) else 'reference_use_recorded' if linked else 'not_observed_used_in_input'
   if i['id']==spi['id']:state='use_unresolved'
   ds.append({'interface_ref':i['id'],'status':state,'connection_refs':sorted(c['id'] for c in linked)})
  sid=next(sid for sid in part['sourceIds'] if sources[sid]['url']==part['geometryUrl'])
  part_reviews.append({'owner_ref':p,'source_ref':sid,'source_sha256':sources[sid]['digest'],'summary':summary,
    'required_interface_refs':sorted(i['id'] for i in interfaces),'interface_dispositions':ds,'open_items':open_items})
 surface_dispositions=[]
 for pair,rows in sorted(pairs.items()):
  new=[c['id'] for c in new_connections if {ix[e['interface_ref']]['owner_ref'] for e in c['endpoints']}==set(pair)]
  if pair==tuple(sorted([speaker,roll])):status='unresolved_proxy_contact';reason='简化扬声器包络的贴靠，不能证明真实固定。'
  elif new:status='added_reference_use';reason='按独立功能结构复核补充具体承接/定位/传动用途；保留各自条件。'
  elif rows[0]['existing_reference_connection_refs']:status='existing_reference_use';reason='已有具体参考关系；附加近邻面作为作用范围/留隙观察，不据此重复增加物理连接。'
  else:status='clearance_or_motion_neighbor';reason='留隙、光学窗口、活动邻接或未具备独立固定依据，不因投影重叠新增固定连接。'
  surface_dispositions.append({'owner_refs':list(pair),'status':status,'reason':reason,'added_connection_refs':new,'observation_count':len(rows)})
 review={'schema':'psop.reference-use-review/1','device_id':'microduck','date':'2026-11-09',
  'scope':'全部70个输入实例的功能接口及输入参考用法审查；所有有限几何/潜在新用途和真实制造装配的完全识别仍不由本审查保证。',
  'basis':'Frozen capabilities.3 raw source bytes; independent STL normals and finite triangle projection; existing attributed installation roles; explicitly reviewed head cradle and knee joint topology.',
  'raw_surface_review_sha256':sha(raw_review_path.read_bytes()),'parts':part_reviews,
  'required_connections':[{'id':c['id'],'endpoints':deepcopy(c['endpoints']),'mechanism':c['mechanism']} for c in connections.values()],
  'required_surface_regions':witnesses,'surface_pair_dispositions':surface_dispositions,
  'limits':['原三角处置完成、候选遍历完成与功能/原装用法完整分别验收。','未观察到原装使用不等于真实实物不可能使用。','简化包络、缺失对端、未知保持及未确认相位分别保留；不声称装配已完成。']}
 review_path=DIRECTORY/'reference-use-review.json';write(review_path,review)
 requirements_path=DIRECTORY/'capability-review.json';requirements=read(requirements_path)
 for path,title in [(raw_review_path,'全实例原始有限面区观察'),(review_path,'功能接口与原装用法的独立逐件审查')]:
  record={'artifact':title,'capture_path':path.name,'sha256':sha(path.read_bytes())}
  requirements['provenance']=[p for p in requirements['provenance'] if p.get('capture_path')!=path.name]+[record]
 requirements['reference_uses']={'source_ref':'SRC-CAPABILITY-REVIEW-'+sha(review_path.read_bytes())[:16],'sha256':sha(review_path.read_bytes())}
 requirements['reference_adjustments']['sha256']=sha(adjustment_path.read_bytes());write(requirements_path,requirements)
 value['provenance']['reference_use_revision']={'id':'functional-reference-uses-2026-11-09','source_package_digest':read(BASE/'manifest.json')['package_digest'],
  'method':'Raw finite source surfaces and independent functional-use dispositions','review_sha256':sha(review_path.read_bytes()),'all_parts_reviewed':len(part_reviews),
  'all_interfaces_or_physical_assemblies_claimed_complete':False}
 validate_input(value,scene,BASE);write(TARGET,value)
 print(json.dumps({'ok':True,'features':len(catalog['features']),'interfaces':len(catalog['interfaces']),'connections':len(catalog['connections']),
  'added_connections':len(new_connections),'body_seating_relations':len(body_pairs),'reviewed_parts':len(part_reviews),'surface_pair_dispositions':len(surface_dispositions),'open_items':sum(len(p['open_items']) for p in part_reviews),'correction_constraints':len(constraints)},ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--base',type=Path,required=True,help='Archived capabilities.3 baseline; old DKPs are not retained in this repository')
 parser.add_argument('--surface-review',type=Path,default=DIRECTORY/'reference-surface-observations.json',help='Frozen independent raw surface review')
 args=parser.parse_args()
 main(args.base,args.surface_review)
