# @rankonelabs/livid-react

Interactive XY Flow renderer for validated, laid-out livid diagrams. Geometry is
owned by `@rankonelabs/livid-core`; this package draws that geometry and applies
validated `StateFrame` snapshots without learning consumer vocabulary.

Import `@rankonelabs/livid-react/styles.css` once in your application, then render:

```tsx
<LividDiagram diagram={laidOut} frame={frame} onSelect={openDetail} />
```

Passing a new frame updates tint and animation tokens in place. Nodes and edges
report their validated detail payload through `onSelect`; nodes with child diagrams
also report double-click drill-down through `onDescend`.
