# The web UI, as files

The page the daemon serves at `/` is built from the files in this folder by `../webui.py`, once, when the daemon
starts: `index.html` is the frame, every `.css` file goes into its `<style>` (`base.css` first, then the pages in tab
order), and every `.js` file into a `<script>` of its own (`shell.js` first, then the pages). There is no build step,
no package and nothing fetched from elsewhere. Every file here except this README is part of the daemon's code
fingerprint, so a change restarts the daemons of agents on the same version: iterate on a scratch daemon
(`PEERLINK_HOME=/tmp/peerlink-dev PEERLINK_PORT=7998 python3 plugin/daemon/peerlinkd.py serve`), and restart it to see
a change, since the page is read once at start.

| File | Owner | What's in it |
|---|---|---|
| `index.html` | shell | The frame: top bar, banners, `<main>`, bottom tab bar, sheet and toast hosts |
| `base.css` | shell | Tokens, the frame, shared components, the classes the moved page code still uses |
| `shell.js` | shell | `window.PL`: data, router, rendering, edit protection, sheets, toasts, helpers |
| `inbox.js` `inbox.css` | Inbox | `#inbox` |
| `agents.js` `agents.css` | Agents | `#agents`, `#agents/<name>` |
| `tasks.js` `tasks.css` | Tasks | `#tasks`, `#tasks/<tid>` |
| `messages.js` `messages.css` | Messages | `#messages`, `#messages/<conversation key or message id>` |
| `schedules.js` `schedules.css` | Schedules | `#schedules`, `#schedules/<cid>` |
| `setup.js` `setup.css` | Setup | `#setup`, `#setup/<spaces, rules, channels, settings, controls, feedback>` |

## The one rule for a page

**Touch only your own page's files** (`<page>.js`, and `<page>.css` if you need it). Don't edit `base.css`,
`shell.js`, `index.html` or another page's files. If you need something shared (a helper, a component, a token, a
change to the state object or the router), write it down in your report and build a page-local version meanwhile.
Every rule in `<page>.css` is scoped under `#page-<page>`, or under `body[data-page="<page>"]` for a rule about the
frame while your page shows (the Agents panel's room, for example). Each page's script is its own `<script>`, so an
error in one page doesn't stop the others; the page's error shows in a banner instead.

Several identifiers are global, because the pages were moved out of one script: a top-level `const`, `let` or
`function` in your file shares one namespace with every other file. Keep new top-level names distinctive, or keep them
inside your `PL.page({...})` object or a block.

## The page contract

```js
PL.page('tasks', {
  title: 'Tasks',
  html: `...`,              // optional static markup, put into the page's <section> once, at registration
  count: st => n || '',     // optional: the number on the page's tab (Setup's shows on the gear)
  mount(el, st, route) {},  // optional: each time the page becomes the visible one
  unmount(el) {},           // optional: each time it stops being visible
  render(st, route) {},     // required: draw the page for this state and route
});
```

- The shell makes `<section class="page" id="page-<name>">` (`PL.el(name)`, or `PL.pages[name].el`) inside `<main>`,
  hidden unless it's the current page.
- `render` is called only for the visible page: on every snapshot the daemon pushes, every 30 s (so "idle 12m" stays
  true), on every route change, and when a held region is released. It must be cheap to call often and must draw
  through `PL.paint` (below). Don't redraw other pages, and don't render from a timer of your own; call
  `PL.render()` (redraw now from the last snapshot) or `refresh(true)` / `PL.refresh()` (fetch, then redraw) after an
  action.
- `count` is called for every page on every render; keep it a cheap expression over the state. Return `''` for none.
  Only the Inbox count is accent-coloured. Messages has no count yet: its page decides what it should count.
- Desktop alerts for new Inbox items, the title's `(N)`, and the banners are the shell's.

## The state object

`render(st, route)` gets `PL.state`, built from the daemon's snapshot (`GET /api/snapshot`, pushed by
`/api/stream`; `peerlinkd.py` `snapshot()` is the contract):

| Field | What |
|---|---|
| `st.status` | `{version, host, home, browsers, limit, ...}` |
| `st.peers` | live agents, local and remote: `{id, name, cwd, branch, space, space_source, parent, leads, busy, busy_since, summary, summary_ts, headline, role, context, sent_hour, open_tasks, threads, also, links, muted, stale, remote, host, ...}` |
| `st.leads` | `{space: {name, cwd, how, live, parent}}` |
| `st.offline` | agents not running now (kept 60 days) |
| `st.messages` | the last 100 messages, oldest first. A conversation's full history is `GET /api/conversation?a=&b=` |
| `st.tasks` | up to 500 tasks |
| `st.issues` | feedback (bugs and ideas) |
| `st.inbox` | what waits on you: `{kind: task, question, feedback or approval, id, who, since, title, text}`. An approval's id says what it is: `s…` a new agent, `c…` a schedule, `r…` a rule |
| `st.schedules` | up to 200 schedules |
| `st.cfg` | `GET /api/config` (loaded at start and after a reconnect) |
| `st.snap` | the raw snapshot |

Rules, channel state and older messages are not in the snapshot: the page that needs them fetches them (Setup polls
`/api/rules` and the channel endpoints while their section is open). The older pages also read the same data from the
globals `livePeers`, `leadOf`, `offList`, `allTasks`, `allSched`, `inbox`, `allFeedback` and `cfg`; new code reads
`st`.

## Routing

Hash routes, `#<page>` or `#<page>/<id>`; `PL.route` is `{page, id, hash}` (the id is decoded, and may contain `/`).

| Route | Shows |
|---|---|
| (none) | Inbox when something waits on you, else Agents |
| `#agents/<name>` | that agent; its id when two live agents share the name (`PL.agentHref(x)` picks) |
| `#tasks/<tid>` | that task |
| `#messages/<key>` | that conversation; `<key>` is the conversation's key, or a message id like `m39` |
| `#schedules/<cid>` | that schedule |
| `#setup/<section>` | `spaces`, `rules`, `channels`, `settings`, `controls`, `feedback`; `#setup` is the overview |

The old hashes `#spaces`, `#rules`, `#channels`, `#discord`, `#settings`, `#controls`, `#feedback` redirect to
`#setup/<section>`. Back and Forward work because every detail is a route: open a detail with a link or `PL.go(hash)`,
close it by going to the page's bare hash. A page handles its own `route.id` in `render`, including one that names
nothing (show an empty state). An unknown page shows "No such page".

## Edit protection

The page is redrawn whenever the daemon pushes a change, so a redraw must never take away what you're typing.

- Draw every region that can change with `PL.paint(el, html)`. It does nothing when the HTML is unchanged, and leaves
  the region alone while it **holds the focused field, or a field whose value differs from what was drawn** (`PL.held`).
  The region is painted once you leave the field with nothing unsaved. It returns `true` when it painted.
- A region is released (its fields count as saved) when a form inside it is submitted, when a field outside a form
  fires `change` (fields that apply at once), or when a button inside an element marked `data-scope` is clicked (an
  Inbox item's note goes with its Done button). Call `PL.settle(el)` yourself after you've sent what a field held.
- `PL.paint(el, html, {force: true})` paints anyway: only for an explicit user action, like picking another item, and
  after asking `PL.dirty(el)`'s owner whether to drop the changes.
- Prefer sheets for editing: a sheet lives outside `<main>`, owns its form until Save or Cancel, and is never redrawn.
- Keep open `<details>`, expanded cards and scroll positions in your own state (a `Set`), since a paint replaces the
  region's DOM.

There is no longer a global `innerHTML` guard or a 4-second "paint anyway" window: assigning `innerHTML` yourself skips
all of this, so do it only for elements that can't hold input.

## Helpers on `window.PL`

Text arguments are escaped unless the name says HTML; anything an agent or a chat wrote must go through `PL.esc` or
`PL.md` before it reaches the page.

| Helper | Does |
|---|---|
| `PL.esc(s)`, `PL.md(s)`, `PL.plain(s)` | escape; safe markdown (http(s) links only); one-line plain text |
| `PL.api(path, opts)`, `PL.post(path, body)`, `PL.put`, `PL.del` | same-origin fetches returning JSON; a 401 shows the signed-out banner |
| `PL.refresh()`, `PL.render()` | fetch the snapshot and redraw / redraw from the last one |
| `PL.go(hash)`, `PL.route` | navigate / the current route |
| `PL.agentLink(nameOrId, label?)`, `PL.findAgent(nameOrId)`, `PL.agentHref(agent)` | a link to the agent's detail (plain text when no live agent matches) |
| `PL.taskLink(tid)`, `PL.msgLink(mid)`, `PL.schedLink(cid)` | links to `#tasks/<tid>`, `#messages/<mid>`, `#schedules/<cid>` |
| `PL.sheet.open({title, body, onSave, saveLabel, cancelLabel, danger, wide, onClose})` | a sheet (see `shell.js`); returns `{el, body, close, setError}`. `onSave(form, sheet)` returning `false` or an error string keeps it open |
| `PL.toast(text, {undo, kind, ms})` | a toast; `undo` is a function and adds an Undo button; `kind: 'bad'` for an error |
| `PL.ask(text, {ok})`, `PL.tell(text)` | the yes/no dialog (the verb is the first word; Delete, Cancel, End... are red) and the notice. Plan: only for terminate and delete; prefer Undo |
| `PL.badge(kind, text)` | a tinted badge: `ok`, `warn`, `bad`, `info`, `acc`, `mut` |
| `PL.row({href, icon, tile, title, sub, value, chevron, attrs, cls})`, `PL.group(rows)` | grouped-list rows (`title`/`sub`/`value` are HTML) |
| `PL.label(text)` | a small-caps section label |
| `PL.empty({icon, title, text, action})` | an empty state with at most one action `{label, href}` or `{label, attrs}` |
| `PL.avatar(name, size)` | a round initial in one of six pastel pairs, picked by name |
| `PL.meter(pct, {text, warn, bad})` | a meter with its number shown |
| `PL.icon(name, size)` | an inline SVG: `inbox agents tasks messages schedules setup search more x chev back check alert plus spaces rules channels settings controls feedback bell` |
| `PL.ago(ts)`, `PL.time(ts)`, `PL.date(ts)`, `PL.tilde(path)` | `12m`; `Nov 19, 10:04`; with the weekday; `~/…` |
| `PL.org(st)` | the spaces tree (groups, leads, nesting) the Agents chart and Setup's Spaces share |
| `PL.paint`, `PL.held`, `PL.dirty`, `PL.settle` | edit protection, above |
| `PL.pref(key, default)`, `PL.keep(key, value)` | this browser's preferences (`localStorage`, `peerlink.` prefix, guarded) |

Shared task rows (`taskRow`, `taskLog`, `byLive`, `isLive`, `TSTATE`, and the Cancel/Reopen and Reassign handlers) are
in `shell.js` because the Tasks list and the agent panel's Tasks tab both use them. So are `agentSelect`,
`agentFolders`, `liveAgents`, `platLogo` and the platform logos (Tasks, Messages and Setup use them), and `grp` (the
`details.plat` panels of Inbox and Feedback).

## Tokens and classes (`base.css`)

Colours are CSS variables with a light and a dark set (`prefers-color-scheme`, overridable with
`<html data-theme="light|dark">`): `--bg` (page) `--surface` (cards, sheets, inputs) `--fg` `--fg2` `--mut` `--faint`
`--line` `--hair` `--well`; the accent `--acc` (emerald-600, the one main action) `--acc-ink` (accent text, links)
`--acc-tint` (soft fills, the active tab) `--focus`; status trios `--ok|warn|bad|info` (text) with `-bg`, `-ring` and
`-solid`; `--solid`/`--solid-fg` (the default dark button). Radii `--r10 --r12 --r14 --r16 --r20` (small button, button
and input, segmented control and toast, card, sheet), `--tap` (44px), `--ease` (the one easing curve), shadows
`--shadow-sm|md|lg|xl`. Never hard-code a colour: dark mode comes from the tokens.

| Class | Is |
|---|---|
| `.btn` + `.btn-solid` `.btn-acc` `.btn-out` `.btn-soft` `.btn-tint` `.btn-danger` `.btn-ghost`, `.sm` | buttons, 44px (36px small), press-scale. Accent fill only for the one main action on a screen |
| `.icon-btn` | a 44px icon-only button |
| `input`, `textarea`, `select`, `.input`, `.field` + `.hint` | 44px, 16px text, emerald focus ring |
| `.badge` + `.b-ok` `.b-warn` `.b-bad` `.b-info` `.b-acc` `.b-mut` | tinted status badges |
| `.chips` > `.chip` (`.on` or `aria-pressed=true` selected) | 36px filter pills |
| `.seg` > `button`/`a` (`.on`) | segmented control, 2–4 choices |
| `.card`, `.group` > `.row` (`.tile` `.row-main` `.row-t` `.row-s` `.row-v` `.chev`), `.label` | cards, grouped lists, section labels |
| `.empty-state`, `.av`, `.meter`, `.dot` (`.busy`) | as the helpers draw them |
| `.banner.warn|bad|info` | the slim bars under the top bar |
| `.link` | an in-text link (agent, task, ...) |

The rest of `base.css` (`.task`, `details.plat`, `.pill`, `.tchip`, `.msgbar`, `.fl`, `.addline`, `.md`, ...) keeps
today's page markup working; move your page to the components above and stop using them. Pick up spacing from the
4px scale (8, 12, 16, 24); headings are 700 with -0.02em tracking; nothing under 12px.

## Checking a page

`peerlink-redesign/tools/` has a scratch daemon with a made-up team (`demo_daemon.py`), `smoke.py` (opens every route,
reports JavaScript errors) and `capture.py` (screenshots, desktop and phone, light and dark; add your page's shots to
`SHOTS`). Run the daemon tests with `python3 -m unittest discover -s plugin/daemon` and check every file with
`node --check plugin/daemon/ui/<file>.js`.
