// Which workspaces need publishing, and why the others do not.
//
// The decision compares the version in each package.json against what the registry already
// has, rather than parsing what a merge commit changed. Version-diff is idempotent (a re-run
// publishes nothing), self-healing (a version that missed its window goes out on the next
// push), and needs no tags, changelog files, or release commits.
//
// Pure: every registry fact arrives as an argument. scripts/plan-publish.mjs is the boundary
// that talks to npm and the filesystem.

/**
 * What the registry knows about one package name.
 *
 * Mirrors `npm view <name> versions --json`: the package exists and has these versions, the
 * name is unknown to the registry, or the registry could not be reached.
 *
 * @typedef {{ kind: 'known', versions: readonly string[] }
 *   | { kind: 'unregistered' }
 *   | { kind: 'unavailable', detail: string }} RegistryView
 */

/**
 * One workspace as its package.json declares it.
 *
 * @typedef {{ name: string, version: string, isPrivate: boolean }} Workspace
 */

/** @typedef {'already-published' | 'private' | 'not-selected'} SkipReason */

/**
 * What should happen to one workspace on this run.
 *
 * `blocked` is not `skip`: a skip is the workflow working correctly, a block is a release that
 * should have happened and did not. The two exit differently.
 *
 * @typedef {{ kind: 'publish', name: string, version: string }
 *   | { kind: 'skip', name: string, version: string, reason: SkipReason }
 *   | { kind: 'blocked', name: string, version: string, detail: string }} PublishDecision
 */

/**
 * Trusted publishing can add a version to a package that already exists; it cannot bring a
 * package into being. npm will not let you configure a trusted publisher until the name is
 * registered, so the first version of every package goes out by hand.
 */
const FIRST_VERSION_IS_MANUAL =
  'not on the registry yet — trusted publishing cannot create a package, so its first version ' +
  'must be published by hand before this workflow can take over';

/**
 * @param {{ workspace: Workspace, registry: RegistryView, selected: string | null }} input
 * @returns {PublishDecision}
 */
export function decidePublish({ workspace, registry, selected }) {
  const { name, version, isPrivate } = workspace;

  if (isPrivate) return { kind: 'skip', name, version, reason: 'private' };
  if (selected !== null && selected !== name) {
    return { kind: 'skip', name, version, reason: 'not-selected' };
  }
  if (registry.kind === 'unavailable') {
    return { kind: 'blocked', name, version, detail: registry.detail };
  }
  if (registry.kind === 'unregistered') {
    return { kind: 'blocked', name, version, detail: FIRST_VERSION_IS_MANUAL };
  }
  if (registry.versions.includes(version)) {
    return { kind: 'skip', name, version, reason: 'already-published' };
  }
  return { kind: 'publish', name, version };
}

/**
 * Every workspace's decision, in one pass.
 *
 * A `selected` name that matches no workspace is itself blocked rather than quietly producing
 * an all-skipped plan — a typo in a dispatch input should say so, not look like a no-op.
 *
 * @param {{
 *   workspaces: readonly Workspace[],
 *   registryByName: Readonly<Record<string, RegistryView>>,
 *   selected: string | null,
 * }} input
 * @returns {readonly PublishDecision[]}
 */
export function planPublishes({ workspaces, registryByName, selected }) {
  const unknownSelection =
    selected !== null && !workspaces.some((workspace) => workspace.name === selected);

  if (unknownSelection) {
    return [
      {
        kind: 'blocked',
        name: selected,
        version: 'unknown',
        detail: `no workspace is named "${selected}" — nothing was published`,
      },
    ];
  }

  return workspaces.map((workspace) =>
    decidePublish({
      workspace,
      registry: registryByName[workspace.name] ?? {
        kind: 'unavailable',
        detail: 'the registry was never queried for this workspace',
      },
      selected,
    }),
  );
}

/**
 * The workspace names to hand the publish matrix, in declaration order.
 *
 * @param {readonly PublishDecision[]} decisions
 * @returns {readonly string[]}
 */
export function publishablePackages(decisions) {
  return decisions.filter((decision) => decision.kind === 'publish').map((decision) => decision.name);
}

/**
 * @param {readonly PublishDecision[]} decisions
 * @returns {readonly PublishDecision[]}
 */
export function blockedDecisions(decisions) {
  return decisions.filter((decision) => decision.kind === 'blocked');
}

/** @type {Readonly<Record<SkipReason, string>>} */
const SKIP_PHRASING = {
  'already-published': 'already on the registry',
  private: 'private, never published',
  'not-selected': 'not the dispatched workspace',
};

/**
 * One log line per decision. The run's summary is the only place a maintainer looks when a
 * release did not happen, so each line has to say the reason on its own.
 *
 * @param {PublishDecision} decision
 * @returns {string}
 */
export function describeDecision(decision) {
  const subject = `${decision.name}@${decision.version}`;

  switch (decision.kind) {
    case 'publish':
      return `publish   ${subject}`;
    case 'skip':
      return `skip      ${subject} — ${SKIP_PHRASING[decision.reason]}`;
    case 'blocked':
      return `BLOCKED   ${subject} — ${decision.detail}`;
  }
}
