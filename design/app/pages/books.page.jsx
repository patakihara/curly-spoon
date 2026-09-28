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
        <Section>
          <SortFilterBar
            icon="swap_vert"
            label={data.sort.value}
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
      </PageBody>
    </BackdropShell>
  );
}
