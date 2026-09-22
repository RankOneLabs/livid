# @rankonelabs/livid-react

Interactive XY Flow renderer for validated, laid-out livid diagrams. Geometry is
owned by **@rankonelabs/livid-core**; this package draws that geometry and
applies validated StateFrame snapshots without learning consumer vocabulary.

Import **@rankonelabs/livid-react/styles.css** once, give the canvas a sized
parent, and render a LaidOutDiagram:

    <LividDiagram diagram={laidOut} frame={frame} onSelect={openInspector} />

## Descent

Embedded and deferred nodes receive a real, focusable button named “Descend
into *node label*”. Tab to it and use Enter or Space, or double-click the node.
Each action calls onDescendRequest once with the node id and its discriminated
child state:

    <LividDiagram
      diagram={laidOut}
      frame={frame}
      onDescendRequest={({ nodeId, childState }) => {
        if (childState.kind === 'deferred') void loadAndReplace(nodeId, childState.key);
        else openEmbedded(nodeId);
      }}
    />

The deprecated onDescend(nodeId, laidOutChild) remains for deep-laid-out
embedded diagrams. If both callbacks are supplied, onDescendRequest takes
precedence and onDescend is not called.

A DOM double-click dispatches two click events before dblclick. Selection
notifications can therefore precede the descent request; the component does
not suppress legitimate single-click selection. A host that replaces the root
on descent should ignore selection updates for the node being descended into,
as shown in **examples/sysvista-integration**.

## Selection and inspection

The selection prop is controlled and accepts one DiagramSelection or null.
Clicking a node or edge reports it directly through onSelectionChange; clicking
the pane reports null. Feed the accepted value back through selection, which
sets XY Flow's controlled selected flags. Echoing that value changes only the
visual selection and does not emit another notification. onSelect receives the
same node or edge click for inspector-style consumers and can be used alongside
controlled selection. Every selection contains the entity's validated detail.

Parallel edges retain their core edge ids as distinct XY Flow ids. They keep
their own detail, route, selected state, and click target even when source and
target are the same. Self-loops use the route supplied by core.

## Focus, fitting, and viewport

The focus prop is a controlled intent naming a visible node or edge. When the
target changes, the canvas centres it once. It does not centre again because
the diagram object or frame changed. onFocusResult receives either the focused
target or { kind: 'focusMissing', focus }; absence is reported as a value and
never thrown.

fitView controls XY Flow's initial fit. Later diagram replacements preserve the
viewport unless fitOnReplace is true; frame-only updates never fit or centre.
For explicit camera persistence, hold a ref:

    const diagramRef = useRef<LividDiagramHandle>(null);
    const savedViewport = useRef<ReturnType<LividDiagramHandle['getViewport']> | null>(null);

    const saveViewport = () => {
      if (diagramRef.current !== null) {
        savedViewport.current = diagramRef.current.getViewport();
      }
    };

    const restoreViewport = async () => {
      if (diagramRef.current !== null && savedViewport.current !== null) {
        await diagramRef.current.setViewport(savedViewport.current, { duration: 150 });
      }
    };

    <LividDiagram ref={diagramRef} diagram={laidOut} frame={frame} />

Call saveViewport and restoreViewport from event handlers or effects, never
during render.

These methods use XY Flow's Viewport shape: { x, y, zoom }.

## Direction and edge labels

Dependency-profile diagrams draw closed target arrowheads automatically.
Pipeline diagrams remain unadorned unless showDirection is true. Edge labels
use the exact position and size projected by core rather than being measured in
the browser.

## Palette

The default stylesheet exposes seven colour variables. A light palette can
override all of them:

    .light-system-map .livid-react {
      --livid-surface: #ffffff;
      --livid-text: #17242d;
      --livid-base: #52718a;
      --livid-muted: #71808c;
      --livid-accent: #087f6c;
      --livid-danger: #c9364a;
      --livid-ghost: #aab4bb;
    }

--livid-surface and --livid-text cover node and edge-label surfaces and text.
The other tokens colour base, muted, accent, danger, and ghost visual states.
Scope overrides above .livid-react so multiple palettes can coexist.
