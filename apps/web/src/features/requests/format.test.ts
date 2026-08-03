import { describe, expect, it } from 'vitest';
import { formatBytes } from './format.js';

describe('formatBytes', () => {
  it('says "Unknown size" for a null byte count — Prowlarr does not always report one', () => {
    expect(formatBytes(null)).toBe('Unknown size');
  });

  it('shows sub-kilobyte sizes as whole bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('renders kilobytes to one decimal place', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('renders megabytes to one decimal place', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('renders gigabytes for a typical audiobook release', () => {
    expect(formatBytes(2.3 * 1024 * 1024 * 1024)).toBe('2.3 GB');
  });

  it('treats zero as a real, known size rather than "unknown"', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
});
