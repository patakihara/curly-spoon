export default function Requests({ data }) {
  return (
    <BackdropShell>
      <PageBody width="list">
        <When state="empty">
          <EmptyState
            icon="downloading"
            title="Nothing requested"
            body="What you request shows here on its way. Search is where things are requested."
            action={
              <Button variant="secondary" onClick={<Open page="search" />}>
                Go to Search
              </Button>
            }
          />
        </When>
        <When state="full">
          <Section title="In flight">
            <Each of={data.inFlight} as="request">
              <ResultRow
                title={request.title}
                meta={request.meta}
                image={request.image}
                status={request.status}
                tone={request.tone}
                divider
                trailing={
                  <IconButton
                    icon={request.actionIcon}
                    label={request.action}
                    onClick={<Act ref={request.id} verb={request.verb} />}
                  />
                }
              />
            </Each>
            <Each of={data.pickable} as="request">
              <ResultRow
                title={request.title}
                meta={request.meta}
                image={request.image}
                status={request.status}
                tone={request.tone}
                trailing={
                  <IconButton
                    icon={request.actionIcon}
                    label={request.action}
                    onClick={<Act ref={request.id} verb={request.verb} />}
                  />
                }
              />
              <ResultRow
                title="Pick another release"
                meta={request.others}
                image={request.image}
                divider
                onClick={<Act ref={request.id} verb="pickAnother" candidate={request.next} />}
                trailing={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={<Act ref={request.id} verb="pickAnother" candidate={request.next} />}
                  >
                    Pick another
                  </Button>
                }
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
                trailing={
                  <IconButton
                    icon="close"
                    label="Cancel"
                    onClick={<Act ref={request.id} verb="cancel" />}
                  />
                }
              />
              <Each of={request.candidates} as="candidate">
                <ResultRow
                  title={candidate.title}
                  meta={candidate.meta}
                  image={request.image}
                  divider
                  onClick={<Act ref={request.id} verb="choose" candidate={candidate.id} />}
                  trailing={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={<Act ref={request.id} verb="choose" candidate={candidate.id} />}
                    >
                      Choose
                    </Button>
                  }
                />
              </Each>
            </Each>
          </Section>
        </When>
      </PageBody>
    </BackdropShell>
  );
}
