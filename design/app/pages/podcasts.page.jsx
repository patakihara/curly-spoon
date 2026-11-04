export default function Podcasts({ data }) {
  return (
    <BackdropShell
      back={<BackLayer search="Search your shows and their episodes" />}
      subheader={<FrontLayerHeader spy sections={data.sections} />}
    >
      <PageBody>
        <When state="empty">
          <EmptyState
            icon="podcasts"
            title="No podcasts yet"
            body="Your library shows the shows you’ve played, subscribed to or requested. Search is where to find one."
            action={
              <Button variant="secondary" onClick={<Open page="search" />}>
                Go to Search
              </Button>
            }
          />
        </When>
        <When state="full">
          <Section>
            <SortFilterBar
              icon="swap_vert"
              label={data.sort.value}
              items={data.sort.options}
              onSelect={<Choose ref={data.sort.ref} />}
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
                  status={show.status}
                  tone={show.tone}
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
        </When>
      </PageBody>
    </BackdropShell>
  );
}
