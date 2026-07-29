import type { StandardSchemaV1 } from './standard-schema.js';

/**
 * Shape carries node type. The set is closed because both renderers are
 * closed — an SVG post and a React canvas must draw the same map, which is
 * only guaranteed if neither can be handed a shape the other cannot draw.
 */
export type NodeShape = 'rect' | 'rounded' | 'stadium' | 'circle' | 'hexagon' | 'diamond' | 'cylinder';

/** Station mark drawn on the node. Closed for the same reason as NodeShape. */
export type Glyph = 'none' | 'dot' | 'ring' | 'bar' | 'chevron' | 'square';

/** Mid-edge mark. A gate is a property of a flow, not a node of its own. */
export type EdgeMarker = 'none' | 'checkpoint' | 'branch';

export interface NodeTypeDef<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly label: string;
  /** Schema for this type's detail bag. Core writes the handler from it. */
  readonly detail: S;
  readonly shape: NodeShape;
  readonly glyph?: Glyph;
}

export interface EdgeTypeDef<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly label: string;
  readonly detail: S;
  readonly marker: EdgeMarker;
  /** Whether this edge type may fan out to more than one target from a node. */
  readonly branching: boolean;
}

export interface Registry<
  N extends Record<string, NodeTypeDef> = Record<string, NodeTypeDef>,
  E extends Record<string, EdgeTypeDef> = Record<string, EdgeTypeDef>,
> {
  readonly nodeTypes: N;
  readonly edgeTypes: E;
}

/** Any registry, for use in constraints where the concrete vocabulary is free. */
export type AnyRegistry = Registry;

export type NodeTypeKey<R extends AnyRegistry> = keyof R['nodeTypes'] & string;
export type EdgeTypeKey<R extends AnyRegistry> = keyof R['edgeTypes'] & string;

/** The validated detail type for one node type, inferred from its schema. */
export type NodeDetailOf<R extends AnyRegistry, K extends NodeTypeKey<R>> = StandardSchemaV1.InferOutput<
  R['nodeTypes'][K]['detail']
>;

export type EdgeDetailOf<R extends AnyRegistry, K extends EdgeTypeKey<R>> = StandardSchemaV1.InferOutput<
  R['edgeTypes'][K]['detail']
>;

/**
 * Identity function whose only job is to capture the literal key types of the
 * vocabulary, so downstream node and edge types resolve to a real
 * discriminated union rather than a widened `string`.
 */
export function defineRegistry<N extends Record<string, NodeTypeDef>, E extends Record<string, EdgeTypeDef>>(
  registry: Registry<N, E>,
): Registry<N, E> {
  return registry;
}

export function nodeTypeKeys<R extends AnyRegistry>(registry: R): readonly NodeTypeKey<R>[] {
  return Object.keys(registry.nodeTypes) as NodeTypeKey<R>[];
}

export function edgeTypeKeys<R extends AnyRegistry>(registry: R): readonly EdgeTypeKey<R>[] {
  return Object.keys(registry.edgeTypes) as EdgeTypeKey<R>[];
}
