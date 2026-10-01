export default function Search({ data }) {
  return (
    <BackdropShell
      back={
        <BackLayer
          controls={
            <LayoutGrid columns={1} gap="12px" maxWidth="var(--grid-max-width-list)">
              <SearchField value={data.query} placeholder={data.placeholder} autoFocus />
              <ButtonGroup items={data.kinds} value="all" />
            </LayoutGrid>
          }
        />
      }
      subheader={
        <FrontLayerHeader>
          <SortFilterBar icon="expand_less" label={data.activeFilters} />
        </FrontLayerHeader>
      }
    >
      <PageBody width="list">
        <Section title="Top result">
          <ResultRow title={data.top.title} meta={data.top.meta} image={data.top.image} />
        </Section>
        <Section title="In your library">
          <Each of={data.library} as="item">
            <ResultRow title={item.title} meta={item.meta} image={item.image} divider />
          </Each>
        </Section>
        <Section
          title="Not in your library"
          actionText="Your requests"
          onAction={<Open page="requests" />}
          last
        >
          <Each of={data.outside.music} as="song">
            <ResultRow title={song.title} meta={song.meta} image={song.image} divider />
          </Each>
          <ExpanderRow label={data.outside.moreReleases} />
          <Each of={data.outside.books} as="book">
            <ResultRow
              title={book.title}
              meta={book.meta}
              image={book.image}
              status={book.status}
              tone={book.tone}
              divider
              trailing={
                <Button variant="secondary" size="sm" pressed={book.requested}>
                  {book.action}
                </Button>
              }
            />
          </Each>
          <Each of={data.outside.podcasts} as="show">
            <ResultRow
              title={show.title}
              meta={show.meta}
              image={show.image}
              divider
              trailing={
                <Button variant="secondary" size="sm">
                  {show.action}
                </Button>
              }
            />
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
