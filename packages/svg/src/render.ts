/**
 * `LaidOutDiagram` to an SVG string.
 *
 * Build-time only: no DOM, no client JS, and nothing measured — geometry
 * arrives from core already computed. The renderer's whole job is turning
 * placed boxes and routes into markup, plus the one thing core cannot know,
 * which is where labels go.
 *
 * Drill-down levels are stacked rather than made interactive. A static file
 * has to contain every level it can reveal, and stacking reveals them without
 * script; the React renderer is where descending on demand belongs.
 *
 * Every node and edge carries `data-*` hooks so the page around an inline SVG can
 * style, highlight, and animate the map from its own stylesheet. That is
 * deliberately where motion lives: a renderer shipping animation config would be
 * deciding something the consumer is better placed to decide, and CSS can already
 * do all of it. What the renderer owes is *identity* — which line, which type,
 * track or branch — because that is the one thing CSS cannot recover from
 * geometry alone.
 */

import type { AnyRegistry, LaidOutDiagram, LaidOutEdge, LaidOutNode, Point } from '@rankonelabs/livid-core';

import { type Box, EMPTY_BOX, boxAround, boxOf, placeLabel, unionOf, withExtent } from './geometry.js';
import { type Arrowhead, arrowDefsMarkup, arrowEndAttr, arrowheadOf, arrowheadReach } from './markers.js';
import { glyphMarkup, shapeMarkup } from './shapes.js';
import { type SvgTheme, type SvgThemeOverrides, lineColour, resolveTheme } from './theme.js';

export interface SvgOptions {
  readonly theme?: SvgThemeOverrides;
  /** Accessible name for the whole figure. */
  readonly title?: string | null;
  /** Caption above the top level. Nested levels caption themselves. */
  readonly caption?: string | null;
  /** `all` stacks every drill-down level present; `root` draws only the top. */
  readonly levels?: 'root' | 'all';
}

/**
 * Markup plus the size it wants to be drawn at.
 *
 * The size is part of the output because a page cannot get it any other way: an
 * embedded figure has to decide between scaling down and scrolling when it is
 * wider than its column, and CSS cannot read an SVG attribute to decide. The
 * numbers are already computed here, so returning them beats every consumer
 * parsing them back out of the string.
 */
export interface SvgFigure {
  readonly svg: string;
  /**
   * Natural width in px. Includes labels sitting outside their shape, so it is
   * wider than `diagram.bounds` — core does not know where labels go.
   */
  readonly width: number;
  readonly height: number;
}

/** The markup alone, for callers with nothing to size. */
export function renderSvg<R extends AnyRegistry>(diagram: LaidOutDiagram<R>, options: SvgOptions = {}): string {
  return renderFigure(diagram, options).svg;
}

export function renderFigure<R extends AnyRegistry>(
  diagram: LaidOutDiagram<R>,
  options: SvgOptions = {},
): SvgFigure {
  const theme = resolveTheme(options.theme);
  const { padding, levelGap } = theme.metrics;

  const levels = levelsOf(diagram, options.caption ?? null, options.levels !== 'root');
  const title = options.title ?? null;
  const arrowhead = arrowheadOf(theme.metrics, () => fingerprintOf(levels, theme, title));
  const rendered = levels.map((level) => renderLevel(level, theme, arrowhead));

  const captionHeight = theme.typography.captionSize + theme.metrics.labelGap * 2;
  const width =
    Math.max(...rendered.map((level) => level.box.maxX - level.box.minX), 0) + padding * 2;

  const placed = rendered.map((level, index) => {
    const above = rendered
      .slice(0, index)
      .reduce((total, previous) => total + heightOf(previous, captionHeight) + levelGap, 0);
    return { ...level, top: padding + above };
  });

  const height =
    placed.reduce((total, level) => total + heightOf(level, captionHeight) + levelGap, 0) - levelGap + padding * 2;

  const body = placed
    .map((level, index) => {
      const captionY = level.top + theme.typography.captionSize;
      const contentTop = level.caption === null ? level.top : level.top + captionHeight;
      const shiftX = padding - level.box.minX;
      const shiftY = contentTop - level.box.minY;

      return [
        // A rule across the gap, so a stack of levels reads as separate maps
        // rather than one that happens to have blank rows in it.
        index === 0
          ? ''
          : `<line x1="${padding}" y1="${round(level.top - levelGap / 2)}" x2="${round(width - padding)}" ` +
            `y2="${round(level.top - levelGap / 2)}" stroke="${theme.palette.divider}" stroke-width="1"/>`,
        level.caption === null
          ? ''
          : `<text x="${padding}" y="${round(captionY)}" font-family="${escapeAttr(theme.typography.captionFamily)}" ` +
            `font-size="${theme.typography.captionSize}" fill="${theme.palette.caption}">${escapeText(level.caption)}</text>`,
        `<g transform="translate(${round(shiftX)},${round(shiftY)})">`,
        level.markup,
        `</g>`,
      ]
        .filter((part) => part !== '')
        .join('\n');
    })
    .join('\n');

  const svg = [
    // `role="img"` is only correct alongside an accessible name; on its own it
    // makes a screen reader announce an unnamed image. Without a title the
    // element is left alone rather than hidden — a diagram is content, and
    // `aria-hidden` would mean a screen reader user is never told it exists.
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" ` +
      `viewBox="0 0 ${round(width)} ${round(height)}"${title === null ? '' : ` role="img" aria-label="${escapeAttr(title)}"`}>`,
    title === null ? '' : `<title>${escapeText(title)}</title>`,
    // One definition for the whole document, however many levels and edges are
    // stacked below it, and nothing at all unless the theme asked for heads.
    arrowhead === null ? '' : arrowDefsMarkup(arrowhead),
    `<rect width="100%" height="100%" fill="${theme.palette.surface}"/>`,
    body,
    `</svg>`,
  ]
    .filter((part) => part !== '')
    .join('\n');

  // Rounded to match the attributes, so a consumer sizing a container against
  // these numbers is working with the same values the markup carries.
  return { svg, width: Number(round(width)), height: Number(round(height)) };
}

/* ------------------------------------------------------------------ *
 * Levels
 * ------------------------------------------------------------------ */

interface Level<R extends AnyRegistry> {
  readonly caption: string | null;
  readonly diagram: LaidOutDiagram<R>;
}

interface RenderedLevel {
  readonly caption: string | null;
  readonly markup: string;
  readonly box: Box;
}

/** The tree of drill-down levels, flattened depth-first into a stack. */
function levelsOf<R extends AnyRegistry>(
  diagram: LaidOutDiagram<R>,
  caption: string | null,
  deep: boolean,
): readonly Level<R>[] {
  const here: Level<R> = { caption, diagram };
  if (!deep) return [here];

  const nested = diagram.nodes.flatMap((node) =>
    node.children === null
      ? []
      : levelsOf(node.children, caption === null ? node.node.label : `${caption} ▸ ${node.node.label}`, true),
  );

  return [here, ...nested];
}

function heightOf(level: RenderedLevel, captionHeight: number): number {
  const content = level.box.maxY - level.box.minY;
  return level.caption === null ? content : content + captionHeight;
}

/* ------------------------------------------------------------------ *
 * One level
 * ------------------------------------------------------------------ */

function renderLevel<R extends AnyRegistry>(
  level: Level<R>,
  theme: SvgTheme,
  arrowhead: Arrowhead | null,
): RenderedLevel {
  const { diagram } = level;
  const colours = new Map(
    diagram.lines.map((line, index) => [line.id as string, lineColour(theme.palette, line.color, index)]),
  );
  const colourOf = (line: string | null): string =>
    (line === null ? undefined : colours.get(line)) ?? theme.palette.caption;

  const lineOfNode = new Map(diagram.nodes.map((node) => [node.node.id as string, node.node.line]));
  const context: EdgeContext = { lineOfNode, colourOf, theme, arrowhead };

  const edges = diagram.edges.map((edge) => renderEdge(edge, context));
  const nodes = diagram.nodes.map((node) => renderNode(node, diagram, colourOf, theme));

  // Edges first so tracks pass under stations rather than over them.
  return {
    caption: level.caption,
    markup: [...edges.map((part) => part.markup), ...nodes.map((part) => part.markup)].join('\n'),
    box: withExtent(unionOf([...edges.map((part) => part.box), ...nodes.map((part) => part.box)])),
  };
}

interface Part {
  readonly markup: string;
  readonly box: Box;
}

/**
 * What an edge needs beyond its own route: which line each end belongs to, the
 * colours and weights of the level it is drawn in, and the head to finish with
 * when the figure draws direction.
 */
interface EdgeContext {
  readonly lineOfNode: ReadonlyMap<string, string | null>;
  readonly colourOf: (line: string | null) => string;
  readonly theme: SvgTheme;
  readonly arrowhead: Arrowhead | null;
}

/**
 * An edge takes the colour of where it is going. Track between two stations on
 * one line is that line; track leaving a router onto another line already
 * belongs to the new one, which is what makes an interchange read as a change.
 */
function renderEdge<R extends AnyRegistry>(edge: LaidOutEdge<R>, context: EdgeContext): Part {
  const { lineOfNode, colourOf, theme, arrowhead } = context;
  const sourceLine = lineOfNode.get(edge.edge.source) ?? null;
  const targetLine = lineOfNode.get(edge.edge.target) ?? null;
  const branching = sourceLine !== targetLine;
  const weight = branching ? theme.metrics.branchWeight : theme.metrics.lineWeight;

  // Nothing to draw and nothing to reserve, so the identity box keeps it out
  // of the union rather than pinning it to the origin.
  if (edge.route.length < 2) return { markup: '', box: EMPTY_BOX };

  const points = edge.route.map((point: Point) => `${round(point.x)},${round(point.y)}`).join(' ');

  return {
    markup:
      `<polyline class="livid-edge" data-type="${escapeAttr(edge.edge.type)}" ` +
      `data-line="${targetLine === null ? '' : escapeAttr(targetLine)}" ` +
      `data-kind="${branching ? 'branch' : 'track'}" ` +
      `points="${points}" fill="none" stroke="${colourOf(targetLine)}" stroke-width="${weight}" ` +
      `stroke-linejoin="round" stroke-linecap="round"` +
      `${arrowhead === null ? '' : ` ${arrowEndAttr(arrowhead)}`}/>`,
    box: unionOf([boxAround(edge.route, weight / 2), headBox(edge.route, weight, arrowhead)]),
  };
}

/**
 * Space the head occupies, which the viewport has to include.
 *
 * Half a stroke width around the route — all an undecorated edge needs — cuts
 * straight through an arrowhead, and a consumer sizing a scroll container from
 * `SvgFigure.width` would show that as a visibly clipped figure rather than as
 * a stray pixel of overflow. So the head's reach is reserved around the vertex
 * it is drawn at, which for `marker-end` is the route's last point.
 */
function headBox(route: readonly Point[], strokeWidth: number, arrowhead: Arrowhead | null): Box {
  const tip = route[route.length - 1];
  if (arrowhead === null || tip === undefined) return EMPTY_BOX;
  return boxAround([tip], arrowheadReach(arrowhead, strokeWidth));
}

function renderNode<R extends AnyRegistry>(
  placed: LaidOutNode<R>,
  diagram: LaidOutDiagram<R>,
  colourOf: (line: string | null) => string,
  theme: SvgTheme,
): Part {
  const typeDef = diagram.registry.nodeTypes[placed.node.type];
  const shape = typeDef?.shape ?? 'rect';
  const glyph = typeDef?.glyph ?? 'none';
  const colour = colourOf(placed.node.line);
  const box = boxOf(placed.position, placed.size);

  const label = placeLabel(
    placed.node.label,
    shape,
    placed.position,
    placed.size,
    theme.typography,
    theme.metrics,
  );

  const leader =
    label.leader === null
      ? ''
      : `<line x1="${round(label.leader[0].x)}" y1="${round(label.leader[0].y)}" ` +
        `x2="${round(label.leader[1].x)}" y2="${round(label.leader[1].y)}" ` +
        `stroke="${colour}" stroke-width="${theme.metrics.nodeStroke}" stroke-linecap="round"/>`;

  const description = typeDef === undefined ? placed.node.label : `${placed.node.label} — ${typeDef.label}`;

  return {
    markup: [
      `<g class="livid-node" data-type="${escapeAttr(placed.node.type)}" ` +
        `data-node="${escapeAttr(placed.node.id)}" ` +
        `data-line="${placed.node.line === null ? '' : escapeAttr(placed.node.line)}">`,
      `<title>${escapeText(description)}</title>`,
      shapeMarkup(shape, box, {
        fill: theme.palette.nodeFill,
        stroke: colour,
        strokeWidth: theme.metrics.nodeStroke,
      }),
      glyph === 'none' ? '' : glyphMarkup(glyph, box, colour),
      leader,
      `<text x="${round(label.x)}" y="${round(label.y)}" text-anchor="${label.anchor}" ` +
        `font-family="${escapeAttr(theme.typography.fontFamily)}" font-size="${theme.typography.labelSize}" ` +
        `font-weight="${theme.typography.labelWeight}" fill="${theme.palette.label}">${escapeText(label.text)}</text>`,
      `</g>`,
    ]
      .filter((part) => part !== '')
      .join('\n'),
    box: unionOf([box, label.box]),
  };
}

/* ------------------------------------------------------------------ *
 * Figure identity
 * ------------------------------------------------------------------ */

/**
 * A short, stable name for *this* figure, for the one DOM id it needs.
 *
 * Two figures inlined into one HTML document share a DOM, so a fixed marker id
 * would have the second figure's edges resolve against the first figure's
 * definition — and duplicate ids are invalid markup besides. A counter or a
 * random suffix would separate them at the cost of purity: the same diagram
 * would render differently on two builds, which a build-time renderer cannot
 * afford. So the suffix is a hash of what the figure draws. Same input, same id;
 * different figures, different ids.
 *
 * A collision degrades rather than breaks. Every head is filled from
 * `context-stroke` and sized in stroke widths, so two figures that agree on the
 * head's proportions have interchangeable definitions — and those proportions
 * are hashed too, so two that disagree cannot quietly share one.
 */
function fingerprintOf<R extends AnyRegistry>(
  levels: readonly Level<R>[],
  theme: SvgTheme,
  title: string | null,
): string {
  const head: readonly (string | number)[] = [
    title ?? '',
    theme.metrics.arrowLength,
    theme.metrics.arrowWidth,
  ];

  const drawn = levels.flatMap((level) => [
    level.caption ?? '',
    ...level.diagram.nodes.map(
      (node) =>
        `${node.node.id}:${node.node.type}:${node.position.x},${node.position.y}:` +
        `${node.size.width}x${node.size.height}`,
    ),
    ...level.diagram.edges.map(
      (edge) => `${edge.edge.id}:${edge.route.map((point) => `${point.x},${point.y}`).join(';')}`,
    ),
  ]);

  return hash32([...head, ...drawn].join('|'));
}

/**
 * FNV-1a, 32 bits, base36. Rolled locally like the rest of the primitives here:
 * it is one expression, it never changes, and it is a fingerprint rather than a
 * cryptographic claim.
 */
function hash32(value: string): string {
  const OFFSET_BASIS = 0x811c9dc5;
  const PRIME = 0x01000193;

  return [...value]
    .reduce((hash, character) => Math.imul(hash ^ (character.codePointAt(0) ?? 0), PRIME) >>> 0, OFFSET_BASIS)
    .toString(36);
}

/* ------------------------------------------------------------------ *
 * Markup helpers
 * ------------------------------------------------------------------ */

const round = (value: number): string => (Math.round(value * 100) / 100).toString();

const TEXT_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const ATTR_ESCAPES: Readonly<Record<string, string>> = { ...TEXT_ESCAPES, '"': '&quot;', "'": '&#39;' };

export function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (character) => TEXT_ESCAPES[character] ?? character);
}

export function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ATTR_ESCAPES[character] ?? character);
}
