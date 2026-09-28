// A page drawn by hand in the app instead of in the design: the lint must refuse all of it.
import { createElement } from 'react';
import Browse from './generated/pages/Browse';

export function HandMade() {
  return (
    <div className="page">
      <span style={{ color: 'red' }}>Hello</span>
      <Browse />
      {createElement('section', null, 'more')}
    </div>
  );
}
