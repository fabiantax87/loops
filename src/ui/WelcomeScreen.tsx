/**
 * The first morning. No counts, no zeroes, no empty bands — just the two things
 * worth knowing on day one.
 */
export function WelcomeScreen({ onNewClient }: { onNewClient: () => void }) {
  return (
    <div className="flex w-[720px] flex-col gap-16 pt-[120px] pb-20">
      <div className="flex flex-col gap-4">
        <span className="label text-faint">Nothing in here yet</span>
        <p className="m-0 text-[30px] leading-[1.5] tracking-[-.012em] text-text">
          Start with the people.
        </p>
        <p className="m-0 max-w-[520px] text-[17px] leading-relaxed text-pretty text-muted">
          Add a client, then write down whatever is open with them — something you
          owe, something you're waiting on, or something you'd like to get to one
          day. Loops will only bring it back when it matters.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onNewClient}
          className="self-start rounded-lg bg-green px-[18px] py-2.5 text-sm text-ink transition-colors hover:bg-green-hover"
        >
          Add your first client
        </button>
        <span className="fact text-[11px] text-faint">
          ⌘⇧L captures a line from anywhere, even when Loops isn't in front.
        </span>
      </div>
    </div>
  );
}
