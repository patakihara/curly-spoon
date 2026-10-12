import { describe, expect, it } from 'vitest';
import { createApiClient } from '../api/client';
import { type Access, type AccessStore, createAccess } from './access';

/** An API whose health answer says `signOn`, or that fails; recording each path asked. */
function api(signOn: boolean | 'down') {
  const asked: string[] = [];
  const client = createApiClient({
    baseUrl: 'http://auralis.test',
    fetch: async (request) => {
      asked.push(new URL(request.url).pathname);
      return signOn === 'down'
        ? new Response('down', { status: 502 })
        : Response.json({ status: 'ok', commit: null, signOn });
    },
  });
  return { client, asked };
}

/** Resolves once `access` changes. */
const changed = (access: AccessStore) =>
  new Promise<void>((resolve) => {
    const stop = access.subscribe(() => {
      stop();
      resolve();
    });
  });

function store(signOn: boolean | 'down') {
  const { client, asked } = api(signOn);
  const sent: string[] = [];
  const access = createAccess({
    api: client,
    signIn: (to) => void sent.push(to),
    here: () => '/books?sort=new',
  });
  return { access, sent, asked };
}

describe('[M1.shell] who the app is drawn for', () => {
  it('is not known until the server has answered, and asks only its health', async () => {
    const { access, asked } = store(true);
    expect(access.getState()).toBe<Access>('unknown');
    await changed(access);
    expect(asked).toEqual(['/api/health']);
  });

  it('draws a member’s own library on a server with a sign-on, which let only a member in', async () => {
    const { access } = store(true);
    await changed(access);
    expect(access.getState()).toBe<Access>('member');
  });

  it('sends a member refused for want of a sign-in to sign in, once, back to where they were', async () => {
    const { access, sent } = await (async () => {
      const made = store(true);
      await changed(made.access);
      return made;
    })();
    access.refused();
    await changed(access);
    expect(access.getState()).toBe<Access>('signedOut');
    access.signIn();
    access.signIn();
    expect(sent).toEqual(['/books?sort=new']);
  });

  it('keeps the canvas on a server nobody can sign in to, and never sends anyone to sign in', async () => {
    const { access, sent } = store(false);
    await changed(access);
    expect(access.getState()).toBe<Access>('canvas');
    access.refused();
    access.signIn();
    expect(access.getState()).toBe<Access>('canvas');
    expect(sent).toEqual([]);
  });

  it('draws for a member when the server cannot say, its pages asking again', async () => {
    const { access } = store('down');
    await changed(access);
    expect(access.getState()).toBe<Access>('member');
  });
});
