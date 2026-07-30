/**
 * The arrowhead: one `<marker>` per figure, shared by every edge that draws
 * direction.
 *
 * One definition rather than one per colour, because the head takes its fill
 * from `context-stroke`. That is not a tidiness choice — a consumer's palette
 * may be CSS custom properties (`var(--accent)`) rather than literals, and a
 * marker cannot be pre-rendered per value it will only learn at paint time.
 * Sizing follows for the same reason: `markerUnits="strokeWidth"` lets the one
 * head serve a track at `lineWeight` and a branch at `branchWeight` without the
 * renderer emitting either.
 */

import type { Metrics } from './theme.js';

/**
 * A head this figure is going to draw: its proportions, in stroke widths, plus
 * the DOM id the edges point at. Absent — `null` at the call site — is how "no
 * arrowheads" travels, so nothing downstream re-reads the mode.
 */
export interface Arrowhead {
  /** DOM id, unique to this figure. See `arrowheadOf`. */
  readonly id: string;
  /** Along the route, in stroke widths. */
  readonly length: number;
  /** Across the route, in stroke widths. */
  readonly width: number;
}

/**
 * The head one figure will draw, or `null` when it draws none.
 *
 * `fingerprint` distinguishes this figure from any other inlined into the same
 * HTML document; `render.ts` derives it from what the figure draws.
 */
export function arrowheadOf(metrics: Metrics, fingerprint: string): Arrowhead | null {
  if (metrics.edgeArrowhead === 'none') return null;

  return {
    // Base36 hash characters only, so there is nothing here to escape.
    id: `livid-arrow-${fingerprint}`,
    length: metrics.arrowLength,
    width: metrics.arrowWidth,
  };
}

/**
 * The `<defs>` block, emitted once for the whole document.
 *
 * `refX` puts the tip on the vertex the marker is attached to, so the head sits
 * *outside* the node the route arrives at rather than under it, and `orient`
 * turns it along the segment it ends.
 */
export function arrowDefsMarkup(head: Arrowhead): string {
  const { length, width } = head;

  return (
    `<defs>` +
    `<marker id="${head.id}" markerUnits="strokeWidth" ` +
    `markerWidth="${round(length)}" markerHeight="${round(width)}" ` +
    `refX="${round(length)}" refY="${round(width / 2)}" orient="auto">` +
    `<path d="M0,0 L${round(length)},${round(width / 2)} L0,${round(width)} z" fill="context-stroke"/>` +
    `</marker>` +
    `</defs>`
  );
}

/** `marker-end`, for an edge that draws its direction. */
export function arrowEndAttr(head: Arrowhead): string {
  return `marker-end="url(#${head.id})"`;
}

/**
 * How far the head reaches from the vertex it is drawn at, in px.
 *
 * The tip sits on the vertex and the body is drawn back along the incoming
 * segment, so the furthest ink is a back corner — the diagonal of half the
 * head. Reserving that as a *radius* holds whichever way the route arrives,
 * which is what lets the bounding box stay ignorant of the route's direction.
 * It errs wide, like every other estimate here: a head with room to spare reads
 * fine, a clipped one does not.
 */
export function arrowheadReach(head: Arrowhead, strokeWidth: number): number {
  return strokeWidth * Math.hypot(head.length, head.width / 2);
}

const round = (value: number): string => (Math.round(value * 100) / 100).toString();
