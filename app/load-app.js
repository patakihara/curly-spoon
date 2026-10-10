// Loads the app config and merges its texts: app/texts/<locale>.json + design/texts/<locale>.json → config.texts; and the composition (loadComposition, below).
// read(path) → Promise<string>, path relative to the project root.
export async function loadApp(read) {
  const config = JSON.parse(await read('app/app.json'));
  const texts = {};
  await Promise.all(config.locales.supported.map(async ({ id }) => {
    const get = async p => { try { return JSON.parse(await read(p)); } catch (e) { return {}; } };
    const [d, a] = await Promise.all([get('design/texts/' + id + '.json'), get('app/texts/' + id + '.json')]);
    texts[id] = { ...d, ...a };
  }));
  return { ...config, texts };
}

// Loads the composition: app/composition.json (the hire names, placements and page exceptions) + each hire's own file,
// app/hires/<name>/<name>.json (its name is its folder's) → Composition (api.d.ts).
export async function loadComposition(read) {
  const man = JSON.parse(await read('app/composition.json'));
  const hires = await Promise.all(man.hires.map(async name => ({ name, ...JSON.parse(await read('app/hires/' + name + '/' + name + '.json')) })));
  return { hires, placements: man.placements, pages: man.pages || [] };
}
