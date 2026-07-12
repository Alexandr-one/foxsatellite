import {
  Immutable,
  MessageEvent,
} from "@foxglove/extension";

import {
  asArray,
  asRecord,
  mergeDefined,
  numberProp,
  prop,
  stringProp,
} from "./objectUtils";

import {
  normalizeHeadingDeg,
  quaternionToEulerDeg,
} from "./geo";

import {
  AircraftState,
  LocalPoint,
  TOPICS,
  WorldOrigin,
} from "./types";

export type MessageState = {
  aircraft?: AircraftState;
  origin?: WorldOrigin;
};

function parseLocalPoint(
  value: unknown,
): LocalPoint | undefined {
  const x =
    numberProp(value, "x");

  const y =
    numberProp(value, "y");

  if (x == undefined || y == undefined) {
    return undefined;
  }

  return { x, y };
}

function removeClosingPoint(
  points: LocalPoint[],
): LocalPoint[] {
  if (points.length < 2) {
    return points;
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;

  const isClosed =
    Math.abs(first.x - last.x) < 1e-6 &&
    Math.abs(first.y - last.y) < 1e-6;

  return isClosed
    ? points.slice(0, -1)
    : points;
}

export function parseSceneFootprint(
  message: Record<string, unknown>,
): LocalPoint[] | undefined {
  for (
    const entity of asArray(
      prop(message, "entities"),
    )
  ) {
    const id =
      stringProp(entity, "id") ?? "";

    if (
      id !== "camera_scan" &&
      !id.includes("camera")
    ) {
      continue;
    }

    for (
      const line of asArray(
        prop(entity, "lines"),
      )
    ) {
      if (
        stringProp(line, "type") ===
        "LINE_LIST"
      ) {
        continue;
      }

      const points =
        asArray(prop(line, "points"))
          .map(parseLocalPoint)
          .filter(
            (
              point,
            ): point is LocalPoint =>
              point != undefined,
          );

      const normalized =
        removeClosingPoint(points);

      if (normalized.length >= 4) {
        return normalized.slice(0, 4);
      }
    }

    for (
      const triangle of asArray(
        prop(entity, "triangles"),
      )
    ) {
      const points =
        asArray(prop(triangle, "points"))
          .map(parseLocalPoint)
          .filter(
            (
              point,
            ): point is LocalPoint =>
              point != undefined,
          );

      const unique: LocalPoint[] = [];

      for (const point of points) {
        const exists =
          unique.some(
            (candidate) =>
              Math.abs(
                candidate.x - point.x,
              ) < 1e-6 &&
              Math.abs(
                candidate.y - point.y,
              ) < 1e-6,
          );

        if (!exists) {
          unique.push(point);
        }
      }

      if (unique.length >= 4) {
        return unique.slice(0, 4);
      }
    }
  }

  return undefined;
}

export function parsePoseMessage(
  message: Record<string, unknown>,
): Partial<AircraftState> {
  const pose =
    asRecord(prop(message, "pose"));

  const position =
    asRecord(prop(pose, "position"));

  const orientation =
    asRecord(prop(pose, "orientation"));

  const euler =
    quaternionToEulerDeg(
      numberProp(orientation, "x"),
      numberProp(orientation, "y"),
      numberProp(orientation, "z"),
      numberProp(orientation, "w"),
    );

  return {
    localPosition: {
      x:
        numberProp(position, "x") ?? 0,

      y:
        numberProp(position, "y") ?? 0,

      z:
        numberProp(position, "z") ?? 0,
    },

    headingDeg:
      euler?.yawDeg,

    pitchDeg:
      euler?.pitchDeg,

    rollDeg:
      euler?.rollDeg,
  };
}

export function mergeMessage(
  current: MessageState,
  event: Immutable<MessageEvent>,
): MessageState {
  const message =
    asRecord(event.message);

  if (message == undefined) {
    return current;
  }

  if (event.topic === TOPICS.origin) {
    const latitude =
      numberProp(message, "latitude");

    const longitude =
      numberProp(message, "longitude");

    const altitudeM =
      numberProp(message, "altitude");

    if (
      latitude == undefined ||
      longitude == undefined ||
      altitudeM == undefined
    ) {
      return current;
    }

    return {
      ...current,

      origin: {
        latitude,
        longitude,
        altitudeM,
      },
    };
  }

  if (event.topic === TOPICS.gps) {
    const latitude =
      numberProp(message, "latitude");

    const longitude =
      numberProp(message, "longitude");

    if (
      latitude == undefined ||
      longitude == undefined
    ) {
      return current;
    }

    const headingRad =
      numberProp(message, "heading");

    return {
      ...current,

      aircraft:
        mergeDefined(
          current.aircraft,
          {
            latitude,
            longitude,

            altitudeM:
              numberProp(
                message,
                "altitude",
              ),

            headingDeg:
              headingRad == undefined
                ? undefined
                : normalizeHeadingDeg(
                    (headingRad * 180) /
                      Math.PI,
                  ),
          },
        ),
    };
  }

  if (event.topic === TOPICS.telemetry) {
    const yawDeg =
      numberProp(message, "yaw_deg");

    return {
      ...current,

      aircraft:
        mergeDefined(
          current.aircraft,
          {
            latitude:
              numberProp(
                message,
                "latitude_deg",
              ),

            longitude:
              numberProp(
                message,
                "longitude_deg",
              ),

            altitudeM:
              numberProp(
                message,
                "altitude_m",
              ),

            aglM:
              numberProp(
                message,
                "agl_m",
              ),

            headingDeg:
              normalizeHeadingDeg(yawDeg),

            pitchDeg:
              numberProp(
                message,
                "pitch_deg",
              ),

            rollDeg:
              numberProp(
                message,
                "roll_deg",
              ),
          },
        ),
    };
  }

  if (event.topic === TOPICS.pose) {
    return {
      ...current,

      aircraft:
        mergeDefined(
          current.aircraft,
          parsePoseMessage(message),
        ),
    };
  }

  if (event.topic === TOPICS.scene) {
    const footprint =
      parseSceneFootprint(message);

    if (footprint == undefined) {
      return current;
    }

    return {
      ...current,

      aircraft:
        mergeDefined(
          current.aircraft,
          {
            sceneFootprintWorld:
              footprint,
          },
        ),
    };
  }

  return current;
}