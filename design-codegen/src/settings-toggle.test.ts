import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNav } from './nav.js';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import { checkPage, parsePage } from './page.js';
import { elements, readPage } from './test-pages.js';

describe('[M3.requests/c] a switch that sets a setting', () => {
  const nav = readNav(join(REPO_ROOT, APP_DIR));
  const handlers = new Map([['SettingRow', new Set(['onChange', 'onReset'])]]);
  const pages = new Map(nav.pages.map((p) => [p.id, []] as [string, string[]]));
  const errorsOf = (source: string) =>
    checkPage(parsePage(source, 'p'), {} as never, handlers, undefined, undefined, undefined, {
      pages,
      handlers,
    } as never);
  const page = (handler: string) =>
    `export default function P({ data }) { return <SettingRow ${handler} />; }`;

  it('[M3.requests/c] takes the setting that shows everyone’s library', () => {
    expect(errorsOf(page('onChange={<Toggle setting="showEveryonesLibrary" />}'))).toEqual([]);
  });

  it('[M3.requests/c] refuses any other setting', () => {
    expect(() => errorsOf(page('onChange={<Toggle setting="theme" />}'))).toThrow(
      /showEveryonesLibrary/,
    );
  });

  it('[M3.requests/c] refuses a setting bound from the data, so the check always knows it', () => {
    expect(() => errorsOf(page('onChange={<Toggle setting={data.key} />}'))).toThrow(/written/);
  });

  it('[M3.requests/c] refuses it on any prop but a switch’s change', () => {
    expect(errorsOf(page('onReset={<Toggle setting="showEveryonesLibrary" />}'))).toEqual([
      expect.stringContaining('Toggle goes on onChange'),
    ]);
  });

  it('[M3.requests/c] Settings binds that one switch, and the others stay unbound', () => {
    const rows = elements(readPage('settings').tree).filter((e) => e.component === 'SettingRow');
    expect(rows.map((row) => row.props.onChange)).toEqual([
      undefined,
      { kind: 'toggle', setting: 'showEveryonesLibrary' },
    ]);
  });

  it('[M3.requests/c] the web hands the switch to the page’s toggles', () => {
    const page = readFileSync(join(REPO_ROOT, 'web/src/generated/pages/Settings.tsx'), 'utf8');
    expect(page).toContain("onChange={toggle('showEveryonesLibrary')}");
  });

  it('[M3.requests/c] Android leaves the switch unbound, so it draws disabled', () => {
    const page = readFileSync(
      join(
        REPO_ROOT,
        'android/app/src/main/java/net/develivarr/auralis/generated/pages/SettingsPage.kt',
      ),
      'utf8',
    );
    expect(page).toContain('Show everyone’s library');
    expect(page).not.toMatch(/SettingRowProps\([^)]*onChange/);
  });
});
