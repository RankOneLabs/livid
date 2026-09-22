import { describe, expect, it } from 'vitest';

import { layoutDeep, validateDiagram } from '@rankonelabs/livid-core';

import { svLividRegistry, SV_LIVID_VALIDATE_OPTIONS } from '../../../fixtures/sv-livid-v1/registry.js';
import { svLividV1Spec } from '../../../fixtures/sv-livid-v1/spec.js';
import { renderSvg } from '../src/index.js';

describe('sv-livid-v1 fixture', () => {
  it('renders dependency styling, deferred detail, labels, and parallel edges', async () => {
    const valid = validateDiagram(svLividRegistry, svLividV1Spec, SV_LIVID_VALIDATE_OPTIONS);
    if (!valid.ok) throw new Error(`fixture is not valid: ${JSON.stringify(valid.error)}`);

    const laidOut = await layoutDeep(valid.value);
    if (!laidOut.ok) throw new Error(`fixture did not lay out: ${JSON.stringify(laidOut.error)}`);

    const svg = renderSvg(laidOut.value, { levels: 'root' });
    const edges = [...svg.matchAll(/<polyline class="livid-edge"[^>]+>/g)].map((match) => match[0]);

    expect(edges).toHaveLength(laidOut.value.edges.length);
    expect(edges.every((edge) => edge.includes('data-kind="edge"'))).toBe(true);
    expect(edges.every((edge) => edge.includes('marker-end="url(#'))).toBe(true);
    expect(svg).not.toContain('data-kind="branch"');
    expect(svg).toContain('data-child-state="deferred"');
    expect(svg).toContain('>exports</text>');
    expect(edges.filter((edge) => edge.includes('data-edge-id="core-elk-'))).toHaveLength(2);
    expect(svg).toContain('data-edge-id="core-elk-import"');
    expect(svg).toContain('data-edge-id="core-elk-dependency"');
  });
});
