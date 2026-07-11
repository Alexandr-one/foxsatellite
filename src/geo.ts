import { AircraftState, LocalPoint, WorldOrigin } from "./types";

const EARTH_RADIUS_M = 6_378_137;

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value != undefined
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

export function numberProp(
  object: unknown,
  ...keys: string[]
): number | undefined {
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

export function stringProp(
  object: unknown,
  ...keys: string[]
): string | undefined {
  const value = prop(object, ...keys);
  return typeof value === "string" ? value : undefined;
}

export function normalizeHeadingDeg(
  value: number | undefined,
): number | undefined {
  if (value == undefined || !Number.isFinite(value)) {
    return undefined;
  }

  return ((value % 360) + 360) % 360;
}

export function quaternionToEulerDeg(
  x: number | undefined,
  y: number | undefined,
  z: number | undefined,
  w: number | undefined,
):
  | {
      yawDeg: number;
      pitchDeg: number;
      rollDeg: number;
    }
  | undefined {
  if (
    [x, y, z, w].some(
      (value) => value == undefined || !Number.isFinite(value),
    )
  ) {
    return undefined;
  }

  const qx = x!;
  const qy = y!;
  const qz = z!;
  const qw = w!;

  const sinRollCosPitch = 2 * (qw * qx + qy * qz);
  const cosRollCosPitch = 1 - 2 * (qx * qx + qy * qy);
  const roll = Math.atan2(sinRollCosPitch, cosRollCosPitch);

  const sinPitch = 2 * (qw * qy - qz * qx);
  const pitch =
    Math.abs(sinPitch) >= 1
      ? Math.sign(sinPitch) * (Math.PI / 2)
      : Math.asin(sinPitch);

  const sinYawCosPitch = 2 * (qw * qz + qx * qy);
  const cosYawCosPitch = 1 - 2 * (qy * qy + qz * qz);
  const yaw = Math.atan2(sinYawCosPitch, cosYawCosPitch);

  return {
    yawDeg: normalizeHeadingDeg((yaw * 180) / Math.PI) ?? 0,
    pitchDeg: (pitch * 180) / Math.PI,
    rollDeg: (roll * 180) / Math.PI,
  };
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
      Math.cos(lat1) *
        Math.sin(angularDistance) *
        Math.cos(bearing),
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) *
        Math.sin(angularDistance) *
        Math.cos(lat1),
      Math.cos(angularDistance) -
        Math.sin(lat1) * Math.sin(lat2),
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

  const bearingDeg =
    (Math.atan2(eastM, northM) * 180) / Math.PI;

  return destination(
    latitudeDeg,
    longitudeDeg,
    bearingDeg,
    distance,
  );
}

export function haversineDistanceM(
  a: [number, number],
  b: [number, number],
): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_M *
    Math.asin(Math.min(1, Math.sqrt(h)))
  );
}

export function computeCameraFootprint(
  heightM: number,
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
  horizontalFovDeg: number,
  verticalFovDeg: number,
): LocalPoint[] | undefined {
  if (
    !Number.isFinite(heightM) ||
    heightM <= 0 ||
    horizontalFovDeg <= 0 ||
    horizontalFovDeg >= 179 ||
    verticalFovDeg <= 0 ||
    verticalFovDeg >= 179
  ) {
    return undefined;
  }

  const halfWidth = Math.tan(
    (horizontalFovDeg * Math.PI) / 360,
  );

  const halfHeight = Math.tan(
    (verticalFovDeg * Math.PI) / 360,
  );

  const raysBody = [
    {
      x: halfHeight,
      y: -halfWidth,
      z: 1,
    },
    {
      x: halfHeight,
      y: halfWidth,
      z: 1,
    },
    {
      x: -halfHeight,
      y: halfWidth,
      z: 1,
    },
    {
      x: -halfHeight,
      y: -halfWidth,
      z: 1,
    },
  ];

  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const roll = (rollDeg * Math.PI) / 180;

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  const result: LocalPoint[] = [];

  for (const ray of raysBody) {
    /*
     * Поворот body FRD -> world NED.
     */
    const north =
      cp * cy * ray.x +
      (sr * sp * cy - cr * sy) * ray.y +
      (cr * sp * cy + sr * sy) * ray.z;

    const east =
      cp * sy * ray.x +
      (sr * sp * sy + cr * cy) * ray.y +
      (cr * sp * sy - sr * cy) * ray.z;

    const down =
      -sp * ray.x +
      sr * cp * ray.y +
      cr * cp * ray.z;

    if (down <= 1e-6) {
      return undefined;
    }

    const scale = heightM / down;

    result.push({
      x: east * scale,
      y: north * scale,
    });
  }

  return result;
}

export function resolveHeightAboveWorldPlane(
  state: AircraftState,
  origin: WorldOrigin | undefined,
): number | undefined {
  if (
    state.localPosition?.z != undefined &&
    state.localPosition.z > 0
  ) {
    return state.localPosition.z;
  }

  if (
    state.altitudeM != undefined &&
    origin != undefined
  ) {
    const height = state.altitudeM - origin.altitudeM;
    return height > 0 ? height : undefined;
  }

  return state.aglM != undefined && state.aglM > 0
    ? state.aglM
    : undefined;
}

export function relativeFootprintToLonLat(
  state: AircraftState,
  points: LocalPoint[] | undefined,
): [number, number][] | undefined {
  if (
    state.latitude == undefined ||
    state.longitude == undefined ||
    points == undefined ||
    points.length < 3
  ) {
    return undefined;
  }

  const coordinates = points.map((point) =>
    enuOffsetToLonLat(
      state.latitude!,
      state.longitude!,
      point.x,
      point.y,
    ),
  );

  coordinates.push(coordinates[0]!);

  return coordinates;
}

export function worldFootprintToLonLat(
  origin: WorldOrigin | undefined,
  points: LocalPoint[] | undefined,
): [number, number][] | undefined {
  if (
    origin == undefined ||
    points == undefined ||
    points.length < 3
  ) {
    return undefined;
  }

  const coordinates = points.map((point) =>
    enuOffsetToLonLat(
      origin.latitude,
      origin.longitude,
      point.x,
      point.y,
    ),
  );

  coordinates.push(coordinates[0]!);

  return coordinates;
}