import { describe, expect, it } from 'vitest';

import { type DiagramSpec, type Point, defineRegistry, layout, layoutDeep, validateDiagram } from '../src/index.js';
import { anything } from './helpers.js';

const registry = defineRegistry({
  nodeTypes: {
    client: { label: 'Client', detail: anything, shape: 'stadium' },
    hub: { label: 'Hub', detail: anything, shape: 'circle' },
    store: { label: 'Store', detail: anything, shape: 'cylinder' },
  },
  edgeTypes: {
    plain: { label: 'Flow', detail: anything, marker: 'none', branching: false },
    gated: { label: 'Gate', detail: anything, marker: 'checkpoint', branching: true },
  },
});

const spec: DiagramSpec = {
  lines: [{ id: 'main', label: 'Main', color: 'route-1' }],
  nodes: [
    { id: 'operator', type: 'client', label: 'Operator', line: 'main' },
    {
      id: 'draft',
      type: 'hub',
      label: 'Draft',
      children: {
        lines: [{ id: 'inner', label: 'Inner', color: 'route-2' }],
        nodes: [
          { id: 'ctx', type: 'store', label: 'Context', line: 'inner' },
          { id: 'model', type: 'hub', label: 'LLM call' },
        ],
        edges: [{ id: 'i1', type: 'plain', source: 'ctx', target: 'model' }],
      },
    },
    { id: 'evidence', type: 'store', label: 'Evidence log' },
    { id: 'customer', type: 'client', label: 'Customer' },
  ],
  edges: [
    { id: 'e1', type: 'plain', source: 'operator', target: 'draft' },
    { id: 'e2', type: 'gated', source: 'draft', target: 'customer' },
    { id: 'e3', type: 'plain', source: 'draft', target: 'evidence' },
  ],
};

function validated(input: DiagramSpec = spec) {
  const result = validateDiagram(registry, input);
  if (!result.ok) throw new Error(result.error.map((error) => error.kind).join(', '));
  return result.value;
}

function lengthAlong(route: readonly Point[], upTo: number): number {
  let total = 0;
  for (let i = 1; i <= upTo; i += 1) {
    const from = route[i - 1];
    const to = route[i];
    if (from === undefined || to === undefined) continue;
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return total;
}

/** Distance travelled along `route` to reach `point`, which must lie on it. */
function distanceToPoint(route: readonly Point[], point: Point): number {
  for (let i = 1; i < route.length; i += 1) {
    const from = route[i - 1];
    const to = route[i];
    if (from === undefined || to === undefined) continue;

    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    const toPoint = Math.hypot(point.x - from.x, point.y - from.y);
    const fromPoint = Math.hypot(to.x - point.x, to.y - point.y);
    if (Math.abs(toPoint + fromPoint - segment) < 0.001) {
      return lengthAlong(route, i - 1) + toPoint;
    }
  }
  throw new Error('point does not lie on the route');
}

describe('layout', () => {
  it('routes every edge segment on an axis', async () => {
    const laid = await layout(validated());
    for (const edge of laid.edges) {
      for (let i = 1; i < edge.route.length; i += 1) {
        const from = edge.route[i - 1];
        const to = edge.route[i];
        expect(from?.x === to?.x || from?.y === to?.y).toBe(true);
      }
    }
  });

  it('gives every edge a route with both endpoints', async () => {
    const laid = await layout(validated());
    for (const edge of laid.edges) {
      expect(edge.route.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('marks only edge types that declare a marker', async () => {
    const laid = await layout(validated());
    const marked = laid.edges.filter((edge) => edge.markerAt !== null).map((edge) => edge.edge.id);
    expect(marked).toEqual(['e2']);
  });

  it('places the marker at the halfway point by travelled distance', async () => {
    const laid = await layout(validated());
    const gated = laid.edges.find((edge) => edge.edge.id === 'e2');
    if (gated?.markerAt == null) throw new Error('expected a marker');

    const total = lengthAlong(gated.route, gated.route.length - 1);
    expect(distanceToPoint(gated.route, gated.markerAt)).toBeCloseTo(total / 2, 3);
  });

  it('normalizes before laying out, so inherited lines survive', async () => {
    const laid = await layout(validated());
    expect(laid.nodes.every((node) => node.node.line === 'main')).toBe(true);
  });

  it('gives every node a non-zero box', async () => {
    const laid = await layout(validated());
    for (const node of laid.nodes) {
      expect(node.size.width).toBeGreaterThan(0);
      expect(node.size.height).toBeGreaterThan(0);
    }
  });

  it('grows a node box to fit a long label', async () => {
    const laid = await layout(
      validated({
        nodes: [
          { id: 'short', type: 'client', label: 'A' },
          { id: 'long', type: 'client', label: 'A considerably longer station name' },
        ],
        edges: [],
      }),
    );
    const short = laid.nodes.find((node) => node.node.id === 'short');
    const long = laid.nodes.find((node) => node.node.id === 'long');
    expect((long?.size.width ?? 0) > (short?.size.width ?? 0)).toBe(true);
  });

  it('keeps circles square regardless of label length', async () => {
    const laid = await layout(
      validated({
        nodes: [
          { id: 'short', type: 'hub', label: 'A' },
          { id: 'long', type: 'hub', label: 'A considerably longer station name' },
        ],
        edges: [],
      }),
    );
    const widths = laid.nodes.map((node) => node.size.width);
    expect(widths[0]).toBe(widths[1]);
  });

  it('leaves nested levels unlaid', async () => {
    const laid = await layout(validated());
    expect(laid.nodes.every((node) => node.children === null)).toBe(true);
  });
});

describe('layoutDeep', () => {
  it('lays out nested levels too', async () => {
    const laid = await layoutDeep(validated());
    const draft = laid.nodes.find((node) => node.node.id === 'draft');
    expect(draft?.children?.nodes.map((child) => child.node.id)).toEqual(['ctx', 'model']);
  });

  it('routes nested edges orthogonally as well', async () => {
    const laid = await layoutDeep(validated());
    const inner = laid.nodes.find((node) => node.node.id === 'draft')?.children;
    const edge = inner?.edges[0];
    if (edge === undefined) throw new Error('expected a nested edge');

    for (let i = 1; i < edge.route.length; i += 1) {
      const from = edge.route[i - 1];
      const to = edge.route[i];
      expect(from?.x === to?.x || from?.y === to?.y).toBe(true);
    }
  });
});
