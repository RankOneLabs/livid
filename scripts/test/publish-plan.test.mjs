import { describe, expect, it } from 'vitest';

import {
  blockedDecisions,
  decidePublish,
  describeDecision,
  planPublishes,
  publishablePackages,
} from '../lib/publish-plan.mjs';

/** @type {import('../lib/publish-plan.mjs').Workspace} */
const SVG = { name: '@rankonelabs/livid-svg', version: '0.2.0', isPrivate: false };
/** @type {import('../lib/publish-plan.mjs').Workspace} */
const CORE = { name: '@rankonelabs/livid-core', version: '0.1.0', isPrivate: false };

/** @param {readonly string[]} versions */
const known = (versions) => ({ kind: 'known', versions });

describe('deciding one workspace', () => {
  it('publishes a version the registry does not have', () => {
    const decision = decidePublish({
      workspace: SVG,
      registry: known(['0.1.0', '0.1.1', '0.1.2']),
      selected: null,
    });

    expect(decision).toEqual({ kind: 'publish', name: SVG.name, version: '0.2.0' });
  });

  it('skips a version the registry already has, so a re-run publishes nothing', () => {
    const decision = decidePublish({
      workspace: CORE,
      registry: known(['0.1.0']),
      selected: null,
    });

    expect(decision).toEqual({
      kind: 'skip',
      name: CORE.name,
      version: '0.1.0',
      reason: 'already-published',
    });
  });

  it('never publishes a private workspace, whatever the registry says', () => {
    const decision = decidePublish({
      workspace: { ...SVG, isPrivate: true },
      registry: known([]),
      selected: null,
    });

    expect(decision).toMatchObject({ kind: 'skip', reason: 'private' });
  });

  it('blocks rather than publishes when the registry could not be reached', () => {
    const decision = decidePublish({
      workspace: SVG,
      registry: { kind: 'unavailable', detail: 'npm view failed: ETIMEDOUT' },
      selected: null,
    });

    expect(decision).toEqual({
      kind: 'blocked',
      name: SVG.name,
      version: '0.2.0',
      detail: 'npm view failed: ETIMEDOUT',
    });
  });

  it('blocks an unregistered package with the reason a first publish is manual', () => {
    const decision = decidePublish({
      workspace: { name: '@rankonelabs/livid-react', version: '0.1.0', isPrivate: false },
      registry: { kind: 'unregistered' },
      selected: null,
    });

    expect(decision.kind).toBe('blocked');
    expect(decision.detail).toMatch(/published by hand/);
  });

  it('holds back every workspace but the dispatched one', () => {
    const decision = decidePublish({ workspace: CORE, registry: known([]), selected: SVG.name });

    expect(decision).toMatchObject({ kind: 'skip', reason: 'not-selected' });
  });
});

describe('planning the whole repo', () => {
  it('decides every workspace in one pass', () => {
    const decisions = planPublishes({
      workspaces: [CORE, SVG],
      registryByName: {
        [CORE.name]: known(['0.1.0']),
        [SVG.name]: known(['0.1.2']),
      },
      selected: null,
    });

    expect(decisions.map((decision) => decision.kind)).toEqual(['skip', 'publish']);
    expect(publishablePackages(decisions)).toEqual([SVG.name]);
  });

  it('blocks a dispatch that names no workspace instead of quietly publishing nothing', () => {
    const decisions = planPublishes({
      workspaces: [CORE, SVG],
      registryByName: { [CORE.name]: known([]), [SVG.name]: known([]) },
      selected: '@rankonelabs/livid-sgv',
    });

    expect(publishablePackages(decisions)).toEqual([]);
    expect(blockedDecisions(decisions)).toHaveLength(1);
    expect(decisions[0].detail).toMatch(/no workspace is named/);
  });

  it('blocks a workspace the registry was never asked about', () => {
    const decisions = planPublishes({
      workspaces: [SVG],
      registryByName: {},
      selected: null,
    });

    expect(blockedDecisions(decisions)).toHaveLength(1);
  });

  it('publishes nothing when every version is already out', () => {
    const decisions = planPublishes({
      workspaces: [CORE, SVG],
      registryByName: {
        [CORE.name]: known(['0.1.0']),
        [SVG.name]: known(['0.1.2', '0.2.0']),
      },
      selected: null,
    });

    expect(publishablePackages(decisions)).toEqual([]);
    expect(blockedDecisions(decisions)).toEqual([]);
  });
});

describe('the run summary', () => {
  it('says why a skipped workspace was skipped', () => {
    const line = describeDecision({
      kind: 'skip',
      name: CORE.name,
      version: '0.1.0',
      reason: 'already-published',
    });

    expect(line).toContain(`${CORE.name}@0.1.0`);
    expect(line).toContain('already on the registry');
  });

  it('marks a blocked release so it cannot read as a skip', () => {
    const line = describeDecision({
      kind: 'blocked',
      name: SVG.name,
      version: '0.2.0',
      detail: 'the registry was unreachable',
    });

    expect(line).toContain('BLOCKED');
    expect(line).toContain('the registry was unreachable');
  });
});
