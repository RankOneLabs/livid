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
});
