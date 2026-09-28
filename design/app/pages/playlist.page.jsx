export default function Playlist({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} search="Search this playlist" />}>
      <PageBody width="list">
        <Section>
          <MediaHeader
            kindLabel={data.kind}
            meta={data.meta}
            image={data.image}
            nextLabel={null}
            lastLabel="Add to queue"
          />
        </Section>
        <Section last>
          <Each of={data.songs} as="song">
            <ResultRow
              title={song.title}
              meta={song.meta}
              image={song.image}
              status={song.status}
              divider
              trailing={<IconButton icon="drag_handle" label="Drag to reorder" muted />}
            />
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
