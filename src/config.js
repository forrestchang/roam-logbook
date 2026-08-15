/**
 * The category config page.
 *
 * The list of categories lives in the graph, not in extension settings, because
 * a category *is* a page: keeping the list as page references means you can
 * click through to one, see its backlinks, and rename it with every tagged task
 * following along. `roam/depot/<extension>` is where Roam Depot extensions keep
 * the config that belongs in the graph.
 *
 *   roam/depot/roam-logbook
 *     - category
 *       - [[Product & Engineering]]
 *       - [[Strategy]]
 *
 * Only what hangs under `category` is read. Anything else on the page is ignored,
 * so it stays free for notes, queries, or whatever else you want beside it, and
 * an absent page simply means no categories rather than an error.
 */

import { categoryNames, isCategoryParent } from './categories.js';
import { createBlock, createPage, getChildren, getPageUid, openPage } from './roam.js';

export const CONFIG_PAGE_TITLE = 'roam/depot/roam-logbook';
export const CATEGORY_BLOCK = 'category';

/** Configured category names in page order; `[]` when nothing is configured. */
export function readCategories() {
    const pageUid = getPageUid(CONFIG_PAGE_TITLE);
    if (!pageUid) return [];
    const parent = getChildren(pageUid).find(child => isCategoryParent(child.string));
    if (!parent) return [];
    return categoryNames(getChildren(parent.uid));
}

/**
 * Open the config page for editing, creating the page and its `category` block
 * when they are not there yet — the list is meant to be edited as a Roam outline,
 * so the extension's job is to put the user in front of it, not to own it.
 */
export async function openCategoryConfig() {
    const pageUid = getPageUid(CONFIG_PAGE_TITLE) || (await createPage(CONFIG_PAGE_TITLE));
    const children = getChildren(pageUid);
    if (!children.some(child => isCategoryParent(child.string))) {
        await createBlock({ parentUid: pageUid, order: children.length, string: CATEGORY_BLOCK });
    }
    await openPage(CONFIG_PAGE_TITLE);
}
