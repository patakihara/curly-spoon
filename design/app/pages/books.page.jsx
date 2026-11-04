export default function Books({ data }) {
  return (
    <BackdropShell
      back={<BackLayer search="Search your books and requests" />}
      subheader={
        <FrontLayerHeader tabs>
          <TabBar items={data.tabs} value="books" />
        </FrontLayerHeader>
      }
    >
      <PageBody>
        <When state="empty">
          <EmptyState
            icon="menu_book"
            title="No books yet"
            body="Your library shows the books you’ve played, added or requested. Search is where to find one."
            action={
              <Button variant="secondary" onClick={<Open page="search" />}>
                Go to Search
              </Button>
            }
          />
        </When>
        <When state="failed">
          <EmptyState
            icon="cloud_off"
            title="Books did not load"
            body="The server did not answer."
            action={
              <Button variant="secondary" onClick={<Retry />}>
                Try again
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
              <Each of={data.library} as="book">
                <MediaCard
                  width="100%"
                  title={book.title}
                  sub={book.sub}
                  image={book.image}
                  progress={book.progress}
                  status={book.status}
                  tone={book.tone}
                  onClick={<Open page="book" ref={book.ref} />}
                  onRequest={<Request ref={book.ref} />}
                />
              </Each>
            </LayoutGrid>
          </Section>
        </When>
      </PageBody>
    </BackdropShell>
  );
}
