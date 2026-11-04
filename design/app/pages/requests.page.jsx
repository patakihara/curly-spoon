export default function Requests({ data }) {
  return (
    <BackdropShell>
      <PageBody width="list">
        <Each of={data.errors} as="error">
          <Section>
            <StatusBanner tone="error" icon="error">
              {error.message}
            </StatusBanner>
          </Section>
        </Each>
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
        <When state="failed">
          <EmptyState
            icon="cloud_off"
            title="Requests did not load"
            body="The server did not answer."
            action={
              <Button variant="secondary" onClick={<Retry />}>
                Try again
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
                detail={request.detail}
                image={request.image}
                status={request.status}
                tone={request.tone}
                divider
                trailing={
                  <IconButton
                    icon="close"
                    label="Cancel"
                    onClick={<Act ref={request.id} verb="cancel" />}
                  />
                }
              />
            </Each>
            <Each of={data.failed} as="request">
              <ResultRow
                title={request.title}
                meta={request.meta}
                detail={request.detail}
                image={request.image}
                status={request.status}
                tone={request.tone}
                divider
                onAction={<Act ref={request.id} verb="retry" />}
                trailing={
                  <IconButton
                    icon="close"
                    label="Cancel"
                    onClick={<Act ref={request.id} verb="cancel" />}
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
                onAction={<Act ref={request.id} verb="retry" />}
                trailing={
                  <IconButton
                    icon="close"
                    label="Cancel"
                    onClick={<Act ref={request.id} verb="cancel" />}
                  />
                }
              />
              <ResultRow
                title="Pick another release"
                detail={request.others}
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
                  detail={candidate.detail}
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
