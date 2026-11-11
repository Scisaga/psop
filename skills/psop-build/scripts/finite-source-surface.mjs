/** Read-only distances to captured finite triangles, in the caller's units. */
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),add=(a,b,t)=>a.map((v,k)=>v+t*b[k]);
export function closestSurfacePoint(p,a,b,c){
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,ab,d1/(d1-d3));
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,ac,d2/(d2-d6));
 const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return add(b,sub(c,b),(d4-d3)/((d4-d3)+(d5-d6)));
 const den=va+vb+vc;if(Math.abs(den)<1e-28)return [a,b,c].sort((x,y)=>dot(sub(p,x),sub(p,x))-dot(sub(p,y),sub(p,y)))[0];return add(add(a,ab,vb/den),ac,vc/den);
}
export function finiteSurface(triangles){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const t of triangles)for(const p of t)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
 if(triangles.length<=12)return {lo,hi,triangles};const axis=[0,1,2].sort((a,b)=>(hi[b]-lo[b])-(hi[a]-lo[a]))[0],sorted=[...triangles].sort((a,b)=>a.reduce((s,p)=>s+p[axis],0)-b.reduce((s,p)=>s+p[axis],0)),mid=sorted.length>>1;return {lo,hi,children:[finiteSurface(sorted.slice(0,mid)),finiteSurface(sorted.slice(mid))]};
}
const boxDistance=(p,node)=>p.reduce((s,v,k)=>s+Math.max(node.lo[k]-v,0,v-node.hi[k])**2,0);
export function surfaceDistanceSquared(point,node,best=Infinity){
 if(boxDistance(point,node)>=best)return best;
 if(node.triangles){for(const triangle of node.triangles){const d=sub(point,closestSurfacePoint(point,...triangle));best=Math.min(best,dot(d,d));if(best<1e-26)break;}return best;}
 const children=[...node.children].sort((a,b)=>boxDistance(point,a)-boxDistance(point,b));for(const child of children)best=surfaceDistanceSquared(point,child,best);return best;
}
export function sourceTriangles(bytes,indices){
 const raw=bytes instanceof DataView?bytes:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=raw.byteLength>=84?raw.getUint32(80,true):0;if(raw.byteLength!==84+50*count)return null;
 if(!indices?.length||indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=count))return null;
 const triangles=indices.map(i=>[0,1,2].map(j=>[0,1,2].map(k=>raw.getFloat32(84+50*i+12+12*j+4*k,true))));return triangles.every(t=>t.every(p=>p.every(Number.isFinite)))?triangles:null;
}
