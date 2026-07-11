import {
  Immutable,
  MessageEvent,
  PanelExtensionContext,
  SettingsTreeAction,
  Topic,
} from "@foxglove/extension";
import maplibregl, { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import {
  asArray,
  asRecord,
  computeCameraFootprint,
  haversineDistanceM,
  normalizeHeadingDeg,
  numberProp,
  prop,
  quaternionToEulerDeg,
  relativeFootprintToLonLat,
  resolveHeightAboveWorldPlane,
  stringProp,
  worldFootprintToLonLat,
} from "./geo";
import { FootprintCorner, ThreeAircraftLayer } from "./ThreeAircraftLayer";
import {
  AircraftState,
  DEFAULT_CONFIG,
  LocalPoint,
  PanelConfig,
  VIEW,
  WorldOrigin,
} from "./types";
import "./panel.css";

type PanelProps = {
  context: PanelExtensionContext;
};

type PersistedState = Partial<PanelConfig>;

type MessageState = {
  aircraft?: AircraftState;
  origin?: WorldOrigin;
};

function emptyFeatureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function source(map: MapLibreMap, id: string): GeoJSONSource | undefined {
  return map.getSource(id) as GeoJSONSource | undefined;
}

function parseLocalPoint(value: unknown): LocalPoint | undefined {
  const x = numberProp(value, "x");
  const y = numberProp(value, "y");

  if (x == undefined || y == undefined) {
    return undefined;
  }

  return { x, y };
}

function parseSceneFootprint(message: Record<string, unknown>): LocalPoint[] | undefined {
  for (const entity of asArray(prop(message, "entities"))) {
    const id = stringProp(entity, "id") ?? "";

    if (id !== "camera_scan" && !id.includes("camera")) {
      continue;
    }

    for (const line of asArray(prop(entity, "lines"))) {
      if (stringProp(line, "type") === "LINE_LIST") {
        continue;
      }

      const points = asArray(prop(line, "points"))
        .map(parseLocalPoint)
        .filter((point): point is LocalPoint => point != undefined);

      if (points.length < 4) {
        continue;
      }

      const first = points[0]!;
      const last = points[points.length - 1]!;

      const withoutClosingPoint =
        Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6
          ? points.slice(0, -1)
          : points;

      return withoutClosingPoint.slice(0, 4);
    }
  }

  return undefined;
}

function parsePose(message: Record<string, unknown>): Partial<AircraftState> {
  const pose = asRecord(prop(message, "pose"));
  const position = asRecord(prop(pose, "position"));
  const orientation = asRecord(prop(pose, "orientation"));

  const euler = quaternionToEulerDeg(
    numberProp(orientation, "x"),
    numberProp(orientation, "y"),
    numberProp(orientation, "z"),
    numberProp(orientation, "w"),
  );

  return {
    localPosition: {
      x: numberProp(position, "x") ?? 0,
      y: numberProp(position, "y") ?? 0,
      z: numberProp(position, "z") ?? 0,
    },
    headingDeg: euler?.yawDeg,
    pitchDeg: euler?.pitchDeg,
    rollDeg: euler?.rollDeg,
  };
}

function mergeDefined<T extends object>(base: T | undefined, patch: Partial<T>): T {
  const result = {
    ...(base ?? ({} as T)),
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value != undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

function eventTimeNs(event: Immutable<MessageEvent>): bigint | undefined {
  const receiveTime = asRecord(event.receiveTime);
  const sec = numberProp(receiveTime, "sec");
  const nsec = numberProp(receiveTime, "nsec");

  if (sec == undefined || nsec == undefined) {
    return undefined;
  }

  return BigInt(Math.trunc(sec)) * 1_000_000_000n + BigInt(Math.trunc(nsec));
}

function mergeMessage(
  current: MessageState,
  event: Immutable<MessageEvent>,
  config: PanelConfig,
): MessageState {
  const message = asRecord(event.message);

  if (message == undefined) {
    return current;
  }

  if (event.topic === config.originTopic) {
    const latitude = numberProp(message, "latitude");
    const longitude = numberProp(message, "longitude");
    const altitudeM = numberProp(message, "altitude");

    if (latitude == undefined || longitude == undefined || altitudeM == undefined) {
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

  if (event.topic === config.gpsTopic) {
    const latitude = numberProp(message, "latitude");
    const longitude = numberProp(message, "longitude");

    if (latitude == undefined || longitude == undefined) {
      return current;
    }

    const headingRad = numberProp(message, "heading");

    return {
      ...current,
      aircraft: mergeDefined(current.aircraft, {
        latitude,
        longitude,
        altitudeM: numberProp(message, "altitude"),
        headingDeg:
          headingRad == undefined
            ? undefined
            : normalizeHeadingDeg(
                (headingRad * 180) / Math.PI + config.headingOffsetDeg,
              ),
      }),
    };
  }

  if (event.topic === config.poseTopic) {
    return {
      ...current,
      aircraft: mergeDefined(current.aircraft, parsePose(message)),
    };
  }

  if (event.topic === config.telemetryTopic) {
    const yawDeg = numberProp(message, "yaw_deg");

    return {
      ...current,
      aircraft: mergeDefined(current.aircraft, {
        latitude: numberProp(message, "latitude_deg"),
        longitude: numberProp(message, "longitude_deg"),
        altitudeM: numberProp(message, "altitude_m"),
        aglM: numberProp(message, "agl_m"),
        headingDeg:
          yawDeg == undefined
            ? undefined
            : normalizeHeadingDeg(yawDeg + config.headingOffsetDeg),
        pitchDeg: numberProp(message, "pitch_deg"),
        rollDeg: numberProp(message, "roll_deg"),
      }),
    };
  }

  if (event.topic === config.sceneTopic) {
    const sceneFootprintWorld = parseSceneFootprint(message);

    if (sceneFootprintWorld == undefined) {
      return current;
    }

    return {
      ...current,
      aircraft: mergeDefined(current.aircraft, {
        sceneFootprintWorld,
      }),
    };
  }

  return current;
}

function aircraftLonLat(state: AircraftState): [number, number] | undefined {
  if (state.latitude == undefined || state.longitude == undefined) {
    return undefined;
  }

  return [state.longitude, state.latitude];
}

function polygonGeoJson(
  coordinates: [number, number][] | undefined,
): GeoJSON.FeatureCollection {
  if (coordinates == undefined || coordinates.length < 4) {
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
        geometry: {
          type: "LineString",
          coordinates: track,
        },
      },
    ],
  };
}

function polygonToFootprintCorners(
  polygon: [number, number][] | undefined,
): FootprintCorner[] {
  if (polygon == undefined || polygon.length < 3) {
    return [];
  }

  const first = polygon[0];
  const last = polygon[polygon.length - 1];

  const points =
    first != undefined &&
    last != undefined &&
    Math.abs(first[0] - last[0]) < 1e-12 &&
    Math.abs(first[1] - last[1]) < 1e-12
      ? polygon.slice(0, -1)
      : polygon;

  return points.slice(0, 4).map(([longitude, latitude]) => ({
    longitude,
    latitude,
  }));
}

function createMap(container: HTMLDivElement, config: PanelConfig): MapLibreMap {
  return new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [config.tileUrl],
          tileSize: 256,
          attribution: config.attribution,
          maxzoom: VIEW.maxZoom,
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
    center: [27.992833, 53.706877],
    zoom: VIEW.initialZoom,
    pitch: VIEW.mapPitchDeg,
    bearing: 0,
    attributionControl: false,
    maxZoom: VIEW.maxZoom,
    minZoom: VIEW.minZoom,
    maxPitch: 80,
    canvasContextAttributes: {
      antialias: true,
    },
  });
}

function installMapLayers(map: MapLibreMap): void {
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
      "line-width": 3,
      "line-opacity": 0.85,
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
}

function topicOptions(
  topics: readonly Topic[],
): Array<{
  label: string;
  value: string;
}> {
  return topics.map((topic) => ({
    label: topic.name,
    value: topic.name,
  }));
}

function AdaptiveSatelliteMapPanel({ context }: PanelProps): ReactElement {
  const initialConfig = useMemo(
    () => ({
      ...DEFAULT_CONFIG,
      ...((context.initialState ?? {}) as PersistedState),
    }),
    [context.initialState],
  );

  const [config, setConfig] = useState<PanelConfig>(initialConfig);
  const [messageState, setMessageState] = useState<MessageState>({});
  const [topics, setTopics] = useState<readonly Topic[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string>();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>();
  const threeAircraftLayerRef = useRef<ThreeAircraftLayer>();

  const configRef = useRef(config);
  const messageStateRef = useRef(messageState);

  const trackRef = useRef<Array<[number, number]>>([]);
  const lastFollowPointRef = useRef<[number, number]>();
  const lastMessageTimeNsRef = useRef<bigint>();
  const renderDoneRef = useRef<(() => void) | undefined>();

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    messageStateRef.current = messageState;
  }, [messageState]);

  const updateConfig = useCallback((patch: Partial<PanelConfig>) => {
    setConfig((current) => {
      const next = {
        ...current,
        ...patch,
      };

      configRef.current = next;

      return next;
    });
  }, []);

  const clearTrack = useCallback(() => {
    trackRef.current = [];
    lastFollowPointRef.current = undefined;

    const map = mapRef.current;

    if (map != undefined) {
      source(map, "track")?.setData(emptyFeatureCollection());
    }
  }, []);

  useEffect(() => {
    const options = topicOptions(topics);

    context.updatePanelSettingsEditor({
      nodes: {
        topics: {
          label: "Input topics",
          fields: {
            gpsTopic: {
              label: "GPS",
              input: "select",
              value: config.gpsTopic,
              options,
            },
            telemetryTopic: {
              label: "Telemetry",
              input: "select",
              value: config.telemetryTopic,
              options,
            },
            sceneTopic: {
              label: "Scene footprint",
              input: "select",
              value: config.sceneTopic,
              options,
            },
            poseTopic: {
              label: "Aircraft pose",
              input: "select",
              value: config.poseTopic,
              options,
            },
            originTopic: {
              label: "World origin",
              input: "select",
              value: config.originTopic,
              options,
            },
          },
        },

        camera: {
          label: "Camera model",
          fields: {
            horizontalFovDeg: {
              label: "Horizontal FOV, deg",
              input: "number",
              value: config.horizontalFovDeg,
              min: 0.1,
              max: 179,
              step: 0.1,
            },
            verticalFovDeg: {
              label: "Vertical FOV, deg",
              input: "number",
              value: config.verticalFovDeg,
              min: 0.1,
              max: 179,
              step: 0.1,
            },
            headingOffsetDeg: {
              label: "Heading offset, deg",
              input: "number",
              value: config.headingOffsetDeg,
              step: 0.1,
            },
            preferSceneFootprint: {
              label: "Prefer /scene footprint",
              input: "boolean",
              value: config.preferSceneFootprint,
            },
          },
        },

        map: {
          label: "Map",
          fields: {
            tileUrl: {
              label: "Raster tile URL",
              input: "string",
              value: config.tileUrl,
            },
            attribution: {
              label: "Attribution",
              input: "string",
              value: config.attribution,
            },
          },
        },
      },

      actionHandler: (action: SettingsTreeAction) => {
        if (action.action !== "update") {
          return;
        }

        const key = action.payload.path[
          action.payload.path.length - 1
        ] as keyof PanelConfig | undefined;

        if (key == undefined) {
          return;
        }

        updateConfig({
          [key]: action.payload.value,
        });
      },
    });
  }, [config, context, topics, updateConfig]);

  useEffect(() => {
    context.subscribe(
      [
        config.gpsTopic,
        config.telemetryTopic,
        config.sceneTopic,
        config.poseTopic,
        config.originTopic,
      ]
        .filter(
          (topic, index, all) =>
            topic.length > 0 && all.indexOf(topic) === index,
        )
        .map((topic) => ({
          topic,
        })),
    );
  }, [
    config.gpsTopic,
    config.originTopic,
    config.poseTopic,
    config.sceneTopic,
    config.telemetryTopic,
    context,
  ]);

  useLayoutEffect(() => {
    context.setDefaultPanelTitle("Adaptive Satellite Map");

    context.watch("currentFrame");
    context.watch("topics");

    context.onRender = (renderState, done) => {
      renderDoneRef.current?.();
      renderDoneRef.current = done;

      if (renderState.topics != undefined) {
        setTopics(renderState.topics);
      }

      let next = messageStateRef.current;
      let newestTimeNs: bigint | undefined;

      for (const event of renderState.currentFrame ?? []) {
        const timeNs = eventTimeNs(event);

        if (
          timeNs != undefined &&
          (newestTimeNs == undefined || timeNs > newestTimeNs)
        ) {
          newestTimeNs = timeNs;
        }

        next = mergeMessage(next, event, configRef.current);
      }

      if (newestTimeNs != undefined) {
        const previousTimeNs = lastMessageTimeNsRef.current;

        if (previousTimeNs != undefined && newestTimeNs < previousTimeNs) {
          clearTrack();
        }

        lastMessageTimeNsRef.current = newestTimeNs;
      }

      messageStateRef.current = next;
      setMessageState(next);

      done();
      renderDoneRef.current = undefined;
    };

    return () => {
      renderDoneRef.current?.();
      renderDoneRef.current = undefined;
      context.unsubscribeAll();
    };
  }, [clearTrack, context]);

  useEffect(() => {
    context.saveState(config);
  }, [config, context]);

  useEffect(() => {
    const container = mapContainerRef.current;

    if (container == undefined) {
      return;
    }

    setMapReady(false);
    setMapError(undefined);

    const map = createMap(container, configRef.current);
    mapRef.current = map;

    map.on("load", () => {
      installMapLayers(map);

      const aircraftLayer = new ThreeAircraftLayer();

      threeAircraftLayerRef.current = aircraftLayer;
      map.addLayer(aircraftLayer.asMapLibreLayer());

      setMapReady(true);
    });

    map.on("error", (event) => {
      const message = event.error?.message;

      if (message != undefined) {
        setMapError(message);
      }
    });

    map.on("dragstart", () => {
      if (configRef.current.follow) {
        updateConfig({
          follow: false,
        });
      }
    });

    map.on("rotatestart", (event) => {
      if (event.originalEvent != undefined && configRef.current.follow) {
        updateConfig({
          follow: false,
        });
      }
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
      }),
      "top-right",
    );

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      "bottom-right",
    );

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();

      threeAircraftLayerRef.current = undefined;

      map.remove();
      mapRef.current = undefined;
    };
  }, [updateConfig]);

  const aircraft = messageState.aircraft;

  const heightM =
    aircraft == undefined
      ? undefined
      : resolveHeightAboveWorldPlane(aircraft, messageState.origin);

  const computedRelativeFootprint =
    aircraft == undefined || heightM == undefined
      ? undefined
      : computeCameraFootprint(
          heightM,
          aircraft.headingDeg ?? 0,
          aircraft.pitchDeg ?? 0,
          aircraft.rollDeg ?? 0,
          config.horizontalFovDeg,
          config.verticalFovDeg,
        );

  const footprintPolygon =
    config.preferSceneFootprint && aircraft?.sceneFootprintWorld != undefined
      ? worldFootprintToLonLat(
          messageState.origin,
          aircraft.sceneFootprintWorld,
        )
      : aircraft == undefined
        ? undefined
        : relativeFootprintToLonLat(
            aircraft,
            computedRelativeFootprint,
          );

  useEffect(() => {
    const map = mapRef.current;
    const aircraftLayer = threeAircraftLayerRef.current;

    if (
      !mapReady ||
      map == undefined ||
      aircraftLayer == undefined ||
      aircraft == undefined
    ) {
      return;
    }

    const point = aircraftLonLat(aircraft);

    if (point == undefined) {
      return;
    }

    const lastTrackPoint =
      trackRef.current[trackRef.current.length - 1];

    if (
      lastTrackPoint == undefined ||
      haversineDistanceM(lastTrackPoint, point) >= VIEW.minimumMoveM
    ) {
      if (
        lastTrackPoint != undefined &&
        haversineDistanceM(lastTrackPoint, point) >
          VIEW.trackTeleportThresholdM
      ) {
        trackRef.current = [];
      }

      trackRef.current.push(point);

      if (trackRef.current.length > VIEW.maximumTrackPoints) {
        trackRef.current.splice(
          0,
          trackRef.current.length - VIEW.maximumTrackPoints,
        );
      }
    }

    source(map, "footprint")?.setData(
      polygonGeoJson(footprintPolygon),
    );

    source(map, "track")?.setData(
      trackGeoJson(trackRef.current),
    );

    aircraftLayer.setPose({
      longitude: point[0],
      latitude: point[1],
      altitudeM: Math.max(0, heightM ?? aircraft.aglM ?? 0),
      yawDeg: aircraft.headingDeg ?? 0,
      pitchDeg: aircraft.pitchDeg ?? 0,
      rollDeg: aircraft.rollDeg ?? 0,
    });

    aircraftLayer.setFootprint(
      polygonToFootprintCorners(footprintPolygon),
    );

    if (!configRef.current.follow || map.isMoving()) {
      return;
    }

    const previousFollowPoint = lastFollowPointRef.current;

    if (
      previousFollowPoint != undefined &&
      haversineDistanceM(previousFollowPoint, point) <
        VIEW.minimumMoveM
    ) {
      return;
    }

    lastFollowPointRef.current = point;

    map.easeTo({
      center: point,
      duration: VIEW.followDurationMs,
      easing: (time) => time * time * (3 - 2 * time),
      essential: true,
    });
  }, [
    aircraft,
    footprintPolygon,
    heightM,
    mapReady,
  ]);

  return (
    <div className="asm-root">
      <div
        ref={mapContainerRef}
        className="asm-map"
      />

      <div className="asm-toolbar">
        <button
          className={config.follow ? "active" : ""}
          onClick={() => {
            const nextFollow = !configRef.current.follow;

            if (nextFollow) {
              lastFollowPointRef.current = undefined;
            }

            updateConfig({
              follow: nextFollow,
            });
          }}
        >
          Follow
        </button>
      </div>

      <div className="asm-status">
        <span>
          ALT {aircraft?.altitudeM?.toFixed(1) ?? "—"} m
        </span>

        <span>
          H {heightM?.toFixed(1) ?? "—"} m
        </span>

        <span>
          Y/P/R {aircraft?.headingDeg?.toFixed(1) ?? "—"} /{" "}
          {aircraft?.pitchDeg?.toFixed(1) ?? "—"} /{" "}
          {aircraft?.rollDeg?.toFixed(1) ?? "—"}
        </span>
      </div>

      {aircraft?.latitude == undefined && (
        <div className="asm-center-message">
          Waiting for the selected GPS and telemetry topics
        </div>
      )}

      {mapError != undefined && (
        <div className="asm-error">
          {mapError}
        </div>
      )}
    </div>
  );
}

export function initAdaptiveSatelliteMapPanel(
  context: PanelExtensionContext,
): () => void {
  const root = createRoot(context.panelElement);

  root.render(
    <AdaptiveSatelliteMapPanel context={context} />,
  );

  return () => {
    root.unmount();
  };
}