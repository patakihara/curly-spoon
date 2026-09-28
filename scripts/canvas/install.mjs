/**
 * The Sonora publish the canvas build installs. It copies Sonora's files from build/sonora, so it
 * refuses unless that build is the publish design/published.json records (same tree, not a
 * draft); the canvas stamp then carries that publish's version for record-publish.mjs.
 */

const short = (sha) => (sha ? sha.slice(0, 7) : 'none');

/** `{ title, artifact, version, tree }` of the Sonora to install; throws naming what is wrong. */
export function sonoraInstall({ published, sonoraStamp, draft = false }) {
  const record = published.sonora ?? null;
  if (draft) {
    return {
      title: 'Sonora',
      artifact: record?.url ?? null,
      version: record?.version ?? null,
      tree: record?.tree ?? null,
    };
  }
  if (!record) throw new Error('Sonora has no recorded publish in design/published.json');
  if (!sonoraStamp) throw new Error('build/sonora/stamp.json is missing: run pnpm sonora:build');
  if (sonoraStamp.draft)
    throw new Error('build/sonora is a draft build: rebuild it without --draft');
  if (sonoraStamp.tree !== record.tree) {
    throw new Error(
      `build/sonora is tree ${short(sonoraStamp.tree)}, but Sonora is published at tree ${short(record.tree)}: build and publish Sonora first`,
    );
  }
  return { title: 'Sonora', artifact: record.url, version: record.version, tree: record.tree };
}
