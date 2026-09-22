import type {
  AnyRegistry,
  ChildState,
  EdgeId,
  Glyph,
  LaidOutDiagram,
  LaidOutEdgeLabel,
  NodeId,
  NodeShape,
  Point,
  StateAnimation,
  StateDeclarations,
  StateFrame,
  StateTint,
} from '@rankonelabs/livid-core';

// XY Flow constrains custom data to Record<string, unknown>. The named fields
// below remain the renderer's actual data model; the index signature exists
// only at that library boundary.
export interface ReactNodeData extends Readonly<Record<string, unknown>> {
  readonly entityId: NodeId;
  readonly label: string;
  readonly typeLabel: string;
  readonly detail: unknown;
  readonly shape: NodeShape;
  readonly glyph: Glyph;
  readonly tint: StateTint | null;
  readonly animation: StateAnimation | null;
  readonly hasChildren: boolean;
  readonly childState: ChildState;
}

export interface ReactEdgeLabel extends LaidOutEdgeLabel {
  readonly text: string;
}

export interface ReactEdgeData extends Readonly<Record<string, unknown>> {
  readonly entityId: EdgeId;
  readonly typeLabel: string;
  readonly detail: unknown;
  readonly route: readonly Point[];
  readonly tint: StateTint | null;
  readonly animation: StateAnimation | null;
  readonly label: ReactEdgeLabel | null;
}

export interface ReactNodeModel {
  readonly id: NodeId;
  readonly position: Point;
  readonly width: number;
  readonly height: number;
  readonly data: ReactNodeData;
}

export interface ReactEdgeModel {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly markerEnd?: 'arrowclosed';
  readonly data: ReactEdgeData;
}

export interface ReactDiagramModel {
  readonly nodes: readonly ReactNodeModel[];
  readonly edges: readonly ReactEdgeModel[];
  readonly width: number;
  readonly height: number;
}

export interface ReactDiagramOptions {
  /** Draw direction even when the diagram does not use dependency semantics. */
  readonly showDirection?: boolean;
}

interface ResolvedVisual {
  readonly tint: StateTint | null;
  readonly animation: StateAnimation | null;
}

function visualOf(states: StateDeclarations | undefined, state: string | undefined): ResolvedVisual {
  const visual = state === undefined ? undefined : states?.[state];
  return { tint: visual?.tint ?? null, animation: visual?.anim ?? null };
}

/** Pure renderer boundary: preserve core geometry and attach the current visual state. */
export function toReactDiagram<R extends AnyRegistry>(
  diagram: LaidOutDiagram<R>,
  frame: StateFrame,
  options: ReactDiagramOptions = {},
): ReactDiagramModel {
  const nodes = diagram.nodes.map((placed): ReactNodeModel => {
    const type = diagram.registry.nodeTypes[placed.node.type];
    const visual = visualOf(type?.states, frame.nodes[placed.node.id]);
    return {
      id: placed.node.id,
      position: placed.position,
      width: placed.size.width,
      height: placed.size.height,
      data: {
        entityId: placed.node.id,
        label: placed.node.label,
        typeLabel: type?.label ?? placed.node.type,
        detail: placed.node.detail,
        shape: type?.shape ?? 'rect',
        glyph: type?.glyph ?? 'none',
        tint: visual.tint,
        animation: visual.animation,
        hasChildren: placed.childState.kind !== 'leaf',
        childState: placed.childState,
      },
    };
  });
  const edges = diagram.edges.map((placed): ReactEdgeModel => {
    const type = diagram.registry.edgeTypes[placed.edge.type];
    const visual = visualOf(type?.states, frame.edges[placed.edge.id]);
    const label = placed.label === null || placed.edge.label === null
      ? null
      : { text: placed.edge.label, ...placed.label };
    const markerEnd: ReactEdgeModel['markerEnd'] = 'arrowclosed';
    return {
      id: placed.edge.id,
      source: placed.edge.source,
      target: placed.edge.target,
      ...((diagram.profile === 'dependency' || options.showDirection === true)
        ? { markerEnd }
        : {}),
      data: {
        entityId: placed.edge.id,
        typeLabel: type?.label ?? placed.edge.type,
        detail: placed.edge.detail,
        route: placed.route,
        tint: visual.tint,
        animation: visual.animation,
        label,
      },
    };
  });
  return { nodes, edges, width: diagram.bounds.width, height: diagram.bounds.height };
}
