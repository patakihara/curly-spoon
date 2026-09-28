export default function Setup({ data }) {
  return (
    <BackdropShell>
      <PageBody width="form">
        <Section>
          <StatusBanner tone="info" icon="info">
            {data.intro}
          </StatusBanner>
        </Section>
        <Section eyebrow="Step 1 of 4" title="One-time code">
          <FieldRow label="Code" placeholder={data.codeHint} />
        </Section>
        <Section eyebrow="Step 2 of 4" title="Services">
          <LayoutGrid columns={1} gap="10px">
            <Each of={data.services} as="service">
              <FieldRow label={service.label} value={service.address} />
            </Each>
          </LayoutGrid>
        </Section>
        <Section eyebrow="Step 3 of 4" title="Providers">
          <LayoutGrid columns={1} gap="10px">
            <Each of={data.providers} as="provider">
              <SettingRow title={provider.title} sub={provider.sub} checked={provider.checked} />
            </Each>
          </LayoutGrid>
        </Section>
        <Section eyebrow="Step 4 of 4" title="Requests">
          <SettingRow
            title={data.approval.title}
            sub={data.approval.sub}
            checked={data.approval.checked}
          />
        </Section>
        <Section last>
          <Button variant="primary" onClick={<Open page="browse" />}>
            Finish setup
          </Button>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
