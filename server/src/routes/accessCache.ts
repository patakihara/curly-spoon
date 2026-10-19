/** How long a person's access check is kept. */
const ACCESS_MS = 60_000;

/**
 * One answer per key, kept for a minute: a person's Audiobookshelf access or Jellyfin views. A
 * failed check is not kept. Expired answers are dropped as new ones are kept.
 */
export function accessCache() {
  const kept = new Map<string, { until: number; answer: Promise<unknown> }>();
  return <T>(key: string, check: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const hit = kept.get(key);
    if (hit !== undefined && hit.until > now) return hit.answer as Promise<T>;
    for (const [k, v] of kept) if (v.until <= now) kept.delete(k);
    const answer = check();
    kept.set(key, { until: now + ACCESS_MS, answer });
    answer.catch(() => {
      if (kept.get(key)?.answer === answer) kept.delete(key);
    });
    return answer;
  };
}
