import { useMemo } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type { AnyRegistry, LaidOutDiagram, StateFrame } from '@rankonelabs/livid-core';

import { toReactDiagram, type ReactEdgeData, type ReactNodeData } from './model.js';

export type DiagramSelection =
  | { readonly kind: 'node'; readonly id: string; readonly detail: unknown }
  | { readonly kind: 'edge'; readonly id: string; readonly detail: unknown };

export interface LividDiagramProps<R extends AnyRegistry> {
  readonly diagram: LaidOutDiagram<R>;
  readonly frame: StateFrame;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly fitView?: boolean;
  readonly interactive?: boolean;
  readonly onSelect?: (selection: DiagramSelection) => void;
  readonly onDescend?: (nodeId: string, child: LaidOutDiagram<R>) => void;
}

type LividNode = Node<ReactNodeData, 'lividNode'>;
type LividEdge = Edge<ReactEdgeData, 'lividEdge'>;

function DiagramNode({ data }: NodeProps<LividNode>) {
  return <div
    className="livid-react-node"
    data-shape={data.shape}
    data-tint={data.tint ?? undefined}
    data-anim={data.animation ?? undefined}
    title={`${data.label} — ${data.typeLabel}`}
  >
    <Handle type="target" position={Position.Left} />
    <span className="livid-react-glyph" data-glyph={data.glyph} aria-hidden="true" />
    <span>{data.label}</span>
    {data.hasChildren && <span className="livid-react-descend" aria-hidden="true">⌄</span>}
    <Handle type="source" position={Position.Right} />
  </div>;
}

function routePath(route: readonly { readonly x: number; readonly y: number }[]): string {
  const first = route[0];
  return first === undefined ? '' : `M ${first.x} ${first.y}${route.slice(1).map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}

function DiagramEdge({ data, markerEnd, style }: EdgeProps<LividEdge>) {
  if (data === undefined) return null;
  return <BaseEdge
    path={routePath(data.route)}
    {...(markerEnd === undefined ? {} : { markerEnd })}
    {...(style === undefined ? {} : { style })}
    className="livid-react-edge"
    data-tint={data.tint ?? undefined}
    data-anim={data.animation ?? undefined}
  />;
}

const nodeTypes = { lividNode: DiagramNode };
const edgeTypes = { lividEdge: DiagramEdge };

function Canvas<R extends AnyRegistry>({
  diagram,
  frame,
  className,
  ariaLabel = 'Interactive diagram',
  fitView = true,
  interactive = true,
  onSelect,
  onDescend,
}: LividDiagramProps<R>) {
  const model = useMemo(() => toReactDiagram(diagram, frame), [diagram, frame]);
  const nodes = useMemo<LividNode[]>(() => model.nodes.map((node) => ({
    ...node,
    type: 'lividNode',
    draggable: false,
    selectable: interactive,
  })), [interactive, model.nodes]);
  const edges = useMemo<LividEdge[]>(() => model.edges.map((edge) => ({
    ...edge,
    type: 'lividEdge',
    selectable: interactive,
  })), [interactive, model.edges]);

  return <div className={`livid-react${className === undefined ? '' : ` ${className}`}`} role="application" aria-label={ariaLabel}>
    <ReactFlow<LividNode, LividEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={interactive}
      panOnDrag={interactive}
      zoomOnScroll={interactive}
      fitView={fitView}
      onNodeClick={(_, node) => onSelect?.({ kind: 'node', id: node.id, detail: node.data.detail })}
      onEdgeClick={(_, edge) => onSelect?.({ kind: 'edge', id: edge.id, detail: edge.data?.detail })}
      onNodeDoubleClick={(_, node) => {
        const child = diagram.nodes.find((placed) => placed.node.id === node.id)?.children;
        if (child !== null && child !== undefined) onDescend?.(node.id, child);
      }}
    >
      <Background gap={24} size={1} />
      {interactive && <Controls showInteractive={false} />}
    </ReactFlow>
  </div>;
}

export function LividDiagram<R extends AnyRegistry>(props: LividDiagramProps<R>) {
  return <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>;
}
