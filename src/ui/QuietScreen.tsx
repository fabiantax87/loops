import { formatBriefingDate } from "../domain/today";
import { useClock } from "../lib/ClockContext";

/**
 * As empty as Loops gets: nothing due, nobody waiting, no ideas left. The
 * screen's whole job is to say so and get out of the way.
 */
export function QuietScreen() {
  const clock = useClock();

  return (
    <div className="flex w-[720px] flex-col gap-[52px] pt-[132px] pb-[90px]">
      <div className="flex flex-col gap-[18px]">
        <span className="label text-faint">{formatBriefingDate(clock)}</span>
        <p className="m-0 text-[30px] leading-[1.5] tracking-[-.012em] text-text">
          Nothing due, nobody waiting, no loose thoughts left.
        </p>
        <p className="m-0 max-w-[520px] text-[17px] leading-relaxed text-pretty text-muted">
          This is as empty as Loops gets. Whatever you do next is genuinely your
          own choice — write it down if you want it back tomorrow.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <span className="fact text-[11px] text-faint">
          ⌘⇧L to capture something · or just close the app
        </span>
      </div>
    </div>
  );
}
