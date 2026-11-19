import { useState } from "react";
import { items } from "../db/repo";
import { attribution, projectsOf } from "../domain/snapshot";
import type { Item } from "../domain/types";
import { useSnapshot, useStore } from "../state/store";
import { Select } from "./primitives";

/* An item's notes: the paragraph behind the sentence. Edited in a small sheet,
   shown under the title with any links made clickable. */

/** In the app a link opens the real browser, never the webview. */
export function openExternal(url: string) {
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

/**
 * Filed under the wrong client or project. The item itself is untouched; its
 * contact only comes along when the client stays the same, since people
 * belong to one client.
 */
export function MoveItemSheet({ item, onClose }: { item: Item; onClose: () => void }) {
  const snapshot = useSnapshot();
  const { act } = useStore();
  const [clientId, setClientId] = useState(item.clientId);
  const [projectId, setProjectId] = useState<number | null>(item.projectId);
  const clients = snapshot.clients.filter((c) => c.archivedAt === null || c.id === item.clientId);
  const projects = projectsOf(snapshot, clientId);
  const changed = clientId !== item.clientId || projectId !== item.projectId;

  const save = () => {
    if (!changed) return;
    void act((db, c) =>
      items.move(db, c, item.id, {
        clientId,
        projectId,
        contactId: clientId === item.clientId ? item.contactId : null,
      }),
    ).then(onClose);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[20vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[480px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") save();
        }}
      >
        <span className="label text-faint">Move</span>
        <div className="flex flex-col gap-1">
          <span className="truncate text-[17px] text-text">{item.title}</span>
          <span className="fact text-[11px] text-faint">now under {attribution(snapshot, item)}</span>
        </div>
        <div className="flex gap-2.5">
          <Select
            label="Client"
            className="flex-1"
            value={String(clientId)}
            choices={clients.map((c) => ({ value: String(c.id), label: c.name }))}
            onChange={(value) => {
              setClientId(Number(value));
              setProjectId(null);
            }}
          />
          <Select
            label="Project"
            className="flex-1"
            value={projectId === null ? "" : String(projectId)}
            disabled={projects.length === 0}
            choices={[
              { value: "", label: projects.length === 0 ? "No projects" : "No project" },
              ...projects.map((p) => ({
                value: String(p.id),
                label: p.status === "done" ? `${p.name} (done)` : p.name,
              })),
            ]}
            onChange={(value) => setProjectId(value === "" ? null : Number(value))}
          />
        </div>
        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={save}
            disabled={!changed}
            className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover disabled:opacity-40"
          >
            Move
          </button>
          <span className="fact text-[11px] text-faint">
            {clientId !== item.clientId && item.contactId !== null
              ? "its contact stays behind — they belong to the old client"
              : "⏎ move · esc dismiss"}
          </span>
        </div>
      </div>
    </div>
  );
}
