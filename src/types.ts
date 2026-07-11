export type LocalPoint = {
  x: number;
  y: number;
};

export type WorldOrigin = {
  latitude: number;
  longitude: number;
  altitudeM: number;
};

export type AircraftState = {
  latitude?: number;
  longitude?: number;
  altitudeM?: number;
  aglM?: number;
  headingDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  localPosition?: {
    x: number;
    y: number;
    z: number;
  };

  sceneFootprintWorld?: LocalPoint[];
};

export type PanelConfig = {
  follow: boolean;
  gpsTopic: string;
  telemetryTopic: string;
  sceneTopic: string;
  poseTopic: string;
  originTopic: string;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  headingOffsetDeg: number;
  preferSceneFootprint: boolean;
  tileUrl: string;
  attribution: string;
};

export const DEFAULT_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const DEFAULT_ATTRIBUTION =
  "Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const DEFAULT_CONFIG: PanelConfig = {
  follow: true,
  gpsTopic: "/input/gps",
  telemetryTopic: "/input/telemetry",
  sceneTopic: "/scene/live",
  poseTopic: "/aircraft/pose",
  originTopic: "/world/origin",
  horizontalFovDeg: 43.2,
  verticalFovDeg: 22.6,
  headingOffsetDeg: 0,
  preferSceneFootprint: true,
  tileUrl: DEFAULT_TILE_URL,
  attribution: DEFAULT_ATTRIBUTION,
};

export const VIEW = {
  minZoom: 2,
  maxZoom: 19,
  mapPitchDeg: 45,
  initialZoom: 15,
  followDurationMs: 650,
  minimumMoveM: 0.6,
  maximumTrackPoints: 10_000,
  trackTeleportThresholdM: 2_000,
} as const;