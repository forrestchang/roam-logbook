# Roam Logbook

org-mode style clock tracking for Roam Research TODOs. Right-click a task to clock in, watch the session run in the topbar, and add it all up in a dashboard.

Entries are stored in the graph in org's own format, as a `LOGBOOK::` drawer under the task:

```
{{[[TODO]]}} this is a test task
  - LOGBOOK::
    - CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00
```

## Use

**Clock in** — right-click a TODO bullet → **Plugins** → **Logbook: Clock in**. The same menu offers **Logbook: Clock out** while a clock is running. Both are also in the Command Palette, acting on the block you are editing. Marking a running task `DONE` closes its clock immediately.

**Topbar** — sits just past Roam's back/forward arrows, so it neither displaces the navigation nor crowds the buttons on the right. Idle it is a single clock icon; running it reads

```
● 12:34 / 30:00 · 2h 05m · task name
```

the session so far, the pomodoro target when one is set, everything banked against that task, then the task itself. Weight and opacity fall off left to right, so the eye lands on the counter; the title is the first thing to ellipsize when space runs short and is repeated in full in the tooltip. Click for the list of open clocks, where each can be stopped, thrown away, given a pomodoro, or jumped to.

**Pomodoro** — right-click a task and choose **Logbook: Start pomodoro**, or hit the stopwatch on a row in the popover to put a target on a session already running. The counter becomes `12:34 / 30:00`. Past the target the entry turns a soft red and **keeps counting** — nothing stops on its own, because only you know whether to push on or break. Length is configurable, 30 minutes by default.

**Dashboard** — `Logbook: Open dashboard`, or the button in the popover. Totals for today and the last 7 days, a per-day bar row, and a per-task tree over the range you pick.

### Sub-tasks

Clocking only ever looks at the block you clocked — the drawer goes on that block and nowhere else. Structure is a *reporting* concern, resolved when the dashboard is drawn, so moving a sub-task or re-indenting it never invalidates the history already recorded.

The **By task** tree nests sub-tasks under their parent and shows two figures:

```
                Sessions   Own     Total
发布 v1             1      1h 00m  4h 00m
  └ 写文档          1      2h 00m  2h 00m
  └ 打包发布  ×2    1      1h 00m  1h 00m
冲刺周报                           1h 00m
  └ 打包发布  ×2    1      1h 00m  1h 00m
```

- **Own** is time clocked directly on that block, **Total** includes everything below it. A parent with no sessions of its own still appears, carrying its children's time.
- Plain blocks between two tasks are not levels — a note or a heading under a TODO is context, not a unit of work.
- A task nested under a parent by a bare `((reference))` rolls up there too, which is how a task on its own page gets counted toward a project that merely links it. A block that just *mentions* the task in a sentence does not adopt it.
- That makes several parents possible, so a task can appear more than once, tagged `×N`. Those rows overlap by design — the headline figures at the top are summed from sessions and count each one exactly once, so they always stay the honest total.

### Multiple clocks and double counting

Nothing stops you clocking a parent and one of its sub-tasks at the same time; both are real sessions and both are counted. Avoiding it is left to you.

### Block references

Clocking in on a block whose entire content is `((uid))` or `{{embed: ((uid))}}` writes the drawer onto the original task, not onto the mirror. Reference a task into today's daily note, clock it there, and the log still collects in one place.

### Unfinished clocks

A clock with no end stamp is a running clock — that is the whole persistence model, so a session survives a reload, a crash, or a clock started on another device. On load the extension reads them straight back out of the graph.

Clocks that have been open longer than the threshold (8 hours by default) are marked as likely forgotten: an amber dot on the topbar, a warning in the popover, and a `stale` tag in the dashboard's Running section. Each can be closed at the current time or discarded.

### One clock or several

By default, clocking in closes whatever was running, the way org-mode behaves. Turn on **Allow multiple clocks at once** in the settings to run several tasks in parallel; the topbar then shows the count, and clocking the same task twice is refused so nothing gets double-counted.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| Show topbar widget | on | The live counter and its clock list |
| Pomodoro length | 30m | Target for a pomodoro session; running past it only changes the colour |
| Only offer clock in on TODO blocks | on | Off lets any block be clocked |
| Allow multiple clocks at once | off | On runs several clocks in parallel |
| Flag unfinished clocks after | 8h | When a running clock is called out as forgotten |

## Notes

- Timestamps carry no timezone, matching org — `[2026-08-05 Wed 15:58]` reads as 15:58 wherever you open it.
- Durations truncate to whole minutes. A hand-edited `=> H:MM` is taken as authoritative over the stamps around it.
- A session that runs past midnight counts wholly against the day it began, as org's own clock reports do.
- Everything happens locally against your graph: no analytics, no network calls, no runtime dependency.

## Development

```bash
npm test     # unit tests plus a jsdom lifecycle smoke test
npm run lint
npm run build
npm run check
```

`npm run build` bundles `src/` into `extension.js` with esbuild. Commit the bundle alongside the source.

MIT licensed.
