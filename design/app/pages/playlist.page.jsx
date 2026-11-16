export default function Playlist({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} search="Search this playlist" />}>
      <PageBody width="list">
        <Section>
          <MediaHeader
            kindLabel={data.kind}
            meta={data.meta}
            image={data.image}
            onPlay={<Play ref={data.ref} queue="music" source />}
            nextLabel={null}
            lastLabel="Add to queue"
            menu={<OverflowMenu items={data.menu} onSelect={<Choose ref={data.ref} />} />}
          />
        </Section>
        <Section>
          <Each of={data.songs} as="song">
            <ResultRow
              title={song.title}
              meta={song.meta}
              image={song.image}
              status={song.status}
              onAction={<Play ref={song.ref} queue="music" />}
              divider
              trailing={<IconButton icon="drag_handle" label="Drag to reorder" muted />}
            />
          </Each>
        </Section>
        <Each of={data.unmatched} as="missing">
          <Section title="Not found on YouTube Music" last>
            <Each of={missing.songs} as="song">
              <ResultRow
                title={song.title}
                meta={song.meta}
                image={song.image}
                status={song.status}
                tone="error"
                divider
              />
            </Each>
          </Section>
        </Each>
      </PageBody>
    </BackdropShell>
  );
}
