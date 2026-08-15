/**
 * The config page read, graph → readCategories, through the stub.
 *
 * `categories.test.js` covers the parsing on hand-written blocks, so this is
 * about the queries and the page shape: the right page, the right block under
 * it, and a graph where none of that exists yet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

installGraph();

const { CONFIG_PAGE_TITLE, openCategoryConfig, readCategories } = await import('../src/config.js');

const page = (uid, title) => ({ uid, title, parent: null });
const block = (uid, string, parent) => ({ uid, string, parent });

test.after(() => uninstallGraph());

test('the categories are read from the config page in order', () => {
    installGraph([
        page('configpage', CONFIG_PAGE_TITLE),
        block('categoryblk', 'category', 'configpage'),
        block('category001', '[[Product & Engineering]]', 'categoryblk'),
        block('category002', '[[Strategy]]', 'categoryblk'),
        block('category003', '[[Routine]]', 'categoryblk'),
    ]);

    assert.deepEqual(readCategories(), ['Product & Engineering', 'Strategy', 'Routine']);
});

test('anything outside the category block is ignored', () => {
    installGraph([
        page('configpage', CONFIG_PAGE_TITLE),
        block('noteblock1', '一些关于这个插件的笔记', 'configpage'),
        block('notechild1', '[[Not A Category]]', 'noteblock1'),
        block('categoryblk', 'category::', 'configpage'),
        block('category001', '[[Strategy]]', 'categoryblk'),
    ]);

    assert.deepEqual(readCategories(), ['Strategy']);
});

test('a graph with no config page simply has no categories', () => {
    installGraph([block('taskone001', '{{[[TODO]]}} 写文档', null)]);
    assert.deepEqual(readCategories(), []);
});

test('a config page with no category block yet has no categories', () => {
    installGraph([page('configpage', CONFIG_PAGE_TITLE)]);
    assert.deepEqual(readCategories(), []);
});

test('opening the config creates the page and its category block once', async () => {
    const graph = installGraph([]);

    await openCategoryConfig();
    const created = [...graph.store.values()].find(entry => entry.title === CONFIG_PAGE_TITLE);
    assert.ok(created, 'the page is created rather than left for the user to make');
    assert.deepEqual(
        graph.childrenOf(created.uid).map(child => child.string),
        ['category']
    );

    // Opening it again finds what is there instead of adding a second block.
    await openCategoryConfig();
    assert.equal(graph.childrenOf(created.uid).length, 1);
    assert.equal([...graph.store.values()].filter(entry => entry.title === CONFIG_PAGE_TITLE).length, 1);
});
