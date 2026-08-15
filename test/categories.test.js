import test from 'node:test';
import assert from 'node:assert/strict';

import {
    assignCategories,
    categoryNames,
    findCategory,
    isCategoryParent,
    parseCategoryName,
} from '../src/categories.js';
import { buildDashboard, summariseByCategory } from '../src/stats.js';

const CATEGORIES = ['Product & Engineering', 'Strategy', 'Company Admin', 'Routine'];
const TODO = title => `{{[[TODO]]}} ${title}`;

/** Build a hierarchy from `uid: [parentUid, string]` pairs, as tree.test.js does. */
const hierarchy = (blocks, mirrorsOf = {}) => {
    const parentOf = {};
    const stringOf = {};
    for (const [uid, parentUid, string] of blocks) {
        if (parentUid) parentOf[uid] = parentUid;
        stringOf[uid] = string;
    }
    return { parentOf, stringOf, mirrorsOf };
};

test('the config list is read off page references, tags or plain text', () => {
    assert.equal(parseCategoryName('[[Strategy]]'), 'Strategy');
    assert.equal(parseCategoryName('#[[Product & Engineering]]'), 'Product & Engineering');
    assert.equal(parseCategoryName('#Routine'), 'Routine');
    // A line meant as a category but written without brackets still counts —
    // silently dropping it would look like the config was not read at all.
    assert.equal(parseCategoryName('  Personal Admin  '), 'Personal Admin');
    assert.equal(parseCategoryName('   '), null);
    assert.equal(parseCategoryName(undefined), null);
});

test('category names keep page order and drop repeats', () => {
    const names = categoryNames([
        { string: '[[Strategy]]' },
        { string: '' },
        { string: '#[[Routine]]' },
        { string: '[[strategy]]' },
    ]);
    assert.deepEqual(names, ['Strategy', 'Routine']);
});

test('the list hangs under a block called category', () => {
    assert.ok(isCategoryParent('category'));
    assert.ok(isCategoryParent('Category::'));
    assert.ok(isCategoryParent('  categories '));
    assert.ok(!isCategoryParent('category of work'));
    assert.ok(!isCategoryParent('[[Strategy]]'));
});

test('every way of writing the reference counts as the tag', () => {
    assert.equal(findCategory(TODO('写文档 #[[Strategy]]'), CATEGORIES), 'Strategy');
    assert.equal(findCategory(TODO('写文档 [[Strategy]]'), CATEGORIES), 'Strategy');
    assert.equal(findCategory(TODO('写文档 #Strategy'), CATEGORIES), 'Strategy');
    // Case is a typo, not a different category.
    assert.equal(findCategory(TODO('写文档 #[[strategy]]'), CATEGORIES), 'Strategy');
});

test('a tag that only looks like a category is not one', () => {
    assert.equal(findCategory(TODO('写文档 #Strategyzing'), CATEGORIES), null);
    assert.equal(findCategory(TODO('写文档 #[[Strategy Review]]'), CATEGORIES), null);
    assert.equal(findCategory(TODO('写文档'), CATEGORIES), null);
    // Only pages on the config page count, however many others are tagged.
    assert.equal(findCategory(TODO('写文档 #[[Reading]] #urgent'), CATEGORIES), null);
});

test('a category name inside a longer one is not a match on its own', () => {
    assert.equal(findCategory(TODO('报销 #[[Company Admin]]'), ['Admin']), null);
    assert.equal(findCategory(TODO('报销 #[[Company Admin]]'), CATEGORIES), 'Company Admin');
});

test('two categories on one task resolve to the first configured', () => {
    const both = TODO('规划 #[[Strategy]] #[[Routine]]');
    assert.equal(findCategory(both, CATEGORIES), 'Strategy');
    assert.equal(findCategory(both, ['Routine', 'Strategy']), 'Routine');
});

test('a task takes the category tagged on it', () => {
    const categoryOf = assignCategories(
        { task000001: TODO('写文档 #[[Strategy]]'), task000002: TODO('打包') },
        { categories: CATEGORIES }
    );
    assert.equal(categoryOf.get('task000001'), 'Strategy');
    assert.equal(categoryOf.get('task000002'), null);
});

test('a sub-task inherits the category of the project above it', () => {
    const categoryOf = assignCategories(
        { subtask001: TODO('写文档') },
        {
            categories: CATEGORIES,
            hierarchy: hierarchy([
                ['project001', null, TODO('发布 v1 #[[Product & Engineering]]')],
                ['note000001', 'project001', '一些说明文字'],
                ['subtask001', 'note000001', TODO('写文档')],
            ]),
        }
    );
    assert.equal(categoryOf.get('subtask001'), 'Product & Engineering');
});

test('the nearest tag wins over one further up', () => {
    const categoryOf = assignCategories(
        { subtask001: TODO('写文档') },
        {
            categories: CATEGORIES,
            hierarchy: hierarchy([
                ['project001', null, TODO('发布 v1 #[[Product & Engineering]]')],
                ['midtask001', 'project001', TODO('文档工作 #[[Strategy]]')],
                ['subtask001', 'midtask001', TODO('写文档')],
            ]),
        }
    );
    assert.equal(categoryOf.get('subtask001'), 'Strategy');
});

test('a task carrying its own tag ignores the one above it', () => {
    const categoryOf = assignCategories(
        { subtask001: TODO('写文档 #[[Routine]]') },
        {
            categories: CATEGORIES,
            hierarchy: hierarchy([
                ['project001', null, TODO('发布 v1 #[[Strategy]]')],
                ['subtask001', 'project001', TODO('写文档 #[[Routine]]')],
            ]),
        }
    );
    assert.equal(categoryOf.get('subtask001'), 'Routine');
});

test('a task referenced under a categorised project inherits through the mirror', () => {
    // 写文档 lives on its own page; the project page holds only ((写文档)).
    const categoryOf = assignCategories(
        { taskdoc001: TODO('写文档') },
        {
            categories: CATEGORIES,
            hierarchy: hierarchy(
                [
                    ['project001', null, TODO('发布 v1 #[[Product & Engineering]]')],
                    ['mirror0001', 'project001', '((taskdoc001))'],
                    ['taskdoc001', null, TODO('写文档')],
                ],
                { taskdoc001: ['mirror0001'] }
            ),
        }
    );
    assert.equal(categoryOf.get('taskdoc001'), 'Product & Engineering');
});

test('a reference loop above a task does not hang the walk', () => {
    const categoryOf = assignCategories(
        { taskA00001: TODO('A') },
        {
            categories: CATEGORIES,
            hierarchy: hierarchy(
                [
                    ['taskA00001', 'taskB00001', TODO('A')],
                    ['taskB00001', 'loop000001', TODO('B')],
                    ['loop000001', 'taskA00001', '((taskA00001))'],
                ],
                { taskA00001: ['loop000001'] }
            ),
        }
    );
    assert.equal(categoryOf.get('taskA00001'), null);
});

test('nothing is categorised when nothing is configured', () => {
    const categoryOf = assignCategories({ task000001: TODO('写文档 #[[Strategy]]') }, { categories: [] });
    assert.equal(categoryOf.get('task000001'), null);
});

// ---- roll-up ----

const now = new Date(2026, 7, 8, 20, 0);
const entry = (taskUid, minutes) => ({
    taskUid,
    minutes,
    running: false,
    start: new Date(2026, 7, 8, 9, 0),
    end: new Date(2026, 7, 8, 10, 0),
});

test('minutes add up per category, each session counted once', () => {
    const categoryOf = new Map([
        ['task000001', 'Strategy'],
        ['task000002', 'Strategy'],
        ['task000003', null],
    ]);
    const rows = summariseByCategory(
        [entry('task000001', 60), entry('task000001', 30), entry('task000002', 30), entry('task000003', 60)],
        { categoryOf, categories: CATEGORIES, now }
    );

    const strategy = rows.find(row => row.name === 'Strategy');
    assert.equal(strategy.minutes, 120);
    assert.equal(strategy.sessions, 3);
    assert.equal(strategy.tasks, 2, 'two tasks, three sessions');
    assert.equal(Math.round(strategy.share * 100), 67);

    // Configured categories with no time still get a row, and they sort last.
    assert.deepEqual(
        rows.map(row => row.name),
        ['Strategy', 'Product & Engineering', 'Company Admin', 'Routine', null]
    );
    assert.equal(rows.find(row => row.name === 'Routine').minutes, 0);

    const untagged = rows.at(-1);
    assert.equal(untagged.name, null, 'the leftover row goes last, whatever its size');
    assert.equal(untagged.minutes, 60);
});

test('with no categories configured there are no category rows at all', () => {
    const rows = summariseByCategory([entry('task000001', 60)], {
        categoryOf: new Map(),
        categories: [],
        now,
    });
    assert.deepEqual(rows, []);
});

test('the category rows add up to the dashboard headline', () => {
    const clocked = (taskUid, taskString, minutes) => ({
        ...entry(taskUid, minutes),
        taskString,
        title: taskString,
        status: 'TODO',
        pageTitle: 'Test Page',
    });

    const model = buildDashboard(
        [
            clocked('task000001', TODO('写文档 #[[Strategy]]'), 120),
            clocked('task000002', TODO('例行检查 #Routine'), 30),
            clocked('task000003', TODO('随手记一笔'), 45),
        ],
        { now, rangeId: 'all', categories: CATEGORIES }
    );

    assert.equal(
        model.categories.reduce((sum, row) => sum + row.minutes, 0),
        model.totalMinutes
    );
    assert.deepEqual(
        model.categories.filter(row => row.minutes > 0).map(row => [row.name, row.minutes]),
        [
            ['Strategy', 120],
            ['Routine', 30],
            [null, 45],
        ]
    );
});
