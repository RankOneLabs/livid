import type { LineId } from './ids.js';
import type { AnyRegistry } from './registry.js';
import type { ValidDiagram, ValidNode } from './types.js';

/**
 * Fills in what a projection is allowed to leave out. Idempotent: normalizing
 * an already-normalized diagram returns an equivalent diagram.
 *
 * This is where aesthetic rules that both renderers must agree on live — line
 * assignment above all. It is deliberately separate from layout so colour
 * rules do not get tangled with geometry, and it is core's, not the
 * consumer's: user control stops at config.
 *
 * `layout()` calls this itself, so it cannot be skipped.
 */
export function normalize<R extends AnyRegistry>(diagram: ValidDiagram<R>): ValidDiagram<R> {
  const assigned = assignLines(diagram);

  return {
    ...assigned,
    nodes: assigned.nodes.map((node) =>
      node.children === null ? node : ({ ...node, children: normalize(node.children) } as ValidNode<R>),
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
