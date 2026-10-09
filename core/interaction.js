// Backdrop Nav — INTERACTION (implements api.d.ts §20)
// Pure: action + raw input + env → InteractionView. No DOM.

// a param's current value (scoped fields resolved)
const readParam = (p, k) => { const pol = p.config.statePolicy.params[k], v = p.params[k]; if (!pol.scope) return v; const key = pol.scope.split('.').reduce((x, y) => x == null ? x : x[y], p); return v && key in v ? v[key] : pol.default; };
export const INTERACTION_STATES = ['disabled', 'pressed', 'keyboardFocus', 'focus', 'hover', 'enabled'];
export const STATUS_STATES = ['selected', 'checked', 'indeterminate', 'busy', 'error', 'dragged'];

// what a control currently represents, derived from its action (+ its own value)
const first = a => Array.isArray(a) ? a[0] || null : a;
export function statusOf(actions, env, facts = {}) {
  const out = [], action = first(actions);
  if (action && action.nav && env && env.model) {
    const m = env.model, s = m.getState(), q = m.query, i = action.nav;
    if ((i.type === 'switchDeck' || i.type === 'reselectDeck') && i.deck === s.activeDeck) out.push('selected');
    if (i.type === 'setParams' || i.type === 'toggleParam') {
      const p = q.paramTarget(s, i), cur = k => p && p.pending && k in p.pending ? p.pending[k] : p && p.config.statePolicy.params && p.config.statePolicy.params[k] ? q.contentParams(p)[k] ?? readParam(p, k) : undefined;   // pending first ('onApply' params)
      if (p && i.type === 'setParams' && Object.keys(i.values || {}).every(k => JSON.stringify(cur(k)) === JSON.stringify(i.values[k]))) out.push('selected');
      if (p && i.type === 'toggleParam' && Array.isArray(cur(i.name)) && cur(i.name).includes(i.option)) out.push('selected');
    }
    if (i.type === 'retry' && m.data) {
      const cur = q.currentPage(s), cc = cur.config.kind === 'backdrop' ? cur.config.front.content : cur.config.content;
      const d = cc ? m.data.get(i.dataSource || cc.dataSource, q.contentParams(cur)) : null;
      if (d && d.status === 'loading') out.push('busy');
    }
  }
  if (action && action.player && env && env.player) {
    const st = env.player.getState().status, t = action.player.type;
    if (['toggle', 'play', 'pause', 'playQueue', 'playIndex'].includes(t) && st === 'loading') out.push('busy');
    if (['toggle', 'play'].includes(t) && st === 'error') out.push('error');
  }
  if (facts && facts.checked === true) out.push('checked');
  if (facts && facts.checked === 'mixed') out.push('indeterminate');
  return out;
}
const NONE = { hover: false, pressed: false, focus: false, keyboardFocus: false };

export function actionAvailable(action, env) {
  if (Array.isArray(action)) return action.length > 0 && action.every(a => actionAvailable(a, env));
  if (!action || !env) return false;
  if (action.nav) return !!env.model && env.model.query.supports(env.model.getState(), env.model.config, action.nav);
  if (action.player) return !!env.player && env.player.supports(action.player);
  if (action.shell) return !!(env.shellActions && env.shellActions.includes(action.shell));
  return false;
}

export function resolveInteraction(action, input, env, facts) {
  const i = input || {}, enabled = actionAvailable(action, env);
  const touch = !!(env && env.model && env.model.getState().device.touch);
  const flags = enabled
    ? { hover: !!i.hovered && !touch, pressed: !!i.pressed, focus: !!i.focused && !i.focusVisible, keyboardFocus: !!i.focused && !!i.focusVisible }
    : NONE;
  const state = !enabled ? 'disabled' : flags.pressed ? 'pressed' : flags.keyboardFocus ? 'keyboardFocus' : flags.focus ? 'focus' : flags.hover ? 'hover' : 'enabled';
  const status = statusOf(action, env, facts);
  if (enabled && i.dragging) status.push('dragged');
  return { state, enabled, flags: { ...flags }, status, activatable: enabled && !status.includes('busy') };
}

// run a player action (14.3): the player's commands, plus a QueuedEvent when a playQueue / enqueue took effect
export function playerAction(player, intent, from = null) {
  if (!player || !intent) return { commands: [], events: [] };
  const before = player.getState().queue.length, commands = player.dispatch(intent), after = player.getState().queue.length;
  const queuing = intent.type === 'playQueue' || intent.type === 'enqueue', n = Array.isArray(intent.tracks) ? intent.tracks.length : 0;
  const took = queuing && n > 0 && (intent.type === 'playQueue' || after > before);
  return { commands, events: took ? [{ type: 'queued', position: intent.type === 'playQueue' ? 'now' : intent.next ? 'next' : 'last', count: n, from: from ?? null }] : [] };
}
