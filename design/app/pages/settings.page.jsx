export default function Settings({ data }) {
  return (
    <BackdropShell>
      <PageBody width="form">
        <Each of={data.errors} as="error">
          <Section>
            <StatusBanner tone="error" icon="error">
              {error.message}
            </StatusBanner>
          </Section>
        </Each>
        <Section>
          <FieldRow label="Server" value={data.server} />
        </Section>
        <Section last>
          <LayoutGrid columns={1} gap="10px">
            <Each of={data.settings} as="setting">
              <SettingRow title={setting.title} sub={setting.sub} checked={setting.checked} />
            </Each>
            <SettingRow
              title={data.everyone.title}
              sub={data.everyone.sub}
              checked={data.everyone.checked}
              onChange={<Toggle setting="showEveryonesLibrary" />}
            />
          </LayoutGrid>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
