import { useState } from "react";
import { items } from "../db/repo";
import type { Item } from "../domain/types";
import { useStore } from "../state/store";

/* An item's notes: the paragraph behind the sentence. Edited in a small sheet,
   shown under the title with any links made clickable. */

/** In the app a link opens the real browser, never the webview. */
function openExternal(url: string) {
  const href = url.startsWith("www.") ? `https://${url}` : url;
  if ("__TAURI_INTERNALS__" in window) {
    void import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(href));
  } else {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"']+)/g;

/** Trailing punctuation reads as prose, not as part of the address. */
function splitTrailing(raw: string): [string, string] {
  const match = raw.match(/[.,;:!?)\]]+$/);
  if (!match) return [raw, ""];
  return [raw.slice(0, -match[0].length), match[0]];
}

/** Plain text with every URL turned into a link. Keeps line breaks. */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PATTERN).map((part, index) => {
        if (index % 2 === 0) return part;
        const [url, rest] = splitTrailing(part);
        return (
          <span key={index}>
            <a
              href={url.startsWith("www.") ? `https://${url}` : url}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openExternal(url);
              }}
              className="break-all text-green underline decoration-[#2c5546] underline-offset-[3px] transition-colors hover:text-green-hover"
            >
              {url}
            </a>
            {rest}
          </span>
        );
      })}
    </>
  );
}

/** The muted paragraph a row shows under its title, when there is one. */
export function NoteLine({ notes }: { notes: string | null }) {
  if (!notes?.trim()) return null;
  return (
    <span className="text-[13px] leading-[1.55] whitespace-pre-wrap text-soft">
      <Linkified text={notes} />
    </span>
  );
}

/**
 * Title and notes, editable in place. The dates stay out of here on purpose —
 * a deadline changes through Reschedule, where the change costs a decision.
 */
export function EditItemSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const { act } = useStore();
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");

  const save = () => {
    if (!title.trim()) return;
    void act((db, c) =>
      items.edit(db, c, item.id, { title, notes: notes.trim() || null }),
    ).then(onClose);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[20vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[560px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
      >
        <span className="label text-faint">Edit</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Title"
          className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 text-[17px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes — context, links, whatever the title can't carry"
          rows={5}
          className="w-full resize-y rounded-lg border border-outline bg-[#212624] px-3.5 py-3 text-[14px] leading-[1.55] text-text outline-none placeholder:text-faint focus:border-outline-hover"
        />
        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover"
          >
            Save
          </button>
          <span className="fact text-[11px] text-faint">⌘⏎ save · esc dismiss</span>
        </div>
      </div>
    </div>
  );
}
