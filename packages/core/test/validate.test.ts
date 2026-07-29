import { describe, expect, it } from 'vitest';

import { type DiagramSpec, defineRegistry, validateConfig, validateDiagram } from '../src/index.js';
import { anything, asyncSchema, objectWithString } from './helpers.js';

const registry = defineRegistry({
  nodeTypes: {
    client: { label: 'Client', detail: anything, shape: 'stadium' },
    transform: { label: 'Transform', detail: objectWithString('flavor'), shape: 'rounded' },
  },
  edgeTypes: {
    plain: { label: 'Flow', detail: anything, marker: 'none', branching: false },
    gated: { label: 'Gate', detail: anything, marker: 'checkpoint', branching: true },
  },
});

const wellFormed: DiagramSpec = {
  lines: [{ id: 'main', label: 'Main', color: 'route-1' }],
  nodes: [
    { id: 'in', type: 'client', label: 'Operator', line: 'main' },
    { id: 'draft', type: 'transform', label: 'Draft', detail: { flavor: 'llm' } },
  ],
  edges: [{ id: 'e1', type: 'plain', source: 'in', target: 'draft' }],
};

function errorKinds(spec: DiagramSpec): readonly string[] {
  const result = validateDiagram(registry, spec);
  return result.ok ? [] : result.error.map((error) => error.kind);
}

describe('validateDiagram', () => {
  it('accepts a well-formed spec', () => {
    const result = validateDiagram(registry, wellFormed);
    expect(result.ok).toBe(true);
  });

  it('rejects a node whose type is not registered', () => {
    expect(errorKinds({ nodes: [{ id: 'a', type: 'wormhole', label: 'Nope' }], edges: [] })).toEqual([
      'unknown_node_type',
    ]);
  });

  it('names the registered types when rejecting an unknown one', () => {
    const result = validateDiagram(registry, { nodes: [{ id: 'a', type: 'wormhole', label: 'Nope' }], edges: [] });
    if (result.ok) throw new Error('expected rejection');
    const [error] = result.error;
    expect(error?.kind === 'unknown_node_type' && error.known).toEqual(['client', 'transform']);
  });

  it('rejects a duplicate node id', () => {
    expect(
      errorKinds({
        nodes: [
          { id: 'a', type: 'client', label: 'One' },
          { id: 'a', type: 'client', label: 'Two' },
        ],
        edges: [],
      }),
    ).toEqual(['duplicate_node_id']);
  });

  it('rejects an edge endpoint that resolves to no node', () => {
    expect(
      errorKinds({
        nodes: [{ id: 'a', type: 'client', label: 'One' }],
        edges: [{ id: 'e1', type: 'plain', source: 'a', target: 'ghost' }],
      }),
    ).toEqual(['unresolved_endpoint']);
  });

  it('rejects a node referencing an undeclared line', () => {
    expect(
      errorKinds({
        lines: [{ id: 'main', label: 'Main', color: 'c' }],
        nodes: [{ id: 'a', type: 'client', label: 'One', line: 'ghost' }],
        edges: [],
      }),
    ).toEqual(['unknown_line']);
  });

  it('rejects a detail bag that fails its type schema, naming the field', () => {
    const result = validateDiagram(registry, {
      nodes: [{ id: 'a', type: 'transform', label: 'Bad', detail: { flavor: 42 } }],
      edges: [],
    });
    if (result.ok) throw new Error('expected rejection');
    const [error] = result.error;
    expect(error?.kind === 'invalid_detail' && error.issues[0]?.field).toBe('flavor');
  });

  it('reports every problem in one pass rather than stopping at the first', () => {
    expect(
      errorKinds({
        lines: [{ id: 'main', label: 'Main', color: 'c' }],
        nodes: [
          { id: 'a', type: 'wormhole', label: 'Nope' },
          { id: 'b', type: 'transform', label: 'Bad', detail: { flavor: 42 } },
          { id: 'b', type: 'client', label: 'Dupe' },
          { id: 'c', type: 'client', label: 'Bad line', line: 'ghost' },
        ],
        edges: [{ id: 'e1', type: 'telepathy', source: 'a', target: 'zzz' }],
      }),
    ).toEqual([
      'unknown_node_type',
      'invalid_detail',
      'duplicate_node_id',
      'unknown_line',
      'unknown_edge_type',
    ]);
  });

  it('attaches the drill-down path to an error inside a nested level', () => {
    const result = validateDiagram(registry, {
      nodes: [
        {
          id: 'outer',
          type: 'client',
          label: 'Outer',
          children: { nodes: [{ id: 'inner', type: 'wormhole', label: 'Nope' }], edges: [] },
        },
      ],
      edges: [],
    });
    if (result.ok) throw new Error('expected rejection');
    expect(result.error[0]?.kind === 'unknown_node_type' && result.error[0].path).toEqual(['outer']);
  });

  it('leaves the path empty for a top-level error', () => {
    const result = validateDiagram(registry, { nodes: [{ id: 'a', type: 'wormhole', label: 'x' }], edges: [] });
    if (result.ok) throw new Error('expected rejection');
    expect(result.error[0]?.kind === 'unknown_node_type' && result.error[0].path).toEqual([]);
  });

  it('rejects an edge whose endpoints live in different drill-down levels', () => {
    // Levels are self-contained: a child cannot reach a node in its parent.
    expect(
      errorKinds({
        nodes: [
          { id: 'outer', type: 'client', label: 'Outer' },
          {
            id: 'host',
            type: 'client',
            label: 'Host',
            children: {
              nodes: [{ id: 'inner', type: 'client', label: 'Inner' }],
              edges: [{ id: 'x', type: 'plain', source: 'inner', target: 'outer' }],
            },
          },
        ],
        edges: [],
      }),
    ).toEqual(['unresolved_endpoint']);
  });

  it('rejects a schema that returns a promise', () => {
    const asyncRegistry = defineRegistry({
      nodeTypes: { client: { label: 'Client', detail: asyncSchema, shape: 'stadium' } },
      edgeTypes: { plain: { label: 'Flow', detail: anything, marker: 'none', branching: false } },
    });
    const result = validateDiagram(asyncRegistry, { nodes: [{ id: 'a', type: 'client', label: 'x' }], edges: [] });
    if (result.ok) throw new Error('expected rejection');
    expect(result.error[0]?.kind).toBe('async_schema');
  });
});

describe('registry discipline', () => {
  const sevenNodeTypes = defineRegistry({
    nodeTypes: Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => [
        key,
        { label: key, detail: anything, shape: 'rect' as const },
      ]),
    ),
    edgeTypes: { plain: { label: 'Flow', detail: anything, marker: 'none', branching: false } },
  });

  it('rejects a vocabulary above the default limit', () => {
    const result = validateDiagram(sevenNodeTypes, { nodes: [], edges: [] });
    if (result.ok) throw new Error('expected rejection');
    expect(result.error[0]?.kind).toBe('registry_overflow');
  });

  it('accepts the same vocabulary when the limit is raised', () => {
    expect(validateDiagram(sevenNodeTypes, { nodes: [], edges: [] }, { nodeTypeLimit: 10 }).ok).toBe(true);
  });
});

describe('validateConfig', () => {
  it('returns the validated value on success', () => {
    const result = validateConfig(objectWithString('flavor'), { flavor: 'llm' });
    expect(result.ok && result.value).toEqual({ flavor: 'llm' });
  });

  it('flattens validator issues into field paths', () => {
    const result = validateConfig(objectWithString('flavor'), { flavor: 42 });
    expect(!result.ok && result.error.kind === 'issues' && result.error.issues[0]?.field).toBe('flavor');
  });

  it('reports a root-level issue when the validator gives no path', () => {
    const result = validateConfig(objectWithString('flavor'), 'not an object');
    expect(!result.ok && result.error.kind === 'issues' && result.error.issues[0]?.field).toBe('<root>');
  });

  it('refuses a promise instead of awaiting it', () => {
    const result = validateConfig(asyncSchema, {});
    expect(!result.ok && result.error.kind).toBe('async');
  });
});
