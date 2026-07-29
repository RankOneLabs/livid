/**
 * @rankonelabs/livid-svg — `LaidOutDiagram` to an SVG string.
 *
 * Build-time, zero client JS. Geometry comes from core already computed, so
 * this package measures nothing and lays out nothing; it draws.
 */

export { type SvgOptions, renderSvg, escapeText, escapeAttr } from './render.js';

export {
  type LabelSide,
  type Palette,
  type Typography,
  type Metrics,
  type SvgTheme,
  type SvgThemeOverrides,
  DEFAULT_PALETTE,
  DEFAULT_TYPOGRAPHY,
  DEFAULT_METRICS,
  DEFAULT_THEME,
  resolveTheme,
  lineColour,
} from './theme.js';

export {
  type Box,
  type LabelPlacement,
  type PlacedLabel,
  EMPTY_BOX,
  ZERO_BOX,
  boxOf,
  unionOf,
  boxAround,
  withExtent,
  estimateTextWidth,
  labelPlacementOf,
  placeLabel,
} from './geometry.js';

export { type ShapeStyle, shapeMarkup, glyphMarkup } from './shapes.js';
