// Fail fast when the local Node doesn't match .nvmrc's major version.
// Node 25+ ships a global localStorage stub and native Request/AbortSignal that
// poison jsdom-based tests with confusing failures — catch it before the suite runs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const expected = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.nvmrc'), 'utf8').trim();
const expectedMajor = expected.split('.')[0];
const actualMajor = process.versions.node.split('.')[0];

if (expectedMajor !== actualMajor) {
  console.error(
    `\nThis repo pins Node ${expected} (.nvmrc); you are on ${process.versions.node}.\n` +
    `jsdom tests break on other majors (broken global localStorage, AbortSignal realm mismatch).\n` +
    `Fix: nvm use ${expected}  (or: export PATH pointing at a Node ${expectedMajor} install)\n`
  );
  process.exit(1);
}
