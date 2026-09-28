export default function Browse({ data }) {
  return (
    <PageBody>
      <Section>
        <ButtonGroup items={data.filters} value="All" />
      </Section>
      <Section title="Jump back in">
        <LayoutGrid item="wide" columns={2} maxWidth="var(--grid-max-width-tiles)">
          <Each of={data.jumpBackIn} as="pick">
            <QuickPick
              title={pick.title}
              sub={pick.sub}
              image={pick.image}
              progress={pick.progress}
            />
          </Each>
        </LayoutGrid>
      </Section>
      <Section title="Recently added" action="arrow_forward" actionLabel="See all">
        <Shelf>
          <Each of={data.recentlyAdded} as="item">
            <MediaCard
              title={item.title}
              sub={item.sub}
              image={item.image}
              progress={item.progress}
            />
          </Each>
        </Shelf>
      </Section>
      <Section title="The next episode awaits">
        <LayoutGrid item="wide">
          <FeatureCard
            kind={data.feature.kind}
            title={data.feature.title}
            meta={data.feature.meta}
            description={data.feature.description}
            image={data.feature.image}
          />
        </LayoutGrid>
      </Section>
      <Section eyebrow="More like" title={data.moreLike.subject} image={data.moreLike.image}>
        <Shelf>
          <Each of={data.moreLike.items} as="item">
            <MediaCard
              eyebrow={item.eyebrow}
              title={item.title}
              sub={item.sub}
              image={item.image}
            />
          </Each>
        </Shelf>
      </Section>
      <Section title="Artists & authors" action="arrow_forward" actionLabel="See all" last>
        <Shelf>
          <Each of={data.people} as="person">
            <ArtistCard title={person.title} sub={person.sub} image={person.image} />
          </Each>
        </Shelf>
      </Section>
    </PageBody>
  );
}
