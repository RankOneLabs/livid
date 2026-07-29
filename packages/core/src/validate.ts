import type { DetailIssue, DiagramError } from './errors.js';
import { type DiagramPath, ROOT_PATH, descend, edgeId, lineId, nodeId } from './ids.js';
import { type Collected, type Result, collected, err, errorsOf, ok, rejected, valuesOf } from './result.js';
import { type AnyRegistry, edgeTypeKeys, nodeTypeKeys } from './registry.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type { DiagramSpec, EdgeSpec, Line, LineSpec, NodeSpec, ValidDiagram, ValidEdge, ValidNode } from './types.js';

/** Vocabulary discipline defaults. A map stops reading as a map past this. */
export const DEFAULT_TYPE_LIMIT = 6;

export interface ValidateOptions {
  readonly nodeTypeLimit?: number;
  readonly edgeTypeLimit?: number;
}

export type ConfigError =
  | { readonly kind: 'issues'; readonly issues: readonly DetailIssue[] }
  | { readonly kind: 'async' }
  | { readonly kind: 'threw'; readonly message: string };

/**
 * Validate one detail bag against its registered schema. Core writes this
 * handler once; it works for zod, valibot, arktype, or an ajv wrapper,
 * because all of them expose the same `~standard` entry point.
 *
 * The validator is foreign code, so this call is an IO-style boundary: a
 * throwing refinement is caught and converted to a value rather than escaping
 * past a caller who is correctly handling `Result`.
 */
export function validateConfig<S extends StandardSchemaV1>(
  schema: S,
  config: unknown,
): Result<StandardSchemaV1.InferOutput<S>, ConfigError> {
  let outcome: StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>;
  try {
    outcome = schema['~standard'].validate(config);
  } catch (cause) {
    return err({ kind: 'threw', message: describe(cause) });
  }

  if (isPromise(outcome)) return err({ kind: 'async' });
  if (outcome.issues !== undefined) return err({ kind: 'issues', issues: outcome.issues.map(toDetailIssue) });
  return ok(outcome.value);
}

/**
 * Validate a whole spec against a registry, recursing through drill-down
 * levels. Reports every problem in one pass rather than stopping at the
 * first, because a bad projection usually has more than one.
 */
export function validateDiagram<R extends AnyRegistry>(
  registry: R,
  spec: DiagramSpec,
  options: ValidateOptions = {},
): Result<ValidDiagram<R>, readonly DiagramError[]> {
  const level = validateLevel(registry, spec, ROOT_PATH);
  const errors = [...registryOverflows(registry, options), ...level.errors];

  return errors.length > 0 ? err(errors) : ok(level.diagram);
}

interface Level<R extends AnyRegistry> {
  readonly diagram: ValidDiagram<R>;
  readonly errors: readonly DiagramError[];
}

/** What every per-item validator needs, grouped rather than passed loose. */
interface LevelContext<R extends AnyRegistry> {
  readonly registry: R;
  readonly path: DiagramPath;
  readonly lineIds: ReadonlySet<string>;
  readonly declaredNodeIds: ReadonlySet<string>;
}

function validateLevel<R extends AnyRegistry>(registry: R, spec: DiagramSpec, path: DiagramPath): Level<R> {
  const lineSpecs = markFirstOccurrences(spec.lines ?? [], (line) => line.id);
  const lineOutcomes = lineSpecs.map(({ item, isFirst }) => validateLine(item, isFirst, path));
  const lines = valuesOf(lineOutcomes);

  const nodeSpecs = markFirstOccurrences(spec.nodes, (node) => node.id);
  const context: LevelContext<R> = {
    registry,
    path,
    lineIds: new Set(lines.map((line) => line.id as string)),
    // Every id that cleared the duplicate check, including nodes that later
    // failed on type or detail — an edge into a node with a bad detail bag is
    // not also an unresolved endpoint.
    declaredNodeIds: new Set(nodeSpecs.filter(({ isFirst }) => isFirst).map(({ item }) => item.id)),
  };

  const nodeOutcomes = nodeSpecs.map(({ item, isFirst }) => validateNode(context, item, isFirst));
  const nodes = valuesOf(nodeOutcomes);

  const edgeOutcomes = markFirstOccurrences(spec.edges, (edge) => edge.id).map(({ item, isFirst }) =>
    validateEdge(context, item, isFirst),
  );
  const edges = valuesOf(edgeOutcomes);

  return {
    diagram: { __brand: 'ValidDiagram', registry, lines, nodes, edges },
    errors: [
      ...errorsOf(lineOutcomes),
      ...errorsOf(nodeOutcomes),
      ...errorsOf(edgeOutcomes),
      ...illegalBranches(context, nodes, edges),
    ],
  };
}

function validateLine(spec: LineSpec, isFirst: boolean, path: DiagramPath): Collected<Line, DiagramError> {
  if (!isFirst) return rejected({ kind: 'duplicate_line_id', path, lineId: spec.id });
  return collected({ id: lineId(spec.id), label: spec.label, color: spec.color });
}

function validateNode<R extends AnyRegistry>(
  context: LevelContext<R>,
  spec: NodeSpec,
  isFirst: boolean,
): Collected<ValidNode<R>, DiagramError> {
  const { registry, path } = context;

  if (!isFirst) return rejected({ kind: 'duplicate_node_id', path, nodeId: spec.id });

  const typeDef = registry.nodeTypes[spec.type];
  if (typeDef === undefined) {
    return rejected({ kind: 'unknown_node_type', path, nodeId: spec.id, type: spec.type, known: nodeTypeKeys(registry) });
  }

  const line = spec.line ?? null;
  // An unknown line is reported but does not stop the node being built: one
  // bad reference should not cascade into unresolved endpoints downstream.
  const lineErrors: readonly DiagramError[] =
    line !== null && !context.lineIds.has(line)
      ? [{ kind: 'unknown_line', path, nodeId: spec.id, line, known: [...context.lineIds] }]
      : [];

  const detail = validateConfig(typeDef.detail, spec.detail);
  if (!detail.ok) return { value: null, errors: [...lineErrors, toNodeError(detail.error, path, spec.id, spec.type)] };

  const id = nodeId(spec.id);
  const nested = spec.children == null ? null : validateLevel(registry, spec.children, descend(path, id));

  // Cast: every field has been checked against the registry entry for
  // `spec.type`, which is exactly the invariant ValidNode encodes. The union
  // cannot be built structurally from a key TypeScript widened to `string` at
  // the spec boundary.
  const node = {
    id,
    type: spec.type,
    label: spec.label,
    line: line === null ? null : lineId(line),
    detail: detail.value,
    children: nested?.diagram ?? null,
  } as ValidNode<R>;

  return collected(node, [...lineErrors, ...(nested?.errors ?? [])]);
}

function validateEdge<R extends AnyRegistry>(
  context: LevelContext<R>,
  spec: EdgeSpec,
  isFirst: boolean,
): Collected<ValidEdge<R>, DiagramError> {
  const { registry, path, declaredNodeIds } = context;

  if (!isFirst) return rejected({ kind: 'duplicate_edge_id', path, edgeId: spec.id });

  const typeDef = registry.edgeTypes[spec.type];
  if (typeDef === undefined) {
    return rejected({ kind: 'unknown_edge_type', path, edgeId: spec.id, type: spec.type, known: edgeTypeKeys(registry) });
  }

  // Edges connect nodes within one level. A drill-down diagram is
  // self-contained, so there is no cross-level endpoint to resolve.
  const endpointErrors = (['source', 'target'] as const)
    .filter((endpoint) => !declaredNodeIds.has(spec[endpoint]))
    .map(
      (endpoint): DiagramError => ({
        kind: 'unresolved_endpoint',
        path,
        edgeId: spec.id,
        endpoint,
        ref: spec[endpoint],
      }),
    );

  const detail = validateConfig(typeDef.detail, spec.detail);
  if (!detail.ok) return { value: null, errors: [...endpointErrors, toEdgeError(detail.error, path, spec.id, spec.type)] };
  if (endpointErrors.length > 0) return { value: null, errors: endpointErrors };

  // Cast: same reasoning as ValidNode above.
  const edge = {
    id: edgeId(spec.id),
    type: spec.type,
    source: nodeId(spec.source),
    target: nodeId(spec.target),
    label: spec.label ?? null,
    detail: detail.value,
  } as ValidEdge<R>;

  return collected(edge);
}

/**
 * Fanning out is a routing act, so only a routing node type may do it. This is
 * structural and needs no resolved lines, unlike the line-change invariant,
 * which has to wait for normalization.
 */
function illegalBranches<R extends AnyRegistry>(
  context: LevelContext<R>,
  nodes: readonly ValidNode<R>[],
  edges: readonly ValidEdge<R>[],
): readonly DiagramError[] {
  const outgoing = edges.reduce(
    (counts, edge) => counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1),
    new Map<string, number>(),
  );

  return nodes
    .filter((node) => (outgoing.get(node.id) ?? 0) > 1)
    .filter((node) => context.registry.nodeTypes[node.type]?.isRouter !== true)
    .map((node) => ({
      kind: 'illegal_branch',
      path: context.path,
      nodeId: node.id,
      type: node.type,
      outgoing: outgoing.get(node.id) ?? 0,
    }));
}

function registryOverflows<R extends AnyRegistry>(registry: R, options: ValidateOptions): readonly DiagramError[] {
  const axes = [
    { axis: 'nodeTypes', count: nodeTypeKeys(registry).length, limit: options.nodeTypeLimit ?? DEFAULT_TYPE_LIMIT },
    { axis: 'edgeTypes', count: edgeTypeKeys(registry).length, limit: options.edgeTypeLimit ?? DEFAULT_TYPE_LIMIT },
  ] as const;

  return axes
    .filter(({ count, limit }) => count > limit)
    .map(({ axis, count, limit }) => ({ kind: 'registry_overflow', axis, count, limit }));
}

interface Occurrence<T> {
  readonly item: T;
  readonly isFirst: boolean;
}

/**
 * Tags each item with whether its id had been seen before, so duplicate
 * detection becomes a pure map rather than a loop threading a mutable set —
 * and encounter order, which callers assert on, is preserved exactly.
 */
function markFirstOccurrences<T>(items: readonly T[], keyOf: (item: T) => string): readonly Occurrence<T>[] {
  const seen = new Set<string>();
  return items.map((item) => {
    const key = keyOf(item);
    const isFirst = !seen.has(key);
    seen.add(key);
    return { item, isFirst };
  });
}

function toNodeError(error: ConfigError, path: DiagramPath, nodeId: string, type: string): DiagramError {
  switch (error.kind) {
    case 'async':
      return { kind: 'async_schema', path, entityId: nodeId, type };
    case 'threw':
      return { kind: 'schema_threw', path, entityId: nodeId, type, message: error.message };
    case 'issues':
      return { kind: 'invalid_detail', path, nodeId, type, issues: error.issues };
  }
}

function toEdgeError(error: ConfigError, path: DiagramPath, edgeId: string, type: string): DiagramError {
  switch (error.kind) {
    case 'async':
      return { kind: 'async_schema', path, entityId: edgeId, type };
    case 'threw':
      return { kind: 'schema_threw', path, entityId: edgeId, type, message: error.message };
    case 'issues':
      return { kind: 'invalid_edge_detail', path, edgeId, type, issues: error.issues };
  }
}

function toDetailIssue(issue: StandardSchemaV1.Issue): DetailIssue {
  const segments = (issue.path ?? []).map((segment) =>
    typeof segment === 'object' && segment !== null && 'key' in segment ? String(segment.key) : String(segment),
  );
  return { message: issue.message, field: segments.length > 0 ? segments.join('.') : '<root>' };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown }).then === 'function';
}
