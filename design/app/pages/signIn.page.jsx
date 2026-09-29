export default function SignIn({ data }) {
  return (
    <BackdropShell>
      <PageBody width="form">
        <Section>
          <EmptyState
            icon="group"
            title="Sign in with your household account"
            body="Auralis has no accounts or passwords of its own: you sign in where you sign in to Audiobookshelf and Jellyfin."
            action={
              <Button variant="primary" onClick={<SignIn />}>
                Sign in
              </Button>
            }
          />
        </Section>
        <Section last>
          <StatusBanner tone="error" icon="block" actionLabel="Try again">
            {data.error}
          </StatusBanner>
        </Section>
      </PageBody>
    </BackdropShell>
  );
}
