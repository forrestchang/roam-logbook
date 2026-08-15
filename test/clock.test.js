import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

installGraph();

const clock = await import('../src/clock.js');
const { setExtensionAPI } = await import('../src/settings.js');

const TASK = { uid: 'taskone01', string: '{{[[TODO]]}} this is a test task', parent: null };
const OTHER = { uid: 'tasktwo02', string: '{{[[TODO]]}} another task', parent: null };

const AT_1558 = new Date(2026, 7, 5, 15, 58);
const AT_1658 = new Date(2026, 7, 5, 16, 58);

/** Rebuild the graph and the clock module's derived state. */
function seed(blocks) {
    const graph = installGraph(blocks);
    clock.refresh();
    return graph;
}

const drawerOf = (graph, taskUid) =>
    graph.childrenOf(taskUid).find(block => block.string.startsWith('LOGBOOK'));

const clockLinesOf = (graph, taskUid) =>
    graph.childrenOf(drawerOf(graph, taskUid).uid).map(block => block.string);

test.beforeEach(() => setExtensionAPI(null));
test.after(() => uninstallGraph());

test('clocking in creates the drawer and a running entry', async () => {
    const graph = seed([TASK]);

    const { taskUid } = await clock.clockIn('taskone01', { now: AT_1558 });

    assert.equal(taskUid, 'taskone01');
    assert.equal(drawerOf(graph, 'taskone01').string, 'LOGBOOK::');
    assert.deepEqual(clockLinesOf(graph, 'taskone01'), ['CLOCK:: [2026-08-05 Wed 15:58]']);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].title, 'this is a test task');
});

test('the drawer sits directly under the task, as in org', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });
    assert.equal(graph.childrenOf('taskone01')[0].string, 'LOGBOOK::');
});

test('entries nest under the drawer, never beside it', async () => {
    const graph = seed([TASK]);
    const { clockUid } = await clock.clockIn('taskone01', { now: AT_1558 });

    // task > LOGBOOK:: > CLOCK:: — a CLOCK block as a sibling of the drawer
    // would still read back, but it is not the org shape.
    const drawer = graph.store.get(graph.store.get(clockUid).parent);
    assert.equal(drawer.string, 'LOGBOOK::');
    assert.equal(drawer.parent, 'taskone01');
    assert.equal(graph.childrenOf('taskone01').length, 1);
});

test('clocking out writes the end stamp and the org duration', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    await clock.clockOut(clock.getRunning()[0].clockUid, { now: AT_1658 });

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
    ]);
    assert.equal(clock.getRunning().length, 0);
});

test('a second session appends to the existing drawer', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: AT_1658 });
    await clock.clockIn('taskone01', { now: new Date(2026, 7, 5, 18, 0) });

    assert.equal(graph.childrenOf('taskone01').filter(b => b.string.startsWith('LOGBOOK')).length, 1);
    assert.equal(clockLinesOf(graph, 'taskone01').length, 2);
});

test('logging against a block reference writes to the original block', async () => {
    const graph = seed([TASK, { uid: 'mirror001', string: '((taskone01))', parent: null }]);

    const { taskUid } = await clock.clockIn('mirror001', { now: AT_1558 });

    assert.equal(taskUid, 'taskone01');
    assert.equal(drawerOf(graph, 'taskone01').string, 'LOGBOOK::');
    assert.equal(drawerOf(graph, 'mirror001'), undefined);
});

test('a chain of references resolves to the block at the end', async () => {
    seed([
        TASK,
        { uid: 'mirror001', string: '((taskone01))', parent: null },
        { uid: 'mirror002', string: '{{embed: ((mirror001))}}', parent: null },
    ]);
    assert.equal(clock.resolveTaskUid('mirror002'), 'taskone01');
});

test('by default a new clock closes the running one', async () => {
    const graph = seed([TASK, OTHER]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    await clock.clockIn('tasktwo02', { now: AT_1658 });

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
    ]);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, 'tasktwo02');
});

test('multiple clocks run in parallel when the setting allows it', async () => {
    setExtensionAPI({ settings: { get: key => (key === 'allowMultipleClocks' ? true : undefined) } });
    seed([TASK, OTHER]);

    await clock.clockIn('taskone01', { now: AT_1558 });
    await clock.clockIn('tasktwo02', { now: AT_1658 });

    assert.equal(clock.getRunning().length, 2);
    // Clocking the same task twice would double-count it.
    await assert.rejects(() => clock.clockIn('taskone01', { now: AT_1658 }), /already has a running clock/);
});

test('clocking out a block finds its running entry', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    assert.equal(await clock.clockOutBlock('taskone01', { now: AT_1658 }), true);
    assert.ok(clockLinesOf(graph, 'taskone01')[0].includes('=> 1:00'));
    assert.equal(await clock.clockOutBlock('taskone01', { now: AT_1658 }), false);
});

test('marking a running task done closes only that task clock', async t => {
    setExtensionAPI({ settings: { get: key => (key === 'allowMultipleClocks' ? true : undefined) } });
    const graph = seed([TASK, OTHER]);
    const detach = clock.attachTaskCompletion({ now: () => AT_1658 });
    t.after(detach);

    await clock.clockIn('taskone01', { now: AT_1558 });
    await clock.clockIn('tasktwo02', { now: AT_1558 });
    assert.equal(graph.pullWatchCount(), 2);

    await graph.api.data.block.update({
        block: { uid: 'taskone01', string: '{{[[DONE]]}} this is a test task' },
    });

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
    ]);
    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid), ['tasktwo02']);
    assert.equal(graph.pullWatchCount(), 1);
});

test('attaching completion handling closes an already-done running task', async t => {
    const graph = seed([
        { ...TASK, string: '{{[[DONE]]}} this is a test task' },
        { uid: 'drawer001', string: 'LOGBOOK::', parent: 'taskone01' },
        { uid: 'entry0001', string: 'CLOCK:: [2026-08-05 Wed 15:58]', parent: 'drawer001' },
    ]);

    const detach = clock.attachTaskCompletion({ now: () => AT_1658 });
    t.after(detach);
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
    ]);
    assert.equal(clock.getRunning().length, 0);
    assert.equal(graph.pullWatchCount(), 0);
});

test('an end before the start clamps to a zero-length session', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1658 });

    // Clock skew or a manual edit must not produce a negative duration.
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: AT_1558 });

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK:: [2026-08-05 Wed 16:58]--[2026-08-05 Wed 16:58] => 0:00',
    ]);
});

test('discarding the last entry removes the empty drawer too', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    await clock.discardClock(clock.getRunning()[0].clockUid);

    assert.equal(drawerOf(graph, 'taskone01'), undefined);
    assert.equal(clock.getRunning().length, 0);
});

test('discarding one of several entries keeps the drawer', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: AT_1658 });
    await clock.clockIn('taskone01', { now: new Date(2026, 7, 5, 18, 0) });

    await clock.discardClock(clock.getRunning()[0].clockUid);

    assert.equal(clockLinesOf(graph, 'taskone01').length, 1);
});

test('a clock left open in the graph is picked back up on refresh', () => {
    seed([
        TASK,
        { uid: 'drawer001', string: 'LOGBOOK::', parent: 'taskone01' },
        { uid: 'entry0001', string: 'CLOCK:: [2026-08-04 Tue 09:00]', parent: 'drawer001' },
    ]);

    // This is the reload path: no extension state, just what the graph says.
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].clockUid, 'entry0001');
    assert.equal(clock.isBlockRunning('taskone01'), true);
});

test('unparseable drawer children are ignored rather than breaking the read', () => {
    seed([
        TASK,
        { uid: 'drawer001', string: 'LOGBOOK::', parent: 'taskone01' },
        { uid: 'junk0001', string: 'a note someone typed in the drawer', parent: 'drawer001' },
        { uid: 'entry0001', string: 'CLOCK:: [2026-08-04 Tue 09:00]', parent: 'drawer001' },
    ]);

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].clockUid, 'entry0001');
});

test('subscribers see the running list immediately and on change', async () => {
    seed([TASK]);
    const seen = [];
    const unsubscribe = clock.subscribe(running => seen.push(running.length));

    await clock.clockIn('taskone01', { now: AT_1558 });
    unsubscribe();
    await clock.clockOutAll({ now: AT_1658 });

    assert.deepEqual(seen, [0, 1]);
});
