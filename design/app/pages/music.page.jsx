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
        <Section>
          <SortFilterBar
            icon="swap_vert"
            label={data.sort.value}
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
              />
            </Each>
          </LayoutGrid>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
