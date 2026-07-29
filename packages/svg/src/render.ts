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
 */

import type { AnyRegistry, LaidOutDiagram, LaidOutEdge, LaidOutNode, Point } from '@rankonelabs/livid-core';

import { type Box, boxAround, boxOf, placeLabel, unionOf } from './geometry.js';
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

export function renderSvg<R extends AnyRegistry>(diagram: LaidOutDiagram<R>, options: SvgOptions = {}): string {
  const theme = resolveTheme(options.theme);
  const { padding, levelGap } = theme.metrics;

  const levels = levelsOf(diagram, options.caption ?? null, options.levels !== 'root');
  const rendered = levels.map((level) => renderLevel(level, theme));

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
    .map((level) => {
      const captionY = level.top + theme.typography.captionSize;
      const contentTop = level.caption === null ? level.top : level.top + captionHeight;
      const shiftX = padding - level.box.minX;
      const shiftY = contentTop - level.box.minY;

      return [
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
    .join(`\n<line x1="${padding}" x2="${round(width - padding)}" y1="0" y2="0" stroke="${theme.palette.divider}" stroke-width="0"/>\n`);

  const title = options.title ?? null;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" ` +
      `viewBox="0 0 ${round(width)} ${round(height)}" role="img"${title === null ? '' : ` aria-label="${escapeAttr(title)}"`}>`,
    title === null ? '' : `<title>${escapeText(title)}</title>`,
    `<rect width="100%" height="100%" fill="${theme.palette.surface}"/>`,
    body,
    `</svg>`,
  ]
    .filter((part) => part !== '')
    .join('\n');
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

function renderLevel<R extends AnyRegistry>(level: Level<R>, theme: SvgTheme): RenderedLevel {
  const { diagram } = level;
  const colours = new Map(
    diagram.lines.map((line, index) => [line.id as string, lineColour(theme.palette, line.color, index)]),
  );
  const colourOf = (line: string | null): string =>
    (line === null ? undefined : colours.get(line)) ?? theme.palette.caption;

  const lineOfNode = new Map(diagram.nodes.map((node) => [node.node.id as string, node.node.line]));

  const edges = diagram.edges.map((edge) => renderEdge(edge, lineOfNode, colourOf, theme));
  const nodes = diagram.nodes.map((node) => renderNode(node, diagram, colourOf, theme));

  const box = unionOf([...edges.map((part) => part.box), ...nodes.map((part) => part.box)]);

  // Edges first so tracks pass under stations rather than over them.
  return {
    caption: level.caption,
    markup: [...edges.map((part) => part.markup), ...nodes.map((part) => part.markup)].join('\n'),
    box,
  };
}

interface Part {
  readonly markup: string;
  readonly box: Box;
}

/**
 * An edge takes the colour of where it is going. Track between two stations on
 * one line is that line; track leaving a router onto another line already
 * belongs to the new one, which is what makes an interchange read as a change.
 */
function renderEdge<R extends AnyRegistry>(
  edge: LaidOutEdge<R>,
  lineOfNode: ReadonlyMap<string, string | null>,
  colourOf: (line: string | null) => string,
  theme: SvgTheme,
): Part {
  const sourceLine = lineOfNode.get(edge.edge.source) ?? null;
  const targetLine = lineOfNode.get(edge.edge.target) ?? null;
  const branching = sourceLine !== targetLine;
  const weight = branching ? theme.metrics.branchWeight : theme.metrics.lineWeight;

  if (edge.route.length < 2) return { markup: '', box: { ...EMPTY } };

  const points = edge.route.map((point: Point) => `${round(point.x)},${round(point.y)}`).join(' ');

  return {
    markup:
      `<polyline points="${points}" fill="none" stroke="${colourOf(targetLine)}" stroke-width="${weight}" ` +
      `stroke-linejoin="round" stroke-linecap="round"/>`,
    box: boxAround(edge.route, weight / 2),
  };
}

const EMPTY: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

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
      `<g>`,
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
