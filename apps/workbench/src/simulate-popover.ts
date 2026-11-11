export interface PopoverPlacement {left:number;bottom:number;maxHeight:number;width:number}

/** Pin the bottom edge; asynchronous results and scrolling must never push the footer offscreen. */
export function placePopover(view:{width:number;height:number;bottomInset?:number;topInset?:number},size:{width:number}):PopoverPlacement {
  const margin=16,top=72+(view.topInset??0),bottom=20+(view.bottomInset??0);
  const width=Math.min(size.width,Math.max(0,view.width-2*margin));
  return {left:Math.max(margin,(view.width-width)/2),bottom,maxHeight:Math.max(0,Math.min(540,view.height-top-bottom)),width};
}
