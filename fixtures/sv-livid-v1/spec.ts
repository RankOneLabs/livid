import type { DiagramSpec } from '@rankonelabs/livid-core';

const dependency = (packageName: string, relation: string) => ({ package: packageName, relation });

export const svLividV1Spec: DiagramSpec = {
  profile: 'dependency',
  lines: [
    { id: 'source', label: 'Source', color: 'route-1' },
    { id: 'storage', label: 'Storage', color: 'route-2' },
  ],
  nodes: [
    { id: 'repo', type: 'workspace', label: 'livid workspace', line: 'source' },
    {
      id: 'core',
      type: 'package',
      label: '@rankonelabs/livid-core',
      childState: {
        kind: 'embedded',
        diagram: {
          nodes: [
            { id: 'validate', type: 'module', label: 'validate.ts' },
            { id: 'normalize', type: 'module', label: 'normalize.ts' },
            { id: 'layout', type: 'module', label: 'layout.ts' },
          ],
          edges: [
            { id: 'inner-1', type: 'import', source: 'validate', target: 'normalize' },
            { id: 'inner-2', type: 'import', source: 'normalize', target: 'layout' },
          ],
        },
      },
    },
    {
      id: 'react',
      type: 'package',
      label: '@rankonelabs/livid-react',
      childState: { kind: 'deferred', key: 'sv-livid-v1:react' },
    },
    { id: 'svg', type: 'package', label: '@rankonelabs/livid-svg' },
    { id: 'api', type: 'symbol', label: 'public API' },
    { id: 'cache', type: 'datastore', label: 'layout cache', line: 'storage' },
    { id: 'boundary', type: 'boundary', label: 'package boundary' },
    { id: 'elk', type: 'external', label: 'elkjs' },
  ],
  edges: [
    { id: 'repo-core', type: 'dependency', source: 'repo', target: 'core', detail: dependency('core', 'owns') },
    { id: 'repo-react', type: 'dependency', source: 'repo', target: 'react', detail: dependency('react', 'owns') },
    { id: 'repo-svg', type: 'dependency', source: 'repo', target: 'svg', detail: dependency('svg', 'owns') },
    { id: 'core-api', type: 'call', source: 'core', target: 'api', label: 'exports' },
    { id: 'api-boundary', type: 'call', source: 'api', target: 'boundary' },
    { id: 'boundary-core', type: 'call', source: 'boundary', target: 'core' },
    { id: 'core-elk-import', type: 'import', source: 'core', target: 'elk' },
    {
      id: 'core-elk-dependency',
      type: 'dependency',
      source: 'core',
      target: 'elk',
      detail: dependency('elkjs', 'runtime'),
    },
    { id: 'core-cache', type: 'call', source: 'core', target: 'cache' },
  ],
};
