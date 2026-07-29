/**
 * Where things sit. Core lays out the graph; this works out what the graph's
 * *labels* need on top of that, which core cannot know because it has no
 * opinion about type.
 */

import type { NodeShape, Point, Size } from '@rankonelabs/livid-core';

import type { Metrics, Typography } from './theme.js';

export interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function boxOf(position: Point, size: Size): Box {
  return {
    minX: position.x,
    minY: position.y,
    maxX: position.x + size.width,
    maxY: position.y + size.height,
  };
}

export const EMPTY_BOX: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

export function unionOf(boxes: readonly Box[]): Box {
  return boxes.reduce(
    (left, right) => ({
      minX: Math.min(left.minX, right.minX),
      minY: Math.min(left.minY, right.minY),
      maxX: Math.max(left.maxX, right.maxX),
      maxY: Math.max(left.maxY, right.maxY),
    }),
    EMPTY_BOX,
  );
}

export function boxAround(points: readonly Point[], slack: number): Box {
  return unionOf(
    points.map((point) => ({
      minX: point.x - slack,
      minY: point.y - slack,
      maxX: point.x + slack,
      maxY: point.y + slack,
    })),
  );
}

/**
 * Text is estimated, not measured: rendering happens at build time with no DOM
 * and no font metrics. The estimate only has to be good enough to reserve
 * space, and it errs wide — a label with room to spare reads fine, a clipped
 * one does not.
 */
export function estimateTextWidth(text: string, fontSize: number, advanceRatio: number): number {
  return text.length * fontSize * advanceRatio;
}

/**
 * Whether a shape can carry its own label.
 *
 * Circles and diamonds cannot: core holds them to a fixed width because
 * growing one distorts it past recognition, and shape carries type. So their
 * names sit alongside, which is also how a transit map names a junction.
 */
export type LabelPlacement = 'inside' | 'beside';

const POINT_SHAPES: ReadonlySet<NodeShape> = new Set<NodeShape>(['circle', 'diamond']);

export function labelPlacementOf(shape: NodeShape): LabelPlacement {
  return POINT_SHAPES.has(shape) ? 'beside' : 'inside';
}

export interface PlacedLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly anchor: 'middle' | 'start';
  /** Space the label occupies, which the viewport has to include. */
  readonly box: Box;
  /** Tick from the shape out to the label; absent when the label is inside. */
  readonly leader: readonly [Point, Point] | null;
}

export function placeLabel(
  text: string,
  shape: NodeShape,
  position: Point,
  size: Size,
  typography: Typography,
  metrics: Metrics,
): PlacedLabel {
  const width = estimateTextWidth(text, typography.labelSize, typography.advanceRatio);
  const height = typography.labelSize;
  const centreX = position.x + size.width / 2;
  const centreY = position.y + size.height / 2;

  if (labelPlacementOf(shape) === 'inside') {
    // Dominant-baseline is unreliable across renderers, so the baseline is
    // nudged by a third of the cap height instead.
    const y = centreY + height / 3;
    return {
      text,
      x: centreX,
      y,
      anchor: 'middle',
      box: boxOf(position, size),
      leader: null,
    };
  }

  if (metrics.labelSide === 'right') {
    const startX = position.x + size.width + metrics.leader + metrics.labelGap;
    return {
      text,
      x: startX,
      y: centreY + height / 3,
      anchor: 'start',
      box: { minX: startX, minY: centreY - height, maxX: startX + width, maxY: centreY + height },
      leader: [
        { x: position.x + size.width, y: centreY },
        { x: position.x + size.width + metrics.leader, y: centreY },
      ],
    };
  }

  const baseline = position.y + size.height + metrics.leader + metrics.labelGap + height;
  return {
    text,
    x: centreX,
    y: baseline,
    anchor: 'middle',
    box: {
      minX: centreX - width / 2,
      minY: position.y + size.height,
      maxX: centreX + width / 2,
      maxY: baseline + metrics.labelGap,
    },
    leader: [
      { x: centreX, y: position.y + size.height },
      { x: centreX, y: position.y + size.height + metrics.leader },
    ],
  };
}
