export interface AnnotationAnchor {id:string;x:number;y:number;width:number;height:number}
export interface AnnotationPlacement {id:string;left:number;top:number;side:number}

export function placeConnectionAnnotations(anchors:AnnotationAnchor[],view:{width:number;height:number},previous=new Map<string,number>()){
  const placed:AnnotationPlacement[]=[],rectangles:{left:number;top:number;right:number;bottom:number}[]=[];
  for(const anchor of anchors){
    const w=Math.min(anchor.width,view.width-24),h=anchor.height,maxLeft=view.width-w-12,maxTop=view.height-h-40,minLeft=Math.min(68,Math.max(12,maxLeft));
    const offsets=[[18,-h-12],[18,12],[-w-18,-h-12],[-w-18,12],[18,-h-48],[-w-18,-h-48],[18,48],[-w-18,48]];
    const old=previous.get(anchor.id),order=old===undefined?offsets.map((_,i)=>i):[old,...offsets.map((_,i)=>i).filter(i=>i!==old)];let best:AnnotationPlacement|undefined,bestCost=Infinity;
    for(const side of order){const [dx,dy]=offsets[side],left=Math.max(minLeft,Math.min(maxLeft,anchor.x+dx)),top=Math.max(52,Math.min(maxTop,anchor.y+dy)),rect={left,top,right:left+w,bottom:top+h};
      const overlap=rectangles.reduce((sum,b)=>sum+Math.max(0,Math.min(rect.right,b.right)-Math.max(rect.left,b.left)+6)*Math.max(0,Math.min(rect.bottom,b.bottom)-Math.max(rect.top,b.top)+6),0),cost=overlap+(side===old?0:1);
      if(cost<bestCost){best={id:anchor.id,left,top,side};bestCost=cost;}if(!overlap)break;
    }
    if(best){placed.push(best);rectangles.push({left:best.left,top:best.top,right:best.left+w,bottom:best.top+h});}
  }
  return placed;
}
