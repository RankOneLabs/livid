import type { EdgeId, NodeId } from './ids.js';
import type { AnyRegistry } from './registry.js';
import { err, ok, type Result } from './result.js';
import type { ValidDiagram, ValidEdge, ValidNode } from './types.js';

export interface StateFrame {
  readonly __brand: 'StateFrame';
  readonly nodes: Readonly<Record<NodeId, string>>;
  readonly edges: Readonly<Record<EdgeId, string>>;
}

export type StateError =
  | { readonly kind: 'invalid_state_frame'; readonly field: 'frame' | 'nodes' | 'edges' }
  | { readonly kind: 'unknown_state_entity'; readonly entity: 'node' | 'edge'; readonly id: string }
  | {
      readonly kind: 'unknown_state';
      readonly entity: 'node' | 'edge';
      readonly id: string;
      readonly type: string;
      readonly state: string;
      readonly known: readonly string[];
    };

interface StateFrameInput {
  readonly nodes: Readonly<Record<string, string>>;
  readonly edges: Readonly<Record<string, string>>;
}

export function validateState<R extends AnyRegistry>(
  registry: R,
  valid: ValidDiagram<R>,
  frame: unknown,
): Result<StateFrame, readonly StateError[]> {
  const input = stateFrameInput(frame);
  if (!input.ok) return input;

  const diagramNodes = collectNodes(valid);
  const diagramEdges = collectEdges(valid);
  const errors = [
    ...validateAssignments('node', input.value.nodes, diagramNodes, (type) => registry.nodeTypes[type]?.states),
    ...validateAssignments('edge', input.value.edges, diagramEdges, (type) => registry.edgeTypes[type]?.states),
  ];

  if (errors.length > 0) return err(errors);
  // Validation above proves every string key is a branded entity id from the
  // diagram. Copy the maps so a caller cannot mutate the validated snapshot by
  // retaining and changing its input object.
  const nodes = { ...input.value.nodes } as Readonly<Record<NodeId, string>>;
  const edges = { ...input.value.edges } as Readonly<Record<EdgeId, string>>;
  return ok({ __brand: 'StateFrame', nodes, edges });
}

function stateFrameInput(frame: unknown): Result<StateFrameInput, readonly StateError[]> {
  if (!isRecord(frame)) return err([{ kind: 'invalid_state_frame', field: 'frame' }]);
  const errors: StateError[] = [];
  if (!isStringRecord(frame.nodes)) errors.push({ kind: 'invalid_state_frame', field: 'nodes' });
  if (!isStringRecord(frame.edges)) errors.push({ kind: 'invalid_state_frame', field: 'edges' });
  if (errors.length > 0) return err(errors);
  return ok({
    nodes: frame.nodes as Readonly<Record<string, string>>,
    edges: frame.edges as Readonly<Record<string, string>>,
  });
}

function validateAssignments<R extends AnyRegistry>(
  entity: 'node' | 'edge',
  assignments: Readonly<Record<string, string>>,
  entities: ReadonlyMap<string, ValidNode<R> | ValidEdge<R>>,
  statesOf: (type: string) => Readonly<Record<string, unknown>> | undefined,
): readonly StateError[] {
  return Object.entries(assignments).flatMap(([id, state]): readonly StateError[] => {
    const item = entities.get(id);
    if (item === undefined) return [{ kind: 'unknown_state_entity', entity, id } as const];
    const states = statesOf(item.type);
    if (states !== undefined && Object.hasOwn(states, state)) return [];
    return [
      {
        kind: 'unknown_state',
        entity,
        id,
        type: item.type,
        state,
        known: states === undefined ? [] : Object.keys(states),
      } as const,
    ];
  });
}

function collectNodes<R extends AnyRegistry>(diagram: ValidDiagram<R>): ReadonlyMap<string, ValidNode<R>> {
  return new Map(diagram.nodes.flatMap((node) => [[node.id as string, node] as const, ...collectChildNodes(node)]));
}

function collectChildNodes<R extends AnyRegistry>(node: ValidNode<R>): readonly (readonly [string, ValidNode<R>])[] {
  return node.children === null ? [] : [...collectNodes(node.children)];
}

function collectEdges<R extends AnyRegistry>(diagram: ValidDiagram<R>): ReadonlyMap<string, ValidEdge<R>> {
  return new Map([
    ...diagram.edges.map((edge) => [edge.id as string, edge] as const),
    ...diagram.nodes.flatMap((node) => node.children === null ? [] : [...collectEdges(node.children)]),
  ]);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}
