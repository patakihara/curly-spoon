/**
 * Formats a `MusicCandidate.bitrateKbps` for display. `types.ts`'s own doc comment on the
 * field (mirrored server-side by `MusicCandidate`) says only "`null` when the provider does
 * not report one" — it does not distinguish that from a lossless file having no single
 * bitrate to report, so this function does not invent that distinction either.
 *
 * Deliberately `null`, not a placeholder string like "Unknown bitrate": a candidate row
 * already renders `format` (e.g. `flac`, `mp3`) when the provider reports one, and a blank
 * bitrate next to a known format is a normal, uninteresting gap — not worth a dedicated
 * "unknown" label the way a missing title or peer would be.
 */
export function formatBitrate(bitrateKbps: number | null): string | null {
  if (bitrateKbps === null) return null;
  return `${bitrateKbps} kbps`;
}
