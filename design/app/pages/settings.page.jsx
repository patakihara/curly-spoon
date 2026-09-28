export default function Settings({ data }) {
  return (
    <BackdropShell subheader={<FrontLayerHeader spy />}>
      <PageBody width="form">
        <Section>
          <FieldRow label="Server" value={data.server} />
        </Section>
        <Section last>
          <LayoutGrid columns={1} gap="10px">
            <Each of={data.settings} as="setting">
              <SettingRow title={setting.title} sub={setting.sub} checked={setting.checked} />
            </Each>
          </LayoutGrid>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
