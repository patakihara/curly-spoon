export default function NotFound() {
  return (
    <BackdropShell>
      <PageBody>
        <EmptyState
          icon="link_off"
          title="This page doesn't exist"
          body="The link may be old, or what it pointed to has left the library."
          action={
            <Button variant="secondary" onClick={<Open page="browse" />}>
              Go to Browse
            </Button>
          }
        />
      </PageBody>
    </BackdropShell>
  );
}
