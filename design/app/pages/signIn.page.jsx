export default function SignIn({ data }) {
  return (
    <BackdropShell>
      <PageBody width="form">
        <Section>
          <StatusBanner tone="error" icon="block" actionLabel="Try again">
            {data.error}
          </StatusBanner>
        </Section>
        <Section last>
          <EmptyState
            icon="group"
            title="Sign in with your household account"
            body="Auralis has no accounts or passwords of its own: you sign in where you sign in to Audiobookshelf and Jellyfin."
            action={<Button variant="primary">Sign in</Button>}
          />
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
