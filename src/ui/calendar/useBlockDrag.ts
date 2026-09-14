import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Block,
  type BlockContent,
  type DragMode,
  type DragRange,
  type TaskEntry,
  nextRange,
} from "../../domain/calendar";
import type { Day } from "../../lib/time";

/**
 * Dragging a task about the grid — the body to move it, the bottom edge to
 * change how long it takes. The first pointer gesture in the app, so it keeps
 * to the discipline the rest of the UI uses for global listeners: registered
 * only while something is actually happening, and always cleaned up.
 *
 * Two things are less obvious than they look:
 *
 *   - The listeners live on `window`, not on the block. Moving a task to
 *     another day unmounts its element, which would release a pointer capture
 *     held there and strand the gesture half-finished. The capture goes on the
 *     document element instead, which never goes away, so a release outside the
 *     window still ends the drag.
 *   - Time comes from how far the pointer moved, plus however far the page
 *     scrolled underneath it. Without that second term a wheel nudge mid-drag
 *     silently drops the task an hour off.
 */

/** Past this many pixels it is a drag; under it, it was a click. */
const LIFT_PX = 4;

export interface DragPreview extends DragRange {
  key: string;
  block: Block;
  day: Day;
  mode: DragMode;
  /** Past the threshold — only then does the block visibly lift. */
  lifted: boolean;
  /** The write is in flight; hold the preview until the snapshot catches up. */
  pending: boolean;
}

export interface BlockDrag {
  preview: DragPreview | null;
  begin: (event: React.PointerEvent<HTMLElement>, block: Block, day: Day, mode: DragMode) => void;
}

interface Gesture {
  block: Block;
  mode: DragMode;
  pointerId: number;
  startY: number;
  startScrollTop: number;
  scroller: Element | null;
  /** The last column the pointer was actually over. */
  day: Day;
  range: DragRange;
  lifted: boolean;
}

export function useBlockDrag(options: {
  pxPerHour: number;
  startHour: number;
  endHour: number;
  /** Week view: a sideways drag moves the task to another day. */
  crossDay: boolean;
  onOpen: (content: BlockContent) => void;
  onCommit: (task: TaskEntry, day: Day, range: DragRange, mode: DragMode) => Promise<void>;
}): BlockDrag {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef<{ x: number; y: number } | null>(null);
  const detach = useRef<(() => void) | null>(null);
  // Options change identity every render; the listeners read them through a ref
  // so they never have to be torn down and rebuilt mid-gesture.
  const opts = useRef(options);
  opts.current = options;

  const finish = useCallback(() => {
    const held = gesture.current;
    gesture.current = null;
    latest.current = null;
    detach.current?.();
    detach.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    document.body.style.removeProperty("cursor");
    if (held) {
      try {
        document.documentElement.releasePointerCapture(held.pointerId);
      } catch {
        // The pointer was already gone; nothing to release.
      }
    }
    return held;
  }, []);

  const apply = useCallback(() => {
    frame.current = null;
    const held = gesture.current;
    const at = latest.current;
    if (!held || !at) return;

    const scrolled = (held.scroller?.scrollTop ?? 0) - held.startScrollTop;
    const movedPx = at.y - held.startY + scrolled;
    const lifted = held.lifted || Math.abs(movedPx) > LIFT_PX;
    const deltaMinutes = (movedPx / opts.current.pxPerHour) * 60;

    let day = held.day;
    if (opts.current.crossDay) {
      // Between columns there is only a gutter — keep the last real target
      // rather than snapping back, which would flicker on every traverse.
      const under = document
        .elementFromPoint(at.x, at.y)
        ?.closest("[data-calendar-day]")
        ?.getAttribute("data-calendar-day");
      if (under) day = under;
    }

    const range = nextRange(held.mode, held.block, deltaMinutes, {
      minMinutes: opts.current.startHour * 60,
      maxMinutes: opts.current.endHour * 60,
    });

    held.day = day;
    held.range = range;
    held.lifted = lifted;
    if (lifted) document.body.style.setProperty("cursor", "grabbing");
    setPreview((current) =>
      current === null || current.pending ? current : { ...current, ...range, day, lifted },
    );
  }, []);

  const onMove = useCallback(
    (event: PointerEvent) => {
      if (!gesture.current || event.pointerId !== gesture.current.pointerId) return;
      latest.current = { x: event.clientX, y: event.clientY };
      if (frame.current === null) frame.current = requestAnimationFrame(apply);
    },
    [apply],
  );

  const onCancel = useCallback(() => {
    finish();
    setPreview(null);
  }, [finish]);

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    },
    [onCancel],
  );

  const onUp = useCallback(
    (event: PointerEvent) => {
      const held = gesture.current;
      if (!held || event.pointerId !== held.pointerId) return;
      // A last look at where the pointer ended, in case the frame never ran.
      latest.current = { x: event.clientX, y: event.clientY };
      if (frame.current === null) apply();
      finish();

      // It never moved, so it was a click after all. The hook answers the tap
      // itself: on a cross-day drag the pointer goes up over a different
      // element, so the block's own onClick would never hear about it.
      if (!held.lifted) {
        setPreview(null);
        opts.current.onOpen(held.block.content);
        return;
      }

      const content = held.block.content;
      if (content.type !== "task") {
        setPreview(null);
        return;
      }
      // The preview stays up until the snapshot has caught up, or the block
      // would flash back to where it started for a frame before landing.
      setPreview((current) => (current === null ? null : { ...current, pending: true }));
      void opts.current
        .onCommit(content.task, held.day, held.range, held.mode)
        .finally(() => setPreview(null));
    },
    [apply, finish],
  );

  const begin = useCallback<BlockDrag["begin"]>((event, block, day, mode) => {
    // Left button only, one pointer, and never a macOS control-click.
    if (!event.isPrimary || event.button !== 0 || event.ctrlKey) return;
    if (gesture.current || preview?.pending) return;
    if (block.content.type !== "task") return;

    const scroller = event.currentTarget.closest("main");
    gesture.current = {
      block,
      mode,
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scroller?.scrollTop ?? 0,
      scroller,
      day,
      range: { startMinutes: block.startMinutes, endMinutes: block.endMinutes },
      lifted: false,
    };
    try {
      document.documentElement.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; the window listeners carry the gesture regardless.
    }

    // Attached here rather than from an effect: a quick click would otherwise
    // be over before React had re-rendered and put the listeners in place.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    detach.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };

    setPreview({
      key: block.key,
      block,
      day,
      mode,
      lifted: false,
      pending: false,
      startMinutes: block.startMinutes,
      endMinutes: block.endMinutes,
    });
  }, [preview?.pending, onMove, onUp, onCancel, onKey]);

  // A drag that outlives its component leaves the body stuck in a grab cursor.
  useEffect(() => () => void finish(), [finish]);

  return { preview, begin };
}
