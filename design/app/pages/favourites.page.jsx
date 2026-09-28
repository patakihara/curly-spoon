export default function Favourites({ data }) {
  return (
    <BackdropShell back={<BackLayer />}>
      <PageBody width="list">
        <Section last>
          <Each of={data.songs} as="song">
            <ResultRow
              title={song.title}
              meta={song.meta}
              image={song.image}
              status={song.status}
              divider
              trailing={<OverflowMenu items={song.menu} />}
            />
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
