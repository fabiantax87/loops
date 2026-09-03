import { buildToday, restingIdeasLine, restingWaitingLine } from "../domain/today";
import { useClock } from "../lib/ClockContext";
import { useSnapshot } from "../state/store";
import { Band, BandLabel } from "./primitives";
import { CriticalRow, IdeaRow, TodoRow, WaitingRow } from "./rows";
import { QuietScreen } from "./QuietScreen";
import { WelcomeScreen } from "./WelcomeScreen";
import type { Screen } from "./navigation";

/**
 * The morning read. Bands run top to bottom in order of how much they want
 * from you — critical, due today, time to chase — and each disappears when it
 * is empty. Only a day with nothing dated anywhere surfaces ideas instead.
 */
export function TodayScreen({
  go,
  onNewClient,
}: {
  go: (screen: Screen) => void;
  onNewClient: () => void;
}) {
  const snapshot = useSnapshot();
  const clock = useClock();
  const model = buildToday(snapshot, clock);

  if (model.mode === "welcome") return <WelcomeScreen onNewClient={onNewClient} />;
  if (model.mode === "quiet") return <QuietScreen />;

  const waitingFooter = restingWaitingLine(model.waitingResting);
  const ideasFooter = restingIdeasLine(model.ideasResting, model.mode === "ideas");

  if (model.mode === "ideas") {
    return (
      <div className="flex w-[720px] flex-col gap-[60px] pt-[104px] pb-20">
        <header className="flex flex-col gap-4">
          <span className="label text-faint">{model.date}</span>
          <p className="m-0 text-[30px] leading-[1.5] tracking-[-.012em] text-text">
            No deadlines, nobody waiting.
          </p>
          <p className="m-0 max-w-[540px] text-[17px] leading-relaxed text-pretty text-muted">
            Everything dated is either done or still in the future. Here{" "}
            {model.ideas.length === 1
              ? "is the oldest thing"
              : `are the ${model.ideas.length === 3 ? "three" : "two"} oldest things`}{" "}
            you once thought were worth doing.
          </p>
        </header>

        <section className="flex flex-col gap-1.5">
          <span className="label pb-2 text-green">Ideas, oldest first</span>
          {model.ideas.map((row, index) => (
            <IdeaRow
              key={row.item.id}
              item={row.item}
              where={row.where}
              wasInProgress={row.wasInProgress}
              last={index === model.ideas.length - 1}
              onOpen={() => go({ name: "client", clientId: row.item.clientId })}
            />
          ))}
          {ideasFooter && (
            <span className="fact pt-3.5 text-[11px] leading-[1.7] text-faint">
              {ideasFooter}
            </span>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="flex w-[720px] flex-col gap-[54px] pt-14 pb-16">
      <header className="flex flex-col gap-3.5">
        <span className="label text-faint">{model.date}</span>
        <p className="m-0 text-[27px] leading-[1.5] tracking-[-.01em] text-pretty text-text">
          {model.headline.lead}{" "}
          {model.headline.tail && <span className="text-muted">{model.headline.tail}</span>}
        </p>
      </header>

      {model.critical.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span className="label pb-2.5 text-red">Past its deadline</span>
          {model.critical.map((row) => (
            <CriticalRow key={row.item.id} item={row.item} where={row.where} fact={row.fact} />
          ))}
        </section>
      )}

      <Band label="Due today" empty={model.dueToday.length === 0}>
        {model.dueToday.map((row, index) => (
          <TodoRow
            key={row.item.id}
            item={row.item}
            where={row.where}
            fact={row.fact}
            promoted={row.promoted}
            last={index === model.dueToday.length - 1}
            onOpen={() => go({ name: "client", clientId: row.item.clientId })}
          />
        ))}
      </Band>

      {model.chase.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <BandLabel>Their move — time to chase</BandLabel>
          {model.chase.map((row, index) => (
            <WaitingRow
              key={row.item.id}
              item={row.item}
              where={row.where}
              fact={row.fact}
              last={index === model.chase.length - 1}
              onOpen={() => go({ name: "client", clientId: row.item.clientId })}
            />
          ))}
          {waitingFooter && (
            <span className="fact pt-3 text-[11px] leading-[1.7] text-faint">
              {waitingFooter}
            </span>
          )}
        </section>
      )}

      {model.ideas.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <span className="label pb-2 text-green">Today's ideas — chosen this morning</span>
          {model.ideas.map((row, index) => (
            <IdeaRow
              key={row.item.id}
              item={row.item}
              where={row.where}
              wasInProgress={row.wasInProgress}
              last={index === model.ideas.length - 1}
              onOpen={() => go({ name: "client", clientId: row.item.clientId })}
            />
          ))}
        </section>
      )}

      {((model.ideas.length === 0 && ideasFooter) ||
        (model.chase.length === 0 && waitingFooter)) && (
        <div className="flex flex-col gap-1.5 border-t border-hairline pt-2">
          {model.chase.length === 0 && waitingFooter && (
            <span className="fact text-[11px] leading-[1.7] text-faint">{waitingFooter}</span>
          )}
          {model.ideas.length === 0 && ideasFooter && (
            <span className="fact text-[11px] leading-[1.7] text-faint">{ideasFooter}</span>
          )}
        </div>
      )}
    </div>
  );
}
