import { describe, expect, it } from 'vitest';

import {
  type DiagramSpec,
  type LaidOutDiagram,
  defineRegistry,
  layout,
  layoutDeep,
  validateDiagram,
} from '../src/index.js';
import { anything } from './helpers.js';

const registry = defineRegistry({
  nodeTypes: {
    client: { label: 'Client', detail: anything, shape: 'stadium', isRouter: false },
    hub: { label: 'Hub', detail: anything, shape: 'circle', isRouter: false },
    store: { label: 'Store', detail: anything, shape: 'cylinder', isRouter: false },
    gate: { label: 'Gate', detail: anything, shape: 'diamond', isRouter: true },
  },
  edgeTypes: {
    flow: { label: 'Flow', detail: anything },
    log: { label: 'Log write', detail: anything },
  },
});

const spec: DiagramSpec = {
  lines: [
    { id: 'response', label: 'Response', color: 'route-1' },
    { id: 'evidence', label: 'Evidence', color: 'route-2' },
  ],
  nodes: [
    { id: 'operator', type: 'client', label: 'Operator', line: 'response' },
    {
      id: 'draft',
      type: 'hub',
      label: 'Draft',
      children: {
        lines: [{ id: 'inner', label: 'Inner', color: 'route-3' }],
        nodes: [
          { id: 'ctx', type: 'store', label: 'Context', line: 'inner' },
          { id: 'call', type: 'hub', label: 'LLM call' },
        ],
        edges: [{ id: 'i1', type: 'flow', source: 'ctx', target: 'call' }],
      },
    },
    { id: 'judge', type: 'gate', label: 'Quality judge' },
    { id: 'customer', type: 'client', label: 'Customer' },
    { id: 'log', type: 'store', label: 'Evidence log', line: 'evidence' },
  ],
  edges: [
    { id: 'e1', type: 'flow', source: 'operator', target: 'draft' },
    { id: 'e2', type: 'flow', source: 'draft', target: 'judge' },
    { id: 'e3', type: 'flow', source: 'judge', target: 'customer' },
    { id: 'e4', type: 'log', source: 'judge', target: 'log' },
  ],
};

function validated(input: DiagramSpec = spec) {
  const result = validateDiagram(registry, input);
  if (!result.ok) throw new Error(result.error.map((error) => error.kind).join(', '));
  return result.value;
}

async function laidOut(input: DiagramSpec = spec, deep = false): Promise<LaidOutDiagram<typeof registry>> {
  const result = await (deep ? layoutDeep : layout)(validated(input));
  if (!result.ok) throw new Error(result.error.map((error) => error.kind).join(', '));
  return result.value;
}

function isAxisAligned(route: readonly { x: number; y: number }[]): boolean {
  for (let i = 1; i < route.length; i += 1) {
    const from = route[i - 1];
    const to = route[i];
    if (from === undefined || to === undefined) continue;
    if (from.x !== to.x && from.y !== to.y) return false;
  }
  return true;
}

describe('layout', () => {
  it('routes every edge segment on an axis', async () => {
    const laid = await laidOut();
    expect(laid.edges.every((edge) => isAxisAligned(edge.route))).toBe(true);
  });

  it('gives every edge a route with both endpoints', async () => {
    const laid = await laidOut();
    expect(laid.edges.every((edge) => edge.route.length >= 2)).toBe(true);
  });

  it('normalizes before laying out, so inherited lines survive', async () => {
    const laid = await laidOut();
    const byId = Object.fromEntries(laid.nodes.map((node) => [node.node.id, node.node.line]));
    expect(byId).toMatchObject({ operator: 'response', draft: 'response', judge: 'response', log: 'evidence' });
  });

  it('propagates a normalization failure instead of laying out', async () => {
    const result = await layout(
      validated({
        lines: [
          { id: 'red', label: 'Red', color: 'c1' },
          { id: 'blue', label: 'Blue', color: 'c2' },
        ],
        nodes: [
          { id: 'a', type: 'client', label: 'A', line: 'red' },
          { id: 'b', type: 'client', label: 'B', line: 'blue' },
        ],
        edges: [{ id: 'e1', type: 'flow', source: 'a', target: 'b' }],
      }),
    );
    expect(!result.ok && result.error[0]?.kind).toBe('illegal_line_change');
  });

  it('gives every node a non-zero box', async () => {
    const laid = await laidOut();
    expect(laid.nodes.every((node) => node.size.width > 0 && node.size.height > 0)).toBe(true);
  });

  it('grows a node box to fit a long label', async () => {
    const laid = await laidOut({
      nodes: [
        { id: 'short', type: 'client', label: 'A' },
        { id: 'long', type: 'client', label: 'A considerably longer station name' },
      ],
      edges: [],
    });
    const short = laid.nodes.find((node) => node.node.id === 'short');
    const long = laid.nodes.find((node) => node.node.id === 'long');
    expect((long?.size.width ?? 0) > (short?.size.width ?? 0)).toBe(true);
  });

  it('keeps circles square regardless of label length', async () => {
    const laid = await laidOut({
      nodes: [
        { id: 'short', type: 'hub', label: 'A' },
        { id: 'long', type: 'hub', label: 'A considerably longer station name' },
      ],
      edges: [],
    });
    const widths = laid.nodes.map((node) => node.size.width);
    expect(widths[0]).toBe(widths[1]);
  });

  it('leaves nested levels unlaid', async () => {
    const laid = await laidOut();
    expect(laid.nodes.every((node) => node.children === null)).toBe(true);
  });
});

describe('layoutDeep', () => {
  it('lays out nested levels too', async () => {
    const laid = await laidOut(spec, true);
    const draft = laid.nodes.find((node) => node.node.id === 'draft');
    expect(draft?.children?.nodes.map((child) => child.node.id)).toEqual(['ctx', 'call']);
  });

  it('routes nested edges orthogonally as well', async () => {
    const laid = await laidOut(spec, true);
    const inner = laid.nodes.find((node) => node.node.id === 'draft')?.children;
    const edge = inner?.edges[0];
    if (edge === undefined) throw new Error('expected a nested edge');
    expect(isAxisAligned(edge.route)).toBe(true);
  });
});
