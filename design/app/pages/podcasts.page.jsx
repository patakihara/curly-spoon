export default function Podcasts({ data }) {
  return (
    <BackdropShell
      back={<BackLayer search="Search your shows and their episodes" />}
      subheader={<FrontLayerHeader spy sections={data.sections} />}
    >
      <PageBody>
        <Section>
          <SortFilterBar
            icon="swap_vert"
            label={data.sort.value}
            trailing={<ViewToggle value="grid" />}
          />
        </Section>
        <Section title="Shows">
          <LayoutGrid>
            <Each of={data.library} as="show">
              <MediaCard
                width="100%"
                title={show.title}
                sub={show.sub}
                image={show.image}
                unplayed={show.unplayed}
                onClick={<Open page="show" ref={show.ref} />}
              />
            </Each>
          </LayoutGrid>
        </Section>
        <Section title="Lists" last>
          <LayoutGrid>
            <Each of={data.lists} as="list">
              <MediaCard
                width="100%"
                title={list.title}
                sub={list.sub}
                covers={list.covers}
                onClick={<Open page="list" ref={list.ref} />}
              />
            </Each>
          </LayoutGrid>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
