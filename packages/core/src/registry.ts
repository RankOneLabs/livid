import type { StandardSchemaV1 } from './standard-schema.js';

/**
 * Shape carries node type. The set is closed because both renderers are
 * closed — an SVG post and a React canvas must draw the same map, which is
 * only guaranteed if neither can be handed a shape the other cannot draw.
 */
export type NodeShape = 'rect' | 'rounded' | 'stadium' | 'circle' | 'hexagon' | 'diamond' | 'cylinder';

/** Station mark drawn on the node. Closed for the same reason as NodeShape. */
export type Glyph = 'none' | 'dot' | 'ring' | 'bar' | 'chevron' | 'square';

/** Closed visual vocabulary shared by every renderer. */
export type StateTint = 'muted' | 'base' | 'accent' | 'danger' | 'ghost';
export type StateAnimation = 'pulse' | 'stall' | 'flash' | 'dim';

export interface StateVisual {
  readonly tint: StateTint;
  readonly anim?: StateAnimation;
}

export type StateDeclarations = Readonly<Record<string, StateVisual>>;

export interface NodeTypeDef<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly label: string;
  /** Schema for this type's detail bag. Core writes the handler from it. */
  readonly detail: S;
  readonly shape: NodeShape;
  readonly glyph?: Glyph;
  /** Named runtime states and their renderer-independent visual treatment. */
  readonly states?: StateDeclarations;
  /**
   * Whether this type routes flow: branching out, condensing in, terminating,
   * and changing line. Everything meta about control flow happens at a router;
   * ordinary nodes pass flow straight through on the line they are on.
   *
   * What *decides* the routing — a gate, a threshold, reading tea leaves — is
   * domain semantics and lives in the type's detail schema, not here. Core
   * never learns the word "gate".
   */
  readonly isRouter: boolean;
}

/**
 * Edges carry what flows, not what happens to it. A type distinguishes a query
 * from a log write from a payment authorization, and its detail schema shapes
 * the payload you drill into. Control flow is the router's business.
 */
export interface EdgeTypeDef<S extends StandardSchemaV1 = StandardSchemaV1> {
  readonly label: string;
  readonly detail: S;
  /** Named runtime states and their renderer-independent visual treatment. */
  readonly states?: StateDeclarations;
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
