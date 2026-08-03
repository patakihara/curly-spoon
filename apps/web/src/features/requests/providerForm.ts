/**
 * What to send as `secret` in `PUT /providers/:id`.
 *
 * A configured provider (`hasSecret`) never echoes its stored secret back — the
 * form renders every secret field empty, with a placeholder. Sending an empty
 * string for a field the user never touched would overwrite, and destroy,
 * whatever is stored; the BFF's contract is "omit `secret` entirely to keep the
 * stored one". So this only ever includes a field once the user has actually
 * typed into it (tracked by the caller as `touchedKeys`), and omits the whole
 * `secret` key when nothing was touched at all.
 *
 * A provider with no stored secret yet (`!hasSecret`) has nothing to protect —
 * every field's current value is sent regardless of whether it was touched.
 * Leaving a required field blank is a validation concern for the caller, not a
 * reason for this function to silently drop it.
 */
export interface BuildSecretPayloadInput {
  hasSecret: boolean;
  secretFieldKeys: readonly string[];
  values: Record<string, string>;
  touchedKeys: ReadonlySet<string>;
}

export function buildSecretPayload(
  input: BuildSecretPayloadInput,
): Record<string, string> | undefined {
  if (!input.hasSecret) {
    const payload: Record<string, string> = {};
    for (const key of input.secretFieldKeys) payload[key] = input.values[key] ?? '';
    return payload;
  }

  const payload: Record<string, string> = {};
  for (const key of input.secretFieldKeys) {
    if (input.touchedKeys.has(key)) payload[key] = input.values[key] ?? '';
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}
