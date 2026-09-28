export default function Book({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} search="Search this book's chapters" />}>
      <PageBody width="list">
        <Section>
          <MediaHeader
            kindLabel={data.kind}
            subtitle={data.author}
            onSubtitle={<Open page="author" ref={data.authorRef} />}
            partOf={data.series.label}
            onPartOf={<Open page="series" ref={data.series.ref} />}
            meta={data.meta}
            progress={data.progress}
            image={data.image}
            playLabel="Resume"
            nextLabel="Play next"
            lastLabel={null}
            download={data.download}
            menu={<OverflowMenu items={data.menu} />}
          />
        </Section>
        <Section title="Chapters">
          <Each of={data.chapters} as="chapter">
            <ResultRow
              number={chapter.number}
              title={chapter.title}
              meta={chapter.meta}
              status={chapter.status}
              tone={chapter.tone}
              divider
            />
          </Each>
        </Section>
        <Section title="About">
          <ExpandableText text={data.about} lines={3} />
        </Section>
        <Section title="Other narrations">
          <Shelf>
            <Each of={data.narrations} as="narration">
              <MediaCard
                eyebrow="Read by"
                title={narration.narrator}
                sub={narration.sub}
                image={narration.image}
                absent={narration.absent}
                status={narration.status}
                tone={narration.tone}
                onClick={<Open page="book" ref={narration.ref} />}
                onRequest={<Request ref={narration.ref} />}
              />
            </Each>
          </Shelf>
        </Section>
        <Section
          title={data.more.series.title}
          eyebrow="More in"
          onSubject={<Open page="series" ref={data.series.ref} />}
        >
          <Shelf>
            <Each of={data.more.series.items} as="book">
              <MediaCard
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
          </Shelf>
        </Section>
        <Section title={data.more.author.title} last>
          <Shelf>
            <Each of={data.more.author.items} as="other">
              <MediaCard
                title={other.title}
                sub={other.sub}
                image={other.image}
                progress={other.progress}
                absent={other.absent}
                status={other.status}
                tone={other.tone}
                onClick={<Open page="book" ref={other.ref} />}
                onRequest={<Request ref={other.ref} />}
              />
            </Each>
          </Shelf>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
