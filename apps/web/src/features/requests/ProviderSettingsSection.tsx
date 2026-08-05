/**
 * Provider settings — every entry `GET /providers` returns, including
 * unconfigured ones, so a provider can be *added* here rather than only edited.
 *
 * Local edits are tracked per-provider as a sparse overlay on top of the fetched
 * `ProviderEntry` (an unedited field falls back to the server value) rather than
 * seeded into a full copy of the entry, so a background refetch never clobbers an
 * in-progress edit and a saved provider's row resets itself for free once the
 * query refetches. Secret fields are the one exception that needs its own
 * tracking beyond "edited or not" — see `providerForm.ts`'s doc comment for why
 * *which* fields were actually typed into matters, not just their values.
 */
import { useState } from 'react';
import { Button, Chip } from '@auralis/ui';
import { ApiError } from '../../api/errors.js';
import type { ProviderEntry, ProviderUpdateBody } from '../../api/types.js';
import {
  useProvidersQuery,
  useTestProviderMutation,
  useUpdateProviderMutation,
} from '../../api/queries.js';
import { buildSecretPayload } from './providerForm.js';

interface ProviderEdit {
  enabled?: boolean;
  baseUrl?: string;
  secretValues: Record<string, string>;
  touchedSecretKeys: ReadonlySet<string>;
}

function emptyEdit(): ProviderEdit {
  return { secretValues: {}, touchedSecretKeys: new Set() };
}

export function ProviderSettingsSection() {
  const providersQuery = useProvidersQuery();
  const updateMutation = useUpdateProviderMutation();
  const testMutation = useTestProviderMutation();

  const [edits, setEdits] = useState<Record<string, ProviderEdit>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>(
    {},
  );

  const providers = providersQuery.data?.providers ?? [];

  const editFor = (id: string) => edits[id] ?? emptyEdit();

  const patchEdit = (id: string, patch: Partial<ProviderEdit>) => {
    setEdits((current) => ({ ...current, [id]: { ...editFor(id), ...patch } }));
  };

  const setSecretValue = (id: string, key: string, value: string) => {
    const current = editFor(id);
    const touched = new Set(current.touchedSecretKeys);
    touched.add(key);
    patchEdit(id, {
      secretValues: { ...current.secretValues, [key]: value },
      touchedSecretKeys: touched,
    });
  };

  const handleSave = async (provider: ProviderEntry) => {
    const edit = editFor(provider.id);
    const body: ProviderUpdateBody = {};
    if (edit.enabled !== undefined) body.enabled = edit.enabled;
    if (provider.requiresBaseUrl && edit.baseUrl !== undefined) body.baseUrl = edit.baseUrl;
    const secret = buildSecretPayload({
      hasSecret: provider.hasSecret,
      secretFieldKeys: provider.secretFields.map((f) => f.key),
      values: edit.secretValues,
      touchedKeys: edit.touchedSecretKeys,
    });
    if (secret !== undefined) body.secret = secret;

    setSaveErrors((current) => {
      const { [provider.id]: _removed, ...rest } = current;
      return rest;
    });
    try {
      await updateMutation.mutateAsync({ id: provider.id, body });
      // The provider query refetches with the new stored values, so clearing the
      // local overlay lets the row fall back to server state instead of showing
      // stale edits (and, for secrets, stale plaintext that should not linger).
      setEdits((current) => {
        const { [provider.id]: _removed, ...rest } = current;
        return rest;
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save this provider.';
      setSaveErrors((current) => ({ ...current, [provider.id]: message }));
    }
  };

  const handleTest = async (provider: ProviderEntry) => {
    setTestResults((current) => {
      const { [provider.id]: _removed, ...rest } = current;
      return rest;
    });
    try {
      await testMutation.mutateAsync(provider.id);
      setTestResults((current) => ({
        ...current,
        [provider.id]: { ok: true, message: 'Connected successfully.' },
      }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach this provider.';
      setTestResults((current) => ({ ...current, [provider.id]: { ok: false, message } }));
    }
  };

  return (
    <section data-testid="provider-settings">
      <h2>Indexers and download clients</h2>
      <p className="auralis-field__hint">
        An indexer finds releases; a download client fetches them. Requests need at least one of
        each, enabled, before the Requests section appears in navigation.
      </p>

      {providersQuery.isLoading ? (
        <p>Loading providers…</p>
      ) : (
        <div className="auralis-services-list" data-testid="providers-list">
          {providers.map((provider) => {
            const edit = editFor(provider.id);
            const enabled = edit.enabled ?? provider.enabled;
            const baseUrl = edit.baseUrl ?? provider.baseUrl ?? '';
            const testResult = testResults[provider.id];
            const saveError = saveErrors[provider.id];

            return (
              <fieldset
                key={provider.id}
                className="auralis-service-fieldset"
                data-testid={`provider-${provider.id}`}
              >
                <legend>
                  {provider.displayName}{' '}
                  <Chip variant="assist">
                    {provider.kind === 'indexer'
                      ? 'Indexer'
                      : provider.kind === 'download'
                        ? 'Download client'
                        : 'Music provider'}
                  </Chip>
                </legend>
                <p className="auralis-field__hint">{provider.summary}</p>

                {provider.requiresBaseUrl ? (
                  <label className="auralis-field" htmlFor={`provider-${provider.id}-baseurl`}>
                    <span className="auralis-field__label">Server address</span>
                    <input
                      id={`provider-${provider.id}-baseurl`}
                      type="url"
                      value={baseUrl}
                      onChange={(event) => patchEdit(provider.id, { baseUrl: event.target.value })}
                      data-testid={`provider-${provider.id}-baseurl-input`}
                    />
                  </label>
                ) : null}

                {provider.secretFields.map((field) => (
                  <label
                    className="auralis-field"
                    key={field.key}
                    htmlFor={`provider-${provider.id}-secret-${field.key}`}
                  >
                    <span className="auralis-field__label">{field.label}</span>
                    <input
                      id={`provider-${provider.id}-secret-${field.key}`}
                      type={field.kind === 'password' ? 'password' : 'text'}
                      autoComplete="off"
                      value={edit.secretValues[field.key] ?? ''}
                      placeholder={
                        provider.hasSecret ? 'Stored — leave blank to keep it' : undefined
                      }
                      onChange={(event) =>
                        setSecretValue(provider.id, field.key, event.target.value)
                      }
                      data-testid={`provider-${provider.id}-secret-${field.key}-input`}
                    />
                  </label>
                ))}

                <label
                  className="auralis-settings-row"
                  htmlFor={`provider-${provider.id}-enabled`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <input
                    id={`provider-${provider.id}-enabled`}
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => patchEdit(provider.id, { enabled: event.target.checked })}
                    data-testid={`provider-${provider.id}-enabled-toggle`}
                  />
                  <span>Enabled</span>
                </label>

                {saveError ? (
                  <p role="alert" data-testid={`provider-${provider.id}-save-error`}>
                    {saveError}
                  </p>
                ) : null}

                <div className="auralis-settings-row">
                  <Button
                    size="sm"
                    variant="filled"
                    onClick={() => void handleSave(provider)}
                    disabled={updateMutation.isPending}
                    data-testid={`provider-${provider.id}-save`}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => void handleTest(provider)}
                    disabled={testMutation.isPending || !provider.configured}
                    data-testid={`provider-${provider.id}-test`}
                  >
                    Test
                  </Button>
                </div>

                {testResult ? (
                  <p
                    role={testResult.ok ? 'status' : 'alert'}
                    data-testid={`provider-${provider.id}-test-result`}
                  >
                    {testResult.message}
                  </p>
                ) : null}
              </fieldset>
            );
          })}
        </div>
      )}
    </section>
  );
}
