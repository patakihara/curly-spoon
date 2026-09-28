export default function Requests({ data }) {
  return (
    <BackdropShell>
      <PageBody width="list">
        <Section title="In flight">
          <Each of={data.inFlight} as="request">
            <ResultRow
              title={request.title}
              meta={request.meta}
              image={request.image}
              status={request.status}
              tone={request.tone}
              divider
              trailing={<IconButton icon={request.actionIcon} label={request.action} />}
            />
          </Each>
        </Section>
        <Section title="Needs choice" last>
          <Each of={data.needsChoice} as="request">
            <ResultRow
              title={request.title}
              meta={request.meta}
              image={request.image}
              status={request.status}
              tone={request.tone}
              trailing={<IconButton icon="close" label="Cancel" />}
            />
            <Each of={request.candidates} as="candidate">
              <ResultRow
                title={candidate.title}
                meta={candidate.meta}
                image={request.image}
                divider
                trailing={
                  <Button variant="secondary" size="sm">
                    Choose
                  </Button>
                }
              />
            </Each>
          </Each>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
