"""Whole source-solid interference at a fixed rigid pose (metres).

Production MeshInterference uses pinned solid Boolean intersection, including
edge coincidences and containment. The dependency-free triangle routines are
an independent reference for analytic fixtures; they never grant production
compatibility. A final pose does not establish a path or manufacturing fit.
"""
from __future__ import annotations

from collections import defaultdict
import hashlib
import math

from .mechanics import _mesh

METHOD = "closed-source-solid-interference/2"
# Same numerical source-plane allowance as finite-source-surface-discovery/1.
# This is not a manufacturing tolerance or a permitted penetration budget.
EPSILON_M = 3e-7
_RESULT_CACHE = {}


def sub(a,b): return (a[0]-b[0],a[1]-b[1],a[2]-b[2])
def add(a,b): return (a[0]+b[0],a[1]+b[1],a[2]+b[2])
def dot(a,b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def length(a): return math.sqrt(dot(a,a))
def scale(a,s): return (a[0]*s,a[1]*s,a[2]*s)
def unit(a): return scale(a,1/length(a)) if length(a)>1e-18 else (0.,0.,0.)
def mul(r,p): return tuple(dot(row,p) for row in r)
def mean(ps): return tuple(sum(p[k] for p in ps)/len(ps) for k in range(3))


def bounds(ps):
    return tuple(min(p[k] for p in ps) for k in range(3)),tuple(max(p[k] for p in ps) for k in range(3))


def overlap(a,b,translation=(0.,0.,0.),margin=EPSILON_M):
    return all(a[0][k]<=b[1][k]+translation[k]+margin and b[0][k]+translation[k]<=a[1][k]+margin for k in range(3))


def _cut(points,distances,epsilon):
    result=[]
    for i,a in enumerate(points):
        b=points[(i+1)%3];da,db=distances[i],distances[(i+1)%3]
        if abs(da)<=epsilon:result.append(a)
        if da*db<0:result.append(add(a,scale(sub(b,a),da/(da-db))))
    return result


def _coplanar_overlap(a,b,normal,epsilon):
    """Clip the actual finite triangles, including only positive-area overlap."""
    axis=max(range(3),key=lambda k:abs(normal[k]));uv=[k for k in range(3) if k!=axis]
    polygon=[tuple(p[k] for k in uv) for p in a];clip=[tuple(p[k] for k in uv) for p in b]
    def area(ps):return sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(ps,ps[1:]+ps[:1]))/2
    sign=1 if area(clip)>0 else -1
    for start,end in zip(clip,clip[1:]+clip[:1]):
        if not polygon:return None
        def side(p):return sign*((end[0]-start[0])*(p[1]-start[1])-(end[1]-start[1])*(p[0]-start[0]))
        output=[]
        for p,q in zip(polygon,polygon[1:]+polygon[:1]):
            dp,dq=side(p),side(q)
            if dp>=0:output.append(p)
            if dp*dq<0:
                t=dp/(dp-dq);output.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
        polygon=output
    if len(polygon)<3 or abs(area(polygon))<=epsilon**2:return None
    center=tuple(sum(p[k] for p in polygon)/len(polygon) for k in range(2));point=[0.,0.,0.]
    for k,v in zip(uv,center):point[k]=v
    point[axis]=a[0][axis]-sum(normal[k]*(point[k]-a[0][k]) for k in uv)/normal[axis]
    return point


def triangle_interference(a,b,na,nb,epsilon=EPSILON_M):
    """A strictly transverse segment or coincident same-side material.

    Contacts along a finite edge, point, or opposed plane have no volume.
    Near-coincident source planes use only the declared source precision.
    """
    da=[dot(sub(p,b[0]),nb) for p in a]
    if min(da)>epsilon or max(da)<-epsilon:return None
    db=[dot(sub(p,a[0]),na) for p in b]
    if min(db)>epsilon or max(db)<-epsilon:return None
    direction=cross(na,nb);n=length(direction)
    if n<1e-8:
        if max(abs(d) for d in da)<=epsilon and dot(na,nb)>0:
            point=_coplanar_overlap(a,b,na,epsilon)
            if point is not None:return {"kind":"coincident_same_side_material","point":point}
        return None
    # Strict interior crossings must straddle both finite face planes. The
    # precision strip is treated as contact, not enlarged into a collision.
    if not (min(da)<-epsilon and max(da)>epsilon and min(db)<-epsilon and max(db)>epsilon):return None
    ca,cb=_cut(a,da,0.),_cut(b,db,0.)
    if not ca or not cb:return None
    direction=scale(direction,1/n)
    ia=[dot(p,direction) for p in ca];ib=[dot(p,direction) for p in cb]
    lo,hi=max(min(ia),min(ib)),min(max(ia),max(ib))
    if hi-lo<=epsilon:return None
    return {"kind":"transverse_source_surfaces","point":list(add(ca[0],scale(direction,(lo+hi)/2-ia[0]))),"intersection_length_m":hi-lo}


class SolidMesh:
    def __init__(self,vertices,faces,*,digest=None,components=None,closed=None):
        self.vertices,self.faces=vertices,faces
        self.digest=digest
        self.triangles=[tuple(vertices[i] for i in f) for f in faces]
        self.normals=[unit(cross(sub(t[1],t[0]),sub(t[2],t[0]))) for t in self.triangles]
        self.face_bounds=[bounds(t) for t in self.triangles]
        if closed is None:
            edges=defaultdict(list)
            for i,face in enumerate(faces):
                for a,b in zip(face,face[1:]+face[:1]):edges[tuple(sorted((a,b)))].append((i,a,b))
            self.closed=bool(faces) and all(len(es)==2 and es[0][1:]==es[1][1:][::-1] for es in edges.values()) and all(length(n)>0 for n in self.normals)
            parents=list(range(len(faces)))
            def find(i):
                while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
                return i
            for es in edges.values():
                for e in es[1:]:parents[find(e[0])]=find(es[0][0])
            groups=defaultdict(list)
            for i in range(len(faces)):groups[find(i)].append(i)
            self.components=list(groups.values())
        else:self.closed,self.components=closed,components
        def build(ids):
            lo=tuple(min(self.face_bounds[i][0][k] for i in ids) for k in range(3));hi=tuple(max(self.face_bounds[i][1][k] for i in ids) for k in range(3))
            if len(ids)<=8:return (lo,hi,ids,None)
            k=max(range(3),key=lambda k:hi[k]-lo[k]);ids.sort(key=lambda i:self.face_bounds[i][0][k]+self.face_bounds[i][1][k]);mid=len(ids)//2
            return (lo,hi,build(ids[:mid]),build(ids[mid:]))
        self.root=build(list(range(len(faces)))) if faces else None
        self.bounds=self.root[:2] if self.root else ((0,0,0),(0,0,0))

    @classmethod
    def from_stl(cls,raw):
        vertices,faces,_,_=_mesh(raw)
        return cls(vertices,faces,digest=hashlib.sha256(raw).hexdigest())

    def rotated(self,r):
        return SolidMesh([mul(r,v) for v in self.vertices],self.faces,digest=self.digest,components=self.components,closed=self.closed)

    def inside(self,point):
        if any(point[k]<self.bounds[0][k]-EPSILON_M or point[k]>self.bounds[1][k]+EPSILON_M for k in range(3)):return False
        votes=[]
        for direction in ((1.,.371,.217),(.193,1.,.417),(.293,.173,1.)):
            inverse=tuple(1/x for x in direction);stack=[self.root];hits=[]
            while stack:
                node=stack.pop();lo,hi,a,b=node;low,high=0.,float('inf')
                for k in range(3):
                    x,y=(lo[k]-point[k])*inverse[k],(hi[k]-point[k])*inverse[k];low=max(low,min(x,y));high=min(high,max(x,y))
                if high<low:continue
                if b is not None:stack.extend((a,b));continue
                for i in a:
                    p,q,r=self.triangles[i];e1,e2=sub(q,p),sub(r,p);h=cross(direction,e2);det=dot(e1,h)
                    if abs(det)<1e-20:continue
                    inv=1/det;s=sub(point,p);u=dot(s,h)*inv
                    if not -1e-9<=u<=1+1e-9:continue
                    c=cross(s,e1);v=dot(direction,c)*inv
                    if v<-1e-9 or u+v>1+1e-9:continue
                    distance=dot(e2,c)*inv
                    if distance>1e-9:hits.append(distance)
            unique=[]
            for hit in sorted(hits):
                if not unique or hit-unique[-1]>1e-8:unique.append(hit)
            votes.append(bool(len(unique)%2))
        return sum(votes)>=2


def check_interference(a,b,translation=(0.,0.,0.)):
    result={"method":"triangle-surface-reference/1","numerical_contact_allowance_m":EPSILON_M,"source_sha256_a":a.digest,"source_sha256_b":b.digest}
    if not a.closed or not b.closed:return {**result,"status":"unresolved","reason":"source_is_not_closed_oriented_manifold"}
    if not overlap(a.bounds,b.bounds,translation):return {**result,"status":"clear","proof":"disjoint_source_bounds"}
    if any(min(a.bounds[1][k],b.bounds[1][k]+translation[k])-max(a.bounds[0][k],b.bounds[0][k]+translation[k])<=EPSILON_M for k in range(3)):
        return {**result,"status":"clear","proof":"disjoint_source_bounds_interiors"}
    stack=[(a.root,b.root)]
    while stack:
        an,bn=stack.pop()
        if not overlap(an[:2],bn[:2],translation):continue
        if an[3] is not None or bn[3] is not None:
            if bn[3] is None or an[3] is not None and max(an[1][k]-an[0][k] for k in range(3))>=max(bn[1][k]-bn[0][k] for k in range(3)):
                stack.extend(((an[2],bn),(an[3],bn)))
            else:stack.extend(((an,bn[2]),(an,bn[3])))
            continue
        for i in an[2]:
            for j in bn[2]:
                if not overlap(a.face_bounds[i],b.face_bounds[j],translation):continue
                witness=triangle_interference(a.triangles[i],tuple(add(p,translation) for p in b.triangles[j]),a.normals[i],b.normals[j])
                if witness:return {**result,"status":"interference","witness":{"triangle_a":i,"triangle_b":j,**witness}}
    # With no transverse boundary crossings, a whole closed component can
    # still be contained. Inward probes also distinguish coincident solids
    # from opposed face contact. Probe all six component extrema and a face.
    for first,second,t,side in ((a,b,translation,'a'),(b,a,scale(translation,-1),'b')):
        for component in first.components:
            selected={component[0]}
            for k in range(3):
                for sign in (-1,1):selected.add(max(component,key=lambda i:sign*mean(first.triangles[i])[k]))
            for i in sorted(selected):
                center=mean(first.triangles[i]);probe=sub(center,scale(first.normals[i],EPSILON_M*4));other=sub(probe,t)
                if second.inside(other) and first.inside(probe):
                    return {**result,"status":"interference","witness":{"kind":"contained_source_material","owner_side":side,"triangle":i,"point":list(probe if side=='a' else add(probe,translation))}}
    return {**result,"status":"clear","proof":"closed_boundaries_and_component_containment"}


class MeshInterference:
    """Share source meshes and exact repeated local placements across instances."""
    def __init__(self,parts,root):
        self.parts={p['id']:p for p in parts};self.root=root;self.meshes={};self.sources={};self.results={}

    def evaluate(self,owner_a,owner_b,r,t,*,diagnostics=False):
        if any(abs(value-1)>1e-10 for owner in (owner_a,owner_b) for value in self.parts[owner]['scale']):
            return {"method":METHOD,"status":"unresolved","reason":"non_unit_source_scale"}
        inputs=[]
        for owner in (owner_a,owner_b):
            # A captured source URL is immutable for this analysis. Resolve
            # it once per owner, not twice for every symmetry/entry alias.
            if owner not in self.sources:
                path=(self.root/self.parts[owner]['geometryUrl']).resolve()
                if path not in self.meshes:self.meshes[path]={'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
                self.sources[owner]=self.meshes[path]
            inputs.append(self.sources[owner])
        # Key rounding is far below the explicitly published source precision;
        # calculations always use the original source registration values.
        key=(inputs[0]['sha256'],inputs[1]['sha256'],tuple(round(v,12) for row in r for v in row),tuple(round(v,12) for v in t))
        if diagnostics:key=key+('diagnostics/1',)
        if key in self.results:return self.results[key]
        if key in _RESULT_CACHE:
            self.results[key]=_RESULT_CACHE[key]
            return self.results[key]
        from .solid_boolean import evaluate
        result=evaluate(*inputs,r,t,diagnostics=diagnostics);self.results[key]=result
        if len(_RESULT_CACHE)>=100000:_RESULT_CACHE.clear()
        _RESULT_CACHE[key]=result
        return result
