import { AircraftState, LocalPoint, VIEW } from "./types";

const EARTH_RADIUS_M = 6_378_137;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value != undefined ? (value as Record<string, unknown>) : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value != undefined) {
      return value;
    }
  }
  return undefined;
}

export function prop(object: unknown, ...keys: string[]): unknown {
  const record = asRecord(object);
  if (record == undefined) {
    return undefined;
  }
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

export function numberProp(object: unknown, ...keys: string[]): number | undefined {
  const value = prop(object, ...keys);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function stringProp(object: unknown, ...keys: string[]): string | undefined {
  const value = prop(object, ...keys);
  return typeof value === "string" ? value : undefined;
}

export function destination(
  latitudeDeg: number,
  longitudeDeg: number,
  bearingDeg: number,
  distanceM: number,
): [number, number] {
  const angularDistance = distanceM / EARTH_RADIUS_M;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (latitudeDeg * Math.PI) / 180;
  const lon1 = (longitudeDeg * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

export function enuOffsetToLonLat(
  latitudeDeg: number,
  longitudeDeg: number,
  eastM: number,
  northM: number,
): [number, number] {
  const distance = Math.hypot(eastM, northM);
  if (distance < 1e-9) {
    return [longitudeDeg, latitudeDeg];
  }
  const bearingDeg = (Math.atan2(eastM, northM) * 180) / Math.PI;
  return destination(latitudeDeg, longitudeDeg, bearingDeg, distance);
}

export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function quaternionToYawDeg(
  x: number | undefined,
  y: number | undefined,
  z: number | undefined,
  w: number | undefined,
): number | undefined {
  if ([x, y, z, w].some((value) => value == undefined || !Number.isFinite(value))) {
    return undefined;
  }
  const sinyCosp = 2 * ((w as number) * (z as number) + (x as number) * (y as number));
  const cosyCosp = 1 - 2 * ((y as number) * (y as number) + (z as number) * (z as number));
  return radiansToDegrees(Math.atan2(sinyCosp, cosyCosp));
}

export function normalizeHeadingDeg(value: number | undefined): number | undefined {
  if (value == undefined || !Number.isFinite(value)) {
    return undefined;
  }
  let angle = value;
  while (angle > 180) {
    angle -= 360;
  }
  while (angle <= -180) {
    angle += 360;
  }
  return angle;
}

export function dedupeClosingPoint(points: LocalPoint[]): LocalPoint[] {
  if (points.length < 2) {
    return points;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
    return points.slice(0, -1);
  }
  return points;
}

export function toPolygonCoordinates(state: AircraftState): [number, number][] | undefined {
  if (state.latitude == undefined || state.longitude == undefined || state.footprintLocal == undefined) {
    return undefined;
  }
  const coordinates = state.footprintLocal.map((point) =>
    enuOffsetToLonLat(state.latitude!, state.longitude!, point.x, point.y),
  );
  if (coordinates.length >= 3) {
    coordinates.push(coordinates[0]!);
  }
  return coordinates;
}

export function footprintGeoJson(
  state: AircraftState,
): GeoJSON.Feature<GeoJSON.Polygon> | undefined {
  const coordinates = toPolygonCoordinates(state);
  if (coordinates == undefined || coordinates.length < 4) {
    return undefined;
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordinates] },
  };
}

export function footprintMetrics(localPoints: LocalPoint[] | undefined):
  | { widthM: number; heightM: number; diagonalM: number }
  | undefined {
  if (localPoints == undefined || localPoints.length < 3) {
    return undefined;
  }
  const xs = localPoints.map((point) => point.x);
  const ys = localPoints.map((point) => point.y);
  const widthM = Math.max(...xs) - Math.min(...xs);
  const heightM = Math.max(...ys) - Math.min(...ys);
  return { widthM, heightM, diagonalM: Math.hypot(widthM, heightM) };
}

export function aircraftLonLat(state: AircraftState): [number, number] | undefined {
  if (state.latitude == undefined || state.longitude == undefined) {
    return undefined;
  }
  const local = state.aircraftLocal ?? { x: 0, y: 0 };
  return enuOffsetToLonLat(state.latitude, state.longitude, local.x, local.y);
}

export function raysGeoJson(state: AircraftState): GeoJSON.FeatureCollection {
  const aircraftPoint = aircraftLonLat(state);
  const coordinates = toPolygonCoordinates(state);
  if (aircraftPoint == undefined || coordinates == undefined || coordinates.length < 4) {
    return { type: "FeatureCollection", features: [] };
  }
  const features = coordinates.slice(0, -1).map((corner) => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: [aircraftPoint, corner] },
  }));
  return { type: "FeatureCollection", features };
}

export function desiredZoom(
  state: AircraftState,
  viewportWidthPx: number,
  viewportHeightPx: number,
): number {
  const metrics = footprintMetrics(state.footprintLocal);
  const agl = Math.max(1, state.aglM ?? state.aircraftLocal?.z ?? 600);
  const footprintWidth = metrics?.widthM ?? agl * 1.2;
  const footprintHeight = metrics?.heightM ?? agl * 0.9;
  const lookAhead = clamp(
    Math.max(agl * VIEW.lookAheadFactor, footprintHeight * 0.6),
    VIEW.minimumLookAheadM,
    VIEW.maximumLookAheadM,
  );

  const visibleWidthM = Math.max(
    VIEW.minimumVisibleWidthM,
    footprintWidth * VIEW.footprintPaddingFactor,
    lookAhead * VIEW.followPaddingFactor,
  );
  const visibleHeightM = Math.max(
    VIEW.minimumVisibleWidthM * 0.75,
    footprintHeight * VIEW.footprintPaddingFactor + lookAhead * 0.5,
  );

  const metersPerPixel = Math.max(
    visibleWidthM / Math.max(1, viewportWidthPx),
    visibleHeightM / Math.max(1, viewportHeightPx),
  );
  const latitudeScale = Math.max(0.05, Math.cos(((state.latitude ?? 0) * Math.PI) / 180));
  const zoom = Math.log2((156543.03392804097 * latitudeScale) / metersPerPixel);
  return clamp(zoom, VIEW.minZoom, VIEW.maxZoom);
}

export function followCenter(state: AircraftState): [number, number] | undefined {
  if (state.latitude == undefined || state.longitude == undefined) {
    return undefined;
  }
  const heading = state.headingDeg ?? 0;
  const metrics = footprintMetrics(state.footprintLocal);
  const agl = Math.max(1, state.aglM ?? state.aircraftLocal?.z ?? 600);
  const lookAhead = clamp(
    Math.max(agl * VIEW.lookAheadFactor, (metrics?.heightM ?? 0) * 0.6),
    VIEW.minimumLookAheadM,
    VIEW.maximumLookAheadM,
  );
  return destination(state.latitude, state.longitude, heading, lookAhead * 0.35);
}
