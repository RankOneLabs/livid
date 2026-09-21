import { describe, expect, it } from 'vitest';

import { largeScopeSpec, LARGE_SCOPE_NODE_COUNT } from '../../../fixtures/sv-livid-v1/large-scope.js';
import { svLividRegistry, SV_LIVID_VALIDATE_OPTIONS } from '../../../fixtures/sv-livid-v1/registry.js';
import { svLividV1Spec } from '../../../fixtures/sv-livid-v1/spec.js';
import { layout, validateDiagram } from '../src/index.js';

describe('SV-Livid v1 fixture', () => {
  it('validates with dependency semantics and raised vocabulary limits', () => {
    const result = validateDiagram(svLividRegistry, svLividV1Spec, SV_LIVID_VALIDATE_OPTIONS);
    expect(result.ok && result.value.profile).toBe('dependency');
  });

  it('exercises embedded and deferred scopes', () => {
    const result = validateDiagram(svLividRegistry, svLividV1Spec, SV_LIVID_VALIDATE_OPTIONS);
    if (!result.ok) throw new Error('expected valid fixture');
    expect(result.value.nodes.find((node) => node.id === 'core')?.childState.kind).toBe('embedded');
    expect(result.value.nodes.find((node) => node.id === 'react')?.childState.kind).toBe('deferred');
  });

  it('fails its non-router fan-out under pipeline semantics', () => {
    const result = validateDiagram(
      svLividRegistry,
      { ...svLividV1Spec, profile: 'pipeline' },
      SV_LIVID_VALIDATE_OPTIONS,
    );
    expect(!result.ok && result.error.some((error) => error.kind === 'illegal_branch')).toBe(true);
  });

  it('generates and lays out the 150-node scope', async () => {
    const valid = validateDiagram(svLividRegistry, largeScopeSpec, SV_LIVID_VALIDATE_OPTIONS);
    if (!valid.ok) throw new Error(valid.error.map((error) => error.kind).join(', '));
    const laid = await layout(valid.value);
    expect(laid.ok && laid.value.nodes).toHaveLength(LARGE_SCOPE_NODE_COUNT);
  });
});
