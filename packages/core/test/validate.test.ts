import { describe, expect, it } from 'vitest';

import { type DiagramSpec, defineRegistry, validateConfig, validateDiagram } from '../src/index.js';
import { anything, asyncSchema, objectWithString, throwingSchema } from './helpers.js';

const registry = defineRegistry({
  nodeTypes: {
    client: { label: 'Client', detail: anything, shape: 'stadium', isRouter: false },
    transform: { label: 'Transform', detail: objectWithString('flavor'), shape: 'rounded', isRouter: false },
    gate: { label: 'Gate', detail: anything, shape: 'diamond', isRouter: true },
  },
  edgeTypes: {
    flow: { label: 'Flow', detail: anything },
    log: { label: 'Log write', detail: anything },
  },
});

const wellFormed: DiagramSpec = {
  lines: [{ id: 'main', label: 'Main', color: 'route-1' }],
  nodes: [
    { id: 'in', type: 'client', label: 'Operator', line: 'main' },
    { id: 'draft', type: 'transform', label: 'Draft', detail: { flavor: 'llm' } },
  ],
  edges: [{ id: 'e1', type: 'flow', source: 'in', target: 'draft' }],
};

function errorKinds(spec: DiagramSpec): readonly string[] {
  const result = validateDiagram(registry, spec);
  return result.ok ? [] : result.error.map((error) => error.kind);
}

describe('validateDiagram', () => {
  it('accepts a well-formed spec', () => {
    expect(validateDiagram(registry, wellFormed).ok).toBe(true);
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
    expect(error?.kind === 'unknown_node_type' && error.known).toEqual(['client', 'transform', 'gate']);
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
        edges: [{ id: 'e1', type: 'flow', source: 'a', target: 'ghost' }],
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
    ).toEqual(['unknown_node_type', 'invalid_detail', 'duplicate_node_id', 'unknown_line', 'unknown_edge_type']);
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
              edges: [{ id: 'x', type: 'flow', source: 'inner', target: 'outer' }],
            },
          },
        ],
        edges: [],
      }),
    ).toEqual(['unresolved_endpoint']);
  });

  it('rejects a schema that returns a promise', () => {
    const asyncRegistry = defineRegistry({
      nodeTypes: { client: { label: 'Client', detail: asyncSchema, shape: 'stadium', isRouter: false } },
      edgeTypes: { flow: { label: 'Flow', detail: anything } },
    });
    const result = validateDiagram(asyncRegistry, { nodes: [{ id: 'a', type: 'client', label: 'x' }], edges: [] });
    if (result.ok) throw new Error('expected rejection');
    expect(result.error[0]?.kind).toBe('async_schema');
  });

  it('catches a schema that throws rather than letting it escape', () => {
    const throwingRegistry = defineRegistry({
      nodeTypes: { client: { label: 'Client', detail: throwingSchema, shape: 'stadium', isRouter: false } },
      edgeTypes: { flow: { label: 'Flow', detail: anything } },
    });
    const result = validateDiagram(throwingRegistry, { nodes: [{ id: 'a', type: 'client', label: 'x' }], edges: [] });
    if (result.ok) throw new Error('expected rejection');
    const [error] = result.error;
    expect(error?.kind === 'schema_threw' && error.message).toBe('refinement exploded');
  });

  it('catches a throwing edge schema too', () => {
    const throwingRegistry = defineRegistry({
      nodeTypes: { client: { label: 'Client', detail: anything, shape: 'stadium', isRouter: false } },
      edgeTypes: { flow: { label: 'Flow', detail: throwingSchema } },
    });
    const result = validateDiagram(throwingRegistry, {
      nodes: [
        { id: 'a', type: 'client', label: 'A' },
        { id: 'b', type: 'client', label: 'B' },
      ],
      edges: [{ id: 'e1', type: 'flow', source: 'a', target: 'b' }],
    });
    if (result.ok) throw new Error('expected rejection');
    expect(result.error[0]?.kind).toBe('schema_threw');
  });

  it('keeps collecting after a throwing schema rather than aborting the pass', () => {
    const throwingRegistry = defineRegistry({
      nodeTypes: {
        boom: { label: 'Boom', detail: throwingSchema, shape: 'rect', isRouter: false },
        client: { label: 'Client', detail: anything, shape: 'stadium', isRouter: false },
      },
      edgeTypes: { flow: { label: 'Flow', detail: anything } },
    });
    const result = validateDiagram(throwingRegistry, {
      nodes: [
        { id: 'a', type: 'boom', label: 'A' },
        { id: 'b', type: 'wormhole', label: 'B' },
      ],
      edges: [],
    });
    if (result.ok) throw new Error('expected rejection');
    expect(result.error.map((error) => error.kind)).toEqual(['schema_threw', 'unknown_node_type']);
  });
});

describe('branching is router-only', () => {
  const fanOut = (sourceType: string): DiagramSpec => ({
    nodes: [
      { id: 'src', type: sourceType, label: 'Source' },
      { id: 'a', type: 'client', label: 'A' },
      { id: 'b', type: 'client', label: 'B' },
    ],
    edges: [
      { id: 'e1', type: 'flow', source: 'src', target: 'a' },
      { id: 'e2', type: 'log', source: 'src', target: 'b' },
    ],
  });

  it('rejects a fan-out from a node whose type does not route', () => {
    expect(errorKinds(fanOut('client'))).toEqual(['illegal_branch']);
  });

  it('reports how many targets the offending node fanned out to', () => {
    const result = validateDiagram(registry, fanOut('client'));
    if (result.ok) throw new Error('expected rejection');
    const [error] = result.error;
    expect(error?.kind === 'illegal_branch' && error.outgoing).toBe(2);
  });

  it('accepts the same fan-out from a router', () => {
    expect(validateDiagram(registry, fanOut('gate')).ok).toBe(true);
  });

  it('accepts a single outgoing edge from a non-router', () => {
    expect(validateDiagram(registry, wellFormed).ok).toBe(true);
  });

  it('accepts a non-router with no outgoing edges, since sinks are ordinary', () => {
    expect(
      validateDiagram(registry, {
        nodes: [
          { id: 'a', type: 'client', label: 'A' },
          { id: 'b', type: 'client', label: 'B' },
        ],
        edges: [{ id: 'e1', type: 'flow', source: 'a', target: 'b' }],
      }).ok,
    ).toBe(true);
  });
});

describe('registry discipline', () => {
  const sevenNodeTypes = defineRegistry({
    nodeTypes: Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key) => [
        key,
        { label: key, detail: anything, shape: 'rect' as const, isRouter: false },
      ]),
    ),
    edgeTypes: { flow: { label: 'Flow', detail: anything } },
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

  it('converts a thrown error into a value rather than propagating it', () => {
    expect(() => validateConfig(throwingSchema, {})).not.toThrow();
    const result = validateConfig(throwingSchema, {});
    expect(!result.ok && result.error.kind === 'threw' && result.error.message).toBe('refinement exploded');
  });

  it('describes a non-Error throw', () => {
    const stringThrower = {
      '~standard': {
        version: 1 as const,
        vendor: 'livid-test',
        validate: () => {
          throw 'just a string';
        },
      },
    };
    const result = validateConfig(stringThrower, {});
    expect(!result.ok && result.error.kind === 'threw' && result.error.message).toBe('just a string');
  });
});
