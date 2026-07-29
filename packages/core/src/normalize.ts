import type { DiagramError } from './errors.js';
import { type DiagramPath, ROOT_PATH, type LineId, descend, nodeId } from './ids.js';
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
  const errors: DiagramError[] = [];
  const normalized = normalizeLevel(diagram, ROOT_PATH, errors);
  return errors.length > 0 ? err(errors) : ok(normalized);
}

function normalizeLevel<R extends AnyRegistry>(
  diagram: ValidDiagram<R>,
  path: DiagramPath,
  errors: DiagramError[],
): ValidDiagram<R> {
  const assigned = assignLines(diagram);
  checkLineChanges(assigned, path, errors);

  return {
    ...assigned,
    nodes: assigned.nodes.map((node) =>
      node.children === null
        ? node
        : ({ ...node, children: normalizeLevel(node.children, descend(path, nodeId(node.id)), errors) } as ValidNode<R>),
    ),
  };
}

/**
 * A node without a declared line inherits from whatever flows into it, so an
 * author only has to colour the head of each route rather than every station.
 * Nodes still unassigned after propagation fall back to the first declared
 * line, which keeps a single-line diagram free of annotation entirely.
 */
function assignLines<R extends AnyRegistry>(diagram: ValidDiagram<R>): ValidDiagram<R> {
  const fallback: LineId | null = diagram.lines[0]?.id ?? null;
  const lineByNode = new Map<string, LineId | null>();
  for (const node of diagram.nodes) {
    lineByNode.set(node.id, node.line);
  }

  // Repeat until stable. Bounded by node count: each pass assigns at least one
  // node or the diagram has converged.
  for (let pass = 0; pass < diagram.nodes.length; pass += 1) {
    let changed = false;

    for (const edge of diagram.edges) {
      if (lineByNode.get(edge.target) != null) continue;
      const upstream = lineByNode.get(edge.source);
      if (upstream == null) continue;
      lineByNode.set(edge.target, upstream);
      changed = true;
    }

    if (!changed) break;
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
function checkLineChanges<R extends AnyRegistry>(
  diagram: ValidDiagram<R>,
  path: DiagramPath,
  errors: DiagramError[],
): void {
  const byId = new Map(diagram.nodes.map((node) => [node.id as string, node]));

  for (const edge of diagram.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (source === undefined || target === undefined) continue;
    if (source.line === target.line) continue;
    if (diagram.registry.nodeTypes[source.type]?.isRouter === true) continue;

    errors.push({
      kind: 'illegal_line_change',
      path,
      edgeId: edge.id,
      sourceId: source.id,
      sourceType: source.type,
      fromLine: source.line,
      toLine: target.line,
    });
  }
}
