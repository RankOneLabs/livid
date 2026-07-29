/**
 * Shape and glyph markup. One function per closed vocabulary in core, so a
 * shape core can name is always a shape this can draw — which is the whole
 * reason `NodeShape` and `Glyph` are closed sets.
 */

import type { Glyph, NodeShape } from '@rankonelabs/livid-core';

import type { Box } from './geometry.js';

export interface ShapeStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
}

function attrs(style: ShapeStyle): string {
  return `fill="${style.fill}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"`;
}

const round = (value: number): string => (Math.round(value * 100) / 100).toString();

export function shapeMarkup(shape: NodeShape, box: Box, style: ShapeStyle): string {
  const x = box.minX;
  const y = box.minY;
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const common = attrs(style);

  switch (shape) {
    case 'rect':
      return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" ${common}/>`;
    case 'rounded':
      return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="10" ${common}/>`;
    case 'stadium':
      return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${round(h / 2)}" ${common}/>`;
    case 'circle':
      return `<circle cx="${round(x + w / 2)}" cy="${round(y + h / 2)}" r="${round(Math.min(w, h) / 2)}" ${common}/>`;
    case 'hexagon': {
      const inset = w * 0.18;
      const points = [
        [x + inset, y],
        [x + w - inset, y],
        [x + w, y + h / 2],
        [x + w - inset, y + h],
        [x + inset, y + h],
        [x, y + h / 2],
      ];
      return `<polygon points="${polygon(points)}" ${common}/>`;
    }
    case 'diamond': {
      const points = [
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2],
      ];
      return `<polygon points="${polygon(points)}" ${common}/>`;
    }
    case 'cylinder': {
      const lip = 9;
      return (
        `<path d="M${round(x)},${round(y + lip)} a${round(w / 2)},${lip} 0 0 1 ${round(w)},0 ` +
        `v${round(h - lip * 2)} a${round(w / 2)},${lip} 0 0 1 ${round(-w)},0 z" ${common}/>` +
        `<ellipse cx="${round(x + w / 2)}" cy="${round(y + lip)}" rx="${round(w / 2)}" ry="${lip}" ` +
        `fill="none" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>`
      );
    }
  }
}

function polygon(points: readonly (readonly number[])[]): string {
  return points.map((point) => `${round(point[0] ?? 0)},${round(point[1] ?? 0)}`).join(' ');
}

/**
 * The station mark. Drawn at the leading edge rather than the centre so it
 * does not fight the label for the middle of a box.
 */
export function glyphMarkup(glyph: Glyph, box: Box, colour: string): string {
  if (glyph === 'none') return '';

  const cx = box.minX + (box.maxX - box.minX) / 2;
  const cy = box.minY + (box.maxY - box.minY) / 2;

  switch (glyph) {
    case 'dot':
      return `<circle cx="${round(cx)}" cy="${round(cy)}" r="4" fill="${colour}"/>`;
    case 'ring':
      return `<circle cx="${round(cx)}" cy="${round(cy)}" r="4.5" fill="none" stroke="${colour}" stroke-width="2"/>`;
    case 'bar':
      return `<rect x="${round(cx - 1.5)}" y="${round(cy - 6)}" width="3" height="12" rx="1.5" fill="${colour}"/>`;
    case 'square':
      return `<rect x="${round(cx - 3.5)}" y="${round(cy - 3.5)}" width="7" height="7" fill="${colour}"/>`;
    case 'chevron':
      return (
        `<path d="M${round(cx - 3)},${round(cy - 5)} L${round(cx + 3)},${round(cy)} L${round(cx - 3)},${round(cy + 5)}" ` +
        `fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      );
  }
}
