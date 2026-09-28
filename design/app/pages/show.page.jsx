export default function Show({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} search="Search this show's episodes" />}>
      <PageBody width="list">
        <Section>
          <MediaHeader
            kindLabel={data.kind}
            subtitle={data.host}
            meta={data.meta}
            image={data.image}
            actions={<FollowButton following={data.following} labels={data.subscribe} />}
            menu={<OverflowMenu items={data.menu} />}
          />
        </Section>
        <Section title="Episodes">
          <SortFilterBar icon="swap_vert" label={data.sort} />
          <Each of={data.episodes} as="episode">
            <EpisodeRow
              title={episode.title}
              description={episode.description}
              meta={episode.meta}
              image={episode.image}
              progress={episode.progress}
              finished={episode.finished}
              absent={episode.absent}
              onClick={<Open page="episode" ref={episode.ref} />}
              onPlay={<Play ref={episode.ref} queue="spoken" />}
              divider
            />
          </Each>
        </Section>
        <Section title="About">
          <ExpandableText text={data.about} lines={3} />
        </Section>
        <Section title="You might also like" last>
          <Shelf>
            <Each of={data.related} as="other">
              <MediaCard
                title={other.title}
                sub={other.sub}
                image={other.image}
                onClick={<Open page="show" ref={other.ref} />}
              />
            </Each>
          </Shelf>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
