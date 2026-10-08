// Backdrop Nav — PLAYER MODEL (implements api.d.ts §13)
// Core owns WHAT should play; shells own MAKING SOUND and report facts back.
// createPlayer() → { getState, dispatch(intent) → PlayerCommand[], current }

const RESTART_THRESHOLD_MS = 3000;
export const PLAYER_INTENT_TYPES = ['playQueue', 'enqueue', 'play', 'pause', 'toggle', 'next', 'previous', 'seek', 'setRepeat', 'setShuffle', 'toggleShuffle', 'cycleRepeat', 'playIndex', 'move', 'reported'];
const TRANSPORT = ['play', 'pause', 'toggle', 'next', 'previous', 'seek', 'playIndex', 'move'];
const REPEAT_CYCLE = { off: 'all', all: 'one', one: 'off' };

function permutation(n, seed) {
  const a = Array.from({ length: n }, (_, i) => i);
  let x = seed || 1;
  for (let i = n - 1; i > 0; i--) { x = (x * 1103515245 + 12345) & 0x7fffffff; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function createPlayer(seed = 7) {
  let s = { queue: [], index: -1, status: 'idle', positionMs: 0, repeat: 'off', shuffle: false, order: [] };
  const linear = n => Array.from({ length: n }, (_, i) => i);
  const pos = () => s.order.indexOf(s.index);                 // position of current track in play order
  const load = (autoplay, positionMs = 0) => {
    const t = s.queue[s.index];
    s = { ...s, status: 'loading', positionMs };
    return [{ type: 'load', track: t, autoplay, positionMs }];
  };

  function step(dir) {
    if (s.index < 0) return [];
    const p = pos(), n = s.order.length;
    let q = p + dir;
    if (q >= n || q < 0) {
      if (s.repeat === 'all') q = (q + n) % n;
      else { s = { ...s, status: dir > 0 ? 'ended' : s.status }; return dir > 0 ? [{ type: 'stop' }] : []; }
    }
    s = { ...s, index: s.order[q] };
    return load(true);
  }

  function dispatch(i) {
    switch (i.type) {
      case 'playQueue': {
        const n = i.tracks.length; if (!n) return [];
        const start = Math.max(0, Math.min(i.start || 0, n - 1));
        s = { ...s, queue: i.tracks.slice(), index: start, order: s.shuffle ? [start, ...permutation(n, seed).filter(k => k !== start)] : linear(n) };
        return load(true);
      }
      case 'enqueue': {
        const base = s.queue.length, add = i.tracks.map((_, k) => base + k);
        const queue = [...s.queue, ...i.tracks];
        let order = s.order.slice();
        if (i.next && s.index >= 0) order.splice(pos() + 1, 0, ...add); else order = [...order, ...add];
        const wasEmpty = s.index < 0;
        s = { ...s, queue, order, index: wasEmpty ? 0 : s.index };
        return wasEmpty ? load(false) : [];
      }
      case 'play': if (s.index < 0) return []; if (s.status === 'ended') { s = { ...s, index: s.order[0] }; return load(true); } s = { ...s, status: 'playing' }; return [{ type: 'play' }];
      case 'pause': if (s.status !== 'playing' && s.status !== 'loading') return []; s = { ...s, status: 'paused' }; return [{ type: 'pause' }];
      case 'toggle': return dispatch({ type: s.status === 'playing' || s.status === 'loading' ? 'pause' : 'play' });
      case 'next': return step(1);   // explicit next always advances, even with repeat 'one'
      case 'previous':
        if (s.positionMs > RESTART_THRESHOLD_MS || pos() === 0 && s.repeat !== 'all') { s = { ...s, positionMs: 0 }; return [{ type: 'seek', positionMs: 0 }]; }
        return step(-1);
      case 'seek': s = { ...s, positionMs: Math.max(0, i.positionMs) }; return [{ type: 'seek', positionMs: s.positionMs }];
      case 'setRepeat': s = { ...s, repeat: i.repeat }; return [];
      case 'cycleRepeat': s = { ...s, repeat: REPEAT_CYCLE[s.repeat] || 'off' }; return [];
      case 'toggleShuffle': return dispatch({ type: 'setShuffle', shuffle: !s.shuffle });
      case 'playIndex': { if (!(i.index >= 0 && i.index < s.queue.length)) return []; s = { ...s, index: i.index }; return load(true); }
      case 'move': {
        const n = s.queue.length; if (!(i.from >= 0 && i.from < n && i.to >= 0 && i.to < n) || i.from === i.to) return [];
        const queue = s.queue.slice(), [t] = queue.splice(i.from, 1); queue.splice(i.to, 0, t);
        const map = k => k === i.from ? i.to : i.from < i.to ? (k > i.from && k <= i.to ? k - 1 : k) : (k >= i.to && k < i.from ? k + 1 : k);
        s = { ...s, queue, index: s.index < 0 ? -1 : map(s.index), order: s.shuffle ? s.order.map(map) : linear(n) };
        return [];
      }
      case 'setShuffle': {
        if (i.shuffle === s.shuffle) return [];
        const n = s.queue.length;
        const order = !n ? [] : i.shuffle ? [s.index, ...permutation(n, seed).filter(k => k !== s.index)].filter(k => k >= 0) : linear(n);
        s = { ...s, shuffle: i.shuffle, order };
        return [];
      }
      case 'reported': {
        const f = i.fact;
        if (f.kind === 'position') { s = { ...s, positionMs: f.ms }; return []; }
        if (f.kind === 'ready') { s = { ...s, status: s.status === 'loading' ? 'playing' : s.status }; return []; }
        if (f.kind === 'buffering') { s = { ...s, status: 'loading' }; return []; }
        if (f.kind === 'error') { s = { ...s, status: 'error' }; return []; }
        if (f.kind === 'ended') { if (s.repeat === 'one') return load(true); return step(1); }
        return [];
      }
    }
    return [];
  }

  function supports(i) {
    if (!i || !PLAYER_INTENT_TYPES.includes(i.type)) return false;
    if (i.type === 'playQueue' || i.type === 'enqueue') return !!(i.tracks && i.tracks.length);
    if (TRANSPORT.includes(i.type)) return s.index >= 0;
    return true;
  }

  return { getState: () => s, dispatch, supports, current: () => s.index >= 0 ? s.queue[s.index] : null };
}
