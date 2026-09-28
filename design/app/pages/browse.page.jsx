export default function Browse({ data }) {
  return (
    <PageBody>
      <Section>
        <ButtonGroup items={data.filters} value="All" />
      </Section>
      <Section title="Jump back in">
        <LayoutGrid item="wide" maxWidth="var(--grid-max-width-tiles)">
          <Each of={data.jumpBackIn} as="pick">
            <QuickPick title={pick.title} sub={pick.sub} image={pick.image} />
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
      <Section title="Artists & authors" action="arrow_forward" actionLabel="See all">
        <Shelf>
          <Each of={data.people} as="person">
            <ArtistCard title={person.title} sub={person.sub} image={person.image} />
          </Each>
        </Shelf>
      </Section>
      <Section title="Picked for you" action="arrow_forward" actionLabel="See all">
        <Shelf>
          <Each of={data.pickedForYou} as="item">
            <MediaCard
              size="sm"
              title={item.title}
              sub={item.sub}
              image={item.image}
              progress={item.progress}
            />
          </Each>
        </Shelf>
      </Section>
      <Section title="Recently played" last>
        <Each of={data.recentlyPlayed} as="track">
          <ResultRow title={track.title} meta={track.meta} image={track.image} divider />
        </Each>
      </Section>
    </PageBody>
  );
}
