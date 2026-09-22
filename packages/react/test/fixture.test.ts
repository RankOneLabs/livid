import { describe, expect, it } from 'vitest';
import { layout, validateDiagram } from '@rankonelabs/livid-core';

import { svLividRegistry, SV_LIVID_VALIDATE_OPTIONS } from '../../../fixtures/sv-livid-v1/registry.js';
import { svLividV1Spec } from '../../../fixtures/sv-livid-v1/spec.js';
import { toReactDiagram } from '../src/index.js';

const emptyFrame = { __brand: 'StateFrame', nodes: {}, edges: {} } as const;

async function fixtureModel() {
  const withSelfLoop = {
    ...svLividV1Spec,
    edges: [
      ...svLividV1Spec.edges,
      { id: 'core-self', type: 'call', source: 'core', target: 'core', detail: { operation: 'revalidate' } },
    ],
  };
  const valid = validateDiagram(svLividRegistry, withSelfLoop, SV_LIVID_VALIDATE_OPTIONS);
  if (!valid.ok) throw new Error(valid.error.map((error) => error.kind).join(', '));
  const laid = await layout(valid.value);
  if (!laid.ok) throw new Error(laid.error.map((error) => error.kind).join(', '));
  return toReactDiagram(laid.value, emptyFrame);
}

describe('React SV-Livid fixture projection', () => {
  it('keeps parallel edges independently identifiable with their own detail', async () => {
    const model = await fixtureModel();
    const parallel = model.edges.filter((edge) => edge.source === 'core' && edge.target === 'elk');

    expect(parallel.map((edge) => edge.id)).toEqual(['core-elk-import', 'core-elk-dependency']);
    expect(parallel.map((edge) => edge.data.detail)).toEqual([
      null,
      { package: 'elkjs', relation: 'runtime' },
    ]);
  });

  it('projects a self-loop route without collapsing its identity', async () => {
    const model = await fixtureModel();
    const selfLoop = model.edges.find((edge) => edge.id === 'core-self');

    expect(selfLoop).toMatchObject({ id: 'core-self', source: 'core', target: 'core' });
    expect(selfLoop?.data.route.length).toBeGreaterThan(1);
  });
});
