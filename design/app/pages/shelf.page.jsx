export default function Shelf({ data }) {
  return (
    <BackdropShell
      back={
        <BackLayer
          title={data.subject}
          eyebrow={data.eyebrow}
          image={data.subjectArt}
          round={data.round}
          search="Search this shelf"
          trailing={<ViewToggle value="grid" />}
        />
      }
    >
      <PageBody>
        <Section last>
          <LayoutGrid>
            <Each of={data.items} as="item">
              <MediaCard
                width="100%"
                title={item.title}
                sub={item.sub}
                image={item.image}
                progress={item.progress}
                onClick={<Open page={item.page} ref={item.ref} />}
              />
            </Each>
          </LayoutGrid>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
