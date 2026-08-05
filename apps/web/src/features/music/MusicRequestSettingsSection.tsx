/**
 * Save path and category for music requests. A separate form from
 * `features/requests/RequestSettingsSection.tsx` (books) rather than an extra fieldset
 * bolted onto it, even though both submit to the same `PUT /settings/requests` — that
 * route already treats every field independently (`if (body.musicSavePath !== undefined)`,
 * `routes/requests.ts`), so this form can send `{ musicSavePath, musicCategory }` alone
 * and never touch approval policy or the book fields, and the book form is left completely
 * unmodified by this file existing. `useRequestSettingsQuery`/`useUpdateRequestSettingsMutation`
 * are reused as-is (`api/queries.ts`) — the query key and the underlying resource are the
 * same one `RequestSettingsSection` reads, so a save here is reflected there too on the
 * next fetch, and vice versa.
 *
 * The save-path hint says the same operational truth `RequestSettingsSection`'s does for
 * books, adapted to slskd's own stricter rule: `music/slskd.ts`'s `isRelativeSavePath`
 * rejects an absolute path or a `..` segment outright (`ProviderError`, kind `rejected`),
 * unlike the book save path, which is merely a namespace mismatch waiting to happen. That
 * error message already names this setting by name — see `slskd.ts`'s `add()` — so the
 * search panel and request list need only display it verbatim (`ApiError.message`, same
 * convention as everywhere else in this app) rather than re-explain it; this hint exists so
 * a user finds the right field *before* hitting that error once.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import { useRequestSettingsQuery, useUpdateRequestSettingsMutation } from '../../api/queries.js';

export function MusicRequestSettingsSection() {
  const settingsQuery = useRequestSettingsQuery();
  const mutation = useUpdateRequestSettingsMutation();

  const [musicSavePath, setMusicSavePath] = useState('');
  const [musicCategory, setMusicCategory] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Same "seed once, not on every refetch" rule as `RequestSettingsSection` — see that
  // file's identical effect for why. `?? ''` covers the unset case, where the server sends
  // `null` (this type's own doc comment on `RequestSettings.musicSavePath` explains why).
  useEffect(() => {
    if (!settingsQuery.data || dirty) return;
    setMusicSavePath(settingsQuery.data.musicSavePath ?? '');
    setMusicCategory(settingsQuery.data.musicCategory ?? '');
  }, [settingsQuery.data, dirty]);

  const markDirty = () => {
    setDirty(true);
    setJustSaved(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync({ musicSavePath, musicCategory });
      setDirty(false);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save music request settings.');
    }
  };

  return (
    <section data-testid="music-request-settings">
      <h2>Music requests</h2>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        data-testid="music-request-settings-form"
      >
        <label className="auralis-field" htmlFor="music-save-path">
          <span className="auralis-field__label">Save path</span>
          <input
            id="music-save-path"
            type="text"
            value={musicSavePath}
            onChange={(event) => {
              setMusicSavePath(event.target.value);
              markDirty();
            }}
            data-testid="music-save-path-input"
          />
          <p className="auralis-field__hint">
            Relative to slskd's own configured download directory — slskd rejects an absolute path
            or a ".." segment outright. Leave blank to use slskd's default. Jellyfin does not watch
            this location automatically; a finished download still needs a manual library rescan
            before it appears.
          </p>
        </label>

        <label className="auralis-field" htmlFor="music-category">
          <span className="auralis-field__label">Category</span>
          <input
            id="music-category"
            type="text"
            value={musicCategory}
            onChange={(event) => {
              setMusicCategory(event.target.value);
              markDirty();
            }}
            data-testid="music-category-input"
          />
        </label>

        {error ? (
          <p role="alert" data-testid="music-request-settings-error">
            {error}
          </p>
        ) : null}
        {justSaved ? <p role="status">Saved.</p> : null}

        <Button
          type="submit"
          variant="filled"
          disabled={mutation.isPending}
          data-testid="music-request-settings-save"
        >
          Save
        </Button>
      </form>
    </section>
  );
}
