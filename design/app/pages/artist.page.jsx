export default function Artist({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} />}>
      <PageBody>
        <Section>
          <MediaHeader
            round
            kindLabel={data.kind}
            meta={data.meta}
            image={data.image}
            playLabel={null}
            nextLabel={null}
            lastLabel={null}
          />
        </Section>
        <Section title="In your library">
          <Shelf>
            <Each of={data.library} as="item">
              <MediaCard
                title={item.title}
                sub={item.sub}
                image={item.image}
                onClick={<Open page="album" ref={item.ref} />}
              />
            </Each>
          </Shelf>
        </Section>
        <Each of={data.discography} as="group">
          <Section title={group.name}>
            <Shelf>
              <Each of={group.items} as="release">
                <MediaCard
                  title={release.title}
                  sub={release.sub}
                  image={release.image}
                  size={group.size}
                  absent={release.absent}
                  status={release.status}
                  tone={release.tone}
                  onClick={<Open page="album" ref={release.ref} />}
                />
              </Each>
            </Shelf>
          </Section>
        </Each>
        <Section title="Popular">
          <Each of={data.popular} as="song">
            <ResultRow
              title={song.title}
              meta={song.meta}
              image={song.image}
              divider
              trailing={<OverflowMenu items={song.menu} />}
            />
          </Each>
        </Section>
        <Section title="Similar artists" last>
          <Shelf>
            <Each of={data.similar} as="artist">
              <ArtistCard title={artist.title} sub={artist.sub} image={artist.image} />
            </Each>
          </Shelf>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
