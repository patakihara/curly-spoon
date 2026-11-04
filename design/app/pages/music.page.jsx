export default function Music({ data }) {
  return (
    <BackdropShell
      back={<BackLayer search="Search your music and requests" />}
      subheader={
        <FrontLayerHeader tabs>
          <TabBar items={data.tabs} value="albums" />
        </FrontLayerHeader>
      }
    >
      <PageBody>
        <When state="empty">
          <EmptyState
            icon="library_music"
            title="No music yet"
            body="Your library shows the music you’ve played, added or requested. Search is where to find, play and add more."
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
          <Section last>
            <LayoutGrid>
              <Each of={data.library} as="item">
                <MediaCard
                  width="100%"
                  title={item.title}
                  sub={item.sub}
                  image={item.image}
                  status={item.status}
                  tone={item.tone}
                  onClick={<Open page="album" ref={item.ref} />}
                />
              </Each>
            </LayoutGrid>
          </Section>
        </When>
      </PageBody>
    </BackdropShell>
  );
}
