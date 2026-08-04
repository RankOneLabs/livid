import { describe, expect, it } from 'vitest';

import { defineRegistry, validateDiagram, validateState } from '../src/index.js';
import { anything } from './helpers.js';

const registry = defineRegistry({
  nodeTypes: {
    unit: {
      label: 'Unit',
      detail: anything,
      shape: 'rect',
      isRouter: false,
      states: {
        ready: { tint: 'base' },
        active: { tint: 'accent', anim: 'pulse' },
        blocked: { tint: 'danger', anim: 'stall' },
      },
    },
  },
  edgeTypes: {
    flow: { label: 'Flow', detail: anything, states: { live: { tint: 'accent', anim: 'flash' } } },
  },
});

const valid = validateDiagram(registry, {
  nodes: [
    { id: 'one', type: 'unit', label: 'One' },
    { id: 'two', type: 'unit', label: 'Two' },
  ],
  edges: [{ id: 'path', type: 'flow', source: 'one', target: 'two' }],
});

if (!valid.ok) throw new Error('state test fixture must be valid');

describe('validateState', () => {
  it('brands a frame whose node and edge states are declared by their types', () => {
    const result = validateState(registry, valid.value, {
      nodes: { one: 'active', two: 'ready' },
      edges: { path: 'live' },
    });

    expect(result.ok && result.value.__brand).toBe('StateFrame');
  });

  it('accepts sparse snapshots', () => {
    expect(validateState(registry, valid.value, { nodes: {}, edges: {} }).ok).toBe(true);
  });

  it('reports every unknown entity and state in one pass', () => {
    const result = validateState(registry, valid.value, {
      nodes: { one: 'missing', ghost: 'active' },
      edges: { path: 'stopped', nowhere: 'live' },
    });
    if (result.ok) throw new Error('expected invalid state');

    expect(result.error.map((error) => error.kind)).toEqual([
      'unknown_state',
      'unknown_state_entity',
      'unknown_state',
      'unknown_state_entity',
    ]);
  });

  it('rejects malformed maps instead of coercing them', () => {
    const result = validateState(registry, valid.value, { nodes: { one: 1 }, edges: [] });
    if (result.ok) throw new Error('expected invalid frame shape');

    expect(result.error).toEqual([
      { kind: 'invalid_state_frame', field: 'nodes' },
      { kind: 'invalid_state_frame', field: 'edges' },
    ]);
  });
});
