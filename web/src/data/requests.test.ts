import { RequestList, type RequestView } from '@auralis/schema';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../api/client';
import { frame } from '../generated/pages/Requests';
import { requestsData, requestsMoving, requestsState, requestVerb } from './requests';
import { SignedOut } from './store';

const request = (over: Partial<RequestView> = {}): RequestView => ({
  id: 'r1',
  medium: 'book',
  title: 'The Ink Orchard',
  creator: 'Linnea Frost',
  art: null,
  source: 'AudiobookBay',
  size: 286_000_000,
  status: 'downloading',
  progress: 0.64,
  reason: null,
  verbs: ['cancel'],
  candidates: [],
  ...over,
});
const list = (inFlight: RequestView[], needsChoice: RequestView[] = []) =>
  RequestList.parse({ inFlight, needsChoice });
const failed = (over: Partial<RequestView> = {}) =>
  request({
    status: 'failed',
    progress: null,
    reason: 'downloadFailed',
    verbs: ['retry', 'cancel'],
    ...over,
  });
const candidate = { id: 'c1', title: 'A Release [FLAC]', source: 'Prowlarr', size: 1_100_000_000 };

describe('[M3.requests] the Requests page from GET /api/requests', () => {
  it('names what a row is, who by, its source and size, and says where it stands', () => {
    expect(requestsData(list([request()]), frame.placeholder).inFlight).toEqual([
      {
        id: 'r1',
        title: 'The Ink Orchard',
        meta: 'Book · Linnea Frost · AudiobookBay · 286 MB',
        image: '',
        status: 'Downloading · 64%',
        tone: 'progress',
        action: 'Cancel',
        actionIcon: 'close',
        verb: 'cancel',
      },
    ]);
  });

  it('leaves out what a request does not have yet', () => {
    const searching = request({
      status: 'searching',
      progress: null,
      source: null,
      size: null,
      creator: null,
    });
    const [row] = requestsData(list([searching]), frame.placeholder).inFlight;
    expect(row).toMatchObject({ meta: 'Book', status: 'Searching…' });
  });

  it('offers a failed row a retry, and says why it failed', () => {
    const [row] = requestsData(list([failed()]), frame.placeholder).inFlight;
    expect(row).toMatchObject({
      status: 'Failed',
      tone: 'error',
      meta: 'Book · Linnea Frost · AudiobookBay · 286 MB · The download failed',
      action: 'Retry',
      actionIcon: 'refresh',
      verb: 'retry',
    });
  });

  it('draws a failed row with other releases left apart, offering the next in a tap', () => {
    const data = requestsData(
      list([
        failed({
          verbs: ['retry', 'pickAnother', 'cancel'],
          candidates: [candidate, { ...candidate, id: 'c2' }],
        }),
      ]),
      frame.placeholder,
    );
    expect(data.inFlight).toEqual([]);
    expect(data.pickable).toEqual([
      expect.objectContaining({
        verb: 'retry',
        others: 'The download failed; 2 releases left',
        next: 'c1',
      }),
    ]);
  });

  it('lists what waits for a choice with its candidates, by the ids the server gave them', () => {
    const album = request({
      medium: 'album',
      title: 'Paper Lanterns',
      creator: 'Sonic Tales',
      status: 'needsChoice',
      progress: null,
      source: null,
      size: null,
      verbs: ['choose', 'cancel'],
      candidates: [candidate],
    });
    const data = requestsData(list([], [album]), frame.placeholder);
    expect(data.needsChoice).toEqual([
      {
        id: 'r1',
        title: 'Paper Lanterns',
        meta: 'Album · Sonic Tales · 1 release, none clearly best',
        image: '',
        status: 'Needs choice',
        tone: 'request',
        candidates: [{ id: 'c1', title: 'A Release [FLAC]', meta: 'Prowlarr · 1.1 GB' }],
      },
    ]);
  });

  it('is empty once nothing is left, in flight or waiting', () => {
    expect(requestsState(list([]))).toBe('empty');
    expect(requestsState(list([request()]))).toBe('full');
    expect(requestsState(list([], [request({ status: 'needsChoice' })]))).toBe('full');
  });

  it('looks again only while something moves by itself', () => {
    expect(requestsMoving(list([request()]))).toBe(true);
    expect(requestsMoving(list([request({ status: 'queued', progress: null })]))).toBe(true);
    expect(requestsMoving(list([failed()]))).toBe(false);
    expect(requestsMoving(list([], [request({ status: 'needsChoice' })]))).toBe(false);
    expect(requestsMoving(list([]))).toBe(false);
  });
});

describe('[M3.requests] a request’s verbs', () => {
  const answering = (status: number) => {
    const sent: { url: string; body: string }[] = [];
    const fetch = vi.fn(async (asked: Request) => {
      sent.push({ url: new URL(asked.url).pathname, body: await asked.text() });
      return Response.json({ ok: true }, { status });
    });
    return { sent, api: createApiClient({ baseUrl: 'http://a.test', fetch }) };
  };

  it.each([
    ['retry', undefined, '/api/requests/r1/retry', ''],
    ['cancel', undefined, '/api/requests/r1/cancel', ''],
    ['choose', 'c1', '/api/requests/r1/choose', '{"candidate":"c1"}'],
    ['pickAnother', 'c2', '/api/requests/r1/choose', '{"candidate":"c2"}'],
  ] as const)('sends %s through its route', async (verb, chosen, url, body) => {
    const { sent, api } = answering(200);
    await requestVerb(api, 'r1', verb, chosen);
    expect(sent).toEqual([{ url, body }]);
  });

  it('says when signed out, and when refused', async () => {
    await expect(requestVerb(answering(401).api, 'r1', 'retry')).rejects.toBeInstanceOf(SignedOut);
    await expect(requestVerb(answering(409).api, 'r1', 'retry')).rejects.toThrow('409');
  });
});
