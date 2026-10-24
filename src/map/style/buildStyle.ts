import type { StyleSpecification } from 'maplibre-gl';
import type { MapTheme } from '../MapAdapter';
import { mapStyleTokens } from './tokens';

export const DEFAULT_LIGHT_TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
export const DEFAULT_DARK_TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png';
export const DEFAULT_TILE_ATTRIBUTION = '© OpenStreetMap contributors, © CARTO';

export function resolveTileUrlForTheme(theme: MapTheme, customTileUrl?: string): string {
  if (customTileUrl) return customTileUrl;
  return theme.endsWith('_DARK') ? DEFAULT_DARK_TILE_URL : DEFAULT_LIGHT_TILE_URL;
}

export function resolveTileArrayForTheme(theme: MapTheme, customTileUrl?: string): string[] {
  if (customTileUrl) return [customTileUrl];
  const variant = theme.endsWith('_DARK') ? 'rastertiles/dark_all' : 'rastertiles/voyager';
  return [
    `https://basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
    `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
    `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
    `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
  ];
}

export function buildFallbackStyle(
  theme: MapTheme,
  tileUrl?: string,
  attribution = DEFAULT_TILE_ATTRIBUTION,
): StyleSpecification {
  const tokens = mapStyleTokens[theme];
  const resolvedTiles = resolveTileArrayForTheme(theme, tileUrl);
  return {
    version: 8,
    name: theme.replaceAll('_', ' '),
    sources: {
      'marshgo-basemap': {
        type: 'raster',
        tiles: resolvedTiles,
        tileSize: 256,
        maxzoom: 19,
        attribution,
      },
    },
    layers: [
      { id: 'marshgo-background', type: 'background', paint: { 'background-color': tokens.background } },
      { id: 'marshgo-basemap', type: 'raster', source: 'marshgo-basemap', paint: { 'raster-opacity': 1 } },
    ],
  };
}
