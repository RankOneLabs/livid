import { useCallback, useEffect, useRef, useState } from 'react';
import {
  layout,
  validateDiagram,
  type DeferredKey,
  type DiagramSpec,
  type LaidOutDiagram,
  type StateFrame,
  type ValidateOptions,
} from '@rankonelabs/livid-core';

import { svLividRegistry } from '../../fixtures/sv-livid-v1/registry.js';
import { svLividV1Spec } from '../../fixtures/sv-livid-v1/spec.js';
import {
  LividDiagram,
  type DescendRequest,
  type DiagramSelection,
} from '../../packages/react/src/index.js';

const validateOptions: ValidateOptions = {
  nodeTypeLimit: 10,
  edgeTypeLimit: 10,
};

const emptyFrame: StateFrame = { __brand: 'StateFrame', nodes: {}, edges: {} };

function deferredSpec(key: DeferredKey): DiagramSpec {
  if (key !== 'sv-livid-v1:react') return { profile: 'dependency', nodes: [], edges: [] };
  return {
    profile: 'dependency',
    nodes: [
      { id: 'component', type: 'module', label: 'LividDiagram.tsx', detail: { source: 'deferred' } },
      { id: 'model', type: 'module', label: 'model.ts', detail: { source: 'deferred' } },
    ],
    edges: [
      { id: 'component-model', type: 'import', source: 'component', target: 'model', label: 'projects' },
    ],
  };
}

async function layOut(spec: DiagramSpec): Promise<LaidOutDiagram<typeof svLividRegistry>> {
  const valid = validateDiagram(svLividRegistry, spec, validateOptions);
  if (!valid.ok) throw new Error(valid.error.map((error) => error.kind).join(', '));
  const laid = await layout(valid.value);
  if (!laid.ok) throw new Error(laid.error.map((error) => error.kind).join(', '));
  return laid.value;
}

export function App() {
  const [diagram, setDiagram] = useState<LaidOutDiagram<typeof svLividRegistry> | null>(null);
  const [selection, setSelection] = useState<DiagramSelection | null>(null);
  const [inspectorDetail, setInspectorDetail] = useState<unknown>(null);
  const descendingNodeId = useRef<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void layOut(svLividV1Spec).then((next) => {
      if (isCurrent) setDiagram(next);
    });
    return () => { isCurrent = false; };
  }, []);

  const inspect = useCallback((next: DiagramSelection) => {
    setInspectorDetail(next.detail);
  }, []);

  const changeSelection = useCallback((next: DiagramSelection | null) => {
    // A double-click emits click selection first. Ignore selection notifications
    // for the node while its requested replacement is being installed.
    if (next?.kind === 'node' && next.id === descendingNodeId.current) return;
    setSelection(next);
  }, []);

  const descend = useCallback(async (request: DescendRequest) => {
    descendingNodeId.current = request.nodeId;
    setSelection(null);
    if (request.childState.kind === 'deferred') {
      const nextRoot = await layOut(deferredSpec(request.childState.key));
      setDiagram(nextRoot);
    }
    descendingNodeId.current = null;
  }, []);

  if (diagram === null) return <p>Loading system map…</p>;

  return <main className="sysvista-example">
    <section className="sysvista-canvas">
      <LividDiagram
        diagram={diagram}
        frame={emptyFrame}
        selection={selection}
        onSelectionChange={changeSelection}
        onSelect={inspect}
        onDescendRequest={(request) => { void descend(request); }}
        fitOnReplace
      />
    </section>
    <aside aria-label="Inspector">
      <pre>{JSON.stringify(inspectorDetail, null, 2)}</pre>
    </aside>
  </main>;
}
