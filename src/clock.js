/**
 * Clock in / clock out, and the observable list of running clocks.
 *
 * State is derived: every mutation writes to the graph and then re-reads it, so
 * what the UI shows is what a reload would show. That costs one query per action
 * and buys us crash safety and multi-device sanity for free.
 */

import { readAllEntries } from './entries.js';
import { DRAWER_LABEL, formatClockLine, isDrawerBlock, parseClockLine, taskStatus } from './org.js';
import {
    createBlock,
    deleteBlock,
    getBlockString,
    getChildren,
    resolveReferencedUid,
    updateBlock,
    watchBlockString,
} from './roam.js';
import { allowMultipleClocks } from './settings.js';

let running = [];
const listeners = new Set();

/** Subscribe to running-clock changes. Returns an unsubscribe function. */
export function subscribe(listener) {
    listeners.add(listener);
    listener(running);
    return () => listeners.delete(listener);
}

export function getRunning() {
    return running;
}

function notify() {
    for (const listener of listeners) {
        try {
            listener(running);
        } catch (error) {
            console.error('[roam-logbook] listener failed', error);
        }
    }
}

/**
 * Re-read the graph and publish the current set of open clocks.
 *
 * Each open clock is tagged with `priorMinutes`, the time already banked against
 * the same task. The topbar needs a running total every second, and deriving it
 * here — from a read we were making anyway — keeps that off the query path.
 */
export function refresh() {
    const all = readAllEntries();

    const bankedByTask = new Map();
    for (const entry of all) {
        if (entry.running) continue;
        bankedByTask.set(entry.taskUid, (bankedByTask.get(entry.taskUid) || 0) + (entry.minutes || 0));
    }

    running = all
        .filter(entry => entry.running)
        .map(entry => ({ ...entry, priorMinutes: bankedByTask.get(entry.taskUid) || 0 }));

    notify();
    return running;
}

export function reset() {
    running = [];
    listeners.clear();
}

/**
 * Close a task's active clock when its checkbox changes to DONE.
 *
 * Watches track only currently running tasks and are reconciled from the same
 * derived state as the topbar. The status check on every refresh also catches a
 * task that was completed while this extension was not loaded.
 */
export function attachTaskCompletion({ now = () => new Date() } = {}) {
    const watches = new Map();
    const stopping = new Map();
    let detached = false;

    const stopIfDone = (taskUid, string) => {
        if (detached || taskStatus(string) !== 'DONE') return Promise.resolve(false);
        if (stopping.has(taskUid)) return stopping.get(taskUid);

        const operation = clockOutBlock(taskUid, { now: now() })
            .catch(error => {
                console.error('[roam-logbook] could not stop completed task', error);
                return false;
            })
            .finally(() => stopping.delete(taskUid));
        stopping.set(taskUid, operation);
        return operation;
    };

    const unsubscribe = subscribe(entries => {
        const activeTaskUids = new Set(entries.map(entry => entry.taskUid));

        for (const [taskUid, unwatch] of watches) {
            if (activeTaskUids.has(taskUid)) continue;
            unwatch();
            watches.delete(taskUid);
        }

        for (const entry of entries) {
            if (!watches.has(entry.taskUid)) {
                watches.set(
                    entry.taskUid,
                    watchBlockString(entry.taskUid, string => stopIfDone(entry.taskUid, string))
                );
            }
            void stopIfDone(entry.taskUid, entry.taskString);
        }
    });

    return () => {
        if (detached) return;
        detached = true;
        unsubscribe();
        for (const unwatch of watches.values()) unwatch();
        watches.clear();
    };
}

/**
 * The block a clock should actually be attached to.
 *
 * When the user right-clicks a block reference or an embed, the drawer belongs
 * on the original block, not on the mirror they happen to be looking at.
 */
export function resolveTaskUid(uid) {
    return resolveReferencedUid(uid);
}

/** The task's LOGBOOK drawer, created directly under the task if missing. */
async function ensureDrawer(taskUid) {
    const children = getChildren(taskUid);
    const existing = children.find(child => isDrawerBlock(child.string));
    if (existing) return existing.uid;
    // Order 0 mirrors org, where the drawer sits immediately under the heading.
    return createBlock({ parentUid: taskUid, order: 0, string: DRAWER_LABEL });
}

/**
 * Open a clock on `blockUid` (or the block it references).
 *
 * @returns {Promise<{clockUid: string, taskUid: string}>}
 */
export async function clockIn(blockUid, { now = new Date() } = {}) {
    const taskUid = resolveTaskUid(blockUid);
    if (!taskUid) throw new Error('No block to clock in');

    if (!allowMultipleClocks()) {
        // Org allows one clock at a time; closing the others keeps totals honest.
        for (const entry of readAllEntries().filter(item => item.running)) {
            await closeClockBlock(entry.clockUid, now);
        }
    } else if (running.some(entry => entry.taskUid === taskUid)) {
        throw new Error('This task already has a running clock');
    }

    const drawerUid = await ensureDrawer(taskUid);
    const order = getChildren(drawerUid).length;
    const clockUid = await createBlock({
        parentUid: drawerUid,
        order,
        string: formatClockLine(now),
    });

    refresh();
    return { clockUid, taskUid };
}

/** Rewrite a running `CLOCK::` block into its closed form. */
async function closeClockBlock(clockUid, end) {
    const string = getBlockString(clockUid);
    const parsed = parseClockLine(string);
    if (!parsed || !parsed.running) return false;
    const endAt = end.getTime() < parsed.start.getTime() ? parsed.start : end;
    await updateBlock({ uid: clockUid, string: formatClockLine(parsed.start, endAt) });
    return true;
}

export async function clockOut(clockUid, { now = new Date() } = {}) {
    const closed = await closeClockBlock(clockUid, now);
    refresh();
    return closed;
}

export async function clockOutAll({ now = new Date() } = {}) {
    let count = 0;
    for (const entry of running.slice()) {
        if (await closeClockBlock(entry.clockUid, now)) count += 1;
    }
    refresh();
    return count;
}

/** Close whichever clock belongs to this block, if any. */
export async function clockOutBlock(blockUid, options) {
    const taskUid = resolveTaskUid(blockUid);
    const entry = running.find(item => item.taskUid === taskUid);
    if (!entry) return false;
    return clockOut(entry.clockUid, options);
}

/**
 * Throw away a clock entry — for sessions that were started by mistake.
 * The drawer goes too once it is empty, so abandoned tasks stay clean.
 */
export async function discardClock(clockUid) {
    const entry = readAllEntries().find(item => item.clockUid === clockUid);
    await deleteBlock(clockUid);

    if (entry) {
        const drawer = getChildren(entry.taskUid).find(child => isDrawerBlock(child.string));
        if (drawer && getChildren(drawer.uid).length === 0) await deleteBlock(drawer.uid);
    }

    refresh();
    return true;
}

/** True when this block (or the one it references) has an open clock. */
export function isBlockRunning(blockUid) {
    const taskUid = resolveTaskUid(blockUid);
    return running.some(entry => entry.taskUid === taskUid);
}
