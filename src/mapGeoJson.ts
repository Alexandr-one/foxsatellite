import {
  FootprintCorner,
} from "./types";

export function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

export function polygonGeoJson(
  coordinates:
    | [number, number][]
    | undefined,
): GeoJSON.FeatureCollection {
  if (
    coordinates == undefined ||
    coordinates.length < 4
  ) {
    return emptyFeatureCollection();
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
      },
    ],
  };
}

export function trackGeoJson(
  track: Array<[number, number]>,
): GeoJSON.FeatureCollection {
  if (track.length < 2) {
    return emptyFeatureCollection();
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: track,
        },
      },
    ],
  };
}

export function polygonToFootprintCorners(
  polygon:
    | [number, number][]
    | undefined,
): FootprintCorner[] {
  if (
    polygon == undefined ||
    polygon.length < 3
  ) {
    return [];
  }

  const first = polygon[0];
  const last = polygon[polygon.length - 1];

  const closed =
    first != undefined &&
    last != undefined &&
    Math.abs(first[0] - last[0]) < 1e-12 &&
    Math.abs(first[1] - last[1]) < 1e-12;

  const points =
    closed
      ? polygon.slice(0, -1)
      : polygon;

  return points
    .slice(0, 4)
    .map(([longitude, latitude]) => ({
      longitude,
      latitude,
    }));
}