export default function Series({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} />}>
      <PageBody>
        <Section>
          <MediaHeader
            kindLabel={data.kind}
            subtitle={data.author}
            onSubtitle={<Open page="author" ref={data.authorRef} />}
            meta={data.meta}
            image={data.image}
            playLabel={null}
            nextLabel={null}
            lastLabel={null}
          />
        </Section>
        <Section last>
          <LayoutGrid>
            <Each of={data.books} as="book">
              <MediaCard
                width="100%"
                eyebrow={book.eyebrow}
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
