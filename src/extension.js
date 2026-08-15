/**
 * Roam Logbook — org-mode clock tracking for Roam TODOs.
 *
 * Right-click a TODO bullet to clock in; the topbar shows the live session and
 * the dashboard adds it up. Entries live in the graph as an org LOGBOOK drawer,
 * which is also how a running clock survives a reload.
 */

import * as clock from './clock.js';
import { openCategoryConfig } from './config.js';
import { createDashboard } from './dashboard.js';
import { injectStyles, removeStyles } from './dom.js';
import { getBlockString, getFocusedBlockUid } from './roam.js';
import { isTaskBlock } from './org.js';
import * as pomodoro from './pomodoro.js';
import {
    normalizeChecked,
    normalizeSelected,
    setExtensionAPI,
    SETTING_MULTIPLE,
    SETTING_POMODORO_MINUTES,
    SETTING_STALE_HOURS,
    SETTING_TODO_ONLY,
    SETTING_TOPBAR,
    todoBlocksOnly,
} from './settings.js';
import { STYLES, STYLE_ID } from './styles.js';
import { createTopbar } from './topbar.js';

const CONTEXT_CLOCK_IN = 'Logbook: Clock in';
const CONTEXT_CLOCK_OUT = 'Logbook: Clock out';
const CONTEXT_POMODORO = 'Logbook: Start pomodoro';

const PALETTE_COMMANDS = [
    'Logbook: Clock in current block',
    'Logbook: Start pomodoro on current block',
    'Logbook: Clock out current block',
    'Logbook: Clock out all running clocks',
    'Logbook: Open dashboard',
    'Logbook: Check for unfinished clocks',
    'Logbook: Edit categories',
];

function createController({ extensionAPI }) {
    const dashboard = createDashboard();
    const topbar = createTopbar({ onOpenDashboard: () => dashboard.open() });
    let destroyed = false;
    let detachPomodoro = null;
    let detachTaskCompletion = null;

    /** Task text of the block a menu entry was opened on, following references. */
    const targetString = context => {
        const uid = clock.resolveTaskUid(context?.['block-uid']);
        return getBlockString(uid) ?? context?.['block-string'] ?? '';
    };

    const canClockIn = context => {
        const uid = context?.['block-uid'];
        if (!uid || clock.isBlockRunning(uid)) return false;
        return todoBlocksOnly() ? isTaskBlock(targetString(context)) : true;
    };

    const guard = async action => {
        try {
            await action();
        } catch (error) {
            console.error('[roam-logbook]', error);
        }
    };

    const clockInFocused = () =>
        guard(async () => {
            const uid = getFocusedBlockUid();
            if (!uid) {
                console.warn('[roam-logbook] no focused block to clock in');
                return;
            }
            await clock.clockIn(uid);
        });

    /** The open clock on this block, if any. */
    const runningOn = blockUid => {
        const taskUid = clock.resolveTaskUid(blockUid);
        return clock.getRunning().find(entry => entry.taskUid === taskUid) ?? null;
    };

    /**
     * Attach a pomodoro to this block's session, clocking in first if needed, so
     * one command covers both "start working, timed" and "time what I'm on".
     */
    const startPomodoro = blockUid =>
        guard(async () => {
            if (!blockUid) {
                console.warn('[roam-logbook] no block to start a pomodoro on');
                return;
            }
            const existing = runningOn(blockUid);
            const clockUid = existing ? existing.clockUid : (await clock.clockIn(blockUid)).clockUid;
            pomodoro.start(clockUid);
            clock.refresh();
        });

    const registerSettings = () => {
        extensionAPI.settings.panel.create({
            tabTitle: 'Logbook',
            settings: [
                {
                    id: SETTING_TOPBAR,
                    name: 'Show topbar widget',
                    description: 'The live counter and its clock list in Roam’s topbar.',
                    action: {
                        type: 'switch',
                        defaultValue: true,
                        onChange: event => {
                            extensionAPI.settings.set(SETTING_TOPBAR, normalizeChecked(event));
                            topbar.refresh();
                        },
                    },
                },
                {
                    id: SETTING_TODO_ONLY,
                    name: 'Only offer clock in on TODO blocks',
                    description: 'Turn off to clock any block, not just TODO/DONE ones.',
                    action: {
                        type: 'switch',
                        defaultValue: true,
                        onChange: event =>
                            extensionAPI.settings.set(SETTING_TODO_ONLY, normalizeChecked(event)),
                    },
                },
                {
                    id: SETTING_MULTIPLE,
                    name: 'Allow multiple clocks at once',
                    description:
                        'Off (org-mode behaviour): clocking in closes the running clock. On: several tasks run in parallel.',
                    action: {
                        type: 'switch',
                        defaultValue: false,
                        onChange: event =>
                            extensionAPI.settings.set(SETTING_MULTIPLE, normalizeChecked(event)),
                    },
                },
                {
                    id: SETTING_POMODORO_MINUTES,
                    name: 'Pomodoro length',
                    description:
                        'Running past it turns the topbar entry red; the clock keeps going until you stop it.',
                    action: {
                        type: 'select',
                        items: ['15', '20', '25', '30', '45', '60', '90'],
                        defaultValue: '30',
                        onChange: event => {
                            extensionAPI.settings.set(SETTING_POMODORO_MINUTES, normalizeSelected(event));
                            topbar.refresh();
                        },
                    },
                },
                {
                    id: SETTING_STALE_HOURS,
                    name: 'Flag unfinished clocks after',
                    description: 'How long a clock may run before it is called out as forgotten.',
                    action: {
                        type: 'select',
                        items: ['2', '4', '8', '12', '24'],
                        defaultValue: '8',
                        onChange: event => {
                            extensionAPI.settings.set(SETTING_STALE_HOURS, normalizeSelected(event));
                            topbar.refresh();
                        },
                    },
                },
            ],
        });
    };

    const registerCommands = () => {
        const add = (label, callback) =>
            extensionAPI.ui.commandPalette.addCommand({ label, callback });

        add(PALETTE_COMMANDS[0], clockInFocused);
        add(PALETTE_COMMANDS[1], () => startPomodoro(getFocusedBlockUid()));
        add(PALETTE_COMMANDS[2], () =>
            guard(async () => {
                const uid = getFocusedBlockUid();
                if (uid) await clock.clockOutBlock(uid);
                else await clock.clockOutAll();
            })
        );
        add(PALETTE_COMMANDS[3], () => guard(() => clock.clockOutAll()));
        add(PALETTE_COMMANDS[4], () => dashboard.open());
        add(PALETTE_COMMANDS[5], () => {
            clock.refresh();
            dashboard.open();
        });
        add(PALETTE_COMMANDS[6], () => guard(() => openCategoryConfig()));

        window.roamAlphaAPI.ui.blockContextMenu.addCommand({
            label: CONTEXT_CLOCK_IN,
            'display-conditional': canClockIn,
            callback: context => guard(() => clock.clockIn(context['block-uid'])),
        });
        window.roamAlphaAPI.ui.blockContextMenu.addCommand({
            label: CONTEXT_POMODORO,
            // Offered both on a task with no clock and on one already running
            // without a pomodoro; pointless once a target is already set.
            'display-conditional': context => {
                const uid = context?.['block-uid'];
                if (!uid) return false;
                const entry = runningOn(uid);
                return entry ? !pomodoro.isActive(entry.clockUid) : canClockIn(context);
            },
            callback: context => startPomodoro(context['block-uid']),
        });
        window.roamAlphaAPI.ui.blockContextMenu.addCommand({
            label: CONTEXT_CLOCK_OUT,
            'display-conditional': context => clock.isBlockRunning(context?.['block-uid']),
            callback: context => guard(() => clock.clockOutBlock(context['block-uid'])),
        });
    };

    return {
        init() {
            setExtensionAPI(extensionAPI);
            injectStyles(STYLE_ID, STYLES);
            registerSettings();
            registerCommands();
            pomodoro.load();
            detachPomodoro = pomodoro.attach();
            detachTaskCompletion = clock.attachTaskCompletion();
            topbar.mount();
            // The graph is the source of truth, so a reload picks any clock left
            // running — including one abandoned days ago — straight back up.
            clock.refresh();
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            detachTaskCompletion?.();
            detachTaskCompletion = null;
            detachPomodoro?.();
            detachPomodoro = null;
            pomodoro.reset();
            topbar.unmount();
            dashboard.destroy();
            clock.reset();
            removeStyles(STYLE_ID);
            for (const label of [CONTEXT_CLOCK_IN, CONTEXT_POMODORO, CONTEXT_CLOCK_OUT]) {
                try {
                    window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
                } catch (error) {
                    console.error('[roam-logbook] could not remove context command', error);
                }
            }
            // Palette commands added through extensionAPI are cleaned up by Roam,
            // but removing them keeps a hot reload from leaving duplicates behind.
            for (const label of PALETTE_COMMANDS) {
                try {
                    extensionAPI.ui.commandPalette.removeCommand({ label });
                } catch {
                    // Already gone.
                }
            }
            setExtensionAPI(null);
        },
    };
}

let controller = null;

export default {
    onload: ({ extensionAPI }) => {
        controller?.destroy();
        controller = createController({ extensionAPI });
        controller.init();
    },
    onunload: () => {
        controller?.destroy();
        controller = null;
    },
};
