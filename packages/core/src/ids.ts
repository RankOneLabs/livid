/**
 * Domain identifiers. Branded so a node id and an edge id cannot be swapped,
 * and so a raw string from a spec cannot reach a validated diagram without
 * passing through a constructor here.
 */
export type NodeId = string & { readonly __brand: 'NodeId' };
export type EdgeId = string & { readonly __brand: 'EdgeId' };
export type LineId = string & { readonly __brand: 'LineId' };

export function nodeId(raw: string): NodeId {
  return raw as NodeId;
}

export function edgeId(raw: string): EdgeId {
  return raw as EdgeId;
}

export function lineId(raw: string): LineId {
  return raw as LineId;
}

/**
 * Position of a nested diagram within the drill-down tree. Empty at the top
 * level; each segment is the id of the node whose `children` diagram was
 * entered. Carried on every error so a failure deep in a recursion can be
 * traced to its path.
 */
export type DiagramPath = readonly NodeId[];

export const ROOT_PATH: DiagramPath = [];

export function descend(path: DiagramPath, into: NodeId): DiagramPath {
  return [...path, into];
}

export function formatPath(path: DiagramPath): string {
  return path.length === 0 ? '<root>' : path.join(' › ');
}
