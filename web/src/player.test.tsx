import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  LyricsSyncButton,
  MiniPlayer,
  NowPlaying,
  NowPlayingPage,
  PlayerPanel,
  QueuePage,
} from './generated/ui/index.js';

const draw = <P extends object>(component: (props: P) => unknown, props: P) =>
  renderToString(createElement(component as never, props));
const labels = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);

describe("Sonora's spoken transport", () => {
  const spoken = { variant: 'spoken' as const, title: 'The Anxious Generation', playing: true };

  it('[M0.canvas] skips back and forward on a podcast or book, never next or previous', () => {
    const html = draw(NowPlayingPage, { ...spoken, platform: 'mobile' });
    expect(labels(html)).toEqual(
      expect.arrayContaining(['Skip back 15 seconds', 'Pause', 'Skip forward 15 seconds']),
    );
    expect(labels(html)).not.toContain('Next');
    expect(labels(html)).not.toContain('Previous');
    expect(labels(html)).not.toContain('Shuffle');
  });

  it('[M0.canvas] puts speed and the sleep timer at its ends, where music has shuffle and repeat', () => {
    const html = draw(NowPlayingPage, {
      ...spoken,
      platform: 'mobile',
      speed: 1.5,
      sleep: '23 min',
    });
    expect(labels(html)).toEqual(
      expect.arrayContaining(['Playback speed, 1.5 times', 'Sleep timer, 23 min']),
    );
  });

  it('[M0.canvas] keeps next and previous, shuffle and repeat for music, its speed off the page', () => {
    const html = draw(NowPlayingPage, { title: 'Heartbeats in Silence', platform: 'mobile' });
    expect(labels(html)).toEqual(
      expect.arrayContaining(['Shuffle', 'Previous', 'Play', 'Next', 'Repeat']),
    );
    expect(html).not.toContain('Playback speed');
    expect(html).toContain('Sleep timer');
  });

  it('[M0.canvas] gives the desktop player bar the same verbs: skip on spoken, next and previous on music', () => {
    const bar = (variant: 'music' | 'spoken') =>
      labels(draw(MiniPlayer, { title: 't', artist: 'a', platform: 'desktop', variant }));
    expect(bar('spoken')).toEqual(
      expect.arrayContaining(['Skip back 15 seconds', 'Skip forward 15 seconds']),
    );
    expect(bar('spoken')).not.toContain('Next');
    expect(bar('spoken')).not.toContain('Previous');
    expect(bar('spoken')).not.toContain('Lyrics');
    expect(bar('music')).toEqual(expect.arrayContaining(['Previous', 'Next', 'Lyrics']));
  });

  it('[M0.canvas] shows a set sleep timer on the player bar in violet, as the page does, leaving rose to play', () => {
    const html = draw(MiniPlayer, {
      title: 't',
      artist: 'a',
      platform: 'desktop',
      variant: 'spoken',
      sleep: '23 min',
    });
    const button = /<button[^>]*aria-label="Sleep timer, 23 min"[^>]*>/.exec(html)?.[0];
    expect(button).toContain('color:var(--accent-ink)');
    expect(button).not.toContain('--play');
  });

  it('[M0.canvas] steps a title with a word too wide for its column down, never running it under the favourite', () => {
    const html = draw(NowPlayingPage, {
      ...spoken,
      title: 'Aftershocks: the second call',
      platform: 'mobile',
      favourite: false,
    });
    expect(html).toMatch(
      /overflow-wrap:break-word;[^"]*font-size:var\(--text-2xl\)"[^>]*>Aftershocks: the second call</,
    );
    expect(draw(NowPlayingPage, { ...spoken, platform: 'mobile' })).toContain(
      'font-size:var(--text-4xl)">The Anxious Generation<',
    );
  });
});

describe("Sonora's mini player", () => {
  it('[M0.sonoraclean/d] plays from a button on the play fill, its glyph filled, on both platforms', () => {
    for (const platform of ['mobile', 'desktop'] as const) {
      const html = draw(MiniPlayer, { title: 't', artist: 'a', platform, onTogglePlay: () => {} });
      const play = /<button[^>]*aria-label="Play"[^>]*>/.exec(html)?.[0];
      expect(play, platform).toContain('background:var(--play)');
      expect(play, platform).toContain('height:var(--control-lg)');
    }
  });

  it('[M0.sonoraclean/d] sets the elapsed time and the length either side of its seek slider on desktop', () => {
    const html = draw(MiniPlayer, {
      title: 't',
      artist: 'a',
      platform: 'desktop',
      progress: 0.5,
      duration: 200,
    });
    expect(html).toMatch(/>1:40<\/span><div[^>]*>.*role="slider".*<\/div><span[^>]*>3:20</);
  });

  it('[M0.sonoraclean/d] draws its controls in the now-playing ink, its off toggles dimmed', () => {
    const html = draw(MiniPlayer, { title: 't', artist: 'a', platform: 'desktop' });
    expect(html).toContain('--surface-fg:var(--surface-now-playing-fg)');
    expect(html).toContain('--surface-fg-muted:var(--surface-now-playing-fg-muted)');
    const shuffle = /<button[^>]*aria-label="Shuffle"[^>]*>/.exec(html)?.[0];
    expect(shuffle).toContain('opacity:var(--opacity-dim)');
  });
});

describe("Sonora's player on desktop", () => {
  it('[M0.canvas] leaves the seek bar and transport to the player bar, so the panel never repeats them', () => {
    const html = draw(NowPlayingPage, { platform: 'desktop', title: 'Heartbeats in Silence' });
    for (const label of ['Play', 'Pause', 'Next', 'Previous', 'Shuffle']) {
      expect(labels(html)).not.toContain(label);
    }
    expect(html).not.toContain('role="slider"');
  });

  it("[M0.canvas] shares the panel's width among its tabs, so the third is never cut off", () => {
    const tabs = [
      { key: 'now', label: 'Now playing' },
      { key: 'queue', label: 'Queue' },
      { key: 'lyrics', label: 'Lyrics' },
    ];
    const html = draw(PlayerPanel, { open: true, tabs, tab: 'now' });
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/<button[^>]*role="tab"[^>]*style="flex:1 1 0;min-width:0/g)).toHaveLength(3);
  });
});

describe("Sonora's player on the phone", () => {
  const html = (variant?: 'music' | 'spoken') =>
    draw(NowPlaying, {
      platform: 'mobile',
      open: true,
      variant,
      track: { context: 'Deep Inertia' },
    });

  it('[M0.canvas] covers the whole frame, the bottom bar included', () => {
    expect(html()).toMatch(/^<div aria-hidden="false" style="position:absolute;inset:0;/);
  });

  it('[M0.canvas] holds Now playing, Queue and Lyrics as tabs, and a spoken item has no Lyrics tab', () => {
    const tabs = (h: string) =>
      [...h.matchAll(/role="tab"[^>]*>(?:<[^>]*>)*([^<]+)/g)].map((m) => m[1]);
    expect(tabs(html())).toEqual(['Now playing', 'Queue', 'Lyrics']);
    expect(tabs(html('spoken'))).toEqual(['Now playing', 'Queue']);
  });
});

describe("Sonora's queue tab", () => {
  const item = (title: string, extra = {}) => ({
    title,
    sub: 'Deep Inertia',
    time: '4:02',
    ...extra,
  });
  const html = draw(QueuePage, {
    platform: 'mobile',
    heading: null,
    queues: [
      { key: 'music', label: 'Music' },
      { key: 'spoken', label: 'Spoken' },
    ],
    queue: 'music',
    played: [item('Tears of Ice')],
    items: [
      item('Heartbeats in Silence', { current: true }),
      item('Episode 12', { handoff: 'Then the spoken queue' }),
      item('Episode 13'),
      item('Glass Coast', { waiting: 'Waiting in the music queue' }),
    ],
    autoplay: { title: 'From Deep Inertia radio', items: [item('Night Drive')] },
    onClear: () => {},
  });

  it('[M0.canvas] switches between the music and the spoken queue', () => {
    expect(html).toContain('>Music<');
    expect(html).toContain('>Spoken<');
  });

  it('[M0.canvas] shows what played, what plays now, what is next and what autoplay continues with, in that order', () => {
    const order = [
      'Played',
      'Tears of Ice',
      'Now playing',
      'Heartbeats in Silence',
      'Up next',
      'Episode 12',
      'Autoplay',
      'Night Drive',
    ];
    const at = order.map((text) => html.indexOf(`>${text}<`));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('[M0.canvas] marks where playback moves to the spoken queue, what it plays there, then where the music waits', () => {
    const order = [
      'Then the spoken queue',
      'Episode 12',
      'Episode 13',
      'Waiting in the music queue',
      'Glass Coast',
    ];
    const at = order.map((text) => html.indexOf(text));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('[M0.canvas] marks where playback moves over to the other queue, and offers to clear and to edit', () => {
    expect(html).toContain('Then the spoken queue');
    expect(labels(html)).toEqual(expect.arrayContaining(['Clear queue', 'Edit queue']));
  });
});

describe("Sonora's queue edit toggle", () => {
  const queue = { platform: 'mobile' as const, heading: null, items: [{ title: 'Low Tide' }] };
  /** The Edit queue button's own tag. */
  const editButton = (html: string) => /<button[^>]*aria-label="Edit queue"[^>]*>/.exec(html)![0];

  it('[M0.states/c] is disabled when the queue can be neither removed from nor reordered', () => {
    expect(editButton(draw(QueuePage, queue))).toMatch(/\sdisabled=""/);
  });

  it('[M0.states/c] is enabled once the queue can be removed from or reordered', () => {
    const remove = { onRemove: () => {} };
    const removeSelected = { onRemoveSelected: () => {} };
    const reorder = { onReorder: () => {} };
    for (const can of [remove, removeSelected, reorder])
      expect(editButton(draw(QueuePage, { ...queue, ...can }))).not.toMatch(/\sdisabled=""/);
  });
});

describe("Sonora's lyric sync toggle", () => {
  const turnsTo = (props: Parameters<typeof LyricsSyncButton>[0]) => {
    let to: string | undefined;
    const tree = LyricsSyncButton({ ...props, onChange: (m) => void (to = m) }) as {
      props: { onClick: () => void };
    };
    tree.props.onClick();
    return to;
  };

  it('[M0.canvas] turns sync off to the dot on the current line, and back on', () => {
    expect(turnsTo({ mode: 'sync' })).toBe('dot');
    expect(turnsTo({ mode: 'dot' })).toBe('sync');
  });

  it('[M0.canvas] turns sync off to no mark at all once the dot is switched off', () => {
    expect(turnsTo({ mode: 'sync', dot: false })).toBe('off');
    expect(turnsTo({ mode: 'off', dot: false })).toBe('sync');
  });
});
