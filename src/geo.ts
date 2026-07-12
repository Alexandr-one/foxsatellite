import {
  AircraftState,
  CAMERA_CONFIG,
  LocalPoint,
  WorldOrigin,
} from "./types";

const EARTH_RADIUS_M = 6_378_137;

export function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
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
    x == undefined ||
    y == undefined ||
    z == undefined ||
    w == undefined
  ) {
    return undefined;
  }

  if (![x, y, z, w].every(Number.isFinite)) {
    return undefined;
  }

  const sinRollCosPitch = 2 * (w * x + y * z);
  const cosRollCosPitch = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinRollCosPitch, cosRollCosPitch);

  const sinPitch = 2 * (w * y - z * x);

  const pitch =
    Math.abs(sinPitch) >= 1
      ? Math.sign(sinPitch) * (Math.PI / 2)
      : Math.asin(sinPitch);

  const sinYawCosPitch = 2 * (w * z + x * y);
  const cosYawCosPitch = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinYawCosPitch, cosYawCosPitch);

  return {
    yawDeg: normalizeHeadingDeg(radiansToDegrees(yaw)) ?? 0,
    pitchDeg: radiansToDegrees(pitch),
    rollDeg: radiansToDegrees(roll),
  };
}

export function destination(
  latitudeDeg: number,
  longitudeDeg: number,
  bearingDeg: number,
  distanceM: number,
): [number, number] {
  const angularDistance = distanceM / EARTH_RADIUS_M;
  const bearing = degreesToRadians(bearingDeg);
  const latitude1 = degreesToRadians(latitudeDeg);
  const longitude1 = degreesToRadians(longitudeDeg);

  const latitude2 = Math.asin(
    Math.sin(latitude1) * Math.cos(angularDistance) +
      Math.cos(latitude1) *
        Math.sin(angularDistance) *
        Math.cos(bearing),
  );

  const longitude2 =
    longitude1 +
    Math.atan2(
      Math.sin(bearing) *
        Math.sin(angularDistance) *
        Math.cos(latitude1),
      Math.cos(angularDistance) -
        Math.sin(latitude1) * Math.sin(latitude2),
    );

  return [
    radiansToDegrees(longitude2),
    radiansToDegrees(latitude2),
  ];
}

export function enuOffsetToLonLat(
  latitudeDeg: number,
  longitudeDeg: number,
  eastM: number,
  northM: number,
): [number, number] {
  const distanceM = Math.hypot(eastM, northM);

  if (distanceM < 1e-9) {
    return [longitudeDeg, latitudeDeg];
  }

  const bearingDeg = radiansToDegrees(
    Math.atan2(eastM, northM),
  );

  return destination(
    latitudeDeg,
    longitudeDeg,
    bearingDeg,
    distanceM,
  );
}

export function haversineDistanceM(
  first: [number, number],
  second: [number, number],
): number {
  const latitude1 = degreesToRadians(first[1]);
  const latitude2 = degreesToRadians(second[1]);

  const deltaLatitude = latitude2 - latitude1;
  const deltaLongitude = degreesToRadians(
    second[0] - first[0],
  );

  const value =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_M *
    Math.asin(Math.min(1, Math.sqrt(value)))
  );
}

export function resolveAircraftLonLat(
  aircraft: AircraftState,
  origin: WorldOrigin | undefined,
): [number, number] | undefined {
  if (
    origin != undefined &&
    aircraft.localPosition != undefined
  ) {
    return enuOffsetToLonLat(
      origin.latitude,
      origin.longitude,
      aircraft.localPosition.x,
      aircraft.localPosition.y,
    );
  }

  if (
    aircraft.latitude != undefined &&
    aircraft.longitude != undefined
  ) {
    return [
      aircraft.longitude,
      aircraft.latitude,
    ];
  }

  return undefined;
}

export function resolveHeightAboveGround(
  aircraft: AircraftState,
  origin: WorldOrigin | undefined,
): number | undefined {
  if (
    aircraft.localPosition != undefined &&
    Number.isFinite(aircraft.localPosition.z) &&
    aircraft.localPosition.z > 0
  ) {
    return aircraft.localPosition.z;
  }

  if (
    aircraft.altitudeM != undefined &&
    origin != undefined
  ) {
    const height =
      aircraft.altitudeM - origin.altitudeM;

    if (height > 0) {
      return height;
    }
  }

  if (
    aircraft.aglM != undefined &&
    aircraft.aglM > 0
  ) {
    return aircraft.aglM;
  }

  return undefined;
}

export function computeCameraFootprint(
  heightM: number,
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
  horizontalFovDeg = CAMERA_CONFIG.horizontalFovDeg,
  verticalFovDeg = CAMERA_CONFIG.verticalFovDeg,
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

  const horizontalHalf = Math.tan(
    degreesToRadians(horizontalFovDeg / 2),
  );

  const verticalHalf = Math.tan(
    degreesToRadians(verticalFovDeg / 2),
  );

  const bodyRays = [
    {
      x: verticalHalf,
      y: -horizontalHalf,
      z: 1,
    },
    {
      x: verticalHalf,
      y: horizontalHalf,
      z: 1,
    },
    {
      x: -verticalHalf,
      y: horizontalHalf,
      z: 1,
    },
    {
      x: -verticalHalf,
      y: -horizontalHalf,
      z: 1,
    },
  ];

  const yaw = degreesToRadians(yawDeg);
  const pitch = degreesToRadians(pitchDeg);
  const roll = degreesToRadians(rollDeg);

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  const result: LocalPoint[] = [];

  for (const ray of bodyRays) {
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

export function relativeFootprintToLonLat(
  aircraft: AircraftState,
  origin: WorldOrigin | undefined,
  points: LocalPoint[] | undefined,
): [number, number][] | undefined {
  const aircraftPoint = resolveAircraftLonLat(
    aircraft,
    origin,
  );

  if (
    aircraftPoint == undefined ||
    points == undefined ||
    points.length < 3
  ) {
    return undefined;
  }

  const [longitude, latitude] = aircraftPoint;

  const coordinates = points.map((point) =>
    enuOffsetToLonLat(
      latitude,
      longitude,
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