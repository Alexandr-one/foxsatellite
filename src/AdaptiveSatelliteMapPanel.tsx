import {
  Immutable,
  MessageEvent,
  PanelExtensionContext,
} from "@foxglove/extension";

import maplibregl, {
  Map as MapLibreMap,
} from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";

import {
  ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  createRoot,
} from "react-dom/client";

import {
  computeCameraFootprint,
  haversineDistanceM,
  relativeFootprintToLonLat,
  resolveAircraftLonLat,
  resolveHeightAboveGround,
  worldFootprintToLonLat,
} from "./geo";

import {
  polygonGeoJson,
  polygonToFootprintCorners,
  trackGeoJson,
} from "./mapGeoJson";

import {
  createMap,
  geoJsonSource,
  installMapLayers,
} from "./mapSetup";

import {
  mergeMessage,
  MessageState,
} from "./messageParsing";

import {
  ThreeAircraftLayer,
} from "./ThreeAircraftLayer";

import {
  CAMERA_CONFIG,
  MAP_CONFIG,
  TOPICS,
} from "./types";

import "./panel.css";

type PanelProps = {
  context: PanelExtensionContext;
};

function AdaptiveSatelliteMapPanel({
  context,
}: PanelProps): ReactElement {
  const [
    messageState,
    setMessageState,
  ] = useState<MessageState>({});

  const [
    mapReady,
    setMapReady,
  ] = useState(false);

  const [
    mapError,
    setMapError,
  ] = useState<string>();

  const [
    follow,
    setFollow,
  ] = useState(true);

  const mapContainerRef =
    useRef<HTMLDivElement>(null);

  const mapRef =
    useRef<MapLibreMap>();

  const aircraftLayerRef =
    useRef<ThreeAircraftLayer>();

  const messageStateRef =
    useRef<MessageState>({});

  const trackRef =
    useRef<
      Array<[number, number]>
    >([]);

  const lastFollowPointRef =
    useRef<
      [number, number]
    >();

  const renderDoneRef =
    useRef<
      (() => void) | undefined
    >();

  const programmaticMoveRef =
    useRef(false);

  useEffect(() => {
    messageStateRef.current =
      messageState;
  }, [messageState]);

  useLayoutEffect(() => {
    context.setDefaultPanelTitle(
      "Adaptive Satellite Map",
    );

    context.watch("currentFrame");

    context.subscribe([
      { topic: TOPICS.gps },
      { topic: TOPICS.telemetry },
      { topic: TOPICS.scene },
      { topic: TOPICS.pose },
      { topic: TOPICS.origin },
    ]);

    context.onRender = (
      renderState,
      done,
    ) => {
      renderDoneRef.current?.();

      renderDoneRef.current =
        done;

      let next =
        messageStateRef.current;

      for (
        const event of
        renderState.currentFrame ?? []
      ) {
        next = mergeMessage(
          next,
          event as Immutable<MessageEvent>,
        );
      }

      messageStateRef.current =
        next;

      setMessageState(next);

      done();

      renderDoneRef.current =
        undefined;
    };

    return () => {
      renderDoneRef.current?.();

      renderDoneRef.current =
        undefined;

      context.unsubscribeAll();
    };
  }, [context]);

  useEffect(() => {
    const container =
      mapContainerRef.current;

    if (container == undefined) {
      return;
    }

    const map =
      createMap(container);

    mapRef.current =
      map;

    map.on("load", () => {
      installMapLayers(map);

      const aircraftLayer =
        new ThreeAircraftLayer();

      aircraftLayerRef.current =
        aircraftLayer;

      map.addLayer(
        aircraftLayer.asMapLibreLayer(),
      );

      setMapReady(true);
    });

    map.on("error", (event) => {
      if (
        event.error?.message != undefined
      ) {
        setMapError(
          event.error.message,
        );
      }
    });

    map.on("movestart", (event) => {
      if (
        !programmaticMoveRef.current &&
        event.originalEvent != undefined
      ) {
        setFollow(false);
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

    const observer =
      new ResizeObserver(() => {
        map.resize();
      });

    observer.observe(container);

    return () => {
      observer.disconnect();

      aircraftLayerRef.current =
        undefined;

      map.remove();

      mapRef.current =
        undefined;
    };
  }, []);

  const aircraft =
    messageState.aircraft;

  const aircraftPoint =
    aircraft == undefined
      ? undefined
      : resolveAircraftLonLat(
          aircraft,
          messageState.origin,
        );

  const heightM =
    aircraft == undefined
      ? undefined
      : resolveHeightAboveGround(
          aircraft,
          messageState.origin,
        );

  const fallbackFootprint =
    aircraft == undefined ||
    heightM == undefined
      ? undefined
      : computeCameraFootprint(
          heightM,
          aircraft.headingDeg ?? 0,
          aircraft.pitchDeg ?? 0,
          aircraft.rollDeg ?? 0,
          CAMERA_CONFIG.horizontalFovDeg,
          CAMERA_CONFIG.verticalFovDeg,
        );

  const footprintPolygon =
    aircraft?.sceneFootprintWorld != undefined
      ? worldFootprintToLonLat(
          messageState.origin,
          aircraft.sceneFootprintWorld,
        )
      : aircraft == undefined
        ? undefined
        : relativeFootprintToLonLat(
            aircraft,
            messageState.origin,
            fallbackFootprint,
          );

  useEffect(() => {
    const map = mapRef.current;

    const aircraftLayer =
      aircraftLayerRef.current;

    if (
      !mapReady ||
      map == undefined ||
      aircraftLayer == undefined ||
      aircraft == undefined ||
      aircraftPoint == undefined
    ) {
      return;
    }

    const lastTrackPoint =
      trackRef.current[
        trackRef.current.length - 1
      ];

    if (
      lastTrackPoint == undefined ||
      haversineDistanceM(
        lastTrackPoint,
        aircraftPoint,
      ) >= MAP_CONFIG.minimumMoveM
    ) {
      if (
        lastTrackPoint != undefined &&
        haversineDistanceM(
          lastTrackPoint,
          aircraftPoint,
        ) >
          MAP_CONFIG.teleportThresholdM
      ) {
        trackRef.current = [];
      }

      trackRef.current.push(
        aircraftPoint,
      );

      if (
        trackRef.current.length >
        MAP_CONFIG.maximumTrackPoints
      ) {
        trackRef.current.splice(
          0,
          trackRef.current.length -
            MAP_CONFIG.maximumTrackPoints,
        );
      }
    }

    geoJsonSource(
      map,
      "track",
    )?.setData(
      trackGeoJson(
        trackRef.current,
      ),
    );

    geoJsonSource(
      map,
      "footprint",
    )?.setData(
      polygonGeoJson(
        footprintPolygon,
      ),
    );

    aircraftLayer.setPose({
      longitude:
        aircraftPoint[0],

      latitude:
        aircraftPoint[1],

      heightM:
        Math.max(
          0,
          heightM ??
            aircraft.aglM ??
            0,
        ),

      headingDeg:
        aircraft.headingDeg ?? 0,

      pitchDeg:
        aircraft.pitchDeg ?? 0,

      rollDeg:
        aircraft.rollDeg ?? 0,
    });

    aircraftLayer.setFootprint(
      polygonToFootprintCorners(
        footprintPolygon,
      ),
    );

    if (!follow) {
      return;
    }

    const previous =
      lastFollowPointRef.current;

    if (
      previous != undefined &&
      haversineDistanceM(
        previous,
        aircraftPoint,
      ) <
        MAP_CONFIG.minimumMoveM
    ) {
      return;
    }

    lastFollowPointRef.current =
      aircraftPoint;

    programmaticMoveRef.current =
      true;

    map.easeTo({
      center: aircraftPoint,

      duration:
        MAP_CONFIG.followDurationMs,

      easing: (value) =>
        value *
        value *
        (3 - 2 * value),

      essential: true,
    });

    window.setTimeout(() => {
      programmaticMoveRef.current =
        false;
    }, MAP_CONFIG.followDurationMs + 100);
  }, [
    aircraft,
    aircraftPoint,
    follow,
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
          className={
            follow
              ? "active"
              : ""
          }

          onClick={() => {
            setFollow(
              (current) => {
                const next =
                  !current;

                if (next) {
                  lastFollowPointRef.current =
                    undefined;
                }

                return next;
              },
            );
          }}
        >
          Follow
        </button>
      </div>

      {aircraftPoint == undefined && (
        <div className="asm-center-message">
          Waiting for aircraft position
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
  const root =
    createRoot(
      context.panelElement,
    );

  root.render(
    <AdaptiveSatelliteMapPanel
      context={context}
    />,
  );

  return () => {
    root.unmount();
  };
}