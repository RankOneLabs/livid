import type { EdgeId, LineId, NodeId } from './ids.js';
import type { AnyRegistry, EdgeDetailOf, EdgeTypeKey, NodeDetailOf, NodeTypeKey } from './registry.js';

/* ------------------------------------------------------------------ *
 * Spec side — what a projection authors. Untrusted.
 * ------------------------------------------------------------------ */

/**
 * Deliberately loose: this is the boundary where JSON files, projections from
 * a domain schema, and live feeds arrive. `detail` is `unknown` because its
 * shape depends on `type`, which has not been checked yet. Type safety on the
 * way in is the projection's job; type safety on the way out is validation's.
 */
export interface DiagramSpec {
  readonly lines?: readonly LineSpec[];
  readonly nodes: readonly NodeSpec[];
  readonly edges: readonly EdgeSpec[];
}

export interface LineSpec {
  readonly id: string;
  readonly label: string;
  /** Renderer-agnostic color token, resolved by each renderer's palette. */
  readonly color: string;
}

export interface NodeSpec {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly line?: string | null;
  readonly detail?: unknown;
  /** A node's guts are themselves a diagram. This is the drill-down. */
  readonly children?: DiagramSpec | null;
}

export interface EdgeSpec {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly target: string;
  readonly label?: string | null;
  readonly detail?: unknown;
}

/* ------------------------------------------------------------------ *
 * Valid side — core's output. Only constructible by validate().
 * ------------------------------------------------------------------ */

export interface Line {
  readonly id: LineId;
  readonly label: string;
  readonly color: string;
}

/**
 * A validated node, as a discriminated union over the registry's node types.
 * `type` narrows `detail` to that type's inferred schema output.
 */
export type ValidNode<R extends AnyRegistry> = {
  [K in NodeTypeKey<R>]: {
    readonly id: NodeId;
    readonly type: K;
    readonly label: string;
    readonly line: LineId | null;
    readonly detail: NodeDetailOf<R, K>;
    readonly children: ValidDiagram<R> | null;
  };
}[NodeTypeKey<R>];

export type ValidEdge<R extends AnyRegistry> = {
  [K in EdgeTypeKey<R>]: {
    readonly id: EdgeId;
    readonly type: K;
    readonly source: NodeId;
    readonly target: NodeId;
    readonly label: string | null;
    readonly detail: EdgeDetailOf<R, K>;
  };
}[EdgeTypeKey<R>];

/**
 * Branded: renderers accept this and nothing else, so there is no path from a
 * spec to a rendered diagram that skips validation.
 */
export interface ValidDiagram<R extends AnyRegistry> {
  readonly __brand: 'ValidDiagram';
  readonly registry: R;
  readonly lines: readonly Line[];
  readonly nodes: readonly ValidNode<R>[];
  readonly edges: readonly ValidEdge<R>[];
}

/* ------------------------------------------------------------------ *
 * Laid-out side — the render contract. Serializable JSON, so geometry can be
 * computed once at build time and handed to either renderer.
 * ------------------------------------------------------------------ */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface LaidOutNode<R extends AnyRegistry> {
  readonly node: ValidNode<R>;
  readonly position: Point;
  readonly size: Size;
  /** Present only when this node's children were laid out too. */
  readonly children: LaidOutDiagram<R> | null;
}

export interface LaidOutEdge<R extends AnyRegistry> {
  readonly edge: ValidEdge<R>;
  /** Orthogonal / 45-degree route, source-first. Includes both endpoints. */
  readonly route: readonly Point[];
}

export interface LaidOutDiagram<R extends AnyRegistry> {
  readonly __brand: 'LaidOutDiagram';
  readonly registry: R;
  readonly lines: readonly Line[];
  readonly nodes: readonly LaidOutNode<R>[];
  readonly edges: readonly LaidOutEdge<R>[];
  readonly bounds: Size;
}
