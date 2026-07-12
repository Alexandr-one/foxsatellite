import maplibregl, {
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";

import {
  emptyFeatureCollection,
} from "./mapGeoJson";

import {
  MAP_CONFIG,
} from "./types";

export function geoJsonSource(
  map: MapLibreMap,
  id: string,
): GeoJSONSource | undefined {
  return map.getSource(id) as
    | GeoJSONSource
    | undefined;
}

export function createMap(
  container: HTMLDivElement,
): MapLibreMap {
  return new maplibregl.Map({
    container,

    style: {
      version: 8,

      sources: {
        satellite: {
          type: "raster",

          tiles: [
            MAP_CONFIG.tileUrl,
          ],

          tileSize: 256,

          attribution:
            MAP_CONFIG.attribution,

          maxzoom:
            MAP_CONFIG.maxZoom,
        },
      },

      layers: [
        {
          id: "satellite",
          type: "raster",
          source: "satellite",
        },
      ],
    },

    center: [
      27.992833,
      53.706877,
    ],

    zoom:
      MAP_CONFIG.initialZoom,

    pitch:
      MAP_CONFIG.pitchDeg,

    bearing: 0,

    minZoom:
      MAP_CONFIG.minZoom,

    maxZoom:
      MAP_CONFIG.maxZoom,

    maxPitch: 80,

    attributionControl: false,

    canvasContextAttributes: {
      antialias: true,
    },
  });
}

export function installMapLayers(
  map: MapLibreMap,
): void {
  map.addSource("track", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });

  map.addLayer({
    id: "track-line",
    type: "line",
    source: "track",

    paint: {
      "line-color": "#41d9ff",
      "line-width": 2.5,
      "line-opacity": 0.82,
    },
  });

  map.addSource("footprint", {
    type: "geojson",
    data: emptyFeatureCollection(),
  });

  map.addLayer({
    id: "footprint-fill",
    type: "fill",
    source: "footprint",

    paint: {
      "fill-color": "#51ff91",
      "fill-opacity": 0.15,
    },
  });

  map.addLayer({
    id: "footprint-outline",
    type: "line",
    source: "footprint",

    paint: {
      "line-color": "#73ffa8",
      "line-width": 2.5,
      "line-opacity": 0.95,
    },
  });
}