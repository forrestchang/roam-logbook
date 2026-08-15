// src/time.js
var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var pad = (n) => String(n).padStart(2, "0");
function formatTimestamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${DAY_NAMES[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatStamp(date) {
  return `[${formatTimestamp(date)}]`;
}
var STAMP_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\S+))?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
function parseTimestamp(text) {
  if (typeof text !== "string")
    return null;
  const match = STAMP_RE.exec(text.trim());
  if (!match)
    return null;
  const [, year, month, day, , hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second || 0),
    0
  );
  const rolledOver = date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day);
  if (rolledOver || Number(hour) > 23 || Number(minute) > 59)
    return null;
  return date;
}
function durationMinutes(startMs, endMs) {
  return Math.max(0, Math.floor((endMs - startMs) / 6e4));
}
function formatDurationMinutes(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  return `${Math.floor(safe / 60)}:${pad(safe % 60)}`;
}
function parseDurationMinutes(text) {
  if (typeof text !== "string")
    return null;
  const match = /^(\d+):([0-5]\d)$/.exec(text.trim());
  if (!match)
    return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1e3));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
function formatMinutesHuman(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  if (hours === 0)
    return `${safe}m`;
  return `${hours}h ${pad(safe % 60)}m`;
}
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}
function startOfDaysAgo(date, days) {
  const start2 = startOfDay(date);
  start2.setDate(start2.getDate() - days);
  return start2;
}

// src/org.js
var DRAWER_LABEL = "LOGBOOK::";
var CLOCK_LABEL = "CLOCK::";
var DRAWER_RE = /^\s*:?LOGBOOK:{1,2}\s*$/i;
var CLOCK_RE = /^\s*:?CLOCK:{1,2}\s*\[([^\]]+)\](?:\s*--\s*\[([^\]]+)\])?(?:\s*=>\s*(\d+:[0-5]\d))?\s*$/i;
var TODO_RE = /\{\{\[\[(TODO|DONE)\]\]\}\}|\{\{(TODO|DONE)\}\}/;
var BLOCK_REF_ONLY_RE = /^\s*\(\(([a-zA-Z0-9_-]{6,})\)\)\s*$/;
var EMBED_ONLY_RE = /^\s*\{\{\[?\[?embed(?:-path|-children)?\]?\]?\s*:\s*\(\(([a-zA-Z0-9_-]{6,})\)\)\s*\}\}\s*$/i;
function isDrawerBlock(string) {
  return typeof string === "string" && DRAWER_RE.test(string);
}
function isTaskBlock(string) {
  return typeof string === "string" && TODO_RE.test(string);
}
function taskStatus(string) {
  if (typeof string !== "string")
    return null;
  const match = TODO_RE.exec(string);
  if (!match)
    return null;
  return (match[1] || match[2]).toUpperCase();
}
function parseClockLine(string) {
  if (typeof string !== "string")
    return null;
  const match = CLOCK_RE.exec(string);
  if (!match)
    return null;
  const start2 = parseTimestamp(match[1]);
  if (!start2)
    return null;
  const end = match[2] ? parseTimestamp(match[2]) : null;
  if (match[2] && !end)
    return null;
  if (end && end.getTime() < start2.getTime())
    return null;
  const stated = match[3] ? parseDurationMinutes(match[3]) : null;
  const minutes = end ? stated ?? durationMinutes(start2.getTime(), end.getTime()) : null;
  return { start: start2, end, minutes, running: !end };
}
function formatClockLine(start2, end) {
  if (!end)
    return `${CLOCK_LABEL} ${formatStamp(start2)}`;
  const minutes = durationMinutes(start2.getTime(), end.getTime());
  return `${CLOCK_LABEL} ${formatStamp(start2)}--${formatStamp(end)} => ${formatDurationMinutes(minutes)}`;
}
function referencedBlockUid(string) {
  if (typeof string !== "string")
    return null;
  const match = BLOCK_REF_ONLY_RE.exec(string) || EMBED_ONLY_RE.exec(string);
  return match ? match[1] : null;
}
function taskTitle(string, { maxLength = 80 } = {}) {
  if (typeof string !== "string")
    return "(untitled)";
  const cleaned = string.replace(TODO_RE, "").replace(/\{\{\[\[?[^}]*\}\}/g, "").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/#\[\[([^\]]+)\]\]/g, "$1").replace(/\(\([a-zA-Z0-9_-]{6,}\)\)/g, "").replace(/\^\^|\*\*|__|~~/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned)
    return "(untitled)";
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}\u2026` : cleaned;
}

// src/roam.js
function getApi() {
  return typeof window !== "undefined" && window.roamAlphaAPI || null;
}
function generateUid() {
  const api = getApi();
  if (typeof api?.util?.generateUID === "function")
    return api.util.generateUID();
  return Math.random().toString(36).slice(2, 11);
}
function resolve(namespace, modernName, legacyName = modernName) {
  const api = getApi();
  if (!api)
    return null;
  const modernOwner = namespace ? api.data?.[namespace] : api.data;
  if (typeof modernOwner?.[modernName] === "function") {
    return modernOwner[modernName].bind(modernOwner);
  }
  if (typeof api[legacyName] === "function")
    return api[legacyName].bind(api);
  return null;
}
function queryOrThrow(datalog, ...args) {
  const run = resolve(null, "q");
  if (!run)
    throw new Error("roamAlphaAPI q unavailable");
  return run(datalog, ...args) || [];
}
function query(datalog, ...args) {
  try {
    return queryOrThrow(datalog, ...args);
  } catch (error) {
    console.error("[roam-logbook] query failed", error);
    return [];
  }
}
function getBlockString(uid) {
  if (!uid)
    return null;
  const rows = query(
    "[:find ?s :in $ ?uid :where [?b :block/uid ?uid] [?b :block/string ?s]]",
    uid
  );
  return rows[0]?.[0] ?? null;
}
function watchBlockString(uid, callback) {
  const add = resolve(null, "addPullWatch");
  const remove = resolve(null, "removePullWatch");
  if (!uid || !add || !remove)
    return () => {
    };
  const pattern = "[:block/string]";
  const entityId = `[:block/uid ${JSON.stringify(uid)}]`;
  const handler = (_before, after) => callback(after?.[":block/string"] ?? getBlockString(uid));
  try {
    add(pattern, entityId, handler);
  } catch (error) {
    console.error("[roam-logbook] could not watch task status", error);
    return () => {
    };
  }
  let watching = true;
  return () => {
    if (!watching)
      return;
    watching = false;
    try {
      remove(pattern, entityId, handler);
    } catch (error) {
      console.error("[roam-logbook] could not remove task-status watch", error);
    }
  };
}
function resolveReferencedUid(uid) {
  const seen = /* @__PURE__ */ new Set();
  let current = uid;
  while (current && !seen.has(current)) {
    seen.add(current);
    const referenced = referencedBlockUid(getBlockString(current));
    if (!referenced)
      return current;
    current = referenced;
  }
  return current || uid;
}
function getChildren(uid) {
  if (!uid)
    return [];
  const rows = query(
    `[:find ?uid ?string ?order
          :in $ ?parent
          :where
          [?p :block/uid ?parent]
          [?p :block/children ?c]
          [?c :block/uid ?uid]
          [?c :block/string ?string]
          [?c :block/order ?order]]`,
    uid
  );
  return rows.map(([childUid, string, order]) => ({ uid: childUid, string, order })).sort((a, b) => a.order - b.order);
}
async function createBlock({ parentUid, order, string, uid }) {
  const create = resolve("block", "create", "createBlock");
  if (!create)
    throw new Error("roamAlphaAPI block.create unavailable");
  const blockUid = uid || generateUid();
  await create({
    location: { "parent-uid": parentUid, order },
    block: { string, uid: blockUid }
  });
  return blockUid;
}
async function updateBlock({ uid, string }) {
  const update = resolve("block", "update", "updateBlock");
  if (!update)
    throw new Error("roamAlphaAPI block.update unavailable");
  await update({ block: { uid, string } });
}
async function deleteBlock(uid) {
  const remove = resolve("block", "delete", "deleteBlock");
  if (!remove)
    throw new Error("roamAlphaAPI block.delete unavailable");
  await remove({ block: { uid } });
}
function getFocusedBlockUid() {
  const api = getApi();
  try {
    return api?.ui?.getFocusedBlock?.()?.["block-uid"] ?? null;
  } catch {
    return null;
  }
}
async function openBlock(uid) {
  const api = getApi();
  try {
    await api?.ui?.mainWindow?.openBlock?.({ block: { uid } });
  } catch (error) {
    console.error("[roam-logbook] could not open block", uid, error);
  }
}

// src/entries.js
var entriesQuery = (predicate) => `[:find ?clock-uid ?clock-string ?drawer-string ?task-uid ?task-string ?page-title
  :where
  [?d :block/string ?drawer-string]
  [(clojure.string/${predicate} ?drawer-string "LOGBOOK:")]
  [?d :block/children ?c]
  [?c :block/uid ?clock-uid]
  [?c :block/string ?clock-string]
  [?t :block/children ?d]
  [?t :block/uid ?task-uid]
  [?t :block/string ?task-string]
  [?t :block/page ?p]
  [?p :node/title ?page-title]]`;
function queryEntryRows() {
  try {
    return queryOrThrow(entriesQuery("includes?"));
  } catch (error) {
    console.warn("[roam-logbook] includes? unavailable, using starts-with?", error);
  }
  try {
    return queryOrThrow(entriesQuery("starts-with?"));
  } catch (error) {
    console.error("[roam-logbook] could not read logbook entries", error);
    return [];
  }
}
function readAllEntries() {
  const rows = queryEntryRows();
  const entries = [];
  for (const [clockUid, clockString, drawerString, taskUid, taskString, pageTitle] of rows) {
    if (!isDrawerBlock(drawerString))
      continue;
    const parsed = parseClockLine(clockString);
    if (!parsed)
      continue;
    entries.push({
      clockUid,
      taskUid,
      taskString,
      title: taskTitle(taskString),
      status: taskStatus(taskString),
      pageTitle: pageTitle ?? null,
      start: parsed.start,
      end: parsed.end,
      minutes: parsed.minutes,
      running: parsed.running
    });
  }
  entries.sort((a, b) => b.start.getTime() - a.start.getTime());
  return entries;
}
var MAX_ANCESTOR_DEPTH = 24;
var PARENTS_QUERY = `[:find ?uid ?parent-uid ?parent-string
  :in $ [?uid ...]
  :where
  [?b :block/uid ?uid]
  [?p :block/children ?b]
  [?p :block/uid ?parent-uid]
  [?p :block/string ?parent-string]]`;
var MIRRORS_QUERY = `[:find ?target-uid ?mirror-uid ?mirror-string
  :in $ [?target-uid ...]
  :where
  [?t :block/uid ?target-uid]
  [?m :block/refs ?t]
  [?m :block/uid ?mirror-uid]
  [?m :block/string ?mirror-string]]`;
function readHierarchy(taskUids) {
  const parentOf = {};
  const stringOf = {};
  const mirrorsOf = {};
  const seeds = new Set(taskUids);
  if (seeds.size === 0)
    return { parentOf, stringOf, mirrorsOf };
  try {
    for (const [targetUid, mirrorUid, mirrorString] of queryOrThrow(MIRRORS_QUERY, [...seeds])) {
      if (referencedBlockUid(mirrorString) !== targetUid)
        continue;
      (mirrorsOf[targetUid] || (mirrorsOf[targetUid] = [])).push(mirrorUid);
      stringOf[mirrorUid] = mirrorString;
    }
  } catch (error) {
    console.warn("[roam-logbook] block references unavailable for roll-up", error);
  }
  let frontier = [...seeds, ...Object.values(mirrorsOf).flat()];
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && frontier.length > 0; depth += 1) {
    const next = [];
    for (const [uid, rawParentUid, rawParentString] of query(PARENTS_QUERY, frontier)) {
      const referenced = referencedBlockUid(rawParentString);
      const parentUid = referenced ? resolveReferencedUid(rawParentUid) : rawParentUid;
      const parentString = referenced ? getBlockString(parentUid) : rawParentString;
      parentOf[uid] = parentUid;
      if (parentUid in stringOf)
        continue;
      stringOf[parentUid] = parentString;
      next.push(parentUid);
    }
    frontier = next;
  }
  return { parentOf, stringOf, mirrorsOf };
}

// src/settings.js
var SETTING_TOPBAR = "showTopbarWidget";
var SETTING_MULTIPLE = "allowMultipleClocks";
var SETTING_TODO_ONLY = "todoBlocksOnly";
var SETTING_STALE_HOURS = "staleHours";
var SETTING_POMODORO_MINUTES = "pomodoroMinutes";
var SETTING_POMODORO_STATE = "pomodoroTargets";
var DEFAULTS = {
  [SETTING_TOPBAR]: true,
  [SETTING_MULTIPLE]: false,
  [SETTING_TODO_ONLY]: true,
  [SETTING_STALE_HOURS]: "8",
  [SETTING_POMODORO_MINUTES]: "30"
};
var extensionAPI = null;
function setExtensionAPI(api) {
  extensionAPI = api;
}
function read(key) {
  const value = extensionAPI?.settings?.get(key);
  return value === void 0 || value === null ? DEFAULTS[key] : value;
}
function showTopbarWidget() {
  return read(SETTING_TOPBAR) !== false;
}
function allowMultipleClocks() {
  return read(SETTING_MULTIPLE) === true;
}
function todoBlocksOnly() {
  return read(SETTING_TODO_ONLY) !== false;
}
function staleHours() {
  const parsed = Number(read(SETTING_STALE_HOURS));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}
function pomodoroMinutes() {
  const parsed = Number(read(SETTING_POMODORO_MINUTES));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}
function readSetting(key) {
  return extensionAPI?.settings?.get(key) ?? null;
}
function writeSetting(key, value) {
  extensionAPI?.settings?.set(key, value);
}
function normalizeChecked(event) {
  return typeof event === "boolean" ? event : Boolean(event?.target?.checked);
}
function normalizeSelected(event) {
  return typeof event === "string" ? event : String(event?.target?.value ?? "");
}

// src/clock.js
var running = [];
var listeners = /* @__PURE__ */ new Set();
function subscribe(listener) {
  listeners.add(listener);
  listener(running);
  return () => listeners.delete(listener);
}
function getRunning() {
  return running;
}
function notify() {
  for (const listener of listeners) {
    try {
      listener(running);
    } catch (error) {
      console.error("[roam-logbook] listener failed", error);
    }
  }
}
function refresh() {
  const all = readAllEntries();
  const bankedByTask = /* @__PURE__ */ new Map();
  for (const entry of all) {
    if (entry.running)
      continue;
    bankedByTask.set(entry.taskUid, (bankedByTask.get(entry.taskUid) || 0) + (entry.minutes || 0));
  }
  running = all.filter((entry) => entry.running).map((entry) => ({ ...entry, priorMinutes: bankedByTask.get(entry.taskUid) || 0 }));
  notify();
  return running;
}
function reset() {
  running = [];
  listeners.clear();
}
function attachTaskCompletion({ now = () => /* @__PURE__ */ new Date() } = {}) {
  const watches = /* @__PURE__ */ new Map();
  const stopping = /* @__PURE__ */ new Map();
  let detached = false;
  const stopIfDone = (taskUid, string) => {
    if (detached || taskStatus(string) !== "DONE")
      return Promise.resolve(false);
    if (stopping.has(taskUid))
      return stopping.get(taskUid);
    const operation = clockOutBlock(taskUid, { now: now() }).catch((error) => {
      console.error("[roam-logbook] could not stop completed task", error);
      return false;
    }).finally(() => stopping.delete(taskUid));
    stopping.set(taskUid, operation);
    return operation;
  };
  const unsubscribe = subscribe((entries) => {
    const activeTaskUids = new Set(entries.map((entry) => entry.taskUid));
    for (const [taskUid, unwatch] of watches) {
      if (activeTaskUids.has(taskUid))
        continue;
      unwatch();
      watches.delete(taskUid);
    }
    for (const entry of entries) {
      if (!watches.has(entry.taskUid)) {
        watches.set(
          entry.taskUid,
          watchBlockString(entry.taskUid, (string) => stopIfDone(entry.taskUid, string))
        );
      }
      void stopIfDone(entry.taskUid, entry.taskString);
    }
  });
  return () => {
    if (detached)
      return;
    detached = true;
    unsubscribe();
    for (const unwatch of watches.values())
      unwatch();
    watches.clear();
  };
}
function resolveTaskUid(uid) {
  return resolveReferencedUid(uid);
}
async function ensureDrawer(taskUid) {
  const children = getChildren(taskUid);
  const existing = children.find((child) => isDrawerBlock(child.string));
  if (existing)
    return existing.uid;
  return createBlock({ parentUid: taskUid, order: 0, string: DRAWER_LABEL });
}
async function clockIn(blockUid, { now = /* @__PURE__ */ new Date() } = {}) {
  const taskUid = resolveTaskUid(blockUid);
  if (!taskUid)
    throw new Error("No block to clock in");
  if (!allowMultipleClocks()) {
    for (const entry of readAllEntries().filter((item) => item.running)) {
      await closeClockBlock(entry.clockUid, now);
    }
  } else if (running.some((entry) => entry.taskUid === taskUid)) {
    throw new Error("This task already has a running clock");
  }
  const drawerUid = await ensureDrawer(taskUid);
  const order = getChildren(drawerUid).length;
  const clockUid = await createBlock({
    parentUid: drawerUid,
    order,
    string: formatClockLine(now)
  });
  refresh();
  return { clockUid, taskUid };
}
async function closeClockBlock(clockUid, end) {
  const string = getBlockString(clockUid);
  const parsed = parseClockLine(string);
  if (!parsed || !parsed.running)
    return false;
  const endAt = end.getTime() < parsed.start.getTime() ? parsed.start : end;
  await updateBlock({ uid: clockUid, string: formatClockLine(parsed.start, endAt) });
  return true;
}
async function clockOut(clockUid, { now = /* @__PURE__ */ new Date() } = {}) {
  const closed = await closeClockBlock(clockUid, now);
  refresh();
  return closed;
}
async function clockOutAll({ now = /* @__PURE__ */ new Date() } = {}) {
  let count = 0;
  for (const entry of running.slice()) {
    if (await closeClockBlock(entry.clockUid, now))
      count += 1;
  }
  refresh();
  return count;
}
async function clockOutBlock(blockUid, options) {
  const taskUid = resolveTaskUid(blockUid);
  const entry = running.find((item) => item.taskUid === taskUid);
  if (!entry)
    return false;
  return clockOut(entry.clockUid, options);
}
async function discardClock(clockUid) {
  const entry = readAllEntries().find((item) => item.clockUid === clockUid);
  await deleteBlock(clockUid);
  if (entry) {
    const drawer = getChildren(entry.taskUid).find((child) => isDrawerBlock(child.string));
    if (drawer && getChildren(drawer.uid).length === 0)
      await deleteBlock(drawer.uid);
  }
  refresh();
  return true;
}
function isBlockRunning(blockUid) {
  const taskUid = resolveTaskUid(blockUid);
  return running.some((entry) => entry.taskUid === taskUid);
}

// src/dom.js
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className)
    node.className = className;
  if (text !== void 0 && text !== null)
    node.textContent = text;
  return node;
}
function button(className, text, onClick, { title } = {}) {
  const node = el("button", className, text);
  node.type = "button";
  if (title) {
    node.title = title;
    node.setAttribute("aria-label", title);
  }
  node.addEventListener("click", onClick);
  return node;
}
function injectStyles(id, css) {
  if (document.getElementById(id))
    return;
  const style = el("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
function removeStyles(id) {
  document.getElementById(id)?.remove();
}

// src/stats.js
var EMPTY_HIERARCHY = { parentOf: {}, stringOf: {}, mirrorsOf: {} };
var RANGES = [
  { id: "today", label: "Today", days: 1 },
  { id: "week", label: "Last 7 days", days: 7 },
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "all", label: "All time", days: null }
];
function getRange(id) {
  return RANGES.find((range) => range.id === id) || RANGES[1];
}
function entryMinutes(entry, now) {
  if (!entry.running)
    return entry.minutes ?? 0;
  return Math.max(0, Math.floor((now.getTime() - entry.start.getTime()) / 6e4));
}
function filterByRange(entries, rangeId, now) {
  const { days } = getRange(rangeId);
  if (days === null)
    return entries.slice();
  const from = days === 1 ? startOfDay(now) : startOfDaysAgo(now, days - 1);
  return entries.filter((entry) => entry.start.getTime() >= from.getTime());
}
function totalMinutes(entries, now) {
  return entries.reduce((sum, entry) => sum + entryMinutes(entry, now), 0);
}
function summariseByTask(entries, now) {
  const byTask = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    let row = byTask.get(entry.taskUid);
    if (!row) {
      row = {
        taskUid: entry.taskUid,
        title: entry.title,
        status: entry.status ?? null,
        pageTitle: entry.pageTitle,
        minutes: 0,
        sessions: 0,
        running: false,
        lastActivity: entry.start
      };
      byTask.set(entry.taskUid, row);
    }
    row.minutes += entryMinutes(entry, now);
    row.sessions += 1;
    row.running = row.running || entry.running;
    const activity = entry.end ?? entry.start;
    if (activity.getTime() > row.lastActivity.getTime())
      row.lastActivity = activity;
  }
  return [...byTask.values()].sort((a, b) => b.minutes - a.minutes);
}
function summariseByDay(entries, now, days) {
  const buckets = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const key = dateKey(entry.start);
    buckets.set(key, (buckets.get(key) || 0) + entryMinutes(entry, now));
  }
  const series = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = startOfDaysAgo(now, offset);
    const key = dateKey(date);
    series.push({ date, key, minutes: buckets.get(key) || 0 });
  }
  return series;
}
var MAX_WALK = 50;
function nearestTaskAncestor(uid, { parentOf, stringOf }) {
  let current = parentOf[uid];
  for (let steps = 0; current && steps < MAX_WALK; steps += 1) {
    if (isTaskBlock(stringOf[current]))
      return current;
    current = parentOf[current];
  }
  return null;
}
function buildTaskForest(taskRows, hierarchy = EMPTY_HIERARCHY) {
  const nodes = /* @__PURE__ */ new Map();
  for (const row of taskRows) {
    nodes.set(row.taskUid, { ...row, own: row.minutes, children: [], parents: /* @__PURE__ */ new Set() });
  }
  const pending = [...nodes.keys()];
  while (pending.length > 0) {
    const uid = pending.shift();
    const parents = /* @__PURE__ */ new Set();
    const structural = nearestTaskAncestor(uid, hierarchy);
    if (structural)
      parents.add(structural);
    for (const mirrorUid of hierarchy.mirrorsOf[uid] || []) {
      const viaReference = nearestTaskAncestor(mirrorUid, hierarchy);
      if (viaReference)
        parents.add(viaReference);
    }
    for (const parentUid of parents) {
      if (parentUid === uid)
        continue;
      if (!nodes.has(parentUid)) {
        nodes.set(parentUid, {
          taskUid: parentUid,
          title: taskTitle(hierarchy.stringOf[parentUid]),
          status: taskStatus(hierarchy.stringOf[parentUid]),
          pageTitle: null,
          minutes: 0,
          own: 0,
          sessions: 0,
          running: false,
          children: [],
          parents: /* @__PURE__ */ new Set()
        });
        pending.push(parentUid);
      }
      nodes.get(uid).parents.add(parentUid);
      const siblings = nodes.get(parentUid).children;
      if (!siblings.includes(uid))
        siblings.push(uid);
    }
  }
  const expand = (uid, path) => {
    const node = nodes.get(uid);
    const base = {
      taskUid: node.taskUid,
      title: node.title,
      status: node.status ?? null,
      pageTitle: node.pageTitle,
      own: node.own,
      sessions: node.sessions,
      running: node.running,
      occurrences: node.parents.size
    };
    if (path.has(uid))
      return { ...base, total: node.own, children: [], truncated: true };
    const nextPath = new Set(path).add(uid);
    const children = node.children.map((childUid) => expand(childUid, nextPath)).sort((a, b) => b.total - a.total);
    return {
      ...base,
      total: node.own + children.reduce((sum, child) => sum + child.total, 0),
      children,
      truncated: false
    };
  };
  const forest = [];
  const covered = /* @__PURE__ */ new Set();
  const addRoot = (uid) => {
    const tree = expand(uid, /* @__PURE__ */ new Set());
    forest.push(tree);
    (function cover(node) {
      covered.add(node.taskUid);
      node.children.forEach(cover);
    })(tree);
  };
  for (const [uid, node] of nodes)
    if (node.parents.size === 0)
      addRoot(uid);
  for (const uid of nodes.keys())
    if (!covered.has(uid))
      addRoot(uid);
  return forest.sort((a, b) => b.total - a.total);
}
function flattenForest(forest, options = {}, depth = 0) {
  return forest.flatMap((node) => {
    const collapsed = node.children.length > 0 && Boolean(options.isCollapsed?.(node));
    const row = { ...node, depth, collapsed, hasChildren: node.children.length > 0 };
    return collapsed ? [row] : [row, ...flattenForest(node.children, options, depth + 1)];
  });
}
function buildDashboard(entries, { now, rangeId, hierarchy = EMPTY_HIERARCHY }) {
  const inRange = filterByRange(entries, rangeId, now);
  const tasks = summariseByTask(inRange, now);
  return {
    rangeId,
    entries: inRange,
    // Summed from entries, so this stays the honest figure even when the tree
    // shows the same task under more than one parent.
    totalMinutes: totalMinutes(inRange, now),
    todayMinutes: totalMinutes(filterByRange(entries, "today", now), now),
    weekMinutes: totalMinutes(filterByRange(entries, "week", now), now),
    tasks,
    tree: buildTaskForest(tasks, hierarchy),
    days: summariseByDay(inRange, now, getRange(rangeId).days ?? 30),
    running: entries.filter((entry) => entry.running)
  };
}
function findStaleClocks(entries, now, staleHours2) {
  const cutoff = now.getTime() - staleHours2 * 36e5;
  return entries.filter((entry) => entry.running && entry.start.getTime() < cutoff);
}

// src/dashboard.js
var ROOT_ID = "roam-logbook-dashboard";
function createDashboard() {
  let root = null;
  let bodyNode = null;
  let rangeId = "week";
  let returnFocusTo = null;
  const collapsed = /* @__PURE__ */ new Set();
  const render = () => {
    if (!bodyNode)
      return;
    const now = /* @__PURE__ */ new Date();
    const entries = readAllEntries();
    const hierarchy = readHierarchy([...new Set(entries.map((entry) => entry.taskUid))]);
    const model = buildDashboard(entries, { now, rangeId, hierarchy });
    bodyNode.replaceChildren();
    const rangeLabel = getRange(rangeId).label;
    const duplicatesFixedCard = rangeId === "today" || rangeId === "week";
    bodyNode.appendChild(
      statsRow([
        ["Today", formatMinutesHuman(model.todayMinutes)],
        ["Last 7 days", formatMinutesHuman(model.weekMinutes)],
        ...duplicatesFixedCard ? [] : [[rangeLabel, formatMinutesHuman(model.totalMinutes)]],
        ["Tasks tracked", String(model.tasks.length)]
      ])
    );
    if (model.running.length > 0) {
      bodyNode.appendChild(runningSection(model.running, now));
    }
    if (model.entries.length === 0) {
      bodyNode.appendChild(
        el("div", "rlb-empty", "No clock entries in this range yet.")
      );
      return;
    }
    bodyNode.appendChild(daysSection(model.days));
    bodyNode.appendChild(tasksSection(model.tree));
  };
  const statsRow = (pairs) => {
    const wrapper = el("div", "rlb-stats");
    for (const [label, value] of pairs) {
      const card = el("div", "rlb-stat");
      card.append(el("strong", "rlb-stat__value", value), el("span", "rlb-stat__label", label));
      wrapper.appendChild(card);
    }
    return wrapper;
  };
  const runningSection = (running2, now) => {
    const stale = new Set(findStaleClocks(running2, now, staleHours()).map((e) => e.clockUid));
    const section = el("section", "rlb-section");
    section.appendChild(
      el(
        "h3",
        "rlb-section__title",
        stale.size > 0 ? `Running \xB7 ${stale.size} unfinished for over ${staleHours()}h` : "Running"
      )
    );
    const table = el("table", "rlb-table");
    table.appendChild(
      headerRow(["Task", "Started", { label: "Elapsed", numeric: true }, ""])
    );
    const tbody = el("tbody");
    for (const entry of running2) {
      const row = el("tr");
      const task = el("td", "rlb-cell");
      const mark = statusMark(entry.status);
      if (mark)
        task.appendChild(mark);
      task.appendChild(taskLink(entry.title, entry.taskUid));
      if (stale.has(entry.clockUid)) {
        task.appendChild(el("span", "bp3-tag bp3-minimal bp3-intent-warning", "stale"));
      }
      const actions = el("td", "rlb-table__num");
      actions.append(
        button(
          "bp3-button bp3-minimal bp3-small bp3-icon-stop bp3-intent-success",
          "",
          () => void act(() => clockOut(entry.clockUid)),
          { title: "Clock out now" }
        ),
        button(
          "bp3-button bp3-minimal bp3-small bp3-icon-trash",
          "",
          () => void act(() => discardClock(entry.clockUid)),
          { title: "Discard this entry" }
        )
      );
      row.append(
        task,
        el("td", "rlb-muted", formatStamp(entry.start)),
        el("td", "rlb-table__num", formatElapsed(now.getTime() - entry.start.getTime())),
        actions
      );
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  };
  const daysSection = (days) => {
    const section = el("section", "rlb-section");
    section.appendChild(el("h3", "rlb-section__title", "By day"));
    const peak = Math.max(1, ...days.map((day) => day.minutes));
    const bars = el("div", "rlb-bars");
    for (const day of days) {
      const bar = el("div", `rlb-bar${day.minutes === 0 ? " rlb-bar--empty" : ""}`);
      bar.title = `${day.key} \xB7 ${formatMinutesHuman(day.minutes)}`;
      const fill = el("div", "rlb-bar__fill");
      fill.style.height = `${Math.max(2, Math.round(day.minutes / peak * 100))}%`;
      bar.appendChild(fill);
      bars.appendChild(bar);
    }
    section.appendChild(bars);
    section.appendChild(
      el("div", "rlb-muted bp3-text-small", `${days[0]?.key} \u2192 ${days[days.length - 1]?.key}`)
    );
    return section;
  };
  const tasksSection = (tree) => {
    const everyRow = flattenForest(tree);
    const parentUids = everyRow.filter((node) => node.hasChildren).map((node) => node.taskUid);
    const nested = everyRow.some((node) => node.depth > 0);
    const section = el("section", "rlb-section");
    const heading = el("div", "rlb-section__heading");
    heading.appendChild(el("h3", "rlb-section__title", "By task"));
    const toggleAll = button("bp3-button bp3-minimal bp3-small", "", () => {
      const anyExpanded = parentUids.some((uid) => !collapsed.has(uid));
      if (anyExpanded)
        for (const uid of parentUids)
          collapsed.add(uid);
      else
        collapsed.clear();
      paint();
    });
    if (parentUids.length > 0)
      heading.appendChild(toggleAll);
    section.appendChild(heading);
    const tableHost = el("div");
    section.appendChild(tableHost);
    function paint() {
      const rows = flattenForest(tree, { isCollapsed: (node) => collapsed.has(node.taskUid) });
      const anyExpanded = parentUids.some((uid) => !collapsed.has(uid));
      toggleAll.textContent = anyExpanded ? "Collapse all" : "Expand all";
      const table = el("table", "rlb-table");
      table.appendChild(
        headerRow([
          "Task",
          { label: "Sessions", numeric: true },
          { label: "Own", numeric: true },
          { label: "Total", numeric: true }
        ])
      );
      const tbody = el("tbody");
      for (const node of rows) {
        const row = el("tr");
        const name = el("td", "rlb-tree__cell");
        name.style.paddingLeft = `${8 + node.depth * 20}px`;
        if (node.hasChildren) {
          const caret = button(
            `bp3-button bp3-minimal bp3-small rlb-tree__toggle bp3-icon-chevron-${node.collapsed ? "right" : "down"}`,
            "",
            () => {
              if (collapsed.has(node.taskUid))
                collapsed.delete(node.taskUid);
              else
                collapsed.add(node.taskUid);
              paint();
            },
            { title: node.collapsed ? "Expand sub-tasks" : "Collapse sub-tasks" }
          );
          caret.setAttribute("aria-expanded", String(!node.collapsed));
          name.appendChild(caret);
        } else {
          name.appendChild(el("span", "rlb-tree__toggle rlb-tree__toggle--empty"));
        }
        const mark = statusMark(node.status);
        if (mark)
          name.appendChild(mark);
        if (node.status === "DONE")
          row.classList.add("rlb-row--done");
        name.appendChild(taskLink(node.title, node.taskUid));
        if (node.occurrences > 1) {
          const badge = el("span", "bp3-tag bp3-minimal rlb-tree__badge", `\xD7${node.occurrences}`);
          badge.title = `Also rolls up under ${node.occurrences - 1} other task(s)`;
          name.appendChild(badge);
        }
        if (node.truncated) {
          name.appendChild(el("span", "bp3-tag bp3-minimal bp3-intent-warning", "loop"));
        }
        if (node.collapsed) {
          const hidden = countDescendants(node);
          name.appendChild(
            el("span", "rlb-muted rlb-tree__hidden", `+${hidden} sub-task${hidden > 1 ? "s" : ""}`)
          );
        }
        row.append(
          name,
          el("td", "rlb-table__num rlb-muted", node.sessions ? String(node.sessions) : ""),
          el("td", "rlb-table__num rlb-muted", node.own > 0 ? formatMinutesHuman(node.own) : ""),
          el("td", "rlb-table__num rlb-tree__total", formatMinutesHuman(node.total))
        );
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      tableHost.replaceChildren(table);
    }
    paint();
    if (nested) {
      section.appendChild(
        el(
          "div",
          "rlb-muted bp3-text-small rlb-tree__note",
          "Total includes sub-tasks, so rows overlap \u2014 the figures above are counted once each."
        )
      );
    }
    return section;
  };
  const countDescendants = (node) => node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
  const headerRow = (columns) => {
    const thead = el("thead");
    const row = el("tr");
    for (const column of columns) {
      const numeric = typeof column === "object" && column.numeric;
      row.appendChild(el("th", numeric ? "rlb-table__num" : "", column.label ?? column));
    }
    thead.appendChild(row);
    return thead;
  };
  const statusMark = (status) => {
    if (!status)
      return null;
    const done = status === "DONE";
    const mark = el("span", `rlb-status rlb-status--${done ? "done" : "todo"}`);
    mark.title = done ? "DONE" : "TODO";
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", done ? "Done" : "To do");
    return mark;
  };
  const taskLink = (title, taskUid) => button("bp3-button bp3-minimal bp3-small rlb-task-link", title, () => {
    close();
    void openBlock(taskUid);
  }, { title: "Open this block" });
  const act = async (action) => {
    try {
      await action();
    } catch (error) {
      console.error("[roam-logbook]", error);
    }
    render();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape" && root?.classList.contains("rlb-root--open")) {
      event.stopPropagation();
      close();
    }
  };
  const build = () => {
    const overlay = el("div", "rlb-root");
    overlay.id = ROOT_ID;
    overlay.setAttribute("aria-hidden", "true");
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay)
        close();
    });
    const dialog = el("div", "bp3-dialog rlb-dialog");
    dialog.tabIndex = -1;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const header = el("header", "bp3-dialog-header rlb-header");
    header.appendChild(el("h2", "bp3-heading rlb-header__title", "Logbook"));
    const selectWrapper = el("div", "bp3-select bp3-small");
    const select = el("select");
    for (const range of RANGES) {
      const option = el("option", "", range.label);
      option.value = range.id;
      if (range.id === rangeId)
        option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", (event) => {
      rangeId = event.target.value;
      render();
    });
    selectWrapper.appendChild(select);
    header.append(
      selectWrapper,
      button("bp3-button bp3-minimal bp3-small bp3-icon-refresh", "", () => {
        refresh();
        render();
      }, { title: "Reload from the graph" }),
      button(
        "bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross",
        "",
        close,
        { title: "Close" }
      )
    );
    bodyNode = el("div", "rlb-body");
    dialog.append(header, bodyNode);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    return overlay;
  };
  function close() {
    if (!root)
      return;
    root.classList.remove("rlb-root--open");
    root.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKeyDown, true);
    if (returnFocusTo?.isConnected)
      returnFocusTo.focus();
    returnFocusTo = null;
  }
  return {
    open() {
      const active = document.activeElement;
      returnFocusTo = active && active !== document.body ? active : null;
      if (!root)
        root = build();
      root.classList.add("rlb-root--open");
      root.setAttribute("aria-hidden", "false");
      document.addEventListener("keydown", onKeyDown, true);
      refresh();
      render();
      root.querySelector(".rlb-dialog")?.focus();
    },
    close,
    destroy() {
      document.removeEventListener("keydown", onKeyDown, true);
      root?.remove();
      root = null;
      bodyNode = null;
    }
  };
}

// src/pomodoro.js
var targets = /* @__PURE__ */ new Map();
function load() {
  targets = /* @__PURE__ */ new Map();
  const raw = readSetting(SETTING_POMODORO_STATE);
  if (!raw)
    return;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    for (const [clockUid, minutes] of Object.entries(parsed || {})) {
      const value = Number(minutes);
      if (Number.isFinite(value) && value > 0)
        targets.set(clockUid, value);
    }
  } catch (error) {
    console.warn("[roam-logbook] could not read pomodoro state", error);
  }
}
function persist() {
  writeSetting(SETTING_POMODORO_STATE, JSON.stringify(Object.fromEntries(targets)));
}
function targetMinutes(clockUid) {
  return targets.get(clockUid) ?? null;
}
function isActive(clockUid) {
  return targets.has(clockUid);
}
function start(clockUid, minutes = pomodoroMinutes()) {
  if (!clockUid || !(minutes > 0))
    return false;
  targets.set(clockUid, minutes);
  persist();
  return true;
}
function cancel(clockUid) {
  if (!targets.delete(clockUid))
    return false;
  persist();
  return true;
}
function toggle(clockUid, minutes = pomodoroMinutes()) {
  return isActive(clockUid) ? !cancel(clockUid) : start(clockUid, minutes);
}
function prune(runningClockUids) {
  const live = new Set(runningClockUids);
  let changed = false;
  for (const clockUid of [...targets.keys()]) {
    if (!live.has(clockUid)) {
      targets.delete(clockUid);
      changed = true;
    }
  }
  if (changed)
    persist();
  return changed;
}
function overrunMs(entry, now = Date.now()) {
  const minutes = entry && targets.get(entry.clockUid);
  if (!minutes)
    return 0;
  return Math.max(0, now - entry.start.getTime() - minutes * 6e4);
}
function isOverrun(entry, now = Date.now()) {
  return overrunMs(entry, now) > 0;
}
function attach() {
  let sawInitialReplay = false;
  return subscribe((running2) => {
    if (!sawInitialReplay) {
      sawInitialReplay = true;
      return;
    }
    prune(running2.map((entry) => entry.clockUid));
  });
}
function reset2() {
  targets = /* @__PURE__ */ new Map();
}

// src/styles.js
var STYLE_ID = "roam-logbook-styles";
var STYLES = `
.rlb-topbar {
    display: flex;
    align-items: center;
    position: relative;
    min-width: 0;
    /* Roam's controls carry no margin of their own, so the widget has to keep
       its own distance rather than butt up against the one beside it. */
    margin: 0 6px;
}

.rlb-topbar__button {
    display: flex;
    align-items: center;
    gap: 6px;
    /* Blueprint centres button content. Combined with overflow: hidden that
       clips an over-wide widget at BOTH ends, which ate the leading digits of
       the counter as well as the ellipsis off the end of the title. */
    justify-content: flex-start;
    /* A long task name must never widen the widget into Roam's own controls.
       Scales down with the window so a narrow graph view stays usable. */
    max-width: min(260px, 26vw);
    overflow: hidden;
    font-variant-numeric: tabular-nums;
}

.rlb-topbar__button > .bp3-icon,
.rlb-topbar__button > .rlb-dot {
    flex: 0 0 auto;
}

.rlb-topbar__labels {
    display: flex;
    align-items: baseline;
    /* Flex strips leading whitespace from an item, so spacing between segments
       has to come from gap; writing " . 44m" into the text silently loses the
       space and renders as "19:50. 44m". */
    gap: 5px;
    /* Without this the labels box refuses to shrink below its text, the button
       blows past max-width, and the ellipsis below never gets a chance to apply. */
    min-width: 0;
    overflow: hidden;
}

/* An empty segment would still earn a gap on both sides, so it is removed from
   layout entirely rather than left as a zero-width item. */
.rlb-topbar__labels > :empty {
    display: none;
}

.rlb-topbar__target::before,
.rlb-topbar__total::before,
.rlb-topbar__label::before {
    margin-right: 5px;
    opacity: 0.45;
}

.rlb-topbar__target::before {
    content: '/';
}

.rlb-topbar__total::before,
.rlb-topbar__label::before {
    content: '\xB7';
}

/* The counter is the point of the widget, so it is the one thing that never shrinks. */
.rlb-topbar__time {
    flex: 0 0 auto;
    font-weight: 600;
}

/* Target and total are context for the counter, so they read quieter than it
   and louder than the title, which the popover and tooltip both repeat. */
.rlb-topbar__target {
    flex: 0 0 auto;
    font-weight: 600;
    opacity: 0.55;
}

.rlb-topbar__total {
    flex: 0 0 auto;
    font-size: 0.92em;
    opacity: 0.7;
}

/* The title is what gives way, down to an ellipsis.
   The max-width is what makes the ellipsis reliable: it gives the element a
   definite size to overflow, instead of depending on shrinkage propagating
   correctly down a nested flex chain. */
.rlb-topbar__label {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92em;
    opacity: 0.8;
}

/* On a narrow window the title is dropped outright rather than squeezed to a
   few characters \u2014 the counter and the totals are what earn the space, and the
   task name is still one hover or one click away. */
@media (max-width: 1080px) {
    .rlb-topbar__label {
        display: none;
    }
}

.rlb-topbar__button--running {
    color: #0f9960;
}

.bp3-dark .rlb-topbar__button--running {
    color: #3dcc91;
}

/* Past the pomodoro target. Deliberately a soft red: the clock is still running
   and nothing is wrong, it is a nudge to decide, not an error. */
.rlb-topbar__button--overrun {
    color: #cd4246;
    background: rgba(205, 66, 70, 0.12);
}

.bp3-dark .rlb-topbar__button--overrun {
    color: #ff7373;
    background: rgba(255, 115, 115, 0.15);
}

.rlb-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #0f9960;
    flex: 0 0 auto;
    animation: rlb-pulse 2s ease-in-out infinite;
}

.rlb-dot--stale {
    background: #d9822b;
    animation: none;
}

.rlb-dot--overrun {
    background: #cd4246;
}

@keyframes rlb-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
    .rlb-dot { animation: none; }
}

/* ---- popover ---- */

/* Lives on <body>, positioned from the button's rect, so the topbar cannot clip it. */
.rlb-popover {
    position: fixed;
    z-index: 30;
    width: min(340px, calc(100vw - 16px));
    max-height: 70vh;
    overflow-y: auto;
    padding: 8px;
    text-align: left;
    cursor: default;
}

.rlb-popover__title {
    padding: 4px 6px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    opacity: 0.6;
}

.rlb-popover__empty {
    padding: 6px 6px 12px;
    opacity: 0.7;
}

.rlb-popover__footer {
    display: flex;
    gap: 6px;
    padding-top: 8px;
    margin-top: 4px;
    border-top: 1px solid rgba(16, 22, 26, 0.15);
}

.bp3-dark .rlb-popover__footer {
    border-top-color: rgba(255, 255, 255, 0.15);
}

.rlb-run {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px;
    border-radius: 3px;
}

.rlb-run:hover {
    background: rgba(167, 182, 194, 0.2);
}

.rlb-run--overrun .rlb-run__meta {
    color: #cd4246;
    opacity: 1;
}

.bp3-dark .rlb-run--overrun .rlb-run__meta {
    color: #ff7373;
}

.rlb-run__pomodoro--on {
    color: #cd4246;
}

.rlb-run__body {
    flex: 1 1 auto;
    min-width: 0;
}

.rlb-run__title {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    padding: 0;
}

.rlb-run__meta {
    font-size: 11px;
    opacity: 0.65;
    font-variant-numeric: tabular-nums;
}

.rlb-run__actions {
    display: flex;
    gap: 2px;
    flex: 0 0 auto;
}

/* ---- dashboard ---- */

.rlb-root {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 100;
    align-items: flex-start;
    justify-content: center;
    padding: 6vh 16px 16px;
    background: rgba(16, 22, 26, 0.7);
}

.rlb-root--open {
    display: flex;
}

.rlb-dialog {
    width: min(920px, 100%);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding-bottom: 0;
}

.rlb-header {
    display: flex;
    align-items: center;
    gap: 12px;
}

.rlb-header__title {
    flex: 1 1 auto;
    margin: 0;
}

.rlb-body {
    padding: 16px 20px 20px;
    overflow-y: auto;
}

.rlb-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 18px;
}

.rlb-stat {
    padding: 10px 12px;
    border-radius: 3px;
    background: rgba(167, 182, 194, 0.2);
}

.rlb-stat__value {
    display: block;
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.rlb-stat__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.65;
}

.rlb-section {
    margin-bottom: 20px;
}

.rlb-section__title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    opacity: 0.65;
}

.rlb-bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 96px;
    padding: 4px 0;
}

.rlb-bar {
    flex: 1 1 0;
    min-width: 4px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
}

.rlb-bar__fill {
    background: #2d72d2;
    border-radius: 2px 2px 0 0;
    min-height: 2px;
}

.rlb-bar--empty .rlb-bar__fill {
    background: rgba(167, 182, 194, 0.35);
}

.rlb-table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
}

.rlb-table th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(16, 22, 26, 0.15);
}

.rlb-table td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(16, 22, 26, 0.08);
    vertical-align: top;
}

.bp3-dark .rlb-table th {
    border-bottom-color: rgba(255, 255, 255, 0.2);
}

.bp3-dark .rlb-table td {
    border-bottom-color: rgba(255, 255, 255, 0.1);
}

.rlb-table__num {
    text-align: right;
    white-space: nowrap;
}

/* Beats the .rlb-table th left-align above, which otherwise parks a numeric
   column's label against the opposite edge from its figures. */
.rlb-table th.rlb-table__num {
    text-align: right;
}

.rlb-cell,
.rlb-tree__cell {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
}

.rlb-section__heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.rlb-section__heading .rlb-section__title {
    margin: 0;
}

/* Scoped to the cell so it outranks .bp3-button.bp3-small, whose own min-width
   would otherwise make the caret wider than the spacer on childless rows and put
   the two sets of titles on different left edges. */
.rlb-tree__cell > .rlb-tree__toggle {
    flex: 0 0 auto;
    width: 20px;
    min-width: 20px;
    height: 20px;
    min-height: 20px;
    padding: 0;
    margin: 0;
    opacity: 0.6;
    align-self: center;
}

.rlb-tree__cell > .rlb-tree__toggle:hover {
    opacity: 1;
}

.rlb-tree__toggle--empty {
    display: block;
}

/* Task status, drawn in CSS rather than Blueprint's icon font so it cannot
   silently render as a blank box if an icon name is wrong. */
.rlb-status {
    flex: 0 0 auto;
    align-self: center;
    box-sizing: border-box;
    width: 13px;
    height: 13px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    opacity: 0.4;
    position: relative;
}

.rlb-status--done {
    background: #0f9960;
    border-color: #0f9960;
    opacity: 1;
}

.rlb-status--done::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 3px;
    height: 6px;
    border: solid #ffffff;
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
}

.rlb-row--done .rlb-task-link {
    opacity: 0.65;
}

.rlb-tree__hidden {
    flex: 0 0 auto;
    font-size: 11px;
}

.rlb-tree__badge {
    flex: 0 0 auto;
    font-size: 10px;
}

.rlb-tree__total {
    font-weight: 600;
}

.rlb-tree__note {
    margin-top: 8px;
}

.rlb-task-link {
    padding: 0;
    text-align: left;
    min-height: 0;
    /* Same shrink-to-ellipsis contract as the topbar; a long task name must not
       push the numeric columns off the dialog. */
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-muted {
    opacity: 0.6;
}

.rlb-empty {
    padding: 24px;
    text-align: center;
    opacity: 0.65;
}
`;

// src/topbar.js
var WIDGET_ID = "roam-logbook-topbar";
var TOPBAR_SELECTOR = ".rm-topbar";
var NAV_ICON_PATTERN = /icon-(menu|arrow-left|arrow-right|chevron-left|chevron-right)\b/;
var TOPBAR_TITLE_LENGTH = 32;
function createTopbar({ onOpenDashboard }) {
  let container = null;
  let labelNode = null;
  let timeNode = null;
  let targetNode = null;
  let totalNode = null;
  let titleNode = null;
  let iconNode = null;
  let buttonNode = null;
  let popover = null;
  let observer = null;
  let ticker = null;
  let unsubscribe = null;
  let destroyed = false;
  const isStale = (entry) => findStaleClocks([entry], /* @__PURE__ */ new Date(), staleHours()).length > 0;
  const closePopover = () => {
    popover?.remove();
    popover = null;
    document.removeEventListener("mousedown", onDocumentMouseDown, true);
    window.removeEventListener("resize", closePopover);
  };
  function onDocumentMouseDown(event) {
    if (!popover)
      return;
    if (container?.contains(event.target) || popover.contains(event.target))
      return;
    closePopover();
  }
  const positionPopover = () => {
    const anchor = buttonNode?.getBoundingClientRect();
    if (!anchor || !popover)
      return;
    const width = popover.offsetWidth || 340;
    const viewport = window.innerWidth || width + 16;
    popover.style.top = `${anchor.bottom + 6}px`;
    popover.style.left = `${Math.max(8, Math.min(anchor.left, viewport - width - 8))}px`;
  };
  const rowFigures = (entry, now) => {
    const target = targetMinutes(entry.clockUid);
    const elapsed = now - entry.start.getTime();
    const total = entry.priorMinutes + Math.floor(elapsed / 6e4);
    return formatElapsed(elapsed) + (target ? ` / ${formatElapsed(target * 6e4)}` : "") + ` \xB7 ${formatMinutesHuman(total)} total`;
  };
  const runningRow = (entry) => {
    const now = Date.now();
    const overrun = isOverrun(entry, now);
    const row = el("div", `rlb-run${overrun ? " rlb-run--overrun" : ""}`);
    row.appendChild(
      el("span", `rlb-dot${overrun ? " rlb-dot--overrun" : isStale(entry) ? " rlb-dot--stale" : ""}`)
    );
    const body = el("div", "rlb-run__body");
    const title = button(
      "bp3-button bp3-minimal rlb-run__title",
      entry.title,
      () => {
        closePopover();
        void openBlock(entry.taskUid);
      },
      { title: "Open this block" }
    );
    const suffix = ` \xB7 since ${formatStamp(entry.start)}` + (entry.pageTitle ? ` \xB7 ${entry.pageTitle}` : "");
    const meta = el("div", "rlb-run__meta", rowFigures(entry, now) + suffix);
    meta.dataset.clockUid = entry.clockUid;
    meta.dataset.suffix = suffix;
    body.append(title, meta);
    const target = targetMinutes(entry.clockUid);
    const actions = el("div", "rlb-run__actions");
    actions.append(
      button(
        `bp3-button bp3-minimal bp3-small bp3-icon-stopwatch${target ? " rlb-run__pomodoro--on" : ""}`,
        "",
        () => {
          toggle(entry.clockUid);
          renderButton();
          renderPopover();
        },
        {
          title: target ? `Pomodoro ${target}m \u2014 click to cancel` : `Start a ${pomodoroMinutes()}m pomodoro on this session`
        }
      ),
      button(
        "bp3-button bp3-minimal bp3-small bp3-icon-stop bp3-intent-success",
        "",
        () => void run(() => clockOut(entry.clockUid)),
        { title: "Clock out now" }
      ),
      button(
        "bp3-button bp3-minimal bp3-small bp3-icon-trash",
        "",
        () => void run(() => discardClock(entry.clockUid)),
        { title: "Discard this entry" }
      )
    );
    row.append(body, actions);
    return row;
  };
  const run = async (action) => {
    try {
      await action();
    } catch (error) {
      console.error("[roam-logbook]", error);
    }
    if (popover)
      renderPopover();
  };
  function renderPopover() {
    if (!popover)
      return;
    const entries = getRunning();
    popover.replaceChildren();
    popover.appendChild(
      el("div", "rlb-popover__title", entries.length ? "Running clocks" : "Logbook")
    );
    if (entries.length === 0) {
      popover.appendChild(
        el(
          "div",
          "rlb-popover__empty",
          "No clock is running. Right-click a TODO bullet and choose Plugins \u2192 Logbook: Clock in."
        )
      );
    } else {
      const stale = findStaleClocks(entries, /* @__PURE__ */ new Date(), staleHours());
      if (stale.length > 0) {
        popover.appendChild(
          el(
            "div",
            "rlb-popover__empty bp3-text-small",
            `${stale.length} clock${stale.length > 1 ? "s have" : " has"} been open for over ${staleHours()}h \u2014 likely forgotten.`
          )
        );
      }
      for (const entry of entries)
        popover.appendChild(runningRow(entry));
    }
    const footer = el("div", "rlb-popover__footer");
    footer.appendChild(
      button("bp3-button bp3-small bp3-icon-timeline-bar-chart", "Dashboard", () => {
        closePopover();
        onOpenDashboard();
      })
    );
    if (entries.length > 1) {
      footer.appendChild(
        button(
          "bp3-button bp3-small bp3-icon-stop",
          "Clock out all",
          () => run(() => clockOutAll())
        )
      );
    }
    footer.appendChild(
      button("bp3-button bp3-small bp3-minimal bp3-icon-refresh", "", () => run(async () => refresh()), {
        title: "Re-read clocks from the graph"
      })
    );
    popover.appendChild(footer);
  }
  const togglePopover = () => {
    if (popover) {
      closePopover();
      return;
    }
    refresh();
    popover = el("div", "bp3-card bp3-elevation-3 rlb-popover");
    document.body.appendChild(popover);
    renderPopover();
    positionPopover();
    document.addEventListener("mousedown", onDocumentMouseDown, true);
    window.addEventListener("resize", closePopover);
  };
  const renderButton = () => {
    if (!buttonNode)
      return;
    const entries = getRunning();
    const running2 = entries.length > 0;
    const now = Date.now();
    const overrun = entries.some((entry) => isOverrun(entry, now));
    const stale = findStaleClocks(entries, /* @__PURE__ */ new Date(), staleHours()).length > 0;
    buttonNode.classList.toggle("rlb-topbar__button--running", running2 && !overrun);
    buttonNode.classList.toggle("rlb-topbar__button--overrun", overrun);
    iconNode.className = running2 ? `rlb-dot${overrun ? " rlb-dot--overrun" : stale ? " rlb-dot--stale" : ""}` : "bp3-icon bp3-icon-time";
    if (!running2) {
      timeNode.textContent = "";
      targetNode.textContent = "";
      totalNode.textContent = "";
      titleNode.textContent = "";
      buttonNode.title = "Logbook \u2014 no clock running. Click for the dashboard.";
      buttonNode.setAttribute("aria-label", buttonNode.title);
      return;
    }
    const [first] = entries;
    const elapsed = now - first.start.getTime();
    timeNode.textContent = formatElapsed(elapsed);
    if (entries.length > 1) {
      targetNode.textContent = "";
      totalNode.textContent = "";
      titleNode.textContent = `${entries.length} clocks`;
      buttonNode.title = `${entries.length} clocks running`;
    } else {
      const target = targetMinutes(first.clockUid);
      targetNode.textContent = target ? formatElapsed(target * 6e4) : "";
      const totalMinutes2 = first.priorMinutes + Math.floor(elapsed / 6e4);
      totalNode.textContent = formatMinutesHuman(totalMinutes2);
      titleNode.textContent = taskTitle(first.taskString, { maxLength: TOPBAR_TITLE_LENGTH });
      buttonNode.title = `Clocked in: ${first.title}
This session ${formatElapsed(elapsed)} \xB7 ${formatMinutesHuman(totalMinutes2)} on this task in total` + (target ? `
Pomodoro ${target}m \u2014 ${overrun ? `over by ${formatElapsed(overrunMs(first, now))}` : `${formatElapsed(target * 6e4 - elapsed)} left`}` : "");
    }
    buttonNode.setAttribute("aria-label", buttonNode.title);
  };
  const tick = () => {
    if (getRunning().length === 0)
      return;
    renderButton();
    if (popover) {
      const now = Date.now();
      const byUid = new Map(getRunning().map((entry) => [entry.clockUid, entry]));
      for (const meta of popover.querySelectorAll(".rlb-run__meta")) {
        const entry = byUid.get(meta.dataset.clockUid);
        if (!entry)
          continue;
        meta.textContent = rowFigures(entry, now) + (meta.dataset.suffix || "");
        const row = meta.closest(".rlb-run");
        if (row) {
          row.classList.toggle("rlb-run--overrun", isOverrun(entry, now));
        }
      }
    }
  };
  const build = () => {
    container = el("div", "rlb-topbar");
    container.id = WIDGET_ID;
    iconNode = el("span", "bp3-icon bp3-icon-time");
    timeNode = el("span", "rlb-topbar__time");
    targetNode = el("span", "rlb-topbar__target");
    totalNode = el("span", "rlb-topbar__total");
    titleNode = el("span", "rlb-topbar__label");
    labelNode = el("span", "rlb-topbar__labels");
    labelNode.append(timeNode, targetNode, totalNode, titleNode);
    buttonNode = button("bp3-button bp3-minimal rlb-topbar__button", "", togglePopover);
    buttonNode.append(iconNode, labelNode);
    container.appendChild(buttonNode);
    renderButton();
  };
  const attach2 = () => {
    if (destroyed)
      return;
    if (!showTopbarWidget()) {
      remove();
      return;
    }
    if (container?.isConnected)
      return;
    const topbar = document.querySelector(TOPBAR_SELECTOR);
    if (!topbar)
      return;
    if (!container)
      build();
    topbar.insertBefore(container, afterNavigation(topbar));
  };
  const afterNavigation = (topbar) => {
    let anchor = null;
    for (const child of topbar.children) {
      if (child === container || !isNavigationControl(child))
        break;
      anchor = child;
    }
    return anchor ? anchor.nextSibling : null;
  };
  const isNavigationControl = (element) => {
    const classOf = (node) => node.getAttribute?.("class") || "";
    const named = (node) => NAV_ICON_PATTERN.test(classOf(node));
    if (named(element) || [...element.querySelectorAll("[class]")].some(named))
      return true;
    if (element.querySelector("input, textarea, select"))
      return false;
    if ((element.textContent || "").trim().length > 0)
      return false;
    return Boolean(element.querySelector("svg") || /icon/i.test(classOf(element)));
  };
  const remove = () => {
    closePopover();
    container?.remove();
  };
  return {
    mount() {
      unsubscribe = subscribe(() => {
        renderButton();
        if (popover)
          renderPopover();
      });
      ticker = setInterval(tick, 1e3);
      observer = new MutationObserver(attach2);
      observer.observe(document.body, { childList: true, subtree: true });
      attach2();
    },
    refresh: attach2,
    unmount() {
      destroyed = true;
      unsubscribe?.();
      unsubscribe = null;
      if (ticker)
        clearInterval(ticker);
      ticker = null;
      observer?.disconnect();
      observer = null;
      remove();
      container = null;
    }
  };
}

// src/extension.js
var CONTEXT_CLOCK_IN = "Logbook: Clock in";
var CONTEXT_CLOCK_OUT = "Logbook: Clock out";
var CONTEXT_POMODORO = "Logbook: Start pomodoro";
var PALETTE_COMMANDS = [
  "Logbook: Clock in current block",
  "Logbook: Start pomodoro on current block",
  "Logbook: Clock out current block",
  "Logbook: Clock out all running clocks",
  "Logbook: Open dashboard",
  "Logbook: Check for unfinished clocks"
];
function createController({ extensionAPI: extensionAPI2 }) {
  const dashboard = createDashboard();
  const topbar = createTopbar({ onOpenDashboard: () => dashboard.open() });
  let destroyed = false;
  let detachPomodoro = null;
  let detachTaskCompletion = null;
  const targetString = (context) => {
    const uid = resolveTaskUid(context?.["block-uid"]);
    return getBlockString(uid) ?? context?.["block-string"] ?? "";
  };
  const canClockIn = (context) => {
    const uid = context?.["block-uid"];
    if (!uid || isBlockRunning(uid))
      return false;
    return todoBlocksOnly() ? isTaskBlock(targetString(context)) : true;
  };
  const guard = async (action) => {
    try {
      await action();
    } catch (error) {
      console.error("[roam-logbook]", error);
    }
  };
  const clockInFocused = () => guard(async () => {
    const uid = getFocusedBlockUid();
    if (!uid) {
      console.warn("[roam-logbook] no focused block to clock in");
      return;
    }
    await clockIn(uid);
  });
  const runningOn = (blockUid) => {
    const taskUid = resolveTaskUid(blockUid);
    return getRunning().find((entry) => entry.taskUid === taskUid) ?? null;
  };
  const startPomodoro = (blockUid) => guard(async () => {
    if (!blockUid) {
      console.warn("[roam-logbook] no block to start a pomodoro on");
      return;
    }
    const existing = runningOn(blockUid);
    const clockUid = existing ? existing.clockUid : (await clockIn(blockUid)).clockUid;
    start(clockUid);
    refresh();
  });
  const registerSettings = () => {
    extensionAPI2.settings.panel.create({
      tabTitle: "Logbook",
      settings: [
        {
          id: SETTING_TOPBAR,
          name: "Show topbar widget",
          description: "The live counter and its clock list in Roam\u2019s topbar.",
          action: {
            type: "switch",
            defaultValue: true,
            onChange: (event) => {
              extensionAPI2.settings.set(SETTING_TOPBAR, normalizeChecked(event));
              topbar.refresh();
            }
          }
        },
        {
          id: SETTING_TODO_ONLY,
          name: "Only offer clock in on TODO blocks",
          description: "Turn off to clock any block, not just TODO/DONE ones.",
          action: {
            type: "switch",
            defaultValue: true,
            onChange: (event) => extensionAPI2.settings.set(SETTING_TODO_ONLY, normalizeChecked(event))
          }
        },
        {
          id: SETTING_MULTIPLE,
          name: "Allow multiple clocks at once",
          description: "Off (org-mode behaviour): clocking in closes the running clock. On: several tasks run in parallel.",
          action: {
            type: "switch",
            defaultValue: false,
            onChange: (event) => extensionAPI2.settings.set(SETTING_MULTIPLE, normalizeChecked(event))
          }
        },
        {
          id: SETTING_POMODORO_MINUTES,
          name: "Pomodoro length",
          description: "Running past it turns the topbar entry red; the clock keeps going until you stop it.",
          action: {
            type: "select",
            items: ["15", "20", "25", "30", "45", "60", "90"],
            defaultValue: "30",
            onChange: (event) => {
              extensionAPI2.settings.set(SETTING_POMODORO_MINUTES, normalizeSelected(event));
              topbar.refresh();
            }
          }
        },
        {
          id: SETTING_STALE_HOURS,
          name: "Flag unfinished clocks after",
          description: "How long a clock may run before it is called out as forgotten.",
          action: {
            type: "select",
            items: ["2", "4", "8", "12", "24"],
            defaultValue: "8",
            onChange: (event) => {
              extensionAPI2.settings.set(SETTING_STALE_HOURS, normalizeSelected(event));
              topbar.refresh();
            }
          }
        }
      ]
    });
  };
  const registerCommands = () => {
    const add = (label, callback) => extensionAPI2.ui.commandPalette.addCommand({ label, callback });
    add(PALETTE_COMMANDS[0], clockInFocused);
    add(PALETTE_COMMANDS[1], () => startPomodoro(getFocusedBlockUid()));
    add(
      PALETTE_COMMANDS[2],
      () => guard(async () => {
        const uid = getFocusedBlockUid();
        if (uid)
          await clockOutBlock(uid);
        else
          await clockOutAll();
      })
    );
    add(PALETTE_COMMANDS[3], () => guard(() => clockOutAll()));
    add(PALETTE_COMMANDS[4], () => dashboard.open());
    add(PALETTE_COMMANDS[5], () => {
      refresh();
      dashboard.open();
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: CONTEXT_CLOCK_IN,
      "display-conditional": canClockIn,
      callback: (context) => guard(() => clockIn(context["block-uid"]))
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: CONTEXT_POMODORO,
      // Offered both on a task with no clock and on one already running
      // without a pomodoro; pointless once a target is already set.
      "display-conditional": (context) => {
        const uid = context?.["block-uid"];
        if (!uid)
          return false;
        const entry = runningOn(uid);
        return entry ? !isActive(entry.clockUid) : canClockIn(context);
      },
      callback: (context) => startPomodoro(context["block-uid"])
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: CONTEXT_CLOCK_OUT,
      "display-conditional": (context) => isBlockRunning(context?.["block-uid"]),
      callback: (context) => guard(() => clockOutBlock(context["block-uid"]))
    });
  };
  return {
    init() {
      setExtensionAPI(extensionAPI2);
      injectStyles(STYLE_ID, STYLES);
      registerSettings();
      registerCommands();
      load();
      detachPomodoro = attach();
      detachTaskCompletion = attachTaskCompletion();
      topbar.mount();
      refresh();
    },
    destroy() {
      if (destroyed)
        return;
      destroyed = true;
      detachTaskCompletion?.();
      detachTaskCompletion = null;
      detachPomodoro?.();
      detachPomodoro = null;
      reset2();
      topbar.unmount();
      dashboard.destroy();
      reset();
      removeStyles(STYLE_ID);
      for (const label of [CONTEXT_CLOCK_IN, CONTEXT_POMODORO, CONTEXT_CLOCK_OUT]) {
        try {
          window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
        } catch (error) {
          console.error("[roam-logbook] could not remove context command", error);
        }
      }
      for (const label of PALETTE_COMMANDS) {
        try {
          extensionAPI2.ui.commandPalette.removeCommand({ label });
        } catch {
        }
      }
      setExtensionAPI(null);
    }
  };
}
var controller = null;
var extension_default = {
  onload: ({ extensionAPI: extensionAPI2 }) => {
    controller?.destroy();
    controller = createController({ extensionAPI: extensionAPI2 });
    controller.init();
  },
  onunload: () => {
    controller?.destroy();
    controller = null;
  }
};
export {
  extension_default as default
};
