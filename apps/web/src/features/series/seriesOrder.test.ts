import { describe, expect, it } from 'vitest';
import { orderSeriesBooks, type SeriesOrderableBook } from './seriesOrder.js';

function book(id: string, title: string, seriesSequence: string | null): SeriesOrderableBook {
  return { id, title, seriesSequence };
}

describe('orderSeriesBooks', () => {
  it('orders numbered entries by sequence, not by title', () => {
    const books = [book('b2', 'Book Two', '2'), book('b1', 'Book One', '1')];
    expect(orderSeriesBooks(books).map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('sorts numerically, not lexicographically — "10" comes after "2"', () => {
    const books = [book('b10', 'Ten', '10'), book('b2', 'Two', '2')];
    expect(orderSeriesBooks(books).map((b) => b.id)).toEqual(['b2', 'b10']);
  });

  it('places a fractional sequence between its neighbours', () => {
    const books = [book('b3', 'Three', '3'), book('b1', 'One', '1'), book('b2', 'Two', '1.5')];
    expect(orderSeriesBooks(books).map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('puts an unnumbered entry after every numbered one, ordered by title', () => {
    const books = [
      book('unnumbered-b', 'Bonus Story', null),
      book('numbered', 'Main Book', '1'),
      book('unnumbered-a', 'Anthology', null),
    ];
    expect(orderSeriesBooks(books).map((b) => b.id)).toEqual([
      'numbered',
      'unnumbered-a',
      'unnumbered-b',
    ]);
  });

  it('degrades an unparseable sequence to unnumbered rather than throwing', () => {
    const books = [book('weird', 'Weird Sequence', 'three'), book('normal', 'Normal', '1')];
    expect(orderSeriesBooks(books).map((b) => b.id)).toEqual(['normal', 'weird']);
  });

  it('does not mutate its input', () => {
    const books = [book('b2', 'Two', '2'), book('b1', 'One', '1')];
    const original = [...books];
    orderSeriesBooks(books);
    expect(books).toEqual(original);
  });
});
