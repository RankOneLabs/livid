import type { DetailIssue, DiagramError } from './errors.js';
import { type DiagramPath, ROOT_PATH, descend, edgeId, lineId, nodeId } from './ids.js';
import { type Result, err, ok } from './result.js';
import { type AnyRegistry, edgeTypeKeys, nodeTypeKeys } from './registry.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type { DiagramSpec, Line, ValidDiagram, ValidEdge, ValidNode } from './types.js';

/** Vocabulary discipline defaults. A map stops reading as a map past this. */
export const DEFAULT_TYPE_LIMIT = 6;

export interface ValidateOptions {
  readonly nodeTypeLimit?: number;
  readonly edgeTypeLimit?: number;
}

export type ConfigError =
  | { readonly kind: 'issues'; readonly issues: readonly DetailIssue[] }
  | { readonly kind: 'async' };

/**
 * Validate one detail bag against its registered schema. Core writes this
 * handler once; it works for zod, valibot, arktype, or an ajv wrapper,
 * because all of them expose the same `~standard` entry point.
 */
export function validateConfig<S extends StandardSchemaV1>(
  schema: S,
  config: unknown,
): Result<StandardSchemaV1.InferOutput<S>, ConfigError> {
  const outcome = schema['~standard'].validate(config);

  if (isPromise(outcome)) {
    return err({ kind: 'async' });
  }

  if (outcome.issues !== undefined) {
    return err({ kind: 'issues', issues: outcome.issues.map(toDetailIssue) });
  }

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
  const errors: DiagramError[] = [];

  const nodeLimit = options.nodeTypeLimit ?? DEFAULT_TYPE_LIMIT;
  const edgeLimit = options.edgeTypeLimit ?? DEFAULT_TYPE_LIMIT;
  const nodeTypeCount = nodeTypeKeys(registry).length;
  const edgeTypeCount = edgeTypeKeys(registry).length;

  if (nodeTypeCount > nodeLimit) {
    errors.push({ kind: 'registry_overflow', axis: 'nodeTypes', count: nodeTypeCount, limit: nodeLimit });
  }
  if (edgeTypeCount > edgeLimit) {
    errors.push({ kind: 'registry_overflow', axis: 'edgeTypes', count: edgeTypeCount, limit: edgeLimit });
  }

  const diagram = validateLevel(registry, spec, ROOT_PATH, errors);

  return errors.length > 0 ? err(errors) : ok(diagram);
}

function validateLevel<R extends AnyRegistry>(
  registry: R,
  spec: DiagramSpec,
  path: DiagramPath,
  errors: DiagramError[],
): ValidDiagram<R> {
  const lines = collectLines(spec, path, errors);
  const lineIds = new Set(lines.map((line) => line.id as string));
  const knownNodeTypes = nodeTypeKeys(registry);
  const knownEdgeTypes = edgeTypeKeys(registry);

  const nodes: ValidNode<R>[] = [];
  const seenNodeIds = new Set<string>();

  for (const nodeSpec of spec.nodes) {
    if (seenNodeIds.has(nodeSpec.id)) {
      errors.push({ kind: 'duplicate_node_id', path, nodeId: nodeSpec.id });
      continue;
    }
    seenNodeIds.add(nodeSpec.id);

    const typeDef = Object.hasOwn(registry.nodeTypes, nodeSpec.type) ? registry.nodeTypes[nodeSpec.type] : undefined;
    if (typeDef === undefined) {
      errors.push({
        kind: 'unknown_node_type',
        path,
        nodeId: nodeSpec.id,
        type: nodeSpec.type,
        known: knownNodeTypes,
      });
      continue;
    }

    const line = nodeSpec.line ?? null;
    if (line !== null && !lineIds.has(line)) {
      errors.push({
        kind: 'unknown_line',
        path,
        nodeId: nodeSpec.id,
        line,
        known: [...lineIds],
      });
    }

    const detail = validateConfig(typeDef.detail, nodeSpec.detail);
    if (!detail.ok) {
      errors.push(
        detail.error.kind === 'async'
          ? { kind: 'async_schema', path, entityId: nodeSpec.id, type: nodeSpec.type }
          : { kind: 'invalid_detail', path, nodeId: nodeSpec.id, type: nodeSpec.type, issues: detail.error.issues },
      );
      continue;
    }

    const id = nodeId(nodeSpec.id);
    const children =
      nodeSpec.children != null ? validateLevel(registry, nodeSpec.children, descend(path, id), errors) : null;

    // Cast: every field above has been checked against the registry entry for
    // `nodeSpec.type`, which is exactly the invariant ValidNode encodes. The
    // union cannot be constructed structurally without re-narrowing on a key
    // TypeScript has already widened to `string` at the spec boundary.
    nodes.push({
      id,
      type: nodeSpec.type,
      label: nodeSpec.label,
      line: line === null ? null : lineId(line),
      detail: detail.value,
      children,
    } as ValidNode<R>);
  }

  const edges: ValidEdge<R>[] = [];
  const seenEdgeIds = new Set<string>();

  for (const edgeSpec of spec.edges) {
    if (seenEdgeIds.has(edgeSpec.id)) {
      errors.push({ kind: 'duplicate_edge_id', path, edgeId: edgeSpec.id });
      continue;
    }
    seenEdgeIds.add(edgeSpec.id);

    const typeDef = Object.hasOwn(registry.edgeTypes, edgeSpec.type) ? registry.edgeTypes[edgeSpec.type] : undefined;
    if (typeDef === undefined) {
      errors.push({
        kind: 'unknown_edge_type',
        path,
        edgeId: edgeSpec.id,
        type: edgeSpec.type,
        known: knownEdgeTypes,
      });
      continue;
    }

    // Edges connect nodes within one level. A drill-down diagram is
    // self-contained, so there is no cross-level edge to resolve.
    let unresolved = false;
    if (!seenNodeIds.has(edgeSpec.source)) {
      errors.push({ kind: 'unresolved_endpoint', path, edgeId: edgeSpec.id, endpoint: 'source', ref: edgeSpec.source });
      unresolved = true;
    }
    if (!seenNodeIds.has(edgeSpec.target)) {
      errors.push({ kind: 'unresolved_endpoint', path, edgeId: edgeSpec.id, endpoint: 'target', ref: edgeSpec.target });
      unresolved = true;
    }

    const detail = validateConfig(typeDef.detail, edgeSpec.detail);
    if (!detail.ok) {
      errors.push(
        detail.error.kind === 'async'
          ? { kind: 'async_schema', path, entityId: edgeSpec.id, type: edgeSpec.type }
          : {
              kind: 'invalid_edge_detail',
              path,
              edgeId: edgeSpec.id,
              type: edgeSpec.type,
              issues: detail.error.issues,
            },
      );
      continue;
    }

    if (unresolved) continue;

    // Cast: same reasoning as ValidNode above.
    edges.push({
      id: edgeId(edgeSpec.id),
      type: edgeSpec.type,
      source: nodeId(edgeSpec.source),
      target: nodeId(edgeSpec.target),
      label: edgeSpec.label ?? null,
      detail: detail.value,
    } as ValidEdge<R>);
  }

  return {
    __brand: 'ValidDiagram',
    registry,
    lines,
    nodes,
    edges,
  };
}

function collectLines(spec: DiagramSpec, path: DiagramPath, errors: DiagramError[]): readonly Line[] {
  const lines: Line[] = [];
  const seen = new Set<string>();

  for (const line of spec.lines ?? []) {
    if (seen.has(line.id)) {
      errors.push({ kind: 'duplicate_line_id', path, lineId: line.id });
      continue;
    }
    seen.add(line.id);
    lines.push({ id: lineId(line.id), label: line.label, color: line.color });
  }

  return lines;
}

function toDetailIssue(issue: StandardSchemaV1.Issue): DetailIssue {
  const segments = (issue.path ?? []).map((segment) =>
    typeof segment === 'object' && segment !== null && 'key' in segment ? String(segment.key) : String(segment),
  );
  return { message: issue.message, field: segments.length > 0 ? segments.join('.') : '<root>' };
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown }).then === 'function';
}
