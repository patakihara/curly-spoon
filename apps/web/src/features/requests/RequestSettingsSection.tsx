/**
 * Approval policy, save path and category for book requests.
 *
 * The save-path hint is the whole reason this form has help text at all: it is
 * the path the *download client* writes to, which on a typical setup (client and
 * Audiobookshelf in separate containers with different mounts) is not the path
 * Audiobookshelf watches. Getting the two confused is the most common way this
 * feature breaks — a download completes and nothing ever shows up in the
 * library — so the UI says this rather than leaving it to a doc no one reads
 * mid-setup.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import { useRequestSettingsQuery, useUpdateRequestSettingsMutation } from '../../api/queries.js';

const MANUAL_POLICY = 'manual';
const AUTOMATIC_POLICY = 'automatic';

export function RequestSettingsSection() {
  const settingsQuery = useRequestSettingsQuery();
  const mutation = useUpdateRequestSettingsMutation();

  const [approvalPolicy, setApprovalPolicy] = useState(MANUAL_POLICY);
  const [bookSavePath, setBookSavePath] = useState('');
  const [bookCategory, setBookCategory] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Seeds local form state from the fetched settings exactly once (not on every
  // refetch) — once the user has started editing, a background refetch must not
  // silently overwrite what they've typed.
  useEffect(() => {
    if (!settingsQuery.data || dirty) return;
    setApprovalPolicy(settingsQuery.data.approvalPolicy);
    setBookSavePath(settingsQuery.data.bookSavePath);
    setBookCategory(settingsQuery.data.bookCategory);
  }, [settingsQuery.data, dirty]);

  const markDirty = () => {
    setDirty(true);
    setJustSaved(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync({ approvalPolicy, bookSavePath, bookCategory });
      setDirty(false);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save request settings.');
    }
  };

  return (
    <section data-testid="request-settings">
      <h2>Book requests</h2>
      <form onSubmit={(event) => void handleSubmit(event)} data-testid="request-settings-form">
        <fieldset>
          <legend>Approval</legend>
          <label
            className="auralis-settings-row"
            htmlFor="approval-policy-manual"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              id="approval-policy-manual"
              type="radio"
              name="approvalPolicy"
              value={MANUAL_POLICY}
              checked={approvalPolicy === MANUAL_POLICY}
              onChange={() => {
                setApprovalPolicy(MANUAL_POLICY);
                markDirty();
              }}
              data-testid="approval-policy-manual"
            />
            <span>Require approval before a request is fulfilled</span>
          </label>
          <label
            className="auralis-settings-row"
            htmlFor="approval-policy-automatic"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              id="approval-policy-automatic"
              type="radio"
              name="approvalPolicy"
              value={AUTOMATIC_POLICY}
              checked={approvalPolicy !== MANUAL_POLICY}
              onChange={() => {
                setApprovalPolicy(AUTOMATIC_POLICY);
                markDirty();
              }}
              data-testid="approval-policy-automatic"
            />
            <span>Fulfil requests automatically</span>
          </label>
        </fieldset>

        <label className="auralis-field" htmlFor="book-save-path">
          <span className="auralis-field__label">Save path</span>
          <input
            id="book-save-path"
            type="text"
            value={bookSavePath}
            onChange={(event) => {
              setBookSavePath(event.target.value);
              markDirty();
            }}
            data-testid="book-save-path-input"
          />
          <p className="auralis-field__hint">
            The path your download client sees, not Audiobookshelf — on most setups these differ. If
            downloads complete but never show up in your library, check this path against what
            Audiobookshelf actually watches.
          </p>
        </label>

        <label className="auralis-field" htmlFor="book-category">
          <span className="auralis-field__label">Category</span>
          <input
            id="book-category"
            type="text"
            value={bookCategory}
            onChange={(event) => {
              setBookCategory(event.target.value);
              markDirty();
            }}
            data-testid="book-category-input"
          />
        </label>

        {error ? (
          <p role="alert" data-testid="request-settings-error">
            {error}
          </p>
        ) : null}
        {justSaved ? <p role="status">Saved.</p> : null}

        <Button
          type="submit"
          variant="filled"
          disabled={mutation.isPending}
          data-testid="request-settings-save"
        >
          Save
        </Button>
      </form>
    </section>
  );
}
