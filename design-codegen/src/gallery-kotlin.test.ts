import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { androidComponents, androidSonoraDir } from './android-sonora.js';
import { galleryEntries, readCards, type GalleryEntry } from './gallery.js';
import { galleryIcons, generateKotlinGallery } from './gallery-kotlin.js';
import { REPO_ROOT, SONORA_DIR } from './outputs.js';
import { readProps } from './props.js';
import { discoverComponents } from './sonora.js';

const sonoraDir = join(REPO_ROOT, SONORA_DIR);
const components = discoverComponents(sonoraDir);
const model = readProps(components);
const { entries } = galleryEntries(components, readCards(sonoraDir));
const android = new Set(androidComponents(androidSonoraDir(REPO_ROOT)).keys());

const kotlinOf = (list: GalleryEntry[], on: Iterable<string> = android) =>
  generateKotlinGallery(list, model, new Set(on)).get('SonoraGallery.kt')!;
const usage = (name: string, jsx: string): GalleryEntry => ({
  name,
  card: 'fixture.card.html',
  jsx,
  uses: [name],
});
/** The generated entry names, in order. */
const namesIn = (kotlin: string) =>
  [...kotlin.matchAll(/GalleryEntry\("(\w+)"\)/g)].map((m) => m[1]);

describe('the Android gallery draws what the web gallery draws', () => {
  it('[M0.tokens/c] has one entry for each Android Sonora component, in the web gallery order', () => {
    const names = namesIn(kotlinOf(entries));
    expect([...names].sort()).toEqual([...android].sort());
    expect(names).toEqual(entries.map((e) => e.name).filter((n) => android.has(n)));
  });

  it('[M0.tokens/c] writes the web usage literal props as the Android props class', () => {
    const kotlin = kotlinOf(
      [
        usage(
          'OverflowMenu',
          `<OverflowMenu platform="desktop" items={([{ key: 'share', label: 'Share', icon: 'share' }])} onSelect={() => {}} />`,
        ),
      ],
      ['OverflowMenu'],
    );
    expect(kotlin).toMatch(/OverflowMenu\(\s+OverflowMenuProps\(/);
    expect(kotlin).toContain(
      'items = listOf(OverflowMenuItem(key = "share", label = "Share", icon = "share")),',
    );
    expect(kotlin, 'Android is the phone').toContain('platform = Platform.MOBILE,');
    expect(kotlin, 'a handler does nothing').toContain('onSelect = { _ -> },');
  });

  it('draws element children in the children slot, a component Android lacks by what it holds', () => {
    const kotlin = kotlinOf(
      [
        usage(
          'Shelf',
          `<div style={{width:300}}><Shelf platform="desktop" margin="20px"><MediaCard title="Driftwave" width="160px"/><Badge>New</Badge></Shelf></div>`,
        ),
        usage('MediaCard', '<MediaCard title="Static Coast"/>'),
      ],
      ['Shelf', 'MediaCard'],
    );
    const shelf = kotlin.slice(
      kotlin.indexOf('GalleryEntry("Shelf")'),
      kotlin.indexOf('GalleryEntry("MediaCard")'),
    );
    expect(shelf).toMatch(/children = \{\s+MediaCard\(\s+MediaCardProps\(\s+title = "Driftwave",/);
    expect(shelf).toMatch(/\)\s+BasicText\("New"\)\s+\},/);
    expect(kotlin).not.toContain('Badge');
  });

  it('leaves out an optional slot whose element draws nothing on Android, such as an Icon', () => {
    const kotlin = kotlinOf(
      [usage('Button', `<Button icon={<Icon name="play_arrow" weight="text" />}>Play</Button>`)],
      ['Button'],
    );
    expect(kotlin).toMatch(/children = \{ BasicText\("Play"\) \}/);
    expect(kotlin).not.toMatch(/icon = /);
  });

  it('[M0.tokens/c] lists the icon names the web gallery draws, for the icon specimen', () => {
    const icons = galleryIcons([
      usage('BottomNav', `<BottomNav items={[{key:'a',label:'A',icon:'explore'}]} />`),
      usage('IconButton', `<IconButton icon="share" />`),
      usage('Icon', `<Icon size="lg" name="bookmark" filled />`),
      usage(
        'Input',
        `<Input leading={<span style={{ fontFamily: 'Material Symbols Rounded' }}>search</span>} />`,
      ),
    ]);
    expect(icons).toEqual(['bookmark', 'explore', 'search', 'share']);
    expect(galleryIcons(entries).length).toBeGreaterThan(10);
  });
});
