import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './outputs.js';
import { parsePage } from './page.js';

describe('[M3.requests] a control asking again for what failed to load', () => {
  const page = (handler: string) =>
    `export default function P({ data }) { return <Button ${handler}>Try</Button>; }`;

  it('[M3.requests] takes nothing', () => {
    expect(() => parsePage(page('onClick={<Retry />}'), 'p')).not.toThrow();
    expect(() => parsePage(page('onClick={<Retry page="x" />}'), 'p')).toThrow(/takes nothing/);
  });

  it('[M3.requests] the web hands it to what the page is given', () => {
    const made = readFileSync(join(REPO_ROOT, 'web/src/generated/pages/Requests.tsx'), 'utf8');
    expect(made).toContain('onClick={retry}');
    expect(made).toContain('const retry = useRetry();');
  });

  it('[M3.requests] Android leaves it unbound, so it draws disabled', () => {
    const made = readFileSync(
      join(
        REPO_ROOT,
        'android/app/src/main/java/net/develivarr/auralis/generated/pages/RequestsPage.kt',
      ),
      'utf8',
    );
    expect(made).not.toMatch(/retry/i);
  });
});
