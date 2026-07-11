export type LocalPoint = {
  x: number;
  y: number;
};

export type AircraftState = {
  latitude?: number;
  longitude?: number;
  altitudeM?: number;
  aglM?: number;
  headingDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  aircraftLocal?: {
    x: number;
    y: number;
    z?: number;
  };
  footprintLocal?: LocalPoint[];
};

export const DEFAULT_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const DEFAULT_ATTRIBUTION =
  "Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const TOPICS = {
  gps: "/input/gps",
  telemetry: "/input/telemetry",
  sceneLive: "/scene/live",
} as const;

export const VIEW = {
  minZoom: 2,
  maxZoom: 19,
  mapPitchDeg: 55,
  minimumVisibleWidthM: 700,
  minimumLookAheadM: 140,
  maximumLookAheadM: 5000,
  lookAheadFactor: 1.25,
  followPaddingFactor: 1.9,
  footprintPaddingFactor: 2.0,
} as const;
