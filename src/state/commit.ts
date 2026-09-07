import { items } from "../db/repo";
import type { SqlDriver } from "../db/driver";
import type { Clock } from "../lib/clock";
import type { Day } from "../lib/time";
import type { ItemKind } from "../domain/types";

type Act = (write: (db: SqlDriver, clock: Clock) => Promise<unknown>) => Promise<void>;

export interface CaptureDraft {
  kind: ItemKind;
  title: string;
  clientId: number;
  projectId: number | null;
  contactId: number | null;
  /** Required when kind is "todo"; the bar refuses to save without it. */
  deadline: Day | null;
  /** Local 'HH:MM' on the deadline day — a reminder fires at that moment. */
  deadlineTime: string | null;
  /** waiting only, and only if you asked for one. */
  checkinOn: Day | null;
  /** Local 'HH:MM' on the check-in day; the nudge waits for it. */
  checkinTime: string | null;
}

/** Turning the capture bar's state into a row. */
export async function commitCapture(draft: CaptureDraft, act: Act): Promise<boolean> {
  if (draft.title.trim() === "") return false;
  if (draft.kind === "todo" && draft.deadline === null) return false;

  await act((db, clock) =>
    items.create(db, clock, {
      clientId: draft.clientId,
      projectId: draft.projectId,
      contactId: draft.contactId,
      kind: draft.kind,
      title: draft.title,
      deadline: draft.deadline,
      deadlineTime: draft.deadlineTime,
      checkinOn: draft.checkinOn,
      checkinTime: draft.checkinTime,
    }),
  );
  return true;
}
