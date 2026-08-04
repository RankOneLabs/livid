/**
 * Everything about how a diagram looks, as config.
 *
 * User control stops at config here as it does in core: a consumer picks
 * colours, weights, and type, and cannot inject markup. That is what keeps the
 * SVG in a post and the React canvas in an app the same map.
 */

import type { StateTint } from '@rankonelabs/livid-core';

/** Where a label sits when its shape cannot hold text. */
export type LabelSide = 'below' | 'right';

/**
 * Which end of an edge draws a head, if any.
 *
 * Every livid edge is already directed in the data — `ValidEdge` has a source
 * and a target — so drawing that direction is a question of look rather than of
 * meaning, which is why it is theme config and not a structural option. The
 * caller decides whether its figures say it out loud; the renderer only draws
 * what it is told.
 */
export type EdgeArrowhead = 'none' | 'target';

export interface Palette {
  /**
   * Colour token from `LineSpec.color` to a CSS colour. Tokens are the
   * consumer's vocabulary — core never sees a colour — so any token missing
   * here falls back to the ramp below, by line order.
   */
  readonly lines: Readonly<Record<string, string>>;
  /** Assigned by line index to any line whose token is not in `lines`. */
  readonly ramp: readonly string[];
  readonly surface: string;
  readonly nodeFill: string;
  readonly label: string;
  readonly caption: string;
  readonly divider: string;
  /** Closed state tint tokens from core, resolved to renderer colours. */
  readonly states: Readonly<Record<StateTint, string>>;
}

export interface Typography {
  readonly fontFamily: string;
  readonly labelSize: number;
  readonly labelWeight: number;
  readonly captionFamily: string;
  readonly captionSize: number;
  /**
   * Mean glyph advance as a fraction of font size. Text is measured by
   * estimate rather than measurement because there is no DOM at build time;
   * see `estimateTextWidth`.
   */
  readonly advanceRatio: number;
}

export interface Metrics {
  /** Track weight on the critical path. Thick lines are what read as transit. */
  readonly lineWeight: number;
  /** Branches are lighter, so the eye follows the main route first. */
  readonly branchWeight: number;
  readonly nodeStroke: number;
  /** Tick drawn from a point-shaped node out to its label. */
  readonly leader: number;
  readonly labelGap: number;
  readonly padding: number;
  /** Vertical space between stacked drill-down levels. */
  readonly levelGap: number;
  readonly labelSide: LabelSide;
  /** `none` by default, so an existing figure draws exactly as it did. */
  readonly edgeArrowhead: EdgeArrowhead;
  /**
   * Head length along the route, in stroke widths rather than px.
   *
   * Stroke widths because the head is drawn once and reused by every edge: a
   * branch at `branchWeight` and track at `lineWeight` are the same marker, so
   * a head proportionate to one is proportionate to the other.
   */
  readonly arrowLength: number;
  /** Head width across the route, in stroke widths. */
  readonly arrowWidth: number;
}

export interface SvgTheme {
  readonly palette: Palette;
  readonly typography: Typography;
  readonly metrics: Metrics;
}

/** Overrides are per-section rather than deep, so the shapes stay nameable. */
export interface SvgThemeOverrides {
  readonly palette?: Partial<Palette>;
  readonly typography?: Partial<Typography>;
  readonly metrics?: Partial<Metrics>;
}

/**
 * Restrained and high-contrast: the map should read on a white page in a post
 * and survive being printed. Deliberately not any existing brand palette.
 */
export const DEFAULT_PALETTE: Palette = {
  lines: {},
  ramp: ['#D64500', '#1B6CA8', '#5B3E96', '#0F7B6C', '#A8341F', '#6B7280'],
  surface: '#FFFFFF',
  nodeFill: '#FFFFFF',
  label: '#16181D',
  caption: '#6B7280',
  divider: '#D8DCE3',
  states: {
    muted: '#9CA3AF',
    base: '#FFFFFF',
    accent: '#2563EB',
    danger: '#DC2626',
    ghost: '#E5E7EB',
  },
};

export const DEFAULT_TYPOGRAPHY: Typography = {
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  labelSize: 13,
  labelWeight: 600,
  captionFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  captionSize: 11,
  advanceRatio: 0.55,
};

export const DEFAULT_METRICS: Metrics = {
  lineWeight: 7,
  branchWeight: 4,
  nodeStroke: 2.5,
  leader: 14,
  labelGap: 6,
  padding: 44,
  levelGap: 96,
  labelSide: 'below',
  edgeArrowhead: 'none',
  arrowLength: 2.4,
  arrowWidth: 2,
};

export const DEFAULT_THEME: SvgTheme = {
  palette: DEFAULT_PALETTE,
  typography: DEFAULT_TYPOGRAPHY,
  metrics: DEFAULT_METRICS,
};

export function resolveTheme(overrides: SvgThemeOverrides = {}): SvgTheme {
  return {
    palette: {
      ...DEFAULT_PALETTE,
      ...overrides.palette,
      lines: { ...DEFAULT_PALETTE.lines, ...overrides.palette?.lines },
      states: { ...DEFAULT_PALETTE.states, ...overrides.palette?.states },
    },
    typography: { ...DEFAULT_TYPOGRAPHY, ...overrides.typography },
    metrics: { ...DEFAULT_METRICS, ...overrides.metrics },
  };
}

/**
 * Colour for one line. A configured token wins; otherwise the ramp assigns by
 * declaration order, so an unconfigured diagram still renders as a map rather
 * than as one grey tangle.
 */
export function lineColour(palette: Palette, token: string, index: number): string {
  const configured = palette.lines[token];
  if (configured !== undefined) return configured;

  const fallback = palette.ramp[index % palette.ramp.length];
  return fallback ?? palette.caption;
}
