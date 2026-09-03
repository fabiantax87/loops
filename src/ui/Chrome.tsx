import type { ReactNode } from "react";

/**
 * The window's own title bar. Tauri hides the native one and overlays the
 * traffic lights, so the space to their right is ours — and all it says is how
 * to capture something.
 */
export function TitleBar({
  children,
  hint = "⌘⇧L to capture",
}: {
  children?: ReactNode;
  hint?: string;
}) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-11 flex-none items-center gap-3.5 border-b border-[#1d2120] bg-chrome pr-4 pl-20"
    >
      <div className="flex-1" data-tauri-drag-region />
      {children}
      {/* Non-interactive text still needs the attribute, or the bar has a
          dead patch you can't drag by. */}
      <span
        data-tauri-drag-region
        className="fact text-[11px] tracking-[.04em] text-faint"
      >
        {hint}
      </span>
    </div>
  );
}
