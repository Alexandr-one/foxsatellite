export type LocalPoint = {
  x: number;
  y: number;
};

export type WorldOrigin = {
  latitude: number;
  longitude: number;
  altitudeM: number;
};

export type LocalPosition = {
  x: number;
  y: number;
  z: number;
};

export type AircraftState = {
  latitude?: number;
  longitude?: number;

  altitudeM?: number;
  aglM?: number;

  headingDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;

  localPosition?: LocalPosition;

  sceneFootprintWorld?: LocalPoint[];
};

export type AircraftMapPose = {
  longitude: number;
  latitude: number;

  heightM: number;

  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
};

export type FootprintCorner = {
  longitude: number;
  latitude: number;
};

export const TOPICS = {
  gps: "/input/gps",
  telemetry: "/input/telemetry",
  scene: "/scene/live",
  pose: "/aircraft/pose",
  origin: "/world/origin",
} as const;

export const MAP_CONFIG = {
  tileUrl:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",

  attribution:
    "Esri, Maxar, Earthstar Geographics, and the GIS User Community",

  minZoom: 2,
  maxZoom: 19,
  initialZoom: 15,

  pitchDeg: 48,

  followDurationMs: 350,
  minimumMoveM: 0.5,

  maximumTrackPoints: 10_000,
  teleportThresholdM: 2_000,
} as const;

export const CAMERA_CONFIG = {
  horizontalFovDeg: 29.3,
  verticalFovDeg: 22.0,
} as const;