/**
 * Run the extension's read path against a real graph, via the `roam` CLI.
 *
 * The test suite's graph stub answers queries by *shape* — it never runs datalog,
 * so a query it happily satisfies can still be wrong or empty against Roam. This
 * script closes that gap: it swaps in a `roamAlphaAPI.q` that shells out to the
 * CLI, then runs the real `entries.js` / `stats.js` and prints what the dashboard
 * would show.
 *
 * Requires the `roam` CLI on PATH, configured with a graph and token.
 *
 *   npm run verify:live
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
let queryCount = 0;

globalThis.window = {
    roamAlphaAPI: {
        data: {
            q(datalog, ...args) {
                queryCount += 1;
                const argv = ['query', datalog];
                if (args.length > 0) argv.push('--args-json', JSON.stringify(args));
                const output = execFileSync('roam', argv, { encoding: 'utf8', maxBuffer: 64e6 });
                return JSON.parse(output).result;
            },
        },
    },
};

const { readAllEntries, readHierarchy } = await import(`${src}/entries.js`);
const { CONFIG_PAGE_TITLE, readCategories } = await import(`${src}/config.js`);
const { buildDashboard, flattenForest } = await import(`${src}/stats.js`);
const { formatMinutesHuman } = await import(`${src}/time.js`);

// Read before the early exit below: an empty config page is worth seeing even in
// a graph with nothing clocked yet.
const categories = readCategories();
console.log(
    `${categories.length} categories on ${CONFIG_PAGE_TITLE}` +
        (categories.length > 0 ? `: ${categories.join(', ')}` : '')
);

const entries = readAllEntries();
console.log(`${entries.length} clock entries`);
for (const entry of entries) {
    const worth = entry.running ? 'running' : formatMinutesHuman(entry.minutes);
    console.log(`  ${entry.taskUid}  ${worth.padStart(8)}  ${entry.title}`);
}

if (entries.length === 0) {
    console.log('\nNothing logged yet — clock something in Roam first.');
    process.exit(0);
}

const taskUids = [...new Set(entries.map(entry => entry.taskUid))];
const hierarchy = readHierarchy(taskUids);

// An empty parentOf here means the ancestor walk found nothing, which is the
// failure mode the stub cannot reproduce.
console.log(`\nparentOf   ${JSON.stringify(hierarchy.parentOf)}`);
console.log(`mirrorsOf  ${JSON.stringify(hierarchy.mirrorsOf)}`);

const model = buildDashboard(entries, { now: new Date(), rangeId: 'all', hierarchy, categories });

if (model.categories.length > 0) {
    console.log('\nBy category');
    for (const row of model.categories) {
        const share = `${Math.round(row.share * 100)}%`.padStart(4);
        console.log(
            `  ${(row.name ?? 'Uncategorised').padEnd(24)} ${formatMinutesHuman(row.minutes).padStart(8)}` +
                `  ${share}  ${row.tasks} task(s), ${row.sessions} session(s)`
        );
    }
}

console.log('\nBy task');
for (const node of flattenForest(model.tree)) {
    const indent = '  '.repeat(node.depth) + (node.depth > 0 ? '└ ' : '');
    const badge = node.occurrences > 1 ? ` ×${node.occurrences}` : '';
    const box = node.status === 'DONE' ? '[x]' : node.status === 'TODO' ? '[ ]' : '   ';
    console.log(
        `  ${indent}${box} ${node.title}${badge}` +
            `   own ${formatMinutesHuman(node.own)} / total ${formatMinutesHuman(node.total)}`
    );
}

console.log(
    `\nheadline ${formatMinutesHuman(model.totalMinutes)} across ${model.tasks.length} tasks` +
        `  (${queryCount} queries)`
);
