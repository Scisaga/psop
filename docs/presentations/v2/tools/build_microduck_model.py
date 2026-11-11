#!/usr/bin/env python3
"""Package the locked official walk reference's exact STL triangle assembly for offline WebGL."""
from pathlib import Path
import array,base64,gzip,hashlib,json,math,struct,sys

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[2]
PACKAGE=REPO/'build/microduck-official-assembled/microduck-official-assembled-v1.2.1.build.dkp'
MANIFEST=PACKAGE/'apps/build/data/scene-manifest.json'
OUT=ROOT/'prototypes/microduck-source.js'

def read_stl(path):
    data=path.read_bytes()
    count=struct.unpack_from('<I',data,80)[0]
    assert len(data)==84+50*count,('Expected binary STL',path)
    triangles=[]
    for record in struct.iter_unpack('<12fH',data[84:]):
        normal=record[:3]
        if math.sqrt(sum(v*v for v in normal))<1e-9:
            a,b,c=[record[i:i+3] for i in (3,6,9)]
            u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
            normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        length=math.sqrt(sum(v*v for v in normal)) or 1
        normal=tuple(v/length for v in normal)
        triangles.append((normal,record[3:12]))
    return triangles

def main():
    preview=json.loads(MANIFEST.read_text(encoding='utf-8'))['items']['geometry_preview']
    xml_path=(MANIFEST.parent.parent/preview['path']).resolve()
    xml_digest='sha256:'+hashlib.sha256(xml_path.read_bytes()).hexdigest()
    assert xml_digest==preview['source_digest'],('Source assembly XML digest mismatch',xml_path)
    meshes={};global_min=[math.inf]*3;global_max=[-math.inf]*3
    for item in preview['items']:
        key=item['mesh_name']
        if key not in meshes:
            path=(MANIFEST.parent.parent/item['path']).resolve()
            assert path.is_relative_to(PACKAGE.resolve())
            assert hashlib.sha256(path.read_bytes()).hexdigest()==item['source_digest'].split(':')[1]
            triangles=read_stl(path)
            assert len(triangles)==item['triangle_count'],('Source triangle count mismatch',path)
            lo=[min(v[axis] for _,vertices in triangles for v in zip(*[iter(vertices)]*3)) for axis in range(3)]
            hi=[max(v[axis] for _,vertices in triangles for v in zip(*[iter(vertices)]*3)) for axis in range(3)]
            step=[(hi[i]-lo[i])/65535 or 1 for i in range(3)]
            vertex_map={};verts=[];normals=[];indices=[]
            for normal,coordinates in triangles:
                nq=tuple(round(max(-1,min(1,n))*32767) for n in normal)
                for start in (0,3,6):
                    q=tuple(round((coordinates[start+i]-lo[i])/step[i]) for i in range(3))
                    token=q+nq
                    index=vertex_map.get(token)
                    if index is None:
                        index=len(vertex_map);vertex_map[token]=index;verts.extend(q);normals.extend(nq)
                    indices.append(index)
            index_type='H' if len(vertex_map)<65536 else 'I'
            position=array.array('H',verts);normal=array.array('h',normals);index=array.array(index_type,indices)
            if sys.byteorder!='little':
                for values in (position,normal,index):values.byteswap()
            raw=position.tobytes()+normal.tobytes()+index.tobytes()
            meshes[key]={'min':lo,'step':step,'vertexCount':len(vertex_map),'triangleCount':len(triangles),
                'indexBytes':index.itemsize,'data':base64.b64encode(gzip.compress(raw,mtime=0)).decode('ascii'),
                'sourceId':item['source_id'],'sourceDigest':item['source_digest'],'sourcePath':item['path']}
        # Transform source bounds from exact input positions, before display-axis conversion.
        m=item['assembled_transform'];mesh=meshes[key]
        lo=mesh['min'];hi=[lo[i]+mesh['step'][i]*65535 for i in range(3)]
        for x in (lo[0],hi[0]):
            for y in (lo[1],hi[1]):
                for z in (lo[2],hi[2]):
                    point=[m[i]*x+m[i+1]*y+m[i+2]*z+m[i+3] for i in (0,4,8)]
                    for i,value in enumerate(point):global_min[i]=min(global_min[i],value);global_max[i]=max(global_max[i],value)
    items=[{k:i[k] for k in ('index','instance_id','mesh_name','body_path','name','rgba','assembled_transform','source_id','source_digest')} for i in preview['items']]
    meta={k:preview[k] for k in ('assembly_status','configurations','coordinate_system','mesh_count','object_count','pose','source_id','source_digest','path','reference_device_id')}
    meta.update({'sourceCommit':'cb70b792312d559a4da09064d92009079671815f','sourceBounds':[global_min,global_max],
        'precision':'uint16 positions per mesh bounds; source face normals int16; triangles unchanged',
        'maxPositionQuantizationErrorMeters':max(max(mesh['step'])/2 for mesh in meshes.values()),
        'sourceManifestSha256':hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
        'license':'Creative Commons BY-SA-NC (upstream statement does not name a version)',
        'alphaMapping':'Not verified; alpha software identity is separate from this walk reference'})
    bundle={'meta':meta,'meshes':meshes,'items':items}
    OUT.write_text('/* Generated from locked official STL + source assembly. See tools/build_microduck_model.py. */\nwindow.psopMicroduckSource='+json.dumps(bundle,ensure_ascii=True,separators=(',',':'))+';\n',encoding='utf-8')
    report={**meta,'bundleBytes':OUT.stat().st_size,'uniqueTriangles':sum(m['triangleCount'] for m in meshes.values()),
        'instanceTriangles':sum(meshes[i['mesh_name']]['triangleCount'] for i in items)}
    dest=ROOT/'assets/generated/microduck/model-source-report.json';dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    source_manifest={**meta,'sourceManifest':str(MANIFEST.relative_to(REPO)).replace('\\','/'),
        'bundle':'prototypes/microduck-source.js','bundleSha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),
        'meshSources':{name:{k:value for k,value in mesh.items() if k not in ('data','min','step')} for name,mesh in meshes.items()},
        'instances':items}
    (dest.parent/'model-source-manifest.json').write_text(json.dumps(source_manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=True))

if __name__=='__main__':main()
