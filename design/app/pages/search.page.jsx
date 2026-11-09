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
        <Each of={data.errors} as="error">
          <Section>
            <StatusBanner tone="error" icon="error">
              {error.message}
            </StatusBanner>
          </Section>
        </Each>
        <Each of={data.yourRequests} as="entry">
          <Section>
            <ResultRow title={entry.title} icon="downloading" onClick={<Open page="requests" />} />
          </Section>
        </Each>
        <When state="suggest">
          <Section last>
            <Each of={data.suggestions} as="s">
              <ResultRow
                title={s.title}
                meta={s.meta}
                icon={s.icon}
                onClick={<Open page="search" q={s.query} />}
                divider
              />
            </Each>
          </Section>
        </When>
        <When state="empty">
          <EmptyState
            icon="search_off"
            title="Nothing found"
            body="Nothing in your library matches this search."
          />
        </When>
        <When state="failed">
          <EmptyState
            icon="cloud_off"
            title="Search failed"
            body="The server did not answer this search."
          />
        </When>
        <When state="full">
          <Section title="Top result">
            <Each of={data.top} as="best">
              <ResultRow
                title={best.title}
                meta={best.meta}
                image={best.image}
                onClick={<Open page={best.page} ref={best.ref} />}
                onAction={<Play ref={best.playRef} queue={best.queue} />}
                nextLabel={best.next}
                onNext={<Play ref={best.playRef} queue={best.queue} next />}
              />
            </Each>
          </Section>
          <Section title="In your library">
            <Each of={data.library} as="item">
              <ResultRow
                title={item.title}
                meta={item.meta}
                image={item.image}
                onClick={<Open page={item.page} ref={item.ref} />}
                onAction={<Play ref={item.playRef} queue={item.queue} />}
                nextLabel={item.next}
                onNext={<Play ref={item.playRef} queue={item.queue} next />}
                divider
              />
            </Each>
          </Section>
          <Section title="Not in your library" last>
            <Each of={data.outside.household} as="item">
              <ResultRow
                title={item.title}
                meta={item.meta}
                image={item.image}
                onClick={<Open page={item.page} ref={item.ref} />}
                onAction={<Play ref={item.playRef} queue={item.queue} />}
                nextLabel={item.next}
                onNext={<Play ref={item.playRef} queue={item.queue} next />}
                divider
              />
            </Each>
            <Each of={data.outside.music} as="song">
              <Each of={song.plays} as="plays">
                <ResultRow
                  title={plays.title}
                  meta={plays.meta}
                  image={plays.image}
                  status={plays.status}
                  tone={plays.tone}
                  onAction={<Play ref={plays.playRef} queue="music" />}
                  divider
                  menu={<OverflowMenu items={plays.menu} onSelect={<Choose ref={plays.ref} />} />}
                />
              </Each>
              <Each of={song.follows} as="follows">
                <ResultRow
                  title={follows.title}
                  meta={follows.meta}
                  image={follows.image}
                  status={follows.status}
                  tone={follows.tone}
                  onAction={<Play ref={follows.playRef} queue="music" />}
                  divider
                  trailing={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={<Play ref={follows.playRef} queue="music" next />}
                    >
                      Play next
                    </Button>
                  }
                  menu={
                    <OverflowMenu items={follows.menu} onSelect={<Choose ref={follows.ref} />} />
                  }
                />
              </Each>
            </Each>
            <ExpanderRow label={data.outside.moreReleases} />
            <Each of={data.outside.books} as="book">
              <Each of={book.asking} as="asking">
                <ResultRow
                  title={asking.title}
                  meta={asking.meta}
                  image={asking.image}
                  status={asking.status}
                  tone={asking.tone}
                  divider
                  trailing={
                    <Button variant="secondary" size="sm" onClick={<Request ref={asking.ref} />}>
                      {asking.action}
                    </Button>
                  }
                />
              </Each>
              <Each of={book.standing} as="standing">
                <ResultRow
                  title={standing.title}
                  meta={standing.meta}
                  image={standing.image}
                  status={standing.status}
                  tone={standing.tone}
                  onClick={<Open page="requests" />}
                  divider
                />
              </Each>
              <Each of={book.arrived} as="arrived">
                <ResultRow
                  title={arrived.title}
                  meta={arrived.meta}
                  image={arrived.image}
                  status={arrived.status}
                  tone={arrived.tone}
                  onClick={<Open page="book" ref={arrived.ref} />}
                  onAction={<Play ref={arrived.ref} queue="spoken" />}
                  divider
                />
              </Each>
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
