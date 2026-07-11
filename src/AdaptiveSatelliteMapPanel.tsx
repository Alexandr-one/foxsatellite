import { Immutable, MessageEvent, PanelExtensionContext } from "@foxglove/extension";
import maplibregl, { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ReactElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  aircraftLonLat,
  asArray,
  asRecord,
  dedupeClosingPoint,
  desiredZoom,
  firstDefined,
  followCenter,
  footprintGeoJson,
  normalizeHeadingDeg,
  numberProp,
  prop,
  quaternionToYawDeg,
  raysGeoJson,
  stringProp,
} from "./geo";
import { AircraftState, DEFAULT_ATTRIBUTION, DEFAULT_TILE_URL, LocalPoint, TOPICS, VIEW } from "./types";
import "./panel.css";

type PanelProps = { context: PanelExtensionContext };
type StoredState = { follow?: boolean; autoZoom?: boolean };

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function source(map: MapLibreMap, id: string): GeoJSONSource | undefined {
  return map.getSource(id) as GeoJSONSource | undefined;
}

function roundTripLine(points: LocalPoint[]): LocalPoint[] {
  const deduped = dedupeClosingPoint(points);
  return deduped.length >= 4 ? deduped.slice(0, 4) : deduped;
}

function parseFootprintEntity(entity: unknown): LocalPoint[] | undefined {
  const lineCandidates = asArray(prop(entity, "lines"));
  for (const line of lineCandidates) {
    const type = stringProp(line, "type");
    const points = asArray(prop(line, "points"))
      .map((point) => ({ x: numberProp(point, "x") ?? 0, y: numberProp(point, "y") ?? 0 }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length >= 4 && type !== "LINE_LIST") {
      const normalized = roundTripLine(points);
      if (normalized.length >= 4) {
        return normalized;
      }
    }
  }

  const triangles = asArray(prop(entity, "triangles"));
  for (const triangle of triangles) {
    const points = asArray(prop(triangle, "points"))
      .map((point) => ({ x: numberProp(point, "x") ?? 0, y: numberProp(point, "y") ?? 0 }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const unique: LocalPoint[] = [];
    for (const point of points) {
      if (!unique.some((existing) => Math.abs(existing.x - point.x) < 1e-6 && Math.abs(existing.y - point.y) < 1e-6)) {
        unique.push(point);
      }
    }
    if (unique.length >= 4) {
      return unique.slice(0, 4);
    }
  }
  return undefined;
}

function parseAircraftPoseEntity(entity: unknown):
  | { x: number; y: number; z?: number; headingDeg?: number }
  | undefined {
  const primitivePose = firstDefined(
    prop(asArray(prop(entity, "triangles"))[0], "pose"),
    prop(asArray(prop(entity, "spheres"))[0], "pose"),
    prop(asArray(prop(entity, "cubes"))[0], "pose"),
    prop(asArray(prop(entity, "models"))[0], "pose"),
  );
  const position = asRecord(prop(primitivePose, "position"));
  const orientation = asRecord(prop(primitivePose, "orientation"));
  return {
    x: numberProp(position, "x") ?? 0,
    y: numberProp(position, "y") ?? 0,
    z: numberProp(position, "z"),
    headingDeg: normalizeHeadingDeg(
      quaternionToYawDeg(
        numberProp(orientation, "x"),
        numberProp(orientation, "y"),
        numberProp(orientation, "z"),
        numberProp(orientation, "w"),
      ),
    ),
  };
}

function parseSceneLive(message: Record<string, unknown>): Partial<AircraftState> {
  const entities = asArray(prop(message, "entities"));
  let footprintLocal: LocalPoint[] | undefined;
  let aircraftLocal: { x: number; y: number; z?: number } | undefined;
  let headingDeg: number | undefined;

  for (const entity of entities) {
    const id = stringProp(entity, "id") ?? "";
    if (id === "camera_scan" || id.includes("camera")) {
      footprintLocal = parseFootprintEntity(entity) ?? footprintLocal;
    }
    if (id === "aircraft" || id.includes("aircraft")) {
      const pose = parseAircraftPoseEntity(entity);
      if (pose != undefined) {
        aircraftLocal = { x: pose.x, y: pose.y, z: pose.z };
        headingDeg = pose.headingDeg ?? headingDeg;
      }
    }
  }

  return { footprintLocal, aircraftLocal, headingDeg };
}

function mergeMessage(current: AircraftState | undefined, event: Immutable<MessageEvent>): AircraftState | undefined {
  const message = asRecord(event.message);
  if (message == undefined) {
    return current;
  }

  if (event.topic === TOPICS.gps) {
    const latitude = numberProp(message, "latitude");
    const longitude = numberProp(message, "longitude");
    if (latitude == undefined || longitude == undefined) {
      return current;
    }
    const gpsHeading = numberProp(message, "heading");
    const headingDeg =
      gpsHeading != undefined && Math.abs(gpsHeading) <= Math.PI * 2
        ? (gpsHeading * 180) / Math.PI
        : gpsHeading;
    return {
      ...current,
      latitude,
      longitude,
      altitudeM: numberProp(message, "altitude") ?? current?.altitudeM,
      headingDeg: current?.headingDeg ?? normalizeHeadingDeg(headingDeg),
    };
  }

  if (event.topic === TOPICS.telemetry) {
    return {
      ...current,
      latitude: numberProp(message, "latitude_deg") ?? current?.latitude,
      longitude: numberProp(message, "longitude_deg") ?? current?.longitude,
      altitudeM: numberProp(message, "altitude_m") ?? current?.altitudeM,
      aglM: numberProp(message, "agl_m") ?? current?.aglM,
      headingDeg: normalizeHeadingDeg(numberProp(message, "yaw_deg")) ?? current?.headingDeg,
      pitchDeg: numberProp(message, "pitch_deg") ?? current?.pitchDeg,
      rollDeg: numberProp(message, "roll_deg") ?? current?.rollDeg,
    };
  }

  if (event.topic === TOPICS.sceneLive) {
    return { ...current, ...parseSceneLive(message) };
  }

  return current;
}

function aircraftGeoJson(state: AircraftState): GeoJSON.FeatureCollection {
  const coordinates = aircraftLonLat(state);
  if (coordinates == undefined) {
    return emptyFeatureCollection();
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          heading: state.headingDeg ?? 0,
        },
        geometry: {
          type: "Point",
          coordinates,
        },
      },
    ],
  };
}

function trackGeoJson(track: Array<[number, number]>): GeoJSON.FeatureCollection {
  if (track.length < 2) {
    return emptyFeatureCollection();
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: track },
      },
    ],
  };
}

function drawAircraftIcon(): ImageData {
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx == undefined) {
    throw new Error("Unable to create aircraft icon canvas");
  }

  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(0);

  ctx.fillStyle = "rgba(17, 24, 39, 0.96)";
  ctx.strokeStyle = "rgba(255, 204, 77, 1)";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.lineTo(8, -12);
  ctx.lineTo(22, -6);
  ctx.lineTo(22, 4);
  ctx.lineTo(6, 2);
  ctx.lineTo(4, 18);
  ctx.lineTo(14, 28);
  ctx.lineTo(10, 34);
  ctx.lineTo(0, 25);
  ctx.lineTo(-10, 34);
  ctx.lineTo(-14, 28);
  ctx.lineTo(-4, 18);
  ctx.lineTo(-6, 2);
  ctx.lineTo(-22, 4);
  ctx.lineTo(-22, -6);
  ctx.lineTo(-8, -12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 204, 77, 0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

function createMap(container: HTMLDivElement): MapLibreMap {
  return new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [DEFAULT_TILE_URL],
          tileSize: 256,
          attribution: DEFAULT_ATTRIBUTION,
          maxzoom: VIEW.maxZoom,
        },
      },
      layers: [{ id: "satellite", type: "raster", source: "satellite" }],
    },
    center: [27.992833, 53.706877],
    zoom: 15,
    pitch: VIEW.mapPitchDeg,
    bearing: 0,
    attributionControl: false,
    maxZoom: VIEW.maxZoom,
    minZoom: VIEW.minZoom,
  });
}

function installOverlayLayers(map: MapLibreMap): void {
  map.addImage("aircraft-icon", drawAircraftIcon(), { pixelRatio: 2 });

  map.addSource("track", { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: "track-line",
    type: "line",
    source: "track",
    paint: {
      "line-color": "#41d9ff",
      "line-width": 3,
      "line-opacity": 0.85,
    },
  });

  map.addSource("footprint", { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: "footprint-fill",
    type: "fill",
    source: "footprint",
    paint: {
      "fill-color": "#51ff91",
      "fill-opacity": 0.18,
    },
  });
  map.addLayer({
    id: "footprint-outline",
    type: "line",
    source: "footprint",
    paint: {
      "line-color": "#7bffb0",
      "line-width": 3,
      "line-opacity": 0.92,
    },
  });

  map.addSource("rays", { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: "rays-line",
    type: "line",
    source: "rays",
    paint: {
      "line-color": "#7edcff",
      "line-width": 2,
      "line-opacity": 0.65,
    },
  });

  map.addSource("aircraft", { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: "aircraft-shadow",
    type: "circle",
    source: "aircraft",
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(8, 14, 24, 0.55)",
      "circle-stroke-color": "rgba(255, 204, 77, 0.25)",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "aircraft-icon-layer",
    type: "symbol",
    source: "aircraft",
    layout: {
      "icon-image": "aircraft-icon",
      "icon-size": 0.45,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-rotation-alignment": "map",
      "icon-rotate": ["get", "heading"],
    },
  });
}

function AdaptiveSatelliteMapPanel({ context }: PanelProps): ReactElement {
  const initial = useMemo(() => ({ follow: true, autoZoom: true, ...((context.initialState ?? {}) as StoredState) }), [context.initialState]);
  const [aircraft, setAircraft] = useState<AircraftState>();
  const [follow, setFollow] = useState(initial.follow ?? true);
  const [autoZoom, setAutoZoom] = useState(initial.autoZoom ?? true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string>();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>();
  const aircraftRef = useRef<AircraftState>();
  const followRef = useRef(follow);
  const autoZoomRef = useRef(autoZoom);
  const programmaticMoveRef = useRef(false);
  const trackRef = useRef<Array<[number, number]>>([]);
  const renderDoneRef = useRef<(() => void) | undefined>();

  useEffect(() => {
    aircraftRef.current = aircraft;
  }, [aircraft]);
  useEffect(() => {
    followRef.current = follow;
  }, [follow]);
  useEffect(() => {
    autoZoomRef.current = autoZoom;
  }, [autoZoom]);

  useLayoutEffect(() => {
    context.setDefaultPanelTitle("Adaptive Satellite Map");
    context.watch("currentFrame");
    context.watch("topics");
    context.subscribe([
      { topic: TOPICS.gps },
      { topic: TOPICS.telemetry },
      { topic: TOPICS.sceneLive },
    ]);

    context.onRender = (renderState, done) => {
      renderDoneRef.current?.();
      renderDoneRef.current = done;

      let next = aircraftRef.current;
      for (const event of renderState.currentFrame ?? []) {
        next = mergeMessage(next, event);
      }
      if (next != undefined) {
        setAircraft(next);
      }
      done();
      renderDoneRef.current = undefined;
    };

    return () => {
      renderDoneRef.current?.();
      renderDoneRef.current = undefined;
      context.unsubscribeAll();
    };
  }, [context]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (container == undefined) {
      return;
    }

    setMapReady(false);
    setError(undefined);
    const map = createMap(container);
    mapRef.current = map;

    map.on("load", () => {
      installOverlayLayers(map);
      setMapReady(true);
    });
    map.on("error", (event) => {
      setError(event.error?.message ?? "Map tile loading error");
    });
    map.on("dragstart", () => {
      if (!programmaticMoveRef.current) {
        setFollow(false);
      }
    });
    map.on("zoomstart", (event) => {
      if (!programmaticMoveRef.current && event.originalEvent != undefined) {
        setAutoZoom(false);
      }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    context.saveState({ follow, autoZoom });
  }, [autoZoom, context, follow]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || map == undefined || aircraft == undefined) {
      return;
    }

    const aircraftPoint = aircraftLonLat(aircraft);
    if (
      aircraftPoint != undefined &&
      (trackRef.current.length === 0 ||
        Math.abs(trackRef.current[trackRef.current.length - 1]![0] - aircraftPoint[0]) > 1e-8 ||
        Math.abs(trackRef.current[trackRef.current.length - 1]![1] - aircraftPoint[1]) > 1e-8)
    ) {
      trackRef.current.push(aircraftPoint);
      if (trackRef.current.length > 10_000) {
        trackRef.current.splice(0, trackRef.current.length - 10_000);
      }
    }

    source(map, "aircraft")?.setData(aircraftGeoJson(aircraft));
    const footprint = footprintGeoJson(aircraft);
    source(map, "footprint")?.setData(
      footprint == undefined
        ? emptyFeatureCollection()
        : { type: "FeatureCollection", features: [footprint] },
    );
    source(map, "rays")?.setData(raysGeoJson(aircraft));
    source(map, "track")?.setData(trackGeoJson(trackRef.current));

    if (follow) {
      const container = map.getContainer();
      const center = followCenter(aircraft) ?? aircraftPoint;
      if (center != undefined) {
        programmaticMoveRef.current = true;
        map.easeTo({
          center,
          zoom: autoZoom ? desiredZoom(aircraft, container.clientWidth, container.clientHeight) : map.getZoom(),
          bearing: 0,
          pitch: VIEW.mapPitchDeg,
          duration: 180,
          essential: true,
        });
        window.setTimeout(() => {
          programmaticMoveRef.current = false;
        }, 220);
      }
    }
  }, [aircraft, autoZoom, follow, mapReady]);

  return (
    <div className="asm-root">
      <div ref={mapContainerRef} className="asm-map" />
      <div className="asm-toolbar">
        <button className={follow ? "active" : ""} onClick={() => setFollow(true)}>
          Follow
        </button>
        <button className={autoZoom ? "active" : ""} onClick={() => setAutoZoom((value) => !value)}>
          Auto zoom
        </button>
      </div>
      {aircraft == undefined && (
        <div className="asm-center-message">Waiting for /input/gps, /input/telemetry and /scene/live</div>
      )}
      {error != undefined && <div className="asm-error">{error}</div>}
    </div>
  );
}

export function initAdaptiveSatelliteMapPanel(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(<AdaptiveSatelliteMapPanel context={context} />);
  return () => root.unmount();
}
