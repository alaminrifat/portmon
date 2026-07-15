import { platform } from 'node:os';

export type Platform = 'win32' | 'darwin' | 'linux' | 'other';

export function getPlatform(): Platform {
  const p = platform();
  if (p === 'win32' || p === 'darwin' || p === 'linux') return p;
  return 'other';
}

export function isWindows(): boolean {
  return getPlatform() === 'win32';
}

export function isUnix(): boolean {
  const p = getPlatform();
  return p === 'darwin' || p === 'linux';
}
