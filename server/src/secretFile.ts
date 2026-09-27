/**
 * Reads one secret from a file: the value of its `NAME=value` line when it has one (a shared
 * `.env`-style keys file), else the whole file, trimmed. The value is never logged.
 */
import { readFileSync } from 'node:fs';

export function readSecretFile(file: string, name: string): string {
  const text = readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] === name && match[2]) return match[2];
  }
  const whole = text.trim();
  if (whole === '' || /^[A-Z_]+\s*=/m.test(whole)) throw new Error(`${file} holds no ${name}`);
  return whole;
}
