export default function List({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} />}>
      <PageBody width="list">
        <Section>
          <MediaHeader
            kindLabel={data.kind}
            meta={data.meta}
            covers={data.covers}
            playLabel="Play"
            onPlay={<Play ref={data.ref} queue="spoken" source />}
            nextLabel="Play next"
            onPlayNext={<Play ref={data.ref} queue="spoken" next />}
            lastLabel={null}
            menu={<OverflowMenu items={data.menu} />}
          />
        </Section>
        <Section title="Shows">
          <Shelf>
            <Each of={data.shows} as="show">
              <MediaCard
                size="sm"
                title={show.title}
                sub={show.sub}
                image={show.image}
                onClick={<Open page="show" ref={show.ref} />}
              />
            </Each>
          </Shelf>
        </Section>
        <Section title="Episodes" last>
          <SortFilterBar icon="swap_vert" label={data.order} />
          <Each of={data.items} as="item">
            <EpisodeRow
              title={item.title}
              description={item.description}
              meta={item.meta}
              image={item.image}
              progress={item.progress}
              onClick={<Open page="episode" ref={item.ref} />}
              onPlay={<Play ref={item.ref} queue="spoken" />}
              divider
            />
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
