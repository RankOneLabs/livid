import { describe, expect, it } from 'vitest';

import {
  type AnyRegistry,
  type DiagramSpec,
  type ValidDiagram,
  defineRegistry,
  normalize,
  validateDiagram,
} from '../src/index.js';
import { anything } from './helpers.js';

const registry = defineRegistry({
  nodeTypes: {
    station: { label: 'Station', detail: anything, shape: 'rect', isRouter: false },
    junction: { label: 'Junction', detail: anything, shape: 'diamond', isRouter: true },
  },
  edgeTypes: { flow: { label: 'Flow', detail: anything } },
});

function valid(spec: DiagramSpec): ValidDiagram<typeof registry> {
  const result = validateDiagram(registry, spec);
  if (!result.ok) throw new Error(result.error.map((error) => error.kind).join(', '));
  return result.value;
}

function normalized(spec: DiagramSpec): ValidDiagram<typeof registry> {
  const result = normalize(valid(spec));
  if (!result.ok) throw new Error(result.error.map((error) => error.kind).join(', '));
  return result.value;
}

function normalizeErrors(spec: DiagramSpec): readonly string[] {
  const result = normalize(valid(spec));
  return result.ok ? [] : result.error.map((error) => error.kind);
}

function linesOf<R extends AnyRegistry>(diagram: ValidDiagram<R>): Record<string, string | null> {
  return Object.fromEntries(diagram.nodes.map((node) => [node.id, node.line]));
}

const twoLines = [
  { id: 'red', label: 'Red', color: 'c1' },
  { id: 'blue', label: 'Blue', color: 'c2' },
];

const chain: DiagramSpec = {
  lines: twoLines,
  nodes: [
    { id: 'a', type: 'station', label: 'A', line: 'red' },
    { id: 'b', type: 'station', label: 'B' },
    { id: 'c', type: 'station', label: 'C' },
  ],
  edges: [
    { id: 'e1', type: 'flow', source: 'a', target: 'b' },
    { id: 'e2', type: 'flow', source: 'b', target: 'c' },
  ],
};

describe('line assignment', () => {
  it('propagates a line downstream so only the head of a route needs colouring', () => {
    expect(linesOf(normalized(chain))).toEqual({ a: 'red', b: 'red', c: 'red' });
  });

  it('falls back to the first declared line when nothing flows in', () => {
    expect(linesOf(normalized({ ...chain, nodes: [{ id: 'z', type: 'station', label: 'Z' }], edges: [] }))).toEqual({
      z: 'red',
    });
  });

  it('leaves a node unassigned when the diagram declares no lines at all', () => {
    expect(linesOf(normalized({ nodes: [{ id: 'z', type: 'station', label: 'Z' }], edges: [] }))).toEqual({ z: null });
  });

  it('is idempotent', () => {
    const once = normalized(chain);
    const twice = normalize(once);
    expect(twice.ok && linesOf(twice.value)).toEqual(linesOf(once));
  });

  it('resolves each drill-down level against its own lines', () => {
    const nested = normalized({
      lines: [{ id: 'outer', label: 'Outer', color: 'c1' }],
      nodes: [
        {
          id: 'host',
          type: 'station',
          label: 'Host',
          children: {
            lines: [{ id: 'inner', label: 'Inner', color: 'c2' }],
            nodes: [
              { id: 'x', type: 'station', label: 'X', line: 'inner' },
              { id: 'y', type: 'station', label: 'Y' },
            ],
            edges: [{ id: 'i1', type: 'flow', source: 'x', target: 'y' }],
          },
        },
      ],
      edges: [],
    });

    const host = nested.nodes[0];
    if (host?.children == null) throw new Error('expected a nested level');
    expect(host.line).toBe('outer');
    expect(linesOf(host.children)).toEqual({ x: 'inner', y: 'inner' });
  });
});

describe('a line may only change at a router', () => {
  const crossing = (sourceType: string): DiagramSpec => ({
    lines: twoLines,
    nodes: [
      { id: 'a', type: sourceType, label: 'A', line: 'red' },
      { id: 'b', type: 'station', label: 'B', line: 'blue' },
    ],
    edges: [{ id: 'e1', type: 'flow', source: 'a', target: 'b' }],
  });

  it('rejects a change across an ordinary node', () => {
    expect(normalizeErrors(crossing('station'))).toEqual(['illegal_line_change']);
  });

  it('reports which lines the rejected change ran between', () => {
    const result = normalize(valid(crossing('station')));
    if (result.ok) throw new Error('expected rejection');
    const [error] = result.error;
    expect(error?.kind === 'illegal_line_change' && [error.fromLine, error.toLine]).toEqual(['red', 'blue']);
  });

  it('accepts the same change at a router', () => {
    expect(normalizeErrors(crossing('junction'))).toEqual([]);
  });

  it('permits a router to pass straight through without changing line', () => {
    expect(
      normalizeErrors({
        lines: twoLines,
        nodes: [
          { id: 'a', type: 'junction', label: 'A', line: 'red' },
          { id: 'b', type: 'station', label: 'B' },
        ],
        edges: [{ id: 'e1', type: 'flow', source: 'a', target: 'b' }],
      }),
    ).toEqual([]);
  });

  it('catches a change inside a nested level and reports its path', () => {
    const result = normalize(
      valid({
        lines: [{ id: 'outer', label: 'Outer', color: 'c1' }],
        nodes: [
          {
            id: 'host',
            type: 'station',
            label: 'Host',
            children: {
              lines: twoLines,
              nodes: [
                { id: 'x', type: 'station', label: 'X', line: 'red' },
                { id: 'y', type: 'station', label: 'Y', line: 'blue' },
              ],
              edges: [{ id: 'i1', type: 'flow', source: 'x', target: 'y' }],
            },
          },
        ],
        edges: [],
      }),
    );
    if (result.ok) throw new Error('expected rejection');
    expect(result.error[0]?.kind === 'illegal_line_change' && result.error[0].path).toEqual(['host']);
  });

  it('does not fire when inheritance puts both ends on the same line', () => {
    expect(normalizeErrors(chain)).toEqual([]);
  });
});
