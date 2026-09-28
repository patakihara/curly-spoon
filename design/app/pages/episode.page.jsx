export default function Episode({ data }) {
  return (
    <BackdropShell back={<BackLayer title={data.title} />}>
      <PageBody width="list">
        <Section>
          <MediaHeader
            kindLabel={data.kind}
            subtitle={data.show}
            onSubtitle={<Open page="show" ref={data.showRef} />}
            meta={data.meta}
            progress={data.progress}
            image={data.image}
            playLabel="Resume"
            onPlay={<Play ref={data.ref} queue="spoken" />}
            nextLabel="Play next"
            onPlayNext={<Play ref={data.ref} queue="spoken" next />}
            lastLabel={null}
            addLabel="Add to a list"
            download={data.download}
            menu={<OverflowMenu items={data.menu} />}
          />
        </Section>
        <Section title="Show notes">
          <ExpandableText text={data.notes} lines={4} />
        </Section>
        <Section title="More from the show" last>
          <Each of={data.more} as="other">
            <EpisodeRow
              title={other.title}
              description={other.description}
              meta={other.meta}
              image={other.image}
              progress={other.progress}
              finished={other.finished}
              onClick={<Open page="episode" ref={other.ref} />}
              onPlay={<Play ref={other.ref} queue="spoken" />}
              divider
            />
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
