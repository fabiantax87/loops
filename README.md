# Loops

A single-user desktop app for the things a calendar can't hold: the deadlines
you owe, the answers you're waiting on, and the ideas you'd get to on a quiet
day. An awareness layer, not an execution layer — no sprints, no boards, no
sub-tasks. You read it in the morning and it tells you when to stop reading.

Tauri 2 · React · TypeScript · SQLite. All local: no accounts, no network.

## Running it

```sh
pnpm install
pnpm tauri dev     # the app; frontend on port 3001 (never 3000)
pnpm dev           # the UI alone in a browser, against a seeded throwaway database
pnpm test          # vitest
pnpm seed          # fill the real app database with demo data
pnpm seed --reset  # …throwing away whatever was in there first
```

`pnpm dev` is the fast loop for design work: same components, same schema, same
queries — only the database is different (sql.js in the tab instead of SQLite on
disk). `pnpm seed` refuses to touch a database that already has clients in it.

## How it is put together

**Three kinds of item.** A **todo** always has a deadline; the day after
missing it, it goes critical — the only red in the app — and stays pinned
until done or rescheduled. An **idea** has no dates at all: ideas rest until a
day with nothing dated anywhere, when the three oldest surface, ones you once
started first, each with "Do it today" and "Not relevant". A **waiting-on** is
their move: an optional check-in day says when to go chasing, chasing buys
another wait, and "They replied" either settles it or turns it into a todo
(deadline required).

**The one exception** is a promoted idea: "Do it today" makes it a todo
without a deadline. It sits with today's work, can't go critical, and can be
demoted back — keeping the fact it was once in progress, which puts it first
in line next time ideas surface.

**People route capture.** ⌘⇧L opens the capture bar anywhere; the type is an
explicit three-way toggle, and everything else is parsed: "send Sanne the
agreement by fri" files itself under Eurotransplant · ETRL with Friday as the
deadline, because that is who Sanne is. Names are unique per client rather
than globally, so two clients may each have a John; when one is named on its
own, capture asks which rather than guessing.

**Everything is derived.** `src/db/repo.ts` loads the whole database into a
`Snapshot` after every write, and each screen is a pure function of that value
(`src/domain/`). That is what makes the interesting parts — what's critical,
who to chase, which ideas surface today — testable without a database or a
browser.

| Where | What lives there |
| --- | --- |
| `src-tauri/migrations/` | The schema. One source of truth, run by Rust in the app and by `src/db/migrations.ts` in tests |
| `src/domain/` | All the logic: the dashboard bands, idea selection, chase windows, the capture parser |
| `src/db/` | The `SqlDriver` seam and its three implementations (Tauri, `node:sqlite`, sql.js) |
| `src/ui/` | Screens and the handful of primitives they share |
| `src/dev/` | The seeded demo data, and the script that writes it into the real database |
| `docs/` | The spec (`SPEC.md`) and the design canvas (`design/Loops.dc.html`) |
| `assets/` | The icon source: `icon.svg` for the app, `tray.mvg` for the menu bar |

**Time is injected.** Nothing calls `new Date()`; the clock comes from
`src/lib/clock.ts`, so tests walk the app forward through deadlines and
check-ins by hand. Instants are UTC ISO strings, days are local `YYYY-MM-DD`,
and the two are never mixed.

## Rules the code keeps

- **Red means late, and nothing else.** Only a todo past its deadline is red.
  A check-in that has arrived is amber; ideas never colour at all. The tone is
  decided in the domain, not per component.
- **Sentences, not counters.** Numbers get spelled out and headers end by
  giving you permission to stop reading.
- **Empty bands vanish.** A good day is a shorter page, never a row of zeroes.
- **Grey means fine.** A healthy client renders dim and says nothing.
- **Nothing is deleted, only put down.** Done, replied, and dropped all land
  in the archive.

## The icon

An open loop with the ball sitting outside it — unresolved, and a question
about whose move it is. Regenerate the app icons from the source after editing
it, then rebuild:

```sh
npx tauri icon assets/icon.svg
rm -rf src-tauri/icons/android src-tauri/icons/ios   # desktop-only app
magick -size 256x256 xc:none -draw @assets/tray.mvg - |
  magick - -filter Lanczos -resize 44x44 src-tauri/icons/tray.png
```

The menu-bar mark is separate and flat black: macOS treats it as a template
image, tinting the alpha to match the bar, so colour there would be thrown away.

## Releasing

The installed app updates itself from GitHub Releases: it checks
`releases/latest/download/latest.json` at startup (and every few hours),
downloads in the background, and offers a restart in the title bar. To ship:

```sh
pnpm bump 0.2.0        # writes the version into package.json + tauri.conf.json
git add -A && git commit -m "v0.2.0"
git tag v0.2.0 && git push && git push --tags
```

The `Release` workflow builds on a macOS runner, signs the update artifacts,
and publishes the release. It needs one repository secret,
`TAURI_SIGNING_PRIVATE_KEY` — the contents of `~/.tauri/loops.key` (no
password). The matching public key lives in `tauri.conf.json`; losing the
private key means shipped apps can never verify another update, so keep a copy
somewhere safe.

## Adding a migration

Write `src-tauri/migrations/000N_*.sql`, then register it in both runners:
`migrations()` in `src-tauri/src/lib.rs` and `MIGRATIONS` in
`src/db/migrations.ts`. Never edit a migration that has shipped.
