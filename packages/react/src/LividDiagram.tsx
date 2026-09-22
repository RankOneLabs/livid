import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
} from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type Viewport,
  type ViewportHelperFunctionOptions,
} from '@xyflow/react';
import type {
  AnyRegistry,
  ChildState,
  EdgeId,
  LaidOutDiagram,
  NodeId,
  Point,
  Result,
  StateFrame,
} from '@rankonelabs/livid-core';

import { toReactDiagram, type ReactEdgeData, type ReactNodeData } from './model.js';

export type DiagramSelection =
  | { readonly kind: 'node'; readonly id: NodeId; readonly detail: unknown }
  | { readonly kind: 'edge'; readonly id: EdgeId; readonly detail: unknown };

export type DiagramFocus =
  | { readonly kind: 'node'; readonly id: NodeId }
  | { readonly kind: 'edge'; readonly id: EdgeId };

export type DescendChildState = Exclude<ChildState, { readonly kind: 'leaf' }>;

export interface DescendRequest {
  readonly nodeId: NodeId;
  readonly childState: DescendChildState;
}

export interface FocusMissing {
  readonly kind: 'focusMissing';
  readonly focus: DiagramFocus;
}

export type FocusResult = Result<DiagramFocus, FocusMissing>;

export interface LividDiagramHandle {
  readonly getViewport: () => Viewport;
  readonly setViewport: (
    viewport: Viewport,
    options?: ViewportHelperFunctionOptions,
  ) => Promise<boolean>;
}

export interface LividDiagramProps<R extends AnyRegistry> {
  readonly diagram: LaidOutDiagram<R>;
  readonly frame: StateFrame;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly fitView?: boolean;
  readonly fitOnReplace?: boolean;
  readonly showDirection?: boolean;
  readonly interactive?: boolean;
  readonly selection?: DiagramSelection | null;
  readonly onSelectionChange?: (selection: DiagramSelection | null) => void;
  readonly focus?: DiagramFocus | null;
  readonly onFocusResult?: (result: FocusResult) => void;
  readonly onSelect?: (selection: DiagramSelection) => void;
  readonly onDescendRequest?: (request: DescendRequest) => void;
  /** @deprecated Prefer onDescendRequest, which also supports deferred children. */
  readonly onDescend?: (nodeId: NodeId, child: LaidOutDiagram<R>) => void;
}

interface LividNodeData extends ReactNodeData {
  readonly requestDescend?: (request: DescendRequest) => void;
}

type LividNode = Node<LividNodeData, 'lividNode'>;
type LividEdge = Edge<ReactEdgeData, 'lividEdge'>;

function descendRequestOf(data: LividNodeData): DescendRequest | null {
  return data.childState.kind === 'leaf'
    ? null
    : { nodeId: data.entityId, childState: data.childState };
}

function DiagramNode({ data }: NodeProps<LividNode>) {
  const labelIsBeside = data.shape === 'circle' || data.shape === 'diamond';
  const descendRequest = descendRequestOf(data);
  return <div
    className="livid-react-node"
    data-shape={data.shape}
    data-tint={data.tint ?? undefined}
    data-anim={data.animation ?? undefined}
    title={`${data.label} — ${data.typeLabel}`}
  >
    <Handle type="target" position={Position.Left} />
    <span className="livid-react-shape">
      <span className="livid-react-glyph" data-glyph={data.glyph} aria-hidden="true" />
      {!labelIsBeside && <span className="livid-react-label">{data.label}</span>}
    </span>
    {labelIsBeside && <>
      <span className="livid-react-leader" aria-hidden="true" />
      <span className="livid-react-label livid-react-label-beside">{data.label}</span>
    </>}
    {descendRequest !== null && <button
      type="button"
      className="livid-react-descend nodrag nopan"
      aria-label={`Descend into ${data.label}`}
      onClick={(event) => {
        event.stopPropagation();
        // A pointer double-click dispatches two click events. The first click
        // requests descent; ignore the second. Keyboard clicks have detail 0.
        if (event.detail > 1) return;
        data.requestDescend?.(descendRequest);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >⌄</button>}
    <Handle type="source" position={Position.Right} />
  </div>;
}

function routePath(route: readonly Point[]): string {
  const first = route[0];
  return first === undefined ? '' : `M ${first.x} ${first.y}${route.slice(1).map((point) => ` L ${point.x} ${point.y}`).join('')}`;
}

function DiagramEdge({ data, markerEnd, style }: EdgeProps<LividEdge>) {
  if (data === undefined) return null;
  return <>
    <BaseEdge
      path={routePath(data.route)}
      {...(markerEnd === undefined ? {} : { markerEnd })}
      {...(style === undefined ? {} : { style })}
      className="livid-react-edge"
      data-tint={data.tint ?? undefined}
      data-anim={data.animation ?? undefined}
    />
    {data.label !== null && <EdgeLabelRenderer>
      <div
        className="livid-react-edge-label"
        style={{
          transform: `translate(${data.label.x}px, ${data.label.y}px)`,
          width: data.label.width,
          height: data.label.height,
        }}
      >{data.label.text}</div>
    </EdgeLabelRenderer>}
  </>;
}

const nodeTypes = { lividNode: DiagramNode };
const edgeTypes = { lividEdge: DiagramEdge };

function centerOfRoute(route: readonly Point[]): Point | null {
  if (route.length === 0) return null;
  const bounds = route.reduce(
    (current, point) => ({
      minX: Math.min(current.minX, point.x),
      minY: Math.min(current.minY, point.y),
      maxX: Math.max(current.maxX, point.x),
      maxY: Math.max(current.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

function Canvas<R extends AnyRegistry>({
  diagram,
  frame,
  className,
  ariaLabel = 'Interactive diagram',
  fitView = true,
  fitOnReplace = false,
  showDirection = false,
  interactive = true,
  selection = null,
  onSelectionChange,
  focus = null,
  onFocusResult,
  onSelect,
  onDescendRequest,
  onDescend,
  diagramRef,
}: LividDiagramProps<R> & { readonly diagramRef: ForwardedRef<LividDiagramHandle> }) {
  const reactFlow = useReactFlow<LividNode, LividEdge>();
  const [isReady, setIsReady] = useState(false);
  const previousDiagram = useRef(diagram);
  const model = useMemo(
    () => toReactDiagram(diagram, frame, { showDirection }),
    [diagram, frame, showDirection],
  );

  const requestDescend = useCallback((request: DescendRequest) => {
    if (onDescendRequest !== undefined) {
      onDescendRequest(request);
      return;
    }
    const child = diagram.nodes.find((placed) => placed.node.id === request.nodeId)?.children;
    if (child !== null && child !== undefined) onDescend?.(request.nodeId, child);
  }, [diagram, onDescend, onDescendRequest]);

  const nodes = useMemo<LividNode[]>(() => model.nodes.map((node) => ({
    ...node,
    type: 'lividNode',
    draggable: false,
    selectable: interactive,
    selected: selection?.kind === 'node' && selection.id === node.id,
    data: { ...node.data, requestDescend },
  })), [interactive, model.nodes, requestDescend, selection]);
  const edges = useMemo<LividEdge[]>(() => model.edges.map((edge) => ({
    ...edge,
    type: 'lividEdge',
    selectable: interactive,
    selected: selection?.kind === 'edge' && selection.id === edge.id,
  })), [interactive, model.edges, selection]);

  useImperativeHandle(diagramRef, () => ({
    getViewport: reactFlow.getViewport,
    setViewport: reactFlow.setViewport,
  }), [reactFlow.getViewport, reactFlow.setViewport]);

  const focusKind = focus?.kind;
  const focusId = focus?.id;
  useEffect(() => {
    if (!isReady || focus === null) return;
    const center = focus.kind === 'node'
      ? (() => {
          const target = model.nodes.find((node) => node.id === focus.id);
          return target === undefined
            ? null
            : { x: target.position.x + target.width / 2, y: target.position.y + target.height / 2 };
        })()
      : (() => {
          const target = model.edges.find((edge) => edge.id === focus.id);
          return target === undefined ? null : centerOfRoute(target.data.route);
        })();
    if (center === null) {
      onFocusResult?.({ ok: false, error: { kind: 'focusMissing', focus } });
      return;
    }
    void reactFlow.setCenter(center.x, center.y);
    onFocusResult?.({ ok: true, value: focus });
    // Deliberately keyed only by the focus target and canvas readiness. Diagram
    // and frame replacement must not retrigger camera movement.
  }, [focusId, focusKind, isReady]);

  useEffect(() => {
    const hasReplacedDiagram = previousDiagram.current !== diagram;
    previousDiagram.current = diagram;
    if (isReady && fitOnReplace && hasReplacedDiagram) void reactFlow.fitView();
  }, [diagram, fitOnReplace, isReady, reactFlow]);

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
      multiSelectionKeyCode={null}
      onInit={() => setIsReady(true)}
      onNodeClick={(_, node) => {
        const next: DiagramSelection = {
          kind: 'node',
          id: node.data.entityId,
          detail: node.data.detail,
        };
        onSelectionChange?.(next);
        onSelect?.(next);
      }}
      onEdgeClick={(_, edge) => {
        if (edge.data === undefined) return;
        const next: DiagramSelection = {
          kind: 'edge',
          id: edge.data.entityId,
          detail: edge.data.detail,
        };
        onSelectionChange?.(next);
        onSelect?.(next);
      }}
      onPaneClick={() => onSelectionChange?.(null)}
      onNodeDoubleClick={(_, node) => {
        const request = descendRequestOf(node.data);
        if (request !== null) requestDescend(request);
      }}
    >
      <Background gap={24} size={1} />
      {interactive && <Controls showInteractive={false} />}
    </ReactFlow>
  </div>;
}

function LividDiagramInner<R extends AnyRegistry>(
  props: LividDiagramProps<R>,
  ref: ForwardedRef<LividDiagramHandle>,
) {
  return <ReactFlowProvider><Canvas {...props} diagramRef={ref} /></ReactFlowProvider>;
}

// forwardRef cannot preserve a generic component signature structurally. This
// assertion restores the same R shared by diagram and legacy onDescend.
export const LividDiagram = forwardRef(LividDiagramInner) as <R extends AnyRegistry>(
  props: LividDiagramProps<R> & { readonly ref?: ForwardedRef<LividDiagramHandle> },
) => ReturnType<typeof LividDiagramInner>;
