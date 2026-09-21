import { defineRegistry, type StandardSchemaV1 } from '@rankonelabs/livid-core';

function schema<T>(validate: (value: unknown) => StandardSchemaV1.Result<T>): StandardSchemaV1<unknown, T> {
  return { '~standard': { version: 1, vendor: 'sv-livid-v1', validate } };
}

const anything = schema<unknown>((value) => ({ value: value ?? null }));

export interface DependencyDetail {
  readonly package: string;
  readonly relation: string;
}

const dependencyDetail = schema<DependencyDetail>((value) => {
  if (typeof value !== 'object' || value === null) {
    return { issues: [{ message: 'expected an object' }] };
  }
  const detail = value as { readonly package?: unknown; readonly relation?: unknown };
  if (typeof detail.package !== 'string' || typeof detail.relation !== 'string') {
    return { issues: [{ message: 'expected package and relation strings' }] };
  }
  return { value: { package: detail.package, relation: detail.relation } };
});

export const svLividRegistry = defineRegistry({
  nodeTypes: {
    workspace: { label: 'Workspace', detail: anything, shape: 'hexagon', isRouter: false },
    package: { label: 'Package', detail: anything, shape: 'rounded', isRouter: false },
    module: { label: 'Module', detail: anything, shape: 'rect', isRouter: false },
    symbol: { label: 'Symbol', detail: anything, shape: 'stadium', isRouter: false },
    datastore: { label: 'Datastore', detail: anything, shape: 'cylinder', isRouter: false },
    boundary: { label: 'Boundary', detail: anything, shape: 'diamond', isRouter: false },
    external: { label: 'External', detail: anything, shape: 'circle', isRouter: false },
  },
  edgeTypes: {
    dependency: { label: 'Dependency', detail: dependencyDetail },
    import: { label: 'Import', detail: anything },
    call: { label: 'Call', detail: anything },
  },
});

export const SV_LIVID_VALIDATE_OPTIONS = { nodeTypeLimit: 10, edgeTypeLimit: 10 } as const;
