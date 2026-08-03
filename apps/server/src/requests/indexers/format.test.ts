import { describe, expect, it } from 'vitest';
import { detectFormat } from './format.js';

describe('detectFormat', () => {
  it('finds m4b in a bracketed tag', () => {
    expect(detectFormat('Great Book [M4B]')).toBe('m4b');
  });

  it('finds flac in parentheses', () => {
    expect(detectFormat('Great Book (FLAC)')).toBe('flac');
  });

  it('finds m4a as a file extension', () => {
    expect(detectFormat('Great Book.m4a')).toBe('m4a');
  });

  it('finds aac in a bitrate tag', () => {
    expect(detectFormat('Great Book [AAC 128kbps]')).toBe('aac');
  });

  it('finds ogg as a file extension', () => {
    expect(detectFormat('Great Book.ogg')).toBe('ogg');
  });

  it('finds opus in a bracketed tag', () => {
    expect(detectFormat('Great Book [Opus]')).toBe('opus');
  });

  it('finds mp3 both as a bitrate tag and as a file extension', () => {
    expect(detectFormat('Book [MP3 64kbps]')).toBe('mp3');
    expect(detectFormat('Book.mp3')).toBe('mp3');
  });

  it('is case-insensitive', () => {
    expect(detectFormat('great book [Mp3]')).toBe('mp3');
  });

  it('picks m4b over mp3 when a title advertises both, in priority order', () => {
    expect(detectFormat('Title [M4B + MP3]')).toBe('m4b');
  });

  it('returns null when no known format token is present', () => {
    expect(detectFormat('Great Book Unabridged')).toBeNull();
  });

  it('does not match a format token embedded inside a longer word', () => {
    // "champ3x" contains the substring "mp3" but is not a format tag.
    expect(detectFormat('champ3x edition')).toBeNull();
  });
});
