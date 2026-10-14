export default function Search({ data }) {
  return (
    <BackdropShell
      back={
        <BackLayer
          controls={
            <LayoutGrid columns={1} gap="12px" maxWidth="var(--grid-max-width-list)">
              <SearchField
                value={data.query}
                placeholder={data.placeholder}
                autoFocus
                onChange={<Query />}
                onSubmit={<Query />}
              />
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
        <When state="suggest">
          <Section last>
            <Each of={data.suggestions} as="s">
              <ResultRow
                title={s.title}
                meta={s.meta}
                onClick={<Open page="search" q={s.query} />}
                divider
              />
            </Each>
          </Section>
        </When>
        <When state="full">
          <Section title="Top result">
            <ResultRow
              title={data.top.title}
              meta={data.top.meta}
              image={data.top.image}
              onClick={<Open page={data.top.page} ref={data.top.ref} />}
              onAction={<Play ref={data.top.playRef} queue={data.top.queue} />}
            />
          </Section>
          <Section title="In your library">
            <Each of={data.library} as="item">
              <ResultRow
                title={item.title}
                meta={item.meta}
                image={item.image}
                onClick={<Open page={item.page} ref={item.ref} />}
                onAction={<Play ref={item.playRef} queue={item.queue} />}
                divider
              />
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
        </When>
      </PageBody>
    </BackdropShell>
  );
}
