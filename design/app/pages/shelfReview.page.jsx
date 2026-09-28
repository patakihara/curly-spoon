export default function ShelfReview({ data }) {
  return (
    <BackdropShell>
      <PageBody width="list">
        <Each of={data.shelves} as="shelf">
          <Section
            eyebrow={shelf.eyebrow}
            title={shelf.subject}
            image={shelf.image}
            round={shelf.round}
            actionText="Open"
            onAction={<Open page="shelf" id={shelf.id} />}
          >
            <Each of={shelf.items} as="item">
              <ResultRow
                title={item.title}
                meta={item.meta}
                detail={item.reason}
                image={item.image}
                status={item.status}
                tone={item.tone}
                divider
              />
            </Each>
          </Section>
        </Each>
      </PageBody>
    </BackdropShell>
  );
}
