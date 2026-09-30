import { readFile, writeFile } from 'node:fs/promises';
import { siteCspHeader } from '../src/lib/content-security-policy.mjs';

const source = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
if ((source.match(/Content-Security-Policy:/g) ?? []).length !== 1) throw new Error('Expected exactly one CSP template.');
// Generated build artifact only; never modifies the reviewed source template.
await writeFile(new URL('../dist/_headers', import.meta.url), source.replace(/Content-Security-Policy:[^\n]*/, `Content-Security-Policy: ${siteCspHeader()}`));
console.log('Built security headers from the shared CSP policy.');
