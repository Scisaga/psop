import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import './inspector-resize.css';

export const INSPECTOR_MIN_WIDTH = 320;
export const INSPECTOR_DEFAULT_WIDTH = 380;
export const INSPECTOR_MAX_WIDTH = 640;
const CANVAS_MIN_WIDTH = 480;
const STORAGE_KEY = 'psop.workbench.inspector-width';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function savedWidth() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const value = stored === null ? NaN : Number(stored);
    return Number.isFinite(value) ? clamp(value, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH) : INSPECTOR_DEFAULT_WIDTH;
  } catch {
    return INSPECTOR_DEFAULT_WIDTH;
  }
}

function persistWidth(value: number) {
  try { localStorage.setItem(STORAGE_KEY, String(Math.round(value))); }
  catch { /* Resizing still works when browser storage is unavailable. */ }
}

export function inspectorLayout(containerWidth: number, viewportWidth: number, treeVisible: boolean, inspectorVisible: boolean, preferredWidth: number) {
  // These values match the existing structure tree's responsive widths.
  const treeWidth = viewportWidth >= 1650 ? 242 : viewportWidth <= 1000 ? 185 : viewportWidth <= 1280 ? 205 : 222;
  const measured = containerWidth > 0;
  const stacked = inspectorVisible && (viewportWidth <= 650 || (measured && containerWidth < CANVAS_MIN_WIDTH + INSPECTOR_MIN_WIDTH));
  const autoCollapseTree = treeVisible && (viewportWidth <= 860 || (inspectorVisible && measured && containerWidth < treeWidth + CANVAS_MIN_WIDTH + INSPECTOR_MIN_WIDTH));
  const effectiveTreeVisible = treeVisible && !autoCollapseTree && !stacked;
  const reservedTreeWidth = effectiveTreeVisible ? treeWidth : 0;
  const maximumWidth = !measured || stacked
    ? INSPECTOR_MAX_WIDTH
    : clamp(containerWidth - reservedTreeWidth - CANVAS_MIN_WIDTH, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH);
  const width = clamp(preferredWidth, INSPECTOR_MIN_WIDTH, maximumWidth);
  return { width, maximumWidth, treeWidth, stacked, autoCollapseTree, effectiveTreeVisible };
}

type DragState = { pointerId: number; startX: number; startWidth: number; startPreferredWidth: number };
type WorkbenchStyle = CSSProperties & { '--inspector-width': string; '--structure-width': string };

/** The separator belongs inside the inspector, so it never adds a grid column. */
export function useInspectorResize({ treeVisible, inspectorVisible }: { treeVisible: boolean; inspectorVisible: boolean }) {
  const [workbenchElement, setWorkbenchElement] = useState<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth);
  const [preferredWidth, setPreferredWidth] = useState(savedWidth);
  const [isResizing, setIsResizing] = useState(false);
  const preferredWidthRef = useRef(preferredWidth);
  const dragRef = useRef<DragState | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const layout = inspectorLayout(containerWidth, viewportWidth, treeVisible, inspectorVisible, preferredWidth);
  const maximumWidthRef = useRef(layout.maximumWidth);
  maximumWidthRef.current = layout.maximumWidth;

  const workbenchRef = useCallback((element: HTMLDivElement | null) => { setWorkbenchElement(element); }, []);
  useLayoutEffect(() => {
    function measure() {
      setViewportWidth(window.innerWidth);
      setContainerWidth(workbenchElement?.getBoundingClientRect().width ?? 0);
    }
    measure();
    const observer = workbenchElement ? new ResizeObserver(measure) : null;
    if (workbenchElement) observer?.observe(workbenchElement);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [workbenchElement]);

  const updatePreference = useCallback((value: number, persist = true) => {
    const next = Math.round(clamp(value, INSPECTOR_MIN_WIDTH, INSPECTOR_MAX_WIDTH));
    preferredWidthRef.current = next;
    setPreferredWidth(next);
    if (persist) persistWidth(next);
  }, []);

  const finishDrag = useCallback((cancel = false) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (cancel) updatePreference(drag.startPreferredWidth, false);
    else persistWidth(preferredWidthRef.current);
    setIsResizing(false);
    if (handleRef.current?.hasPointerCapture(drag.pointerId)) handleRef.current.releasePointerCapture(drag.pointerId);
  }, [updatePreference]);

  useEffect(() => {
    if (!isResizing) return;
    document.documentElement.classList.add('inspector-is-resizing');
    const cancel = () => finishDrag(true);
    window.addEventListener('blur', cancel);
    return () => {
      document.documentElement.classList.remove('inspector-is-resizing');
      window.removeEventListener('blur', cancel);
    };
  }, [isResizing, finishDrag]);

  useEffect(() => {
    if (!workbenchElement || !inspectorVisible || layout.stacked) finishDrag(true);
  }, [workbenchElement, inspectorVisible, layout.stacked, finishDrag]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || layout.stacked) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: layout.width, startPreferredWidth: preferredWidthRef.current };
    setIsResizing(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    // The handle is the pane's left edge: moving it left makes the pane wider.
    updatePreference(clamp(drag.startWidth + drag.startX - event.clientX, INSPECTOR_MIN_WIDTH, maximumWidthRef.current), false);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (dragRef.current) {
      // A pointer gesture owns its temporary width until it commits or cancels.
      // Keep keyboard shortcuts from persisting it or changing the scene behind it.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') finishDrag(true);
      return;
    }
    const step = event.shiftKey ? 48 : 16;
    let next: number;
    if (event.key === 'ArrowLeft') next = layout.width + step;
    else if (event.key === 'ArrowRight') next = layout.width - step;
    else if (event.key === 'Home') next = INSPECTOR_MIN_WIDTH;
    else if (event.key === 'End') next = layout.maximumWidth;
    else if (event.key === 'Enter') next = INSPECTOR_DEFAULT_WIDTH;
    else return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Enter') updatePreference(next);
    else updatePreference(clamp(next, INSPECTOR_MIN_WIDTH, layout.maximumWidth));
  }

  const workbenchStyle: WorkbenchStyle = { '--inspector-width': `${layout.width}px`, '--structure-width': `${layout.treeWidth}px` };
  const separator = inspectorVisible && !layout.stacked ? <div
    ref={handleRef}
    className={`inspector-resize-handle${isResizing ? ' is-resizing' : ''}`}
    role="separator"
    tabIndex={0}
    aria-label="调整对象详情宽度"
    aria-orientation="vertical"
    aria-valuemin={INSPECTOR_MIN_WIDTH}
    aria-valuemax={Math.round(layout.maximumWidth)}
    aria-valuenow={Math.round(layout.width)}
    aria-valuetext={`${Math.round(layout.width)} 像素`}
    aria-describedby={helpId}
    title="拖动调整详情宽度；双击恢复默认"
    onPointerDown={startDrag}
    onPointerMove={moveDrag}
    onPointerUp={event => { if (event.pointerId === dragRef.current?.pointerId) finishDrag(); }}
    onPointerCancel={event => { if (event.pointerId === dragRef.current?.pointerId) finishDrag(true); }}
    onLostPointerCapture={() => finishDrag()}
    onKeyDown={resizeWithKeyboard}
    onDoubleClick={() => updatePreference(INSPECTOR_DEFAULT_WIDTH)}
  >
    <span className="inspector-resize-grip" aria-hidden="true" />
    <span className="inspector-resize-instructions" id={helpId}>左右方向键调整宽度，按住 Shift 加快；Home 最窄，End 最宽，回车恢复默认。</span>
  </div> : null;

  return { workbenchRef, workbenchStyle, ...layout, preferredWidth, isResizing, separator };
}
