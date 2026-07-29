# livid

Living diagrams: system maps derived from schema, where every node and edge is
real and drills down into the payload flowing through it.

Top layer is the map. One level down is a node's guts. One more down is the
actual payload. Same interaction model at every level — dense systems made
legible by progressive disclosure rather than by leaving things out.

## Packages

| Package | Role |
|---|---|
| `@livid/core` | Headless. Registry, validation, normalization, layout. No DOM, runs in Node. |
| `@livid/svg` | `LaidOutDiagram` → SVG string. Build-time, zero client JS. For posts and portability. |
| `@livid/react` | `LaidOutDiagram` → XY Flow canvas. For web apps and live-wired feeds. |

Only `core` exists so far.

## The pipeline

```
DiagramSpec ──validate──▶ ValidDiagram ──layout──▶ LaidOutDiagram ──▶ svg | react
user-authored             core-only                core-only
```

`ValidDiagram` and `LaidOutDiagram` are branded, so there is no path from a
spec to a rendered diagram that skips validation. Layout lives in core rather
than in each renderer — that is what makes the SVG in a post and the React
canvas in an app the *same map*, not two drawings that drifted.

`LaidOutDiagram` is serializable JSON, so geometry is computed once at build
time and either inlined as SVG or handed to the React island, which then does
no layout work in the browser.

Validation and normalization are synchronous. Layout is not — it runs on
[elkjs](https://github.com/kieler/elkjs), which exposes no synchronous API.
ELK over dagre because real orthogonal routing is what makes the map read as a
transit diagram rather than a flowchart, and its cost lands at build time where
bundle size and async both come free.

`layout()` does one level; `layoutDeep()` walks the drill-down tree. The SVG
renderer needs deep — a static file has to contain every level it can reveal.
The React renderer can go shallow and descend on demand, which is what keeps
large graphs viable.

## Where user control stops

- **What data** → config, validated, brand-gated.
- **How a type draws** → registry config (`shape`, `glyph`). Not component
  injection: both renderers are closed, which is what guarantees they agree.
- **Nothing structural** → graph invariants, normalization, layout, and edge
  routing are core's.

Detail views are derived from the type's schema rather than hand-written per
type, which is what keeps shipping sensible defaults cheap.

## Routers carry control flow; edges carry payload

Edges say *what flows* — a query, a log write, a payment authorization — and
their detail schema shapes the payload you drill into. They have no say in
what happens to flow.

Everything meta belongs to node types that declare `isRouter`: branching out,
condensing in, terminating, and changing line. A router has contents worth
drilling into (a policy, a verdict, an evidence trail), fan-out is naturally
n-ary where an edge is binary, and on a transit map you change line *at* an
interchange rather than mid-track.

What *decides* the routing — a gate, a threshold, reading tea leaves — is
domain semantics living in the router type's detail schema. Core never learns
the word "gate".

Two invariants follow, and core enforces both:

- **Fanning out is router-only.** More than one outgoing edge from a
  non-routing node is rejected. Sinks with no outgoing edges stay ordinary.
- **A line may only change at a router.** Routers may switch flow onto another
  line but are not obliged to; most gates pass straight through.

The second needs resolved lines, so it runs after inheritance — which is why
`normalize` returns a `Result` rather than only filling defaults, and why
`layout` propagates it.

## Vocabulary is configurable

Node and edge types are registered, not hardcoded. Core enforces *discipline*
— a cardinality limit, shape-carries-type, colour-carries-line — not membership.
A pipeline standard and a codebase scanner declare different vocabularies and
both render.

```ts
const registry = defineRegistry({
  nodeTypes: {
    datastore: { label: 'Data store', detail: DatastoreDetail, shape: 'cylinder', glyph: 'bar',    isRouter: false },
    transform: { label: 'Transform',  detail: TransformDetail, shape: 'rounded',  glyph: 'dot',    isRouter: false },
    server:    { label: 'Server',     detail: ServerDetail,    shape: 'rect',     glyph: 'square', isRouter: false },
    client:    { label: 'Client',     detail: ClientDetail,    shape: 'stadium',  glyph: 'ring',   isRouter: false },
    gate:      { label: 'Gate',       detail: GateDetail,      shape: 'diamond',  glyph: 'chevron', isRouter: true },
  },
  edgeTypes: {
    flow:      { label: 'Flow',       detail: NoDetail },
    log:       { label: 'Log write',  detail: LogDetail },
  },
})
```

## Schemas

Core depends on the [Standard Schema](https://github.com/standard-schema/standard-schema)
interface, vendored as types only — bring zod, valibot, arktype, or wrap ajv.
Core writes the validation handler once and it works for all of them. Detail
types flow by inference from the registry entry through to the renderer, so
nothing downstream re-declares them.

Validation reports every problem in one pass, as values, with the drill-down
path attached — a bad projection usually has more than one thing wrong with it.

## Verification

```
npm run check   # build + typecheck, tests included
npm test        # vitest
```

The suite validates against hand-rolled Standard Schema validators rather than
a library, so the claim that core privileges none of them stays exercised — a
zod-only suite would only prove zod works.

## Consumers

- **paa.dev** — the PAA pipeline as the diagram, handoff documents and evidence
  log entries as the payloads, gates as natural inspection points. Projects
  `paa-task.schema.json` into a `DiagramSpec`; the projection lives in paa.dev,
  not here, so core never grows a PAA dependency.
- **sysvista** — scans a codebase, emits `SysVistaOutput`, declares its own
  vocabulary. Same thesis: legibility through scaling views and drill-down.

Each consumer owns its projection. Core owns the render contract and the
geometry, and nothing else.
