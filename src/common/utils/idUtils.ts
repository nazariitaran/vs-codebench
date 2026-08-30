import { randomUUID } from 'node:crypto';

export function randomId(): string {
  return randomUUID();
}
