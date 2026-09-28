export default function Author({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} />}>
      <PageBody>
        <Section>
          <MediaHeader
            round
            kindLabel={data.kind}
            meta={data.meta}
            image={data.image}
            playLabel={null}
            nextLabel={null}
            lastLabel={null}
          />
        </Section>
        <Each of={data.series} as="series">
          <Section
            title={series.title}
            eyebrow="Series"
            onSubject={<Open page="series" ref={series.ref} />}
          >
            <Shelf>
              <Each of={series.books} as="entry">
                <MediaCard
                  title={entry.title}
                  sub={entry.sub}
                  image={entry.image}
                  progress={entry.progress}
                  absent={entry.absent}
                  status={entry.status}
                  tone={entry.tone}
                  onClick={<Open page="book" ref={entry.ref} />}
                  onRequest={<Request ref={entry.ref} />}
                />
              </Each>
            </Shelf>
          </Section>
        </Each>
        <Section title="Books" last>
          <LayoutGrid>
            <Each of={data.books} as="book">
              <MediaCard
                width="100%"
                title={book.title}
                sub={book.sub}
                image={book.image}
                progress={book.progress}
                absent={book.absent}
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
