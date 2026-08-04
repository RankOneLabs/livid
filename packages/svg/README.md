# @rankonelabs/livid-svg

`LaidOutDiagram` to an SVG string, for [livid](https://github.com/RankOneLabs/livid).

Build-time only. No DOM, no client JS, and nothing measured — geometry arrives
from [`@rankonelabs/livid-core`](https://www.npmjs.com/package/@rankonelabs/livid-core)
already computed, so this package draws and does not lay out. That is what makes
the SVG in a post and the React canvas in an app the *same map* rather than two
drawings that drifted.

## Install

```
npm install @rankonelabs/livid-svg @rankonelabs/livid-core
```

Core is a peer dependency, and the only one. Nothing is imported at runtime —
this package emits zero dependencies of its own.

## Use

```ts
import { layout, validateDiagram } from '@rankonelabs/livid-core'
import { renderFigure, renderSvg } from '@rankonelabs/livid-svg'

const valid = validateDiagram(registry, spec)
if (!valid.ok) return valid.error

const laid = await layout(valid.value)
if (!laid.ok) return laid.error

const svg = renderSvg(laid.value, {
  title: 'Refund approval at HITL',
  theme: { palette: { lines: { 'line-critical': '#D64500', 'line-parallel': '#1B6CA8' } } },
})
```

Use `renderFigure` instead when the page has to size a container. It returns the
same markup plus the size the figure wants:

```ts
const { svg, width, height } = renderFigure(laid.value, { title: 'Refund approval at HITL' })
```

Those numbers cannot be derived from `diagram.bounds` — core does not know where
labels go, so the figure is wider than the layout. An embedded diagram needs them
to choose between scaling down and scrolling when it is wider than its column,
and CSS cannot read an SVG attribute to decide.

## Labels

Boxes carry their own text. Circles and diamonds cannot — core holds them to a
fixed width because growing one distorts it past recognition, and shape carries
type — so their labels sit alongside with a leader tick, which is also how a
transit map names a junction. Set `metrics.labelSide` to `right` for a
top-to-bottom layout.

Text is estimated rather than measured (there is no DOM at build time) and the
estimate errs wide: a label with room to spare reads fine, a clipped one does
not. The viewport always includes outside labels, so nothing is cut off.

## Colour

`LineSpec.color` is a token, not a colour — core has no palette. Configure
tokens through `palette.lines`; any token left unconfigured takes a colour from
`palette.ramp` by line order, so an unthemed diagram still renders as a map
rather than one grey tangle.

An edge takes the colour of where it is *going*. Track between two stations on
one line is that line; track leaving a router onto another line already belongs
to the new one, which is what makes an interchange read as a change. Edges that
cross lines are drawn at `branchWeight`, lighter than the track they leave.

## Direction

Edges draw no arrowheads unless you ask for them:

```ts
const svg = renderSvg(laid.value, { theme: { metrics: { edgeArrowhead: 'target' } } })
```

Off by default, and it is theme config rather than a structural option, because
every livid edge is *already* directed in the data — core gives an edge a source
and a target — so whether the drawing says so out loud is a question of look. A
transit map with a head on every segment reads busier than one without; the
caller knows which of the two its figure is, and the renderer draws what it is
told.

One `<marker>` is defined per figure and shared by every edge. It fills from
`context-stroke`, so a head is whatever colour its edge is — including when the
palette is CSS custom properties (`var(--accent)`) that only resolve at paint
time, which a per-colour definition could never anticipate. It is sized in
`strokeWidth` units, so the same head serves a track at `lineWeight` and a
branch at `branchWeight` in proportion. Tune the proportions with `arrowLength`
and `arrowWidth`, both in stroke widths rather than px.

The head is drawn back from the route's last point, which core puts on the
target's boundary — so it points *at* the node from outside rather than
disappearing under it. `renderFigure` reserves the room it needs, so turning
heads on never clips a figure sized from `width` and `height`.

## Styling hooks, and where motion lives

Every node and edge carries hooks for the page's own stylesheet:

| Element | Class | Attributes |
| --- | --- | --- |
| node `<g>` | `livid-node` | `data-type`, `data-node`, `data-line`, `data-state`, `data-tint`, `data-anim` |
| edge `<polyline>` | `livid-edge` | `data-type`, `data-line`, `data-kind` (`track` \| `branch`), `data-state`, `data-tint`, `data-anim` |

Motion is not a renderer option, and that is on purpose. An inline SVG is stylable
by the document around it, so hover states, transitions, and flow animation are
already the consumer's to write — a renderer shipping animation config would be
deciding something the page is better placed to decide. What the renderer owes is
*identity*: which line, which type, track or branch. That is the one thing CSS
cannot recover from geometry.

Pass a validated frame as the second argument to render a state snapshot:

```ts
renderSvg(diagram, frame, { levels: 'root' })
```

The renderer resolves the declared tint through `theme.palette.states` and
emits the closed animation token as `data-anim`; the surrounding stylesheet can
then implement transitions while respecting `prefers-reduced-motion`.

```css
/* Artifact flowing along the critical path, in the consumer's stylesheet. */
@media (prefers-reduced-motion: no-preference) {
  .livid-edge[data-kind='track'] {
    stroke-dasharray: 1 14;
    stroke-linecap: round;
    animation: livid-flow 1.4s linear infinite;
  }
}
@keyframes livid-flow { to { stroke-dashoffset: -15; } }
```

## Drill-down

Levels are stacked, not made interactive: a static file has to contain every
level it can reveal, and stacking reveals them without script. Pass
`levels: 'root'` to draw only the top. Descending on demand belongs to the React
renderer.

Feed it `layoutDeep()` output if you want nested levels to have geometry.

## Configuration

Everything visual is config — `palette`, `typography`, `metrics` — and nothing
is component injection. Both renderers are closed, which is what guarantees they
agree.

MIT.
