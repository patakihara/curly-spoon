// An app file as the rule wants it: only generated pages and Sonora components.
import Browse from './generated/pages/Browse';
import { PageBody } from './generated/ui/index.js';

export function Composed() {
  return (
    <PageBody>
      <Browse state="full" />
    </PageBody>
  );
}
