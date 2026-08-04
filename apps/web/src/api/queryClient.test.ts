/**
 * Regression coverage for the global 401 handler's `code`, not `status`, check —
 * see `queryClient.ts`'s doc comment for the live bug this pins: a Jellyfin
 * (or Audiobookshelf) upstream auth failure also comes back as HTTP 401, and
 * must not be treated as the *Auralis* session expiring.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './errors.js';

const navigate = vi.fn();
let pathname = '/music';

vi.mock('../router/router.js', () => ({
  router: {
    get state() {
      return { location: { pathname } };
    },
    navigate,
  },
}));

describe('handlePossibleAuthError', () => {
  beforeEach(() => {
    navigate.mockClear();
    pathname = '/music';
  });

  it('redirects to /login when the Auralis session itself is unauthenticated', async () => {
    const { handlePossibleAuthError } = await import('./queryClient.js');
    handlePossibleAuthError(new ApiError('unauthenticated', 'Session expired', 401));
    expect(navigate).toHaveBeenCalledWith({ to: '/login' });
  });

  it('does not redirect for a Jellyfin upstream auth failure, even though it is also a 401', async () => {
    const { handlePossibleAuthError } = await import('./queryClient.js');
    handlePossibleAuthError(
      new ApiError('jellyfin_auth_expired', 'Jellyfin rejected the credentials', 401),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not redirect for an Audiobookshelf upstream auth failure either', async () => {
    const { handlePossibleAuthError } = await import('./queryClient.js');
    handlePossibleAuthError(new ApiError('upstream_auth_expired', 'Token expired', 401));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not redirect for a non-ApiError', async () => {
    const { handlePossibleAuthError } = await import('./queryClient.js');
    handlePossibleAuthError(new Error('boom'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is a no-op while already on /login', async () => {
    pathname = '/login';
    const { handlePossibleAuthError } = await import('./queryClient.js');
    handlePossibleAuthError(new ApiError('unauthenticated', 'Session expired', 401));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is a no-op anywhere under /setup', async () => {
    pathname = '/setup/services';
    const { handlePossibleAuthError } = await import('./queryClient.js');
    handlePossibleAuthError(new ApiError('unauthenticated', 'Session expired', 401));
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('isExemptFromAuthRedirect', () => {
  it('exempts /login and any /setup path, nothing else', async () => {
    const { isExemptFromAuthRedirect } = await import('./queryClient.js');
    expect(isExemptFromAuthRedirect('/login')).toBe(true);
    expect(isExemptFromAuthRedirect('/setup')).toBe(true);
    expect(isExemptFromAuthRedirect('/setup/services')).toBe(true);
    expect(isExemptFromAuthRedirect('/music')).toBe(false);
    expect(isExemptFromAuthRedirect('/settings')).toBe(false);
  });
});
