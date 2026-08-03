/**
 * Formats a release's byte count the way a "which release do I want" decision
 * needs it: whole bytes below 1 KB, one decimal place above — enough precision to
 * tell releases apart, not so much that two releases a few KB apart look
 * meaningfully different.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
