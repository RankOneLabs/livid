#!/usr/bin/env node
// Decides what this run publishes, and writes the matrix the publish job consumes.
//
// The IO boundary for scripts/lib/publish-plan.mjs: reads the workspaces off disk, asks the
// registry what it already has, and converts both — including every way they can fail — into
// the plain values the pure planner takes.
//
// Usage: node scripts/plan-publish.mjs [--selected <workspace>]
//
// Writes `packages=<json array>` to $GITHUB_OUTPUT when that variable is set, prints one line
// per workspace either way, and exits 1 if any release was blocked.

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  blockedDecisions,
  describeDecision,
  planPublishes,
  publishablePackages,
} from './lib/publish-plan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** `all` and an empty input both mean "everything that needs it" — the dispatch default. */
const SELECT_EVERYTHING = new Set(['', 'all']);

/**
 * @param {readonly string[]} argv
 * @returns {string | null}
 */
function readSelection(argv) {
  const flag = argv.indexOf('--selected');
  if (flag === -1) return null;

  const value = (argv[flag + 1] ?? '').trim();
  return SELECT_EVERYTHING.has(value) ? null : value;
}

/**
 * @param {string} file
 * @returns {unknown}
 */
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Every workspace the root package.json declares.
 *
 * Only the `dir/*` glob form is supported, because it is the only form this repo uses. A
 * pattern this cannot expand throws rather than silently contributing no workspaces — an
 * unexpanded glob would look exactly like "nothing to publish".
 *
 * @returns {readonly import('./lib/publish-plan.mjs').Workspace[]}
 */
function readWorkspaces() {
  const root = readJson(resolve(ROOT, 'package.json'));
  const patterns = Array.isArray(root.workspaces) ? root.workspaces : [];

  return patterns.flatMap((pattern) => {
    if (!pattern.endsWith('/*')) {
      throw new Error(
        `plan-publish: cannot expand workspace pattern "${pattern}" — only the "dir/*" form is supported`,
      );
    }

    const parent = resolve(ROOT, pattern.slice(0, -2));
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readJson(resolve(parent, entry.name, 'package.json')))
      .map((manifest) => ({
        name: manifest.name,
        version: manifest.version,
        isPrivate: manifest.private === true,
      }));
  });
}

/**
 * What the registry has for one package name.
 *
 * `npm view` exits non-zero for both "no such package" and "the registry is down", and only the
 * first of those is a normal state, so the E404 body is what separates them. Anything else is
 * reported as unavailable rather than guessed at — publishing on a failed lookup would mean
 * republishing whatever the network happened to hide.
 *
 * @param {string} name
 * @returns {import('./lib/publish-plan.mjs').RegistryView}
 */
function viewRegistry(name) {
  const probe = spawnSync('npm', ['view', name, 'versions', '--json'], { encoding: 'utf8' });

  if (probe.error) {
    return { kind: 'unavailable', detail: `npm view could not run: ${probe.error.message}` };
  }

  let body;
  try {
    body = JSON.parse(probe.stdout);
  } catch {
    return {
      kind: 'unavailable',
      detail: `npm view returned no JSON (exit ${probe.status}): ${probe.stderr.trim().slice(0, 200)}`,
    };
  }

  if (probe.status === 0) {
    // A package with exactly one version can come back as a bare string.
    return { kind: 'known', versions: Array.isArray(body) ? body : [body] };
  }
  if (body?.error?.code === 'E404') return { kind: 'unregistered' };

  return {
    kind: 'unavailable',
    detail: `npm view failed: ${body?.error?.summary ?? `exit ${probe.status}`}`,
  };
}

function main() {
  const selected = readSelection(process.argv.slice(2));
  const workspaces = readWorkspaces();

  const registryByName = Object.fromEntries(
    workspaces.map((workspace) => [workspace.name, viewRegistry(workspace.name)]),
  );

  const decisions = planPublishes({ workspaces, registryByName, selected });
  const packages = publishablePackages(decisions);
  const blocked = blockedDecisions(decisions);

  for (const decision of decisions) console.log(describeDecision(decision));

  if (packages.length === 0 && blocked.length === 0) {
    // Deliberately does not say "everything is already published" — a dispatch narrowed to one
    // workspace also lands here, and the per-workspace lines above already carry the reason.
    console.log('\nNothing to publish — each line above says why.');
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `packages=${JSON.stringify(packages)}\n`);
  }

  if (blocked.length > 0) {
    console.error(`\n${blocked.length} release(s) blocked — see the lines marked BLOCKED above.`);
    process.exit(1);
  }
}

main();
