export default function Shelf({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} search="Search this shelf" />}>
      <PageBody>
        <Section
          eyebrow={data.eyebrow}
          title={data.subject}
          image={data.subjectArt}
          round={data.round}
          trailing={<ViewToggle value="grid" />}
          last
        >
          <LayoutGrid>
            <Each of={data.items} as="item">
              <MediaCard
                width="100%"
                title={item.title}
                sub={item.sub}
                image={item.image}
                progress={item.progress}
              />
            </Each>
          </LayoutGrid>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
