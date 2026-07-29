import type { DiagramError } from './errors.js';
import { type DiagramPath, type LineId, ROOT_PATH, descend, nodeId } from './ids.js';
import { type Result, err, ok } from './result.js';
import type { AnyRegistry } from './registry.js';
import type { ValidDiagram, ValidNode } from './types.js';

/**
 * Fills in what a projection is allowed to leave out, then enforces the one
 * invariant that cannot be checked until lines are resolved.
 *
 * This is where aesthetic rules both renderers must agree on live — line
 * assignment above all. It is deliberately separate from layout so colour
 * rules do not get tangled with geometry, and it is core's, not the
 * consumer's: user control stops at config.
 *
 * Fallible because it now enforces something rather than only defaulting.
 * `layout()` calls it itself, so it cannot be skipped.
 *
 * Idempotent: normalizing an already-normalized diagram returns an equivalent
 * diagram.
 */
export function normalize<R extends AnyRegistry>(
  diagram: ValidDiagram<R>,
): Result<ValidDiagram<R>, readonly DiagramError[]> {
  const level = normalizeLevel(diagram, ROOT_PATH);
  return level.errors.length > 0 ? err(level.errors) : ok(level.diagram);
}

interface Level<R extends AnyRegistry> {
  readonly diagram: ValidDiagram<R>;
  readonly errors: readonly DiagramError[];
}

function normalizeLevel<R extends AnyRegistry>(diagram: ValidDiagram<R>, path: DiagramPath): Level<R> {
  const assigned = assignLines(diagram);

  const nested = assigned.nodes.map((node) =>
    node.children === null ? null : normalizeLevel(node.children, descend(path, nodeId(node.id))),
  );

  const nodes = assigned.nodes.map((node, index) => {
    const child = nested[index];
    return (child === null || child === undefined ? node : { ...node, children: child.diagram }) as ValidNode<R>;
  });

  return {
    diagram: { ...assigned, nodes },
    errors: [
      ...illegalLineChanges(assigned, path),
      ...nested.flatMap((child) => child?.errors ?? []),
    ],
  };
}

/**
 * A node without a declared line inherits from whatever flows into it, so an
 * author only has to colour the head of each route rather than every station.
 * Nodes still unassigned after propagation fall back to the first declared
 * line, which keeps a single-line diagram free of annotation entirely.
 *
 * A loop rather than a fold: this is a fixpoint, and iterating until stable
 * says that more plainly than an accumulation would.
 */
function assignLines<R extends AnyRegistry>(diagram: ValidDiagram<R>): ValidDiagram<R> {
  const fallback: LineId | null = diagram.lines[0]?.id ?? null;
  const lineByNode = new Map<string, LineId | null>(diagram.nodes.map((node) => [node.id as string, node.line]));

  // Bounded by node count: each pass assigns at least one node or converges.
  for (let pass = 0; pass < diagram.nodes.length; pass += 1) {
    const pending = diagram.edges.filter(
      (edge) => lineByNode.get(edge.target) == null && lineByNode.get(edge.source) != null,
    );
    if (pending.length === 0) break;

    for (const edge of pending) {
      lineByNode.set(edge.target, lineByNode.get(edge.source) ?? null);
    }
  }

  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      const line = lineByNode.get(node.id) ?? fallback;
      return (line === node.line ? node : { ...node, line }) as ValidNode<R>;
    }),
  };
}

/**
 * You change line at an interchange, never mid-track. A router may switch flow
 * onto another line but is not obliged to — most gates pass straight through.
 */
function illegalLineChanges<R extends AnyRegistry>(
  diagram: ValidDiagram<R>,
  path: DiagramPath,
): readonly DiagramError[] {
  const byId = new Map(diagram.nodes.map((node) => [node.id as string, node]));

  return diagram.edges.flatMap((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source === undefined || target === undefined) return [];
    if (source.line === target.line) return [];
    if (diagram.registry.nodeTypes[source.type]?.isRouter === true) return [];

    return [
      {
        kind: 'illegal_line_change',
        path,
        edgeId: edge.id,
        sourceId: source.id,
        sourceType: source.type,
        fromLine: source.line,
        toLine: target.line,
      } satisfies DiagramError,
    ];
  });
}
