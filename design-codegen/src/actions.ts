/**
 * Which of a Sonora component's handler props are actions: every `on…` prop its `.d.ts` declares,
 * less the ones below. A control is drawn disabled for lacking an action, never for lacking one of
 * these. The states fixture's test and the unbound-action ledger's test both read this one list,
 * and `pnpm gen` writes it out for the Android states test.
 */
import { GENERATED_NOTE } from './outputs.js';

/** Handler props that are not actions: a control is never disabled for lacking one. */
export const NOT_ACTIONS: readonly { component: string; prop: string }[] = [
  { component: 'BackdropShell', prop: 'onProgress' },
  { component: 'FrontLayer', prop: 'onProgress' },
  { component: 'ScrollArea', prop: 'onScroll' },
  { component: 'FrontLayerHeader', prop: 'onSpyChange' },
  { component: 'OverflowMenu', prop: 'onOpenChange' },
  { component: 'QueuePage', prop: 'onEditingChange' },
  ...['onDragStart', 'onDragOver', 'onDrop', 'onDragEnd'].flatMap((prop) => [
    { component: 'EditableList', prop },
    { component: 'QueueRow', prop },
  ]),
  { component: 'EditableList', prop: 'onReorder' },
  { component: 'QueuePage', prop: 'onReorder' },
  // Android's NowPlaying takes its queue's props flat, where the web nests them in `queue`.
  { component: 'NowPlaying', prop: 'onEditingChange' },
  { component: 'NowPlaying', prop: 'onReorder' },
];

export const KOTLIN_STATES_PACKAGE = 'net.develivarr.auralis.generated.states';

/** `NotActions.kt`: the list above, for the `:sonora` states test. */
export const generateKotlinNotActions = (): Map<string, string> =>
  new Map([
    [
      'NotActions.kt',
      [
        `// ${GENERATED_NOTE}`,
        `package ${KOTLIN_STATES_PACKAGE}`,
        '',
        '/** Handler props that are not actions: a control is never disabled for lacking one. */',
        'val notActions: Set<Pair<String, String>> = setOf(',
        ...NOT_ACTIONS.map((n) => `    "${n.component}" to "${n.prop}",`),
        ')',
        '',
      ].join('\n'),
    ],
  ]);

/** The action props of `component`, from its `.d.ts` source, in the order it declares them. */
export const actionProps = (component: string, dts: string): string[] =>
  [...dts.matchAll(/^\s*(on[A-Z]\w*)\??:/gm)]
    .map(([, prop]) => prop!)
    .filter((prop) => !NOT_ACTIONS.some((n) => n.component === component && n.prop === prop));
