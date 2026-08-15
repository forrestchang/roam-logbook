/**
 * End-to-end smoke test of the extension lifecycle against jsdom.
 *
 * The unit tests cover the pure layers; this one exists to catch the mistakes
 * they cannot see — a mount path that throws, a widget that never attaches, a
 * command that references something undefined, state left behind on unload.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph } from './helpers/graph-stub.js';

const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const TASK = { uid: 'taskone01', string: '{{[[TODO]]}} this is a test task', parent: null };

// installGraph hangs roamAlphaAPI off the jsdom window it finds.
const graph = installGraph([TASK]);
globalThis.window.roamAlphaAPI.ui.blockContextMenu = {
    addCommand: spec => contextCommands.set(spec.label, spec),
    removeCommand: ({ label }) => contextCommands.delete(label),
};

const contextCommands = new Map();
const paletteCommands = new Map();
const settingsStore = new Map();
let settingsPanel = null;

const extensionAPI = {
    settings: {
        get: key => settingsStore.get(key),
        set: (key, value) => settingsStore.set(key, value),
        panel: { create: config => (settingsPanel = config) },
    },
    ui: {
        commandPalette: {
            addCommand: ({ label, callback }) => paletteCommands.set(label, callback),
            removeCommand: ({ label }) => paletteCommands.delete(label),
        },
    },
};

const extension = (await import('../src/extension.js')).default;
const clock = await import('../src/clock.js');
const pomodoro = await import('../src/pomodoro.js');
const { formatStamp } = await import('../src/time.js');

/**
 * A closed session earlier today.
 *
 * The dashboard's default range is the last 7 days, so a hard-coded date drops
 * out of it a week after it is written and takes the row it feeds with it.
 */
const closedClockToday = (fromHour, toHour) => {
    const at = hour => {
        const date = new Date();
        date.setHours(hour, 0, 0, 0);
        return date;
    };
    return `CLOCK:: ${formatStamp(at(fromHour))}--${formatStamp(at(toHour))} => ${toHour - fromHour}:00`;
};

const topbarWidget = () => document.getElementById('roam-logbook-topbar');
const dialog = () => document.getElementById('roam-logbook-dashboard');
const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

test.before(() => extension.onload({ extensionAPI }));
test.after(() => extension.onunload());

test('onload mounts the topbar widget and registers every command', () => {
    assert.ok(topbarWidget(), 'widget should be attached to .rm-topbar');
    assert.equal(settingsPanel.tabTitle, 'Logbook');
    assert.equal(paletteCommands.size, 7);
    assert.deepEqual(
        [...contextCommands.keys()],
        ['Logbook: Clock in', 'Logbook: Start pomodoro', 'Logbook: Clock out']
    );
});

test('the context menu offers clock in on a TODO block only', () => {
    const clockIn = contextCommands.get('Logbook: Clock in');
    assert.equal(clockIn['display-conditional']({ 'block-uid': 'taskone01' }), true);

    graph.store.set('plain0001', { uid: 'plain0001', string: 'just a note', parent: null, order: 9 });
    assert.equal(clockIn['display-conditional']({ 'block-uid': 'plain0001' }), false);
});

test('clocking in through the context menu writes the drawer and lights the widget', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'taskone01' });

    const drawer = graph.childrenOf('taskone01')[0];
    assert.equal(drawer.string, 'LOGBOOK::');
    assert.ok(graph.childrenOf(drawer.uid)[0].string.startsWith('CLOCK:: ['));

    const label = topbarWidget().textContent;
    assert.match(label, /this is a test task/);
    assert.ok(
        topbarWidget().querySelector('.rlb-topbar__button--running'),
        'widget should show the running state'
    );
    assert.equal(graph.pullWatchCount(), 1, 'the running task should be watched for completion');
});

test('marking the active task done stops its clock immediately', async () => {
    const [entry] = clock.getRunning();

    await graph.api.data.block.update({
        block: { uid: 'taskone01', string: '{{[[DONE]]}} this is a test task' },
    });

    assert.equal(clock.getRunning().length, 0);
    assert.match(graph.store.get(entry.clockUid).string, /\]--\[.*\] => \d+:\d\d$/);
    assert.equal(graph.pullWatchCount(), 0);

    // Restore a running TODO for the remaining lifecycle assertions.
    await graph.api.data.block.update({
        block: { uid: 'taskone01', string: '{{[[TODO]]}} this is a test task' },
    });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'taskone01' });
    assert.equal(clock.getRunning().length, 1);
});

test('the widget shows the task total alongside the running session', () => {
    // A closed session already banked against the same task.
    graph.store.set('drawerOld1', { uid: 'drawerOld1', string: 'LOGBOOK::', parent: 'taskone01', order: 0 });
    graph.store.set('clockOld01', {
        uid: 'clockOld01',
        string: 'CLOCK:: [2026-08-08 Sat 09:00]--[2026-08-08 Sat 11:00] => 2:00',
        parent: 'drawerOld1',
        order: 0,
    });
    clock.refresh();

    const [entry] = clock.getRunning();
    assert.equal(entry.priorMinutes, 120, 'banked time is derived on refresh, not queried per tick');
    // Total is prior sessions plus this one, so it exceeds the session counter.
    assert.match(topbarWidget().querySelector('.rlb-topbar__total').textContent, /2h 0\dm/);
});

test('a pomodoro shows its target and goes red only once passed', () => {
    const [entry] = clock.getRunning();
    pomodoro.start(entry.clockUid, 30);
    clock.refresh();

    // The "/" separator is a CSS pseudo-element: flex eats leading spaces in
    // text, so separators cannot live in the string.
    assert.equal(topbarWidget().querySelector('.rlb-topbar__target').textContent, '30:00');
    assert.equal(topbarWidget().querySelector('.rlb-topbar__button--overrun'), null);
    assert.ok(topbarWidget().querySelector('.rlb-topbar__button--running'));

    // Backdate the CLOCK block itself — refresh re-reads from the graph, so
    // mutating the in-memory entry would simply be overwritten.
    graph.store.get(entry.clockUid).string = `CLOCK:: ${formatStamp(new Date(Date.now() - 31 * 60_000))}`;
    clock.refresh();

    assert.ok(topbarWidget().querySelector('.rlb-topbar__button--overrun'), 'entry turns red');
    assert.equal(topbarWidget().querySelector('.rlb-topbar__button--running'), null);
    assert.match(topbarWidget().querySelector('button').title, /over by/);

    pomodoro.cancel(entry.clockUid);
    clock.refresh();
    assert.equal(topbarWidget().querySelector('.rlb-topbar__target').textContent, '');
});

test('a long task name is truncated in the widget but kept in the tooltip', () => {
    const longName = '把这个非常非常长的任务名字放进标题栏里看看会不会把整个顶栏撑坏掉真的很长';
    graph.store.get('taskone01').string = `{{[[TODO]]}} ${longName}`;
    clock.refresh();

    const label = topbarWidget().querySelector('.rlb-topbar__label').textContent;
    // CSS ellipsis does the real work; this only keeps the DOM sane.
    assert.ok(label.length < longName.length, 'the visible label is shortened');
    assert.ok(label.endsWith('…'));
    // Nothing is lost — the full name is one hover away.
    assert.match(topbarWidget().querySelector('button').title, new RegExp(longName.slice(0, 20)));

    graph.store.get('taskone01').string = '{{[[TODO]]}} this is a test task';
    clock.refresh();
});

test('clock in is hidden and clock out offered while the clock runs', () => {
    const context = { 'block-uid': 'taskone01' };
    assert.equal(contextCommands.get('Logbook: Clock in')['display-conditional'](context), false);
    assert.equal(contextCommands.get('Logbook: Clock out')['display-conditional'](context), true);
});

test('the popover lists the running clock', () => {
    click(topbarWidget().querySelector('button'));
    // It is anchored on <body>, not inside the widget, so the topbar cannot clip it.
    const popover = document.querySelector('body > .rlb-popover');

    assert.ok(popover, 'clicking the widget should open the popover');
    assert.equal(popover.querySelectorAll('.rlb-run').length, 1);
    assert.match(popover.textContent, /Running clocks/);

    click(topbarWidget().querySelector('button'));
    assert.equal(document.querySelector('.rlb-popover'), null, 'second click closes it');
});

test('the dashboard renders totals and the task breakdown', () => {
    paletteCommands.get('Logbook: Open dashboard')();

    assert.ok(dialog().classList.contains('rlb-root--open'));
    assert.match(dialog().textContent, /Today/);
    assert.match(dialog().textContent, /this is a test task/);
    // The running session is listed separately from the by-task rollup.
    assert.equal(dialog().querySelectorAll('.rlb-table').length, 2);
});

test('the task tree collapses and expands from the caret', () => {
    // Give the tracked task a sub-task with time of its own.
    graph.store.set('steps00001', {
        uid: 'steps00001',
        string: 'Steps::',
        parent: 'taskone01',
        order: 5,
        page: 'Test Page',
    });
    graph.store.set('subtask001', {
        uid: 'subtask001',
        string: '{{[[TODO]]}} a sub task',
        parent: 'steps00001',
        order: 0,
        page: 'Test Page',
    });
    graph.store.set('drawer0001', {
        uid: 'drawer0001',
        string: 'LOGBOOK::',
        parent: 'subtask001',
        order: 0,
        page: 'Test Page',
    });
    graph.store.set('clock00001', {
        uid: 'clock00001',
        string: closedClockToday(9, 10),
        parent: 'drawer0001',
        order: 0,
        page: 'Test Page',
    });

    paletteCommands.get('Logbook: Open dashboard')();

    const taskRows = () => [...dialog().querySelectorAll('.rlb-tree__cell')].map(cell => cell.textContent);
    assert.equal(taskRows().length, 2, 'parent and sub-task both listed');

    const caret = dialog().querySelector('.rlb-tree__toggle');
    assert.equal(caret.getAttribute('aria-expanded'), 'true');
    caret.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

    assert.equal(taskRows().length, 1, 'the sub-task row is hidden');
    assert.match(taskRows()[0], /\+1 sub-task/);
    assert.equal(dialog().querySelector('.rlb-tree__toggle').getAttribute('aria-expanded'), 'false');

    dialog().querySelector('.rlb-tree__toggle').dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true })
    );
    assert.equal(taskRows().length, 2, 'expanding brings it back');
});

test('each task row shows its checkbox state', () => {
    graph.store.get('subtask001').string = '{{[[DONE]]}} a sub task';
    paletteCommands.get('Logbook: Open dashboard')();

    const marks = [...dialog().querySelectorAll('.rlb-tree__cell .rlb-status')];
    assert.equal(marks.length, 2, 'one per task row');
    assert.deepEqual(marks.map(mark => mark.getAttribute('aria-label')), ['To do', 'Done']);
    // The finished row is dimmed rather than hidden.
    assert.equal(dialog().querySelectorAll('tr.rlb-row--done').length, 1);
});

test('collapsed state survives a re-render', () => {
    dialog().querySelector('.rlb-tree__toggle').dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true })
    );
    // Changing the range rebuilds the body from scratch.
    const select = dialog().querySelector('select');
    select.value = 'all';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    assert.equal(dialog().querySelectorAll('.rlb-tree__cell').length, 1, 'still collapsed');
});

test('the dashboard groups by the categories on the config page', () => {
    const CATEGORY = 'Product & Engineering';
    graph.store.set('configpage', {
        uid: 'configpage',
        string: '',
        title: 'roam/depot/roam-logbook',
        parent: null,
        order: 20,
    });
    graph.store.set('categoryblk', {
        uid: 'categoryblk',
        string: 'category',
        parent: 'configpage',
        order: 0,
    });
    graph.store.set('category001', {
        uid: 'category001',
        string: `[[${CATEGORY}]]`,
        parent: 'categoryblk',
        order: 0,
    });
    // Only the top task is tagged; the sub-task under it carries no tag at all.
    graph.store.get('taskone01').string = `{{[[TODO]]}} this is a test task #[[${CATEGORY}]]`;

    paletteCommands.get('Logbook: Open dashboard')();

    const section = [...dialog().querySelectorAll('.rlb-section')].find(node =>
        node.textContent.startsWith('By category')
    );
    assert.ok(section, 'a By category section appears once categories are configured');

    const cells = [...section.querySelectorAll('tbody tr')].map(row =>
        [...row.children].map(cell => cell.textContent)
    );
    // No Uncategorised row: the sub-task inherits the category of the task above it.
    assert.deepEqual(cells.map(row => row[0]), [CATEGORY]);
    assert.equal(cells[0][2], '2', 'the tagged task and its sub-task both counted');

    graph.store.get('taskone01').string = '{{[[TODO]]}} this is a test task';
});

test('Escape closes the dashboard', () => {
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(!dialog().classList.contains('rlb-root--open'));
});

test('clocking out through the palette closes the entry', async () => {
    await paletteCommands.get('Logbook: Clock out all running clocks')();

    const drawer = graph.childrenOf('taskone01')[0];
    assert.match(graph.childrenOf(drawer.uid)[0].string, /\]--\[.*\] => \d+:\d\d$/);
    assert.ok(!topbarWidget().querySelector('.rlb-topbar__button--running'));
    // Idle is icon-only — it earns no words in Roam's topbar — so the state
    // shows up in the icon and the tooltip rather than in the text.
    assert.equal(topbarWidget().textContent, '');
    assert.ok(topbarWidget().querySelector('.bp3-icon-time'));
    assert.match(topbarWidget().querySelector('button').title, /no clock running/);
});

test('a pomodoro survives unload and reload', async () => {
    await contextCommands.get('Logbook: Start pomodoro').callback({ 'block-uid': 'taskone01' });
    const before = clock.getRunning()[0];
    assert.ok(before, 'a clock should be running');
    assert.equal(pomodoro.isActive(before.clockUid), true);
    assert.equal(topbarWidget().querySelector('.rlb-topbar__target').textContent, '30:00');

    // A real reload: the module keeps no memory, only what reached settings.
    extension.onunload();
    extension.onload({ extensionAPI });

    const after = clock.getRunning()[0];
    assert.equal(after.clockUid, before.clockUid, 'the open clock comes back from the graph');
    assert.equal(pomodoro.isActive(after.clockUid), true, 'and so does its pomodoro');
    assert.equal(topbarWidget().querySelector('.rlb-topbar__target').textContent, '30:00');
});

test('onunload removes every trace of the extension', () => {
    extension.onunload();

    assert.equal(topbarWidget(), null);
    assert.equal(dialog(), null);
    assert.equal(document.getElementById('roam-logbook-styles'), null);
    assert.equal(contextCommands.size, 0);
    assert.equal(paletteCommands.size, 0);
    assert.equal(graph.pullWatchCount(), 0);
});
