import { beforeAll, describe, expect, it } from 'vitest';
import type { DiagramSpec, LaidOutDiagram, StandardSchemaV1 } from '@rankonelabs/livid-core';
import { defineRegistry, layout, validateDiagram, validateState } from '@rankonelabs/livid-core';
import { toReactDiagram } from '../src/index.js';

const anything: StandardSchemaV1<unknown, unknown> = { '~standard': { version: 1, vendor: 'livid-react-test', validate: (value) => ({ value }) } };
const registry = defineRegistry({
  nodeTypes: { unit: { label: 'Unit', detail: anything, shape: 'rect', glyph: 'dot', isRouter: false, states: { active: { tint: 'accent', anim: 'pulse' } } } },
  edgeTypes: { flow: { label: 'Flow', detail: anything, states: { blocked: { tint: 'danger', anim: 'stall' } } } },
});
const spec: DiagramSpec = {
  nodes: [{ id: 'a', type: 'unit', label: 'Alpha' }, { id: 'b', type: 'unit', label: 'Beta' }],
  edges: [{ id: 'a-b', type: 'flow', source: 'a', target: 'b' }],
};
const emptyChild: DiagramSpec = { nodes: [], edges: [] };
let diagram: LaidOutDiagram<typeof registry>;

beforeAll(async () => {
  const valid = validateDiagram(registry, spec);
  if (!valid.ok) throw new Error(JSON.stringify(valid.error));
  const result = await layout(valid.value);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  diagram = result.value;
});

describe('React renderer model', () => {
  it('uses the exact node geometry computed by core', () => {
    const model = toReactDiagram(diagram, { __brand: 'StateFrame', nodes: {}, edges: {} });
    expect(model.nodes.map(({ id, position, width, height }) => ({ id, position, width, height }))).toEqual(
      diagram.nodes.map(({ node, position, size }) => ({ id: node.id, position, width: size.width, height: size.height })),
    );
  });

  it('extends fit bounds to include labels beside fixed-width shapes', async () => {
    const fixedRegistry = defineRegistry({
      nodeTypes: {
        point: { label: 'Point', detail: anything, shape: 'circle', glyph: 'dot', isRouter: false },
      },
      edgeTypes: {},
    });
    const valid = validateDiagram(fixedRegistry, {
      nodes: [{ id: 'point', type: 'point', label: 'A long label outside the circle' }],
      edges: [],
    });
    if (!valid.ok) throw new Error(JSON.stringify(valid.error));
    const laid = await layout(valid.value);
    if (!laid.ok) throw new Error(JSON.stringify(laid.error));

    const model = toReactDiagram(laid.value, { __brand: 'StateFrame', nodes: {}, edges: {} });
    expect(model.width).toBeGreaterThan(laid.value.bounds.width);
  });

  it('uses the exact orthogonal edge routes computed by core', () => {
    const model = toReactDiagram(diagram, { __brand: 'StateFrame', nodes: {}, edges: {} });
    expect(model.edges[0]?.data.route).toEqual(diagram.edges[0]?.route);
  });

  it('maps the same closed state visuals declared by the registry', () => {
    const valid = validateDiagram(registry, spec);
    if (!valid.ok) throw new Error(JSON.stringify(valid.error));
    const frame = validateState(registry, valid.value, { nodes: { a: 'active' }, edges: { 'a-b': 'blocked' } });
    if (!frame.ok) throw new Error(JSON.stringify(frame.error));
    const model = toReactDiagram(diagram, frame.value);
    expect({ node: model.nodes[0]?.data, edge: model.edges[0]?.data }).toMatchObject({
      node: { tint: 'accent', animation: 'pulse' },
      edge: { tint: 'danger', animation: 'stall' },
    });
  });

  it('projects child availability from shallow-layout child state', async () => {
    const valid = validateDiagram(registry, {
      nodes: [
        { id: 'embedded', type: 'unit', label: 'Embedded', childState: { kind: 'embedded', diagram: emptyChild } },
        { id: 'deferred', type: 'unit', label: 'Deferred', childState: { kind: 'deferred', key: 'later' } },
        { id: 'leaf', type: 'unit', label: 'Leaf' },
      ],
      edges: [],
    });
    if (!valid.ok) throw new Error(JSON.stringify(valid.error));
    const laid = await layout(valid.value);
    if (!laid.ok) throw new Error(JSON.stringify(laid.error));

    const nodes = toReactDiagram(laid.value, { __brand: 'StateFrame', nodes: {}, edges: {} }).nodes;
    expect(nodes.map(({ data }) => ({ hasChildren: data.hasChildren, childState: data.childState }))).toEqual([
      { hasChildren: true, childState: { kind: 'embedded' } },
      { hasChildren: true, childState: { kind: 'deferred', key: 'later' } },
      { hasChildren: false, childState: { kind: 'leaf' } },
    ]);
  });

  it('projects arrowheads for dependency diagrams and explicit direction only', async () => {
    const dependencyValid = validateDiagram(registry, { ...spec, profile: 'dependency' });
    if (!dependencyValid.ok) throw new Error(JSON.stringify(dependencyValid.error));
    const dependencyLaid = await layout(dependencyValid.value);
    if (!dependencyLaid.ok) throw new Error(JSON.stringify(dependencyLaid.error));

    expect(toReactDiagram(dependencyLaid.value, { __brand: 'StateFrame', nodes: {}, edges: {} }).edges[0]?.markerEnd).toBe('arrowclosed');
    expect(toReactDiagram(diagram, { __brand: 'StateFrame', nodes: {}, edges: {} }).edges[0]?.markerEnd).toBeUndefined();
    expect(toReactDiagram(diagram, { __brand: 'StateFrame', nodes: {}, edges: {} }, { showDirection: true }).edges[0]?.markerEnd).toBe('arrowclosed');
  });

  it('projects edge label text and exact core geometry', async () => {
    const valid = validateDiagram(registry, {
      ...spec,
      edges: [{ id: 'a-b', type: 'flow', source: 'a', target: 'b', label: 'payload' }],
    });
    if (!valid.ok) throw new Error(JSON.stringify(valid.error));
    const laid = await layout(valid.value);
    if (!laid.ok) throw new Error(JSON.stringify(laid.error));

    expect(toReactDiagram(laid.value, { __brand: 'StateFrame', nodes: {}, edges: {} }).edges[0]?.data.label).toEqual({
      text: 'payload',
      ...laid.value.edges[0]?.label,
    });
    expect(toReactDiagram(diagram, { __brand: 'StateFrame', nodes: {}, edges: {} }).edges[0]?.data.label).toBeNull();
  });
});
