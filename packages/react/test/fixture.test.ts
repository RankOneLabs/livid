import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  layout,
  validateDiagram,
  type EdgeId,
  type LaidOutDiagram,
  type NodeId,
  type StateFrame,
} from '@rankonelabs/livid-core';

interface CapturedNode {
  readonly data: {
    readonly entityId: NodeId;
    readonly detail: unknown;
    readonly requestDescend?: unknown;
  };
}

interface CapturedEdge {
  readonly data?: { readonly entityId: EdgeId; readonly detail: unknown };
}

interface CapturedFlowProps {
  readonly nodes: readonly CapturedNode[];
  readonly edges: readonly CapturedEdge[];
  readonly onNodeClick?: (event: unknown, node: CapturedNode) => void;
  readonly onEdgeClick?: (event: unknown, edge: CapturedEdge) => void;
  readonly onPaneClick?: (event: unknown) => void;
  readonly onNodeDoubleClick?: (event: unknown, node: CapturedNode) => void;
}

const flowCapture = vi.hoisted<{ props: CapturedFlowProps | null }>(() => ({ props: null }));

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: (props: CapturedFlowProps) => {
      flowCapture.props = props;
      return null;
    },
    useReactFlow: () => ({
      fitView: async () => true,
      fitBounds: async () => true,
      getZoom: () => 1,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setCenter: async () => true,
      setViewport: async () => true,
    }),
  };
});

import { svLividRegistry, SV_LIVID_VALIDATE_OPTIONS } from '../../../fixtures/sv-livid-v1/registry.js';
import { svLividV1Spec } from '../../../fixtures/sv-livid-v1/spec.js';
import { LividDiagram, toReactDiagram, type DiagramSelection } from '../src/index.js';

const emptyFrame: StateFrame = { __brand: 'StateFrame', nodes: {}, edges: {} };

async function fixtureModel() {
  const withSelfLoop = {
    ...svLividV1Spec,
    edges: [
      ...svLividV1Spec.edges,
      { id: 'core-self', type: 'call', source: 'core', target: 'core', detail: { operation: 'revalidate' } },
    ],
  };
  const valid = validateDiagram(svLividRegistry, withSelfLoop, SV_LIVID_VALIDATE_OPTIONS);
  if (!valid.ok) throw new Error(valid.error.map((error) => error.kind).join(', '));
  const laid = await layout(valid.value);
  if (!laid.ok) throw new Error(laid.error.map((error) => error.kind).join(', '));
  return toReactDiagram(laid.value, emptyFrame);
}

async function fixtureDiagram(): Promise<LaidOutDiagram<typeof svLividRegistry>> {
  const valid = validateDiagram(svLividRegistry, svLividV1Spec, SV_LIVID_VALIDATE_OPTIONS);
  if (!valid.ok) throw new Error(valid.error.map((error) => error.kind).join(', '));
  const laid = await layout(valid.value);
  if (!laid.ok) throw new Error(laid.error.map((error) => error.kind).join(', '));
  return laid.value;
}

function renderSelectionHarness(
  diagram: LaidOutDiagram<typeof svLividRegistry>,
  onSelectionChange: (selection: DiagramSelection | null) => void,
  selection: DiagramSelection | null = null,
): CapturedFlowProps {
  flowCapture.props = null;
  renderToStaticMarkup(createElement(LividDiagram<typeof svLividRegistry>, {
    diagram,
    frame: emptyFrame,
    selection,
    onSelectionChange,
  }));
  if (flowCapture.props === null) throw new Error('expected ReactFlow props to be captured');
  return flowCapture.props;
}

function renderNonInteractiveHarness(
  diagram: LaidOutDiagram<typeof svLividRegistry>,
  onDescendRequest: () => void,
): CapturedFlowProps {
  flowCapture.props = null;
  renderToStaticMarkup(createElement(LividDiagram<typeof svLividRegistry>, {
    diagram,
    frame: emptyFrame,
    interactive: false,
    onDescendRequest,
  }));
  if (flowCapture.props === null) throw new Error('expected ReactFlow props to be captured');
  return flowCapture.props;
}

describe('React SV-Livid fixture projection', () => {
  it('keeps parallel edges independently identifiable with their own detail', async () => {
    const model = await fixtureModel();
    const parallel = model.edges.filter((edge) => edge.source === 'core' && edge.target === 'elk');

    expect(parallel.map((edge) => edge.id)).toEqual(['core-elk-import', 'core-elk-dependency']);
    expect(parallel.map((edge) => edge.data.detail)).toEqual([
      null,
      { package: 'elkjs', relation: 'runtime' },
    ]);
  });

  it('projects a self-loop route without collapsing its identity', async () => {
    const model = await fixtureModel();
    const selfLoop = model.edges.find((edge) => edge.id === 'core-self');

    expect(selfLoop).toMatchObject({ id: 'core-self', source: 'core', target: 'core' });
    expect(selfLoop?.data.route.length).toBeGreaterThan(1);
  });
});

describe('controlled selection dispatch', () => {
  it('reports node clicks, edge clicks, and pane clearing', async () => {
    const onSelectionChange = vi.fn<(selection: DiagramSelection | null) => void>();
    const props = renderSelectionHarness(await fixtureDiagram(), onSelectionChange);
    const node = props.nodes[0];
    const edge = props.edges[0];
    if (node === undefined || edge === undefined) throw new Error('expected fixture entities');

    props.onNodeClick?.({}, node);
    props.onEdgeClick?.({}, edge);
    props.onPaneClick?.({});

    expect(onSelectionChange.mock.calls).toEqual([
      [{ kind: 'node', id: node.data.entityId, detail: node.data.detail }],
      [{ kind: 'edge', id: edge.data?.entityId, detail: edge.data?.detail }],
      [null],
    ]);
  });

  it('does not notify again when the host echoes selection', async () => {
    const diagram = await fixtureDiagram();
    const onSelectionChange = vi.fn<(selection: DiagramSelection | null) => void>();
    const props = renderSelectionHarness(diagram, onSelectionChange);
    const node = props.nodes[0];
    if (node === undefined) throw new Error('expected a fixture node');

    props.onNodeClick?.({}, node);
    renderSelectionHarness(diagram, onSelectionChange, {
      kind: 'node',
      id: node.data.entityId,
      detail: node.data.detail,
    });

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });
});

describe('interaction controls', () => {
  it('does not expose or request descent when interaction is disabled', async () => {
    const diagram = await fixtureDiagram();
    const onDescendRequest = vi.fn();
    const props = renderNonInteractiveHarness(diagram, onDescendRequest);
    const embedded = props.nodes.find((node) => node.data.entityId === 'core');
    if (embedded === undefined) throw new Error('expected embedded fixture node');

    props.onNodeDoubleClick?.({}, embedded);

    expect(embedded.data.requestDescend).toBeUndefined();
    expect(onDescendRequest).not.toHaveBeenCalled();
  });
});
