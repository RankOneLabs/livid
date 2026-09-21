import type { DiagramSpec, EdgeSpec, NodeSpec } from '@rankonelabs/livid-core';

export const LARGE_SCOPE_NODE_COUNT = 150;

function nodeAt(index: number): NodeSpec {
  return {
    id: `module-${index}`,
    type: index % 10 === 0 ? 'boundary' : 'module',
    label: `Module ${index}`,
  };
}

function edgeAt(index: number): EdgeSpec {
  return {
    id: `dependency-${index}`,
    type: 'dependency',
    source: `module-${index}`,
    target: `module-${(index + 1) % LARGE_SCOPE_NODE_COUNT}`,
    detail: { package: `package-${index % 12}`, relation: 'imports' },
  };
}

export function generateLargeScope(): DiagramSpec {
  const indexes = Array.from({ length: LARGE_SCOPE_NODE_COUNT }, (_, index) => index);
  return {
    profile: 'dependency',
    nodes: indexes.map(nodeAt),
    edges: indexes.map(edgeAt),
  };
}

export const largeScopeSpec = generateLargeScope();
