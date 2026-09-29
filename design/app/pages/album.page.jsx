export default function Album({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} search="Search this album" />}>
      <PageBody width="list">
        <Section>
          <MediaHeader
            kindLabel={data.kind}
            subtitle={data.artist}
            onSubtitle={<Open page="artist" ref={data.artistRef} />}
            meta={data.meta}
            image={data.image}
            nextLabel={null}
            lastLabel="Add to queue"
            menu={<OverflowMenu items={data.menu} />}
          />
        </Section>
        <Section>
          <Each of={data.tracks} as="track">
            <ResultRow
              number={track.number}
              title={track.title}
              meta={track.meta}
              status={track.status}
              divider
              trailing={<OverflowMenu items={track.menu} />}
            />
          </Each>
        </Section>
        <Section>
          <ExpanderRow label={data.editions.label} image={data.image} />
        </Section>
        <Section title={data.more.title} last>
          <Shelf>
            <Each of={data.more.items} as="album">
              <MediaCard title={album.title} sub={album.sub} image={album.image} />
            </Each>
          </Shelf>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
