# @rankonelabs/livid-core

Headless core for [livid](https://github.com/RankOneLabs/livid) — living
diagrams: system maps derived from schema, where every node and edge is real
and drills down into the payload flowing through it.

Config in, validated and laid-out view data out. No DOM, runs in Node.

```
DiagramSpec ──validate──▶ ValidDiagram ──layout──▶ LaidOutDiagram ──▶ svg | react
user-authored             core-only                core-only
```

`ValidDiagram` and `LaidOutDiagram` are branded, so there is no path from a
spec to a rendered diagram that skips validation. `LaidOutDiagram` is
serializable JSON — geometry is computed once at build time and either inlined
as SVG or handed to a React island that then does no layout work in the browser.

## Install

```
npm install @rankonelabs/livid-core
```

## Use

Register a vocabulary, validate a spec, lay it out:

```ts
import { defineRegistry, validateDiagram, validateState, layout } from '@rankonelabs/livid-core'

const registry = defineRegistry({
  nodeTypes: {
    transform: {
      label: 'Transform', detail: TransformDetail, shape: 'rounded', isRouter: false,
      states: {
        ready:   { tint: 'base' },
        active:  { tint: 'accent', anim: 'pulse' },
        blocked: { tint: 'danger', anim: 'stall' },
      },
    },
    gate:      { label: 'Gate',      detail: GateDetail,      shape: 'diamond',  isRouter: true  },
  },
  edgeTypes: {
    flow: { label: 'Flow', detail: FlowDetail },
  },
})

const valid = validateDiagram(registry, spec)
if (!valid.ok) return valid.error          // every problem, in one pass

const laid = await layout(valid.value)     // async: elkjs has no sync API

const state = validateState(registry, valid.value, {
  nodes: { transformer: 'active' },
  edges: {},
})
```

`layout()` does one level; `layoutDeep()` walks the whole drill-down tree.
In a cycle, declaration order is reading order: edges that point at an
earlier-listed node are the ones that wrap back, so a simple loop reads from its
first-listed node with one return arc. Acyclic specs are ranked by their edges
alone.
`StateFrame` is validated and branded separately from layout, so live state can
change without recomputing serializable geometry. State names belong to each
registered type; their visuals use the closed tint and animation vocabularies.

## Vocabulary is registered, not hardcoded

Core enforces *discipline* — a cardinality limit, shape-carries-type,
colour-carries-line, `isRouter` for control flow — never membership. A pipeline
standard and a codebase scanner declare different vocabularies and both render.

Everything meta about control flow belongs to node types that declare
`isRouter`: branching out, condensing in, terminating, changing line. Edges say
only *what flows*. Two invariants follow, and core enforces both: fanning out is
router-only, and a line may only change at a router.

What *decides* the routing — a gate, a threshold, reading tea leaves — is domain
semantics living in the type's detail schema. Core never learns the word "gate".

## Schemas

Detail schemas use the [Standard Schema](https://github.com/standard-schema/standard-schema)
interface, vendored as types only — bring zod, valibot, arktype, or wrap ajv.
Core writes the validation handler once and it works for all of them, so core
carries no validation dependency. Detail types flow by inference from the
registry entry through to the renderer.

Errors are values, not exceptions. Validation reports every problem in one pass
with the drill-down path attached.

## Dependencies

[elkjs](https://github.com/kieler/elkjs), for layout. That is the only one —
ELK over dagre because real orthogonal routing is what makes the map read as a
transit diagram rather than a flowchart, and its cost lands at build time.

## Renderers

`@rankonelabs/livid-svg` renders a `LaidOutDiagram` to an SVG string at build
time; `@rankonelabs/livid-react` is still to come. Layout lives here rather than
in each renderer, which is what makes the SVG in a post and the React canvas in
an app the *same map*.

Full documentation: <https://github.com/RankOneLabs/livid>
