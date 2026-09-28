export default function Downloads({ data }) {
  return (
    <BackdropShell>
      <PageBody width="list">
        <Section title="Downloaded">
          <ValueRow label="On this phone" value={data.total} />
          <Each of={data.downloaded} as="item">
            <ResultRow
              title={item.title}
              meta={item.meta}
              image={item.image}
              divider
              trailing={<IconButton icon="delete" label="Remove" />}
            />
          </Each>
        </Section>
        <Section title="In progress" last>
          <Each of={data.inProgress} as="item">
            <ResultRow
              title={item.title}
              meta={item.meta}
              image={item.image}
              status={item.status}
              tone={item.tone}
              divider
              trailing={<IconButton icon="close" label="Cancel" />}
            />
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
