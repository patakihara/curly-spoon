// Backdrop Nav — FAKE BACKEND + TEST FIXTURES for app/app.json
// The app itself is app/app.json (AppConfig, plain JSON). This file only fakes the backend: a small media catalog
// (music, audiobooks, podcasts), the data sources the config names, and the pages items open. bind(config) → { config, data, fixtures }

// ── catalog (mock data) ────────────────────────────────────
const MUSIC = [
  ['Maren Holt', 'Pop', [['Paper Satellites', 2023, ['Orbit', 'Paper Hearts', 'Lowlight', 'Signal Fire', 'Afterglow']], ['Northbound', 2019, ['Northbound', 'Tidal', 'Cold Coffee', 'Aurora']]]],
  ['The Lumen Tide', 'Rock', [['High Water', 2021, ['Undertow', 'High Water', 'Breakwater', 'Salt']], ['Static Bloom', 2014, ['Static Bloom', 'Voltage', 'Faultline']]]],
  ['Kofi Asante', 'Jazz', [['Blue Hours', 2022, ['Blue Hours', 'Late Train', 'Rain on Brass', 'Quiet Room']], ['Lagos Nights', 2008, ['Harbour', 'Lagos Nights', 'Ember']]]],
  ['Velvet Arcade', 'Electronic', [['Neon Weather', 2024, ['Neon Weather', 'Pixel Rain', 'Night Drive', 'Echo Park', 'Glass']], ['Arcadia', 2012, ['Arcadia', 'Coin Op', 'Hi-Score']]]],
  ['Ines Duarte', 'Folk', [['Small Fires', 2020, ['Small Fires', 'Riverbed', 'Linen', 'Grandmother Song']]]],
  ['North Atlas', 'Hip-hop', [['Compass', 2023, ['Compass', 'True North', 'Block Party', 'Atlas']], ['First Draft', 2005, ['Intro', 'First Draft', 'Corner Store']]]],
  ['Juno Park', 'Pop', [['Soft Focus', 2018, ['Soft Focus', 'Polaroid', 'Summer Static']]]],
  ['Saltwater Choir', 'Folk', [['Harbour Hymns', 2016, ['Lantern', 'Harbour Hymns', 'Fog Bell']]]]
];
const BOOKS = [
  ['Edda Lindqvist', 'Mystery', [['The Glass Orchard', 2022, 9], ['A Quiet Murder', 2017, 7]]],
  ['Tomas Reyes', 'Science', [['Small Stars', 2023, 12]]],
  ['Priya Nair', 'Fiction', [['The Salt Road', 2021, 10], ['Monsoon Letters', 2011, 8]]],
  ['Arthur Bell', 'History', [['Empires of Ice', 2019, 14]]],
  ['Lena Okafor', 'Biography', [['Running Uphill', 2024, 6]]],
  ['Henrik Moss', 'Fiction', [['The Last Lighthouse', 2002, 11]]]
];
const SHOWS = [
  ['Mira Castell', 'Science', [['Curious Minds', ['Why we dream', 'The octopus question', 'Light from dead stars', 'Gut feelings']]]],
  ['Dev & Sam', 'Comedy', [['Two Mics', ['The wedding episode', 'Bad advice', 'Live from Lisbon']]]],
  ['Noor Haddad', 'News', [['The Daily Brief', ['Monday briefing', 'Election week', 'Markets wrap', 'Weekend read']]]],
  ['Oskar Wren', 'True crime', [['Cold Files', ['The lake house', 'Missing at midnight', 'A forger’s confession']]]],
  ['Ada Moreau', 'Culture', [['Slow Culture', ['On boredom', 'The museum at night', 'Why we collect']]]]
];
// ── generated filler (deterministic) so lists are long enough to test scrolling: more artists / albums / songs, authors / books, hosts / shows / episodes
const W1 = ['Silver', 'Hollow', 'Quiet', 'Golden', 'Paper', 'Electric', 'Velvet', 'Wild', 'Broken', 'Distant', 'Crimson', 'Lucky', 'Midnight', 'Open', 'Slow', 'Northern', 'Glass', 'Restless', 'Sunday', 'Little'];
const W2 = ['River', 'Engine', 'Garden', 'Signal', 'Harbor', 'Window', 'Season', 'Lantern', 'Mirror', 'Highway', 'Orchard', 'Comet', 'Letter', 'Island', 'Machine', 'Meadow', 'Station', 'Weather', 'Echo', 'Parade'];
const FIRST = ['Ari', 'Bea', 'Cato', 'Dara', 'Eli', 'Fen', 'Gia', 'Hugo', 'Ilse', 'Jonah', 'Kira', 'Luca', 'Mina', 'Nils', 'Odette', 'Pavel', 'Rosa', 'Sven', 'Tove', 'Uma'];
const LAST = ['Varga', 'Lund', 'Okoro', 'Brandt', 'Sato', 'Moreno', 'Kask', 'Doyle', 'Haas', 'Nakamura', 'Ferreira', 'Holm', 'Quist', 'Adeyemi', 'Roux', 'Petrov', 'Tan', 'Wilde', 'Yilmaz', 'Zeller'];
const wordPair = (i, j) => W1[(i * 7 + j * 3) % W1.length] + ' ' + W2[(i * 5 + j * 11) % W2.length];
const used = new Set();
const uniq = t => { let x = t, n = 2; while (used.has(x)) x = t + ' ' + (n++); used.add(x); return x; };
[MUSIC, BOOKS, SHOWS].forEach(L => L.forEach(([, , cs]) => cs.forEach(c => { used.add(c[0]); if (Array.isArray(c[2])) c[2].forEach(x => used.add(x)); })));
const MUSIC_GENRES = ['Pop', 'Rock', 'Jazz', 'Electronic', 'Folk', 'Hip-hop'];
const songsFor = (i, j, n) => Array.from({ length: n }, (_, k) => W1[(i + j * 3 + k * 7) % W1.length] + ' ' + W2[(i * 3 + k * 5 + j) % W2.length]);
MUSIC.forEach(([, , albums], i) => { for (let j = 0; j < 4; j++) albums.push([uniq(wordPair(i + 3, j)), 2001 + (i * 3 + j * 5) % 24, songsFor(i, j, 10 + (i + j) % 5)]); albums.forEach(a => { while (a[2].length < 10) a[2].push(W2[(a[2].length * 7 + a[0].length) % W2.length] + ' ' + (a[2].length + 1)); }); });
for (let i = 0; i < 20; i++) {
  const name = uniq(FIRST[i] + ' ' + LAST[(i * 7) % LAST.length]);
  MUSIC.push([name, MUSIC_GENRES[i % MUSIC_GENRES.length], Array.from({ length: 3 + i % 4 }, (_, j) => [uniq(wordPair(i + 20, j)), 1998 + (i * 5 + j * 4) % 27, songsFor(i + 20, j, 9 + (i * j) % 6)])]);
}
const BOOK_GENRES = ['Fiction', 'Mystery', 'Science', 'History', 'Biography'];
BOOKS.forEach(([, , books], i) => { for (let j = 0; j < 3; j++) books.push([uniq('The ' + wordPair(i + 40, j)), 1995 + (i * 4 + j * 6) % 30, 8 + (i + j) % 10]); });
for (let i = 0; i < 12; i++) BOOKS.push([uniq(FIRST[(i + 5) % FIRST.length] + ' ' + LAST[(i * 3 + 2) % LAST.length]), BOOK_GENRES[i % BOOK_GENRES.length], Array.from({ length: 2 + i % 3 }, (_, j) => [uniq('The ' + wordPair(i + 60, j)), 1990 + (i * 7 + j * 3) % 35, 6 + (i + j * 2) % 12])]);
const SHOW_GENRES = ['News', 'Comedy', 'Science', 'True crime', 'Culture'];
const episodes = (i, n) => Array.from({ length: n }, (_, k) => 'On ' + (W1[(i + k * 3) % W1.length] + ' ' + W2[(i * 2 + k * 7) % W2.length]).toLowerCase());
SHOWS.forEach(([, , shows], i) => shows.forEach(sh => { sh[1] = [...sh[1], ...episodes(i, 16)]; }));
for (let i = 0; i < 10; i++) SHOWS.push([uniq(FIRST[(i + 11) % FIRST.length] + ' ' + LAST[(i * 9 + 4) % LAST.length]), SHOW_GENRES[i % SHOW_GENRES.length], [[uniq(wordPair(i + 80, 0) + ' Hour'), episodes(i + 80, 12 + i % 8)]]]);
const decade = y => y >= 2020 ? '2020s' : y >= 2010 ? '2010s' : y >= 2000 ? '2000s' : 'older';
const age = y => y >= 2022 ? 'new' : 'classic';
const pad = n => String(n).padStart(2, '0');
const C = { people: [], collections: [], tracks: [] };
const add = (bucket, o) => { C[bucket].push(o); return o; };
MUSIC.forEach(([name, genre, albums]) => {
  const a = add('people', { id: name, title: name, domain: 'music', genre, sub: 'Artist · ' + genre, year: Math.max(...albums.map(x => x[1])) });
  albums.forEach(([t, y, songs]) => {
    const al = add('collections', { id: t, title: t, domain: 'music', genre, year: y, by: a.id, sub: name + ' · ' + y });
    songs.forEach((s, i) => add('tracks', { id: s + ' · ' + t, title: s, domain: 'music', genre, year: y, of: al.id, by: a.id, sub: name + ' · ' + t, ms: (150 + ((i * 37 + t.length * 11) % 130)) * 1000 }));
  });
});
BOOKS.forEach(([name, genre, books]) => {
  const a = add('people', { id: name, title: name, domain: 'audiobooks', genre, sub: 'Author · ' + genre, year: Math.max(...books.map(x => x[1])) });
  books.forEach(([t, y, n]) => {
    const b = add('collections', { id: t, title: t, domain: 'audiobooks', genre, year: y, by: a.id, sub: name + ' · ' + n + ' chapters' });
    for (let i = 1; i <= n; i++) add('tracks', { id: 'Chapter ' + i + ' · ' + t, title: 'Chapter ' + i, domain: 'audiobooks', genre, year: y, of: b.id, by: a.id, sub: t, ms: (1500 + i * 97) * 1000 });
  });
});
SHOWS.forEach(([name, genre, shows], k) => {
  const a = { id: name };   // hosts aren't in the catalog (no data source for them)
  shows.forEach(([t, eps]) => {
    const sh = add('collections', { id: t, title: t, domain: 'podcasts', genre, year: 2024, by: a.id, sub: name + ' · ' + eps.length + ' episodes' });
    eps.forEach((e, i) => add('tracks', { id: e + ' · ' + t, title: e, domain: 'podcasts', genre, year: 2024, fresh: i < 2 ? 'week' : 'month', of: sh.id, by: a.id, sub: t + ' · Ep. ' + (eps.length - i), ms: (1800 + i * 240 + k * 60) * 1000 }));
  });
});
const byId = id => C.people.find(x => x.id === id) || C.collections.find(x => x.id === id) || C.tracks.find(x => x.id === id);
export const track = t => ({ id: t.id, title: t.title, subtitle: t.sub, image: 'mock:' + (t.of || t.id), durationMs: t.ms, source: 'audio:' + encodeURIComponent(t.id) });
const tracksOf = c => C.tracks.filter(t => t.of === c.id);
const fmtMs = ms => Math.floor(ms / 60000) + ':' + pad(Math.round(ms / 1000) % 60);

// labels the engine shows for each domain (backend content: arrives localized)
const DOMAIN = {
  music: { people: 'Artists', collections: 'Albums', tracks: 'Songs', genres: ['Pop', 'Rock', 'Jazz', 'Electronic', 'Folk', 'Hip-hop'], when: ['any', '2020s', '2010s', '2000s', 'older', 'range'], whenLabel: { any: 'Any year', '2020s': '2020s', '2010s': '2010s', '2000s': '2000s', older: 'Older', range: 'From – to' } },
  audiobooks: { people: 'Authors', collections: 'Books', tracks: 'Chapters', genres: ['Fiction', 'Mystery', 'Science', 'History', 'Biography'], when: ['any', 'new', 'classic', 'range'], whenLabel: { any: 'Any time', new: 'New releases', classic: 'Classics', range: 'From – to' } },
  podcasts: { people: 'Hosts', collections: 'Shows', tracks: 'Episodes', genres: ['News', 'Comedy', 'Science', 'True crime', 'Culture'], when: ['any', 'week', 'month'], whenLabel: { any: 'Any time', week: 'This week', month: 'This month' } }
};
const whenOf = (x, d) => d === 'music' ? decade(x.year) : d === 'audiobooks' ? age(x.year) : (x.fresh || 'month');

// an item of the catalog as the engine sees it (tag = its subtitle line)
function toItem(x) {
  const isP = C.people.includes(x), isC = C.collections.includes(x), isT = C.tracks.includes(x), isE = isT && x.domain === 'podcasts';
  const o = { id: x.id, title: x.title, subtitle: x.sub + (isT ? ' · ' + fmtMs(x.ms) : ''), image: 'mock:' + x.id, domain: x.domain, year: x.year, shape: isP ? 'circle' : 'square', opens: isP ? { template: 'person' } : isC ? { template: 'collection' } : isE ? { template: 'episode' } : null };
  if (isT) o.track = track(x);
  if (isE) o.tracks = [track(x)];   // the episode page plays / queues its opener's tracks, like an album's
  if (isC) o.tracks = tracksOf(x).map(track);
  if (isP) { o.tracks = C.tracks.filter(t => t.by === x.id).map(track); o.collectionCount = C.collections.filter(c => c.by === x.id).length; o.trackCount = C.tracks.filter(t => t.by === x.id).length; }
  return o;
}
// shelves (Browse carousels): each opens the shelf template with its full list
const SHELVES = [
  { id: 'Artists to know', domain: 'music', pick: () => C.people.filter(x => x.domain === 'music') },
  { id: 'New music', domain: 'music', pick: () => C.collections.filter(x => x.domain === 'music').sort((a, b) => b.year - a.year) },
  { id: 'Popular audiobooks', domain: 'audiobooks', pick: () => C.collections.filter(x => x.domain === 'audiobooks') },
  { id: 'Authors', domain: 'audiobooks', pick: () => C.people.filter(x => x.domain === 'audiobooks') },
  { id: 'Podcasts to try', domain: 'podcasts', pick: () => C.collections.filter(x => x.domain === 'podcasts') },
  { id: 'Fresh episodes', domain: 'podcasts', pick: () => C.tracks.filter(x => x.domain === 'podcasts' && x.fresh === 'week') },
  { id: 'Jazz & folk', domain: 'music', pick: () => C.collections.filter(x => x.genre === 'Jazz' || x.genre === 'Folk') }
];
const sorted = (xs, sort) => sort === 'new' ? [...xs].sort((a, b) => (b.year || 0) - (a.year || 0)) : xs;
// subtitle: what the shelf holds, as the backend would send it (localized content), e.g. '8 artists'
const bucketOf = x => C.people.includes(x) ? 'people' : C.collections.includes(x) ? 'collections' : 'tracks';
const shelfItem = (s, sort) => { const xs = sorted(s.pick(), sort); return { id: s.id, title: s.id, subtitle: xs.length + ' ' + (xs.length ? DOMAIN[s.domain][bucketOf(xs[0])] : '').toLowerCase(), domain: s.domain, entries: xs.slice(0, 10).map(toItem), opens: { template: 'shelfPage' } }; };

// ── data sources ──────────────────────────────────────────
const featured = () => { const c = C.collections.filter((x, k) => k % 3 === 0), p = C.people.filter((x, k) => k % 3 === 0), out = []; for (let k = 0; out.length < 24 && (k < c.length || k < p.length); k++) { if (p[k]) out.push(p[k]); if (c[k]) out.push(c[k]); } return out; };
const SOURCES = {
  'content:browse': p => SHELVES.filter(s => !p.f || p.f === 'all' || s.domain === p.f).map(s => shelfItem(s, p.sort)),
  shelf: p => { const s = SHELVES.find(x => x.id === p.id); if (!s) return []; let xs = sorted(s.pick(), p.sort); if (Array.isArray(p.genre) && p.genre.length) xs = xs.filter(x => p.genre.includes(x.genre)); return xs.map(toItem); },
  'options:shelf.genre': p => { const s = SHELVES.find(x => x.id === p.id); return s ? [...new Set(s.pick().map(x => x.genre))].map(g => ({ value: g, label: g })) : []; },
  'options:person.when': p => { const x = byId(p.id); if (!x) return []; const ys = [...new Set(C.collections.filter(c => c.by === x.id).map(c => decade(c.year)))]; return [{ value: 'any', label: x.domain === 'music' ? 'Any year' : 'Any time' }, ...ys.map(y => ({ value: y, label: y === 'older' ? 'Older' : y }))]; },
  collection: p => { const c = byId(p.id); return c ? tracksOf(c).map(toItem) : []; },
  person: p => { const x = byId(p.id); if (!x) return []; if (p.section === 'related') return C.people.filter(y => y.domain === x.domain && y.id !== x.id).slice(0, 6).map(toItem); let xs = (p.section === 'tracks' ? C.tracks : C.collections).filter(y => y.by === x.id); if (p.when && p.when !== 'any') xs = xs.filter(y => decade(y.year) === p.when); xs = p.sort === 'name' ? [...xs].sort((a, b) => a.title.localeCompare(b.title)) : [...xs].sort((a, b) => (b.year || 0) - (a.year || 0)); return xs.map(toItem); },
  'options:person.section': p => { const x = byId(p.id), D = DOMAIN[(x && x.domain) || 'music']; return [{ value: 'collections', label: D.collections }, { value: 'tracks', label: D.tracks }, { value: 'related', label: 'Similar' }]; },
  'content:library': (p, id) => {
    const d = p.tab || 'music', kind = p.kind || 'collections';
    let xs = (C[kind] || []).filter(x => x.domain === d);
    if (Array.isArray(p.genre) && p.genre.length) xs = xs.filter(x => p.genre.includes(x.genre));
    if (p.year === 'range' && Array.isArray(p.years)) xs = xs.filter(x => x.year >= p.years[0] && x.year <= p.years[1]);
    else if (p.year && p.year !== 'any') xs = xs.filter(x => whenOf(x, d) === p.year);
    if (p.sort === 'name') xs = [...xs].sort((a, b) => a.title.localeCompare(b.title));
    if (p.sort === 'year') xs = [...xs].sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
    if (p.sort === 'added') xs = [...xs].reverse();
    return xs.map(toItem);
  },
  'content:search': (p, id) => {
    const q = String(p.q || '').trim().toLowerCase(); if (!q) return featured().map(toItem);   // nothing typed: what's popular
    return [...C.people, ...C.collections, ...C.tracks].filter(x => x.title.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q)).slice(0, 30).map(toItem);
  },
  suggest: p => {
    const q = String(p.prefix || '').trim().toLowerCase();
    const pool = [...C.people, ...C.collections].map(x => x.title);
    return (q ? pool.filter(t => t.toLowerCase().includes(q)) : ['Velvet Arcade', 'Blue Hours', 'The Glass Orchard', 'Curious Minds', 'Maren Holt']).slice(0, 5).map(t => ({ id: t, title: t, opens: null }));
  },
  // Now playing sheet: the queue (from the player, passed as params), lyrics and related of the current track
  nowPlaying: p => {
    const q = Array.isArray(p.queue) ? p.queue : [], cur = q[p.index];
    if (p.tab === 'lyrics') return cur ? LYRICS.map((l, i) => ({ id: 'line ' + i, title: l, opens: null })) : [];
    if (p.tab === 'related') { const t = cur && C.tracks.find(x => x.id === cur.id); return t ? C.collections.filter(c => c.domain === t.domain && c.id !== t.of).slice(0, 6).map(toItem) : []; }
    return q.map((t, i) => ({ id: t.id + '#' + i, title: t.title, subtitle: t.subtitle, image: t.image, index: i, current: i === p.index, opens: null }));
  },
  'options:library.kind': p => (p.tab === 'podcasts' ? ['collections', 'tracks'] : ['people', 'collections', 'tracks']).map(v => ({ value: v, label: DOMAIN[p.tab || 'music'][v] })),
  'options:library.genre': p => DOMAIN[p.tab || 'music'].genres.map(g => ({ value: g, label: g })),
  'options:library.year': p => { const D = DOMAIN[p.tab || 'music']; return D.when.map(v => ({ value: v, label: D.whenLabel[v] })); }
};
const LYRICS = ['(instrumental intro)', 'Paper boats on a silver line', 'Counting lights until the morning', 'Every signal finds its way home', 'Hold the static, let it ring', 'Paper boats on a silver line'];
const LAYER = {
  'layer:nowPlaying:recent': id => [C.collections[3], C.collections[12], C.people[8]].map(toItem),
  'layer:nowPlaying:saved': id => [C.collections[0], C.collections[16], C.people[0]].map(toItem),
  'layer:Dedede:home': () => DEDEDE.map(n => toPage(n, n)),
  ...Object.fromEntries(['Fliboo', 'Granto', 'Pesquil', 'Wumbel', 'Zorrit', 'Quimbo'].map(n => ['layer:Dedede:' + n, () => ['Brimble', 'Snorf', 'Twaddle', 'Quonk'].map(x => ({ id: x, title: x, image: 'mock:' + x, opens: null }))]))
};
const DEDEDE = ['Fliboo', 'Granto', 'Pesquil', 'Wumbel', 'Zorrit', 'Quimbo'];
const toPage = (label, page) => ({ id: label, title: label, image: 'mock:' + label, opens: { kind: 'layerPage', page } });
export const data = {
  get(dataSource, params = {}) {
    let items = SOURCES[dataSource] ? SOURCES[dataSource](params) : LAYER[dataSource] ? LAYER[dataSource]() : null;
    if (!items) return { status: 'error', items: [] };
    const q = String(params.find || '').trim().toLowerCase();   // local search (the page's 'find' param)
    if (q) items = items.filter(i => String(i.title || '').toLowerCase().includes(q) || String(i.subtitle || '').toLowerCase().includes(q));
    return { status: 'ready', items };
  }
};


// ── invariant fixtures (roles are discovered from config; only devices + item access here)
export function bind(config) {
  const fixtures = {
  config,
  data,
  devices: [
    { width: 360, touch: true },
    { width: 720, touch: true },
    { width: 720, touch: false },
    { width: 1100, touch: false }
  ],
  // a navigable item of that kind in the under page's content, under the current params or any option of a choice param (sections)
  item(m, kind) {
    const s = m.getState(), u = m.query.underPage(s), base = m.query.contentParams(u), ds = u.config.front.content.dataSource, P = u.config.params || {};
    const variants = [base, ...Object.keys(P).filter(k => P[k].type === 'choice').flatMap(k => m.query.paramOptions(s, m.config, u, k).map(o => ({ ...base, [k]: o.value })))];
    const kindOf = i => !i.opens ? null : i.opens.kind === 'layerPage' ? 'layerPage' : ((config.pages || {})[i.opens.template] || {}).kind;
    for (const v of variants) { const it = data.get(ds, v).items.find(i => kindOf(i) === kind); if (it) return it; }
    return undefined;
  },
  tracks(n = 4) { return C.tracks.slice(0, n).map(track); },
  sampleDialog: { id: 'confirm', kind: 'dialog', component: 'dialog', blocking: true, props: { title: 'Sure?' } },
  sampleSnackbar: { id: 'toast', kind: 'snackbar', component: 'snackbar', blocking: false, timeoutMs: 4000 },
  link(m, layerId) {
    const L = config.layers.find(l => l.id === layerId);
    for (const pg of Object.values(L.pages.set)) { if (!pg.content) continue; const it = data.get(pg.content.dataSource).items.find(i => i.opens && i.opens.kind !== 'layerPage'); if (it) return it; }
    return undefined;
  }
  };
  return { config, data, fixtures };
}
