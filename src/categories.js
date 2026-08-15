/**
 * Categories — the dashboard's coarsest cut, driven by pages in the graph.
 *
 * A category is a page you tag a task with, `#[[Product & Engineering]]`. Only
 * the pages listed on the config page count, so the other tags a task carries
 * for their own reasons stay out of the report and the list stays a decision
 * rather than whatever happens to be linked.
 *
 * Everything here is pure. Reading the config page is `config.js`; this module
 * only knows how to read the blocks that come back, spot a category in a
 * block's text, and say which category a task belongs to.
 */

/** `category`, `Categories::` — the block the configured list hangs under. */
const CATEGORY_PARENT_RE = /^\s*categor(?:y|ies)\s*:{0,2}\s*$/i;

/** Ancestors are walked a level at a time; a guard against a pathological graph. */
const MAX_WALK = 50;

const NO_HIERARCHY = { parentOf: {}, stringOf: {}, mirrorsOf: {} };

export function isCategoryParent(string) {
    return typeof string === 'string' && CATEGORY_PARENT_RE.test(string);
}

/**
 * The category a config block names.
 *
 * `[[X]]`, `#[[X]]` and `#X` are the same reference to Roam, and plain text is
 * taken at face value — a line that was meant as a category but written without
 * brackets is better read than silently dropped.
 *
 * @returns {string|null} null for a blank block
 */
export function parseCategoryName(string) {
    if (typeof string !== 'string') return null;
    const trimmed = string.trim();
    if (!trimmed) return null;

    const bracketed = /^#?\[\[(.+)\]\]$/.exec(trimmed);
    if (bracketed) return bracketed[1].trim() || null;

    const tag = /^#(\S+)$/.exec(trimmed);
    if (tag) return tag[1].trim() || null;

    return trimmed;
}

/** Category names from the config blocks, in page order, without repeats. */
export function categoryNames(blocks) {
    const names = [];
    const seen = new Set();
    for (const block of blocks) {
        const name = parseCategoryName(typeof block === 'string' ? block : block?.string);
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(name);
    }
    return names;
}

const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A bare `#tag` ends at whitespace, at the end of the block, or at punctuation —
// including CJK punctuation, since a category name is as likely to be Chinese as
// English. Without it `#Routine` would also match inside `#RoutineCheck`.
const TAG_END = '(?=$|[\\s,.;:!?)\\]}"\'\\u3000-\\u303f\\uff01-\\uff65])';

/**
 * Does this text reference `name`?
 *
 * `#[[X]]`, `[[X]]` and `#X` all count: Roam stores them as one reference, so
 * which one a task carries is a matter of typing rather than of meaning. Case is
 * ignored, because a tag that differs only in capitalisation is a typo, not a
 * different category, and dropping it would fail silently.
 */
function referencesPage(string, name) {
    const escaped = escapeRe(name);
    // `[[X]]` covers `#[[X]]` too — the hash only ever precedes it.
    if (new RegExp(`\\[\\[${escaped}\\]\\]`, 'i').test(string)) return true;
    if (/\s/.test(name)) return false; // a bare `#tag` cannot carry a space
    return new RegExp(`#${escaped}${TAG_END}`, 'i').test(string);
}

/**
 * The first configured category this text references.
 *
 * Config order decides when a block carries two, so a task counts once and
 * always in the same place.
 */
export function findCategory(string, categories) {
    if (typeof string !== 'string' || !string) return null;
    for (const name of categories) {
        if (referencesPage(string, name)) return name;
    }
    return null;
}

/**
 * Which category each task belongs to.
 *
 * The tag is looked for on the task itself first, then on its ancestors, so a
 * sub-task inherits the category of the project it sits under and only the block
 * that starts a piece of work has to carry the tag. The walk sees a task's
 * `((reference))` mirrors as well as its real parents — the same equivalence the
 * roll-up in `stats.js` uses — so a task pulled into a categorised project page
 * belongs to that category too.
 *
 * The nearest tag wins, and config order breaks a tie between two at the same
 * distance. Every task therefore lands in at most one category, which is what
 * keeps the category rows summing to the same figure as the headline.
 *
 * @param {Record<string,string>} taskStrings task uid → its block text
 * @returns {Map<string,string|null>} task uid → category name, null when untagged
 */
export function assignCategories(taskStrings, { categories = [], hierarchy = NO_HIERARCHY } = {}) {
    const categoryOf = new Map();
    const uids = Object.keys(taskStrings);
    if (categories.length === 0) {
        for (const uid of uids) categoryOf.set(uid, null);
        return categoryOf;
    }

    const rank = new Map(categories.map((name, index) => [name, index]));
    const textOf = uid => taskStrings[uid] ?? hierarchy.stringOf[uid] ?? null;

    const walk = uid => {
        let frontier = [uid, ...(hierarchy.mirrorsOf[uid] || [])];
        const seen = new Set(frontier);

        for (let depth = 0; depth < MAX_WALK && frontier.length > 0; depth += 1) {
            let best = null;
            for (const current of frontier) {
                const found = findCategory(textOf(current), categories);
                if (found && (best === null || rank.get(found) < rank.get(best))) best = found;
            }
            if (best) return best;

            const next = [];
            for (const current of frontier) {
                const parent = hierarchy.parentOf[current];
                if (!parent || seen.has(parent)) continue;
                seen.add(parent);
                next.push(parent);
            }
            frontier = next;
        }
        return null;
    };

    for (const uid of uids) categoryOf.set(uid, walk(uid));
    return categoryOf;
}
