import { describe, expect, it } from 'vitest';

import { type AnyRegistry, type DiagramSpec, type ValidDiagram, defineRegistry, normalize, validateDiagram } from '../src/index.js';
import { anything } from './helpers.js';

const registry = defineRegistry({
  nodeTypes: { station: { label: 'Station', detail: anything, shape: 'rect' } },
  edgeTypes: { plain: { label: 'Flow', detail: anything, marker: 'none', branching: false } },
});

function valid(spec: DiagramSpec): ValidDiagram<typeof registry> {
  const result = validateDiagram(registry, spec);
  if (!result.ok) throw new Error(result.error.map((error) => error.kind).join(', '));
  return result.value;
}

function linesOf<R extends AnyRegistry>(diagram: ValidDiagram<R>): Record<string, string | null> {
  return Object.fromEntries(diagram.nodes.map((node) => [node.id, node.line]));
}

const chain: DiagramSpec = {
  lines: [
    { id: 'red', label: 'Red', color: 'c1' },
    { id: 'blue', label: 'Blue', color: 'c2' },
  ],
  nodes: [
    { id: 'a', type: 'station', label: 'A', line: 'red' },
    { id: 'b', type: 'station', label: 'B' },
    { id: 'c', type: 'station', label: 'C' },
  ],
  edges: [
    { id: 'e1', type: 'plain', source: 'a', target: 'b' },
    { id: 'e2', type: 'plain', source: 'b', target: 'c' },
  ],
};

describe('normalize', () => {
  it('propagates a line downstream so only the head of a route needs colouring', () => {
    expect(linesOf(normalize(valid(chain)))).toEqual({ a: 'red', b: 'red', c: 'red' });
  });

  it('leaves an explicitly declared line untouched', () => {
    const branched = normalize(
      valid({
        ...chain,
        nodes: [
          { id: 'a', type: 'station', label: 'A', line: 'red' },
          { id: 'b', type: 'station', label: 'B', line: 'blue' },
          { id: 'c', type: 'station', label: 'C' },
        ],
      }),
    );
    expect(linesOf(branched)).toEqual({ a: 'red', b: 'blue', c: 'blue' });
  });

  it('falls back to the first declared line when nothing flows in', () => {
    const orphan = normalize(valid({ ...chain, nodes: [{ id: 'z', type: 'station', label: 'Z' }], edges: [] }));
    expect(linesOf(orphan)).toEqual({ z: 'red' });
  });

  it('leaves a node unassigned when the diagram declares no lines at all', () => {
    const unlined = normalize(valid({ nodes: [{ id: 'z', type: 'station', label: 'Z' }], edges: [] }));
    expect(linesOf(unlined)).toEqual({ z: null });
  });

  it('is idempotent', () => {
    const once = normalize(valid(chain));
    expect(linesOf(normalize(once))).toEqual(linesOf(once));
  });

  it('resolves each drill-down level against its own lines', () => {
    const nested = normalize(
      valid({
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
              edges: [{ id: 'i1', type: 'plain', source: 'x', target: 'y' }],
            },
          },
        ],
        edges: [],
      }),
    );

    const host = nested.nodes[0];
    if (host?.children == null) throw new Error('expected a nested level');
    expect(host.line).toBe('outer');
    expect(linesOf(host.children)).toEqual({ x: 'inner', y: 'inner' });
  });
});
