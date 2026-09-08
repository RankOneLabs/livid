import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkEdgeSection, ElkExtendedEdge, ElkNode, LayoutOptions as ElkOptions } from 'elkjs/lib/elk-api.js';

import type { DiagramError } from './errors.js';
import { normalize } from './normalize.js';
import type { AnyRegistry, NodeShape } from './registry.js';
import { type Result, ok } from './result.js';
import type { LaidOutDiagram, LaidOutEdge, LaidOutNode, Point, Size, ValidDiagram, ValidNode } from './types.js';

export type LayoutDirection = 'right' | 'down';

export interface LayoutSpacing {
  /** Gap between nodes sharing a layer. */
  readonly nodeNode?: number;
  /** Gap between layers — the distance a route travels between stations. */
  readonly layers?: number;
  /** Clearance an orthogonal route keeps from a node it passes. */
  readonly edgeNode?: number;
}

export interface NodeSizeConfig {
  readonly base?: Partial<Record<NodeShape, Size>>;
  /** Width added per label character, before clamping to `maxWidth`. */
  readonly charWidth?: number;
  readonly padding?: number;
  readonly maxWidth?: number;
}

export interface LayoutOptions {
  readonly direction?: LayoutDirection;
  readonly spacing?: LayoutSpacing;
  readonly nodeSize?: NodeSizeConfig;
}

/**
 * Shapes read as themselves only at roughly these proportions, so the defaults
 * are per-shape rather than one box size for everything.
 */
const DEFAULT_SIZES: Record<NodeShape, Size> = {
  rect: { width: 160, height: 56 },
  rounded: { width: 160, height: 56 },
  stadium: { width: 152, height: 48 },
  circle: { width: 72, height: 72 },
  hexagon: { width: 152, height: 64 },
  diamond: { width: 120, height: 88 },
  cylinder: { width: 144, height: 72 },
};

/** Growing these would distort the shape past recognition, so they stay fixed. */
const FIXED_WIDTH_SHAPES: ReadonlySet<NodeShape> = new Set<NodeShape>(['circle', 'diamond']);

const DEFAULT_SPACING: Required<LayoutSpacing> = { nodeNode: 48, layers: 96, edgeNode: 24 };
const DEFAULT_CHAR_WIDTH = 8;
const DEFAULT_PADDING = 20;
const DEFAULT_MAX_WIDTH = 280;

/**
 * One instance, reused. `elk.bundled` runs in-process with no worker, so there
 * is nothing to tear down and construction is the only meaningful cost.
 */
let engine: InstanceType<typeof ELK> | null = null;

function elk(): InstanceType<typeof ELK> {
  engine ??= new ELK();
  return engine;
}

/**
 * Lay out one diagram level. Async because elkjs has no synchronous API —
 * which costs nothing in practice, since geometry is computed at build time
 * and `LaidOutDiagram` is serializable.
 *
 * Normalization runs first and cannot be skipped.
 */
export async function layout<R extends AnyRegistry>(
  diagram: ValidDiagram<R>,
  options: LayoutOptions = {},
): Promise<Result<LaidOutDiagram<R>, readonly DiagramError[]>> {
  const normalized = normalize(diagram);
  if (!normalized.ok) return normalized;
  return ok(await layoutLevel(normalized.value, options, false));
}

/**
 * Lay out a diagram and every drill-down level beneath it. The SVG renderer
 * needs this — a static file has to contain every level it can reveal. The
 * React renderer can use `layout()` and descend on demand, which is what keeps
 * large graphs viable.
 */
export async function layoutDeep<R extends AnyRegistry>(
  diagram: ValidDiagram<R>,
  options: LayoutOptions = {},
): Promise<Result<LaidOutDiagram<R>, readonly DiagramError[]>> {
  const normalized = normalize(diagram);
  if (!normalized.ok) return normalized;
  return ok(await layoutLevel(normalized.value, options, true));
}

async function layoutLevel<R extends AnyRegistry>(
  diagram: ValidDiagram<R>,
  options: LayoutOptions,
  deep: boolean,
): Promise<LaidOutDiagram<R>> {
  const sizes = new Map<string, Size>(
    diagram.nodes.map((node) => [node.id as string, sizeOf(diagram, node, options.nodeSize ?? {})]),
  );

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: elkOptions(options),
    children: diagram.nodes.map((node) => {
      const size = sizes.get(node.id) ?? DEFAULT_SIZES.rect;
      return { id: node.id, width: size.width, height: size.height };
    }),
    edges: diagram.edges.map(
      (edge): ElkExtendedEdge => ({ id: edge.id, sources: [edge.source], targets: [edge.target] }),
    ),
  };

  const result = await elk().layout(graph);
  const placed = new Map<string, ElkNode>((result.children ?? []).map((child) => [child.id, child]));
  const routed = new Map<string, ElkExtendedEdge>((result.edges ?? []).map((edge) => [edge.id, edge]));

  // Nested levels lay out concurrently rather than one after another — they
  // are independent, and elk is the slow part.
  const nodes: readonly LaidOutNode<R>[] = await Promise.all(
    diagram.nodes.map(async (node): Promise<LaidOutNode<R>> => {
      const box = placed.get(node.id);
      const size = sizes.get(node.id) ?? DEFAULT_SIZES.rect;

      return {
        node,
        position: { x: box?.x ?? 0, y: box?.y ?? 0 },
        size: { width: box?.width ?? size.width, height: box?.height ?? size.height },
        children: deep && node.children !== null ? await layoutLevel(node.children, options, true) : null,
      };
    }),
  );

  const edges: readonly LaidOutEdge<R>[] = diagram.edges.map((edge) => ({ edge, route: toRoute(routed.get(edge.id)) }));

  return {
    __brand: 'LaidOutDiagram',
    registry: diagram.registry,
    lines: diagram.lines,
    nodes,
    edges,
    bounds: { width: result.width ?? 0, height: result.height ?? 0 },
  };
}

function elkOptions(options: LayoutOptions): ElkOptions {
  const spacing = { ...DEFAULT_SPACING, ...options.spacing };

  return {
    'elk.algorithm': 'layered',
    'elk.direction': options.direction === 'down' ? 'DOWN' : 'RIGHT',
    // The reason for choosing ELK over dagre: real orthogonal routing is what
    // makes the map read as a transit diagram rather than a flowchart.
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing.layers),
    'elk.spacing.nodeNode': String(spacing.nodeNode),
    'elk.spacing.edgeNode': String(spacing.edgeNode),
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    // A layered layout has to reverse some edge of every cycle before it can
    // rank the nodes. ELK's default picks those edges greedily, so a loop lands
    // in whatever order the heuristic happened to produce — a five-stage cycle
    // has been seen starting at its second stage, with the return edge drawn
    // forwards and a forward edge drawn backwards. Model order makes the choice
    // the author's: the edges that point at earlier-declared nodes are the ones
    // that wrap back, and every other edge runs forwards. Declaration order is
    // reading order, which is what a map's author expects anyway.
    'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
  };
}

function sizeOf<R extends AnyRegistry>(
  diagram: ValidDiagram<R>,
  node: ValidNode<R>,
  config: NodeSizeConfig,
): Size {
  const typeDef = diagram.registry.nodeTypes[node.type];
  const shape: NodeShape = typeDef?.shape ?? 'rect';
  const base = config.base?.[shape] ?? DEFAULT_SIZES[shape];

  if (FIXED_WIDTH_SHAPES.has(shape)) return base;

  const charWidth = config.charWidth ?? DEFAULT_CHAR_WIDTH;
  const padding = config.padding ?? DEFAULT_PADDING;
  const maxWidth = config.maxWidth ?? DEFAULT_MAX_WIDTH;
  const wanted = padding * 2 + node.label.length * charWidth;

  return { width: Math.min(maxWidth, Math.max(base.width, wanted)), height: base.height };
}

function toRoute(edge: ElkExtendedEdge | undefined): readonly Point[] {
  const sections: readonly ElkEdgeSection[] = edge?.sections ?? [];

  return sections
    .flatMap((section) => [section.startPoint, ...(section.bendPoints ?? []), section.endPoint])
    .map((point): Point => ({ x: point.x, y: point.y }))
    .filter(dropConsecutiveDuplicates);
}

/** Zero-length segments serve no purpose and complicate anything that walks a route. */
function dropConsecutiveDuplicates(point: Point, index: number, route: readonly Point[]): boolean {
  const previous = route[index - 1];
  return previous === undefined || previous.x !== point.x || previous.y !== point.y;
}

