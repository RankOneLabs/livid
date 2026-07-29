import {
  type DiagramSpec,
  type LaidOutDiagram,
  type StandardSchemaV1,
  defineRegistry,
  layoutDeep,
  validateDiagram,
} from '@rankonelabs/livid-core';

/** Accepts anything. Detail validation is core's concern, not the renderer's. */
export const anything: StandardSchemaV1<unknown, unknown> = {
  '~standard': {
    version: 1,
    vendor: 'livid-svg-test',
    validate: (value: unknown) => ({ value }),
  },
};

/**
 * One node type per shape family the renderer treats differently: boxes that
 * carry their own label, and the two point shapes whose labels sit beside.
 */
export const REGISTRY = defineRegistry({
  nodeTypes: {
    terminal: { label: 'Terminal', detail: anything, shape: 'stadium', isRouter: false },
    work: { label: 'Work', detail: anything, shape: 'rect', isRouter: false },
    junction: { label: 'Junction', detail: anything, shape: 'circle', glyph: 'dot', isRouter: true },
    decision: { label: 'Decision', detail: anything, shape: 'diamond', glyph: 'bar', isRouter: true },
    observer: { label: 'Observer', detail: anything, shape: 'hexagon', isRouter: false },
  },
  edgeTypes: {
    flow: { label: 'Flow', detail: anything },
  },
});

export type TestRegistry = typeof REGISTRY;

const NESTED: DiagramSpec = {
  lines: [{ id: 'inner', label: 'Inner', color: 'token-inner' }],
  nodes: [
    { id: 'step-one', type: 'work', label: 'step one', line: 'inner' },
    { id: 'step-two', type: 'work', label: 'step two', line: 'inner' },
  ],
  edges: [{ id: 'i1', type: 'flow', source: 'step-one', target: 'step-two' }],
};

export const SPEC: DiagramSpec = {
  lines: [
    { id: 'main', label: 'Main', color: 'token-main' },
    { id: 'side', label: 'Side', color: 'token-side' },
  ],
  nodes: [
    { id: 'entry', type: 'terminal', label: 'entry point', line: 'main' },
    { id: 'process', type: 'work', label: 'process', line: 'main', children: NESTED },
    { id: 'fork', type: 'junction', label: 'fork', line: 'main' },
    { id: 'check', type: 'decision', label: 'a very long decision name', line: 'main' },
    { id: 'watcher', type: 'observer', label: 'watcher', line: 'side' },
    { id: 'exit', type: 'terminal', label: 'exit point', line: 'main' },
  ],
  edges: [
    { id: 'e1', type: 'flow', source: 'entry', target: 'process' },
    { id: 'e2', type: 'flow', source: 'process', target: 'fork' },
    { id: 'e3', type: 'flow', source: 'fork', target: 'check' },
    { id: 'e4', type: 'flow', source: 'check', target: 'exit' },
    { id: 'e5', type: 'flow', source: 'fork', target: 'watcher' },
  ],
};

export async function laidOut(spec: DiagramSpec = SPEC): Promise<LaidOutDiagram<TestRegistry>> {
  const valid = validateDiagram(REGISTRY, spec);
  if (!valid.ok) throw new Error(`fixture is not valid: ${JSON.stringify(valid.error)}`);

  const laid = await layoutDeep(valid.value);
  if (!laid.ok) throw new Error(`fixture did not lay out: ${JSON.stringify(laid.error)}`);
  return laid.value;
}

/** Every numeric attribute of one kind, for bounds assertions. */
export function attributeValues(svg: string, attribute: string): readonly number[] {
  return [...svg.matchAll(new RegExp(`${attribute}="(-?[\\d.]+)"`, 'g'))].flatMap((match) => {
    const value = Number(match[1]);
    return Number.isFinite(value) ? [value] : [];
  });
}
