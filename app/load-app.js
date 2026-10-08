// Loads the app config and merges its texts: app/texts/<locale>.json + design/texts/<locale>.json → config.texts.
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
