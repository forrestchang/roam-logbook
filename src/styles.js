/**
 * Styles for the topbar widget and dashboard.
 *
 * Layout and spacing only — colour comes from Blueprint's own variables so the
 * extension follows Roam's light/dark theme without a second set of rules.
 */

export const STYLE_ID = 'roam-logbook-styles';

export const STYLES = `
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
    content: '·';
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
   few characters — the counter and the totals are what earn the space, and the
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

/* The share bar reads as a proportion of the range, so the column keeps a fixed
   share of the table rather than sizing to its content — bars that change width
   between renders cannot be compared by eye. */
.rlb-share-cell {
    width: 34%;
    vertical-align: middle;
}

.rlb-share {
    height: 6px;
    border-radius: 3px;
    background: rgba(167, 182, 194, 0.3);
    overflow: hidden;
}

.rlb-share__fill {
    height: 100%;
    background: #2d72d2;
    border-radius: 3px;
}

/* A configured category with nothing against it: present but plainly quiet. */
.rlb-row--idle td {
    opacity: 0.5;
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
