import maplibregl, {
  CustomLayerInterface,
  Map as MapLibreMap,
} from "maplibre-gl";

import * as THREE from "three";

import {
  createAircraftModel,
} from "./aircraftModel";

import {
  AircraftMapPose,
  FootprintCorner,
} from "./types";

type RenderArguments = {
  defaultProjectionData?: {
    mainMatrix?: ArrayLike<number>;
  };

  projectionMatrix?: ArrayLike<number>;

  modelViewProjectionMatrix?: ArrayLike<number>;
};

const LAYER_ID =
  "adaptive-aircraft-3d-layer";

const MAX_RAYS = 4;

function degreesToRadians(
  value: number,
): number {
  return (value * Math.PI) / 180;
}

function projectionMatrixFromArguments(
  firstArgument: unknown,
  secondArgument: unknown,
): ArrayLike<number> | undefined {
  const modern =
    secondArgument as RenderArguments | undefined;

  const modernMatrix =
    modern?.defaultProjectionData?.mainMatrix ??
    modern?.projectionMatrix ??
    modern?.modelViewProjectionMatrix;

  if (modernMatrix != undefined) {
    return modernMatrix;
  }

  if (
    secondArgument != undefined &&
    typeof secondArgument === "object" &&
    "length" in secondArgument
  ) {
    return secondArgument as ArrayLike<number>;
  }

  const legacy =
    firstArgument as RenderArguments | undefined;

  return (
    legacy?.defaultProjectionData?.mainMatrix ??
    legacy?.projectionMatrix ??
    legacy?.modelViewProjectionMatrix
  );
}

export class ThreeAircraftLayer {
  public readonly id = LAYER_ID;

  public readonly type =
    "custom" as const;

  public readonly renderingMode =
    "3d" as const;

  private map:
    | MapLibreMap
    | undefined;

  private renderer:
    | THREE.WebGLRenderer
    | undefined;

  private readonly scene =
    new THREE.Scene();

  private readonly camera =
    new THREE.Camera();

  private readonly aircraftRoot =
    new THREE.Group();

  private readonly aircraftModel =
    createAircraftModel();

  private pose:
    | AircraftMapPose
    | undefined;

  private footprint:
    FootprintCorner[] = [];

  private readonly rayPositions =
    new Float32Array(
      MAX_RAYS * 2 * 3,
    );

  private readonly rayGeometry =
    new THREE.BufferGeometry();

  private readonly rayMaterial =
    new THREE.LineBasicMaterial({
      color: "#67d9ff",
      transparent: true,
      opacity: 0.72,
      depthTest: true,
      depthWrite: false,
    });

  private readonly rays =
    new THREE.LineSegments(
      this.rayGeometry,
      this.rayMaterial,
    );

  private readonly dropPositions =
    new Float32Array(6);

  private readonly dropGeometry =
    new THREE.BufferGeometry();

  private readonly dropMaterial =
    new THREE.LineBasicMaterial({
      color: "#45d9ff",
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false,
    });

  private readonly dropLine =
    new THREE.LineSegments(
      this.dropGeometry,
      this.dropMaterial,
    );

  public constructor() {
    this.aircraftRoot.matrixAutoUpdate =
      false;

    this.aircraftRoot.add(
      this.aircraftModel,
    );

    this.scene.add(
      this.aircraftRoot,
    );

    this.rayGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        this.rayPositions,
        3,
      ),
    );

    this.rayGeometry.setDrawRange(
      0,
      0,
    );

    this.rays.frustumCulled =
      false;

    this.scene.add(this.rays);

    this.dropGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        this.dropPositions,
        3,
      ),
    );

    this.dropGeometry.setDrawRange(
      0,
      0,
    );

    this.dropLine.frustumCulled =
      false;

    this.scene.add(
      this.dropLine,
    );

    const hemisphere =
      new THREE.HemisphereLight(
        "#f4f8ff",
        "#25303d",
        1.8,
      );

    this.scene.add(hemisphere);

    const sun =
      new THREE.DirectionalLight(
        "#ffffff",
        2.25,
      );

    sun.position.set(
      -200,
      -120,
      420,
    );

    this.scene.add(sun);

    const fill =
      new THREE.DirectionalLight(
        "#93c7ff",
        0.65,
      );

    fill.position.set(
      180,
      120,
      120,
    );

    this.scene.add(fill);
  }

  public asMapLibreLayer(): CustomLayerInterface {
    return this as unknown as CustomLayerInterface;
  }

  public onAdd(
    map: MapLibreMap,
    gl:
      | WebGLRenderingContext
      | WebGL2RenderingContext,
  ): void {
    this.map = map;

    this.renderer =
      new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });

    this.renderer.autoClear =
      false;

    this.renderer.outputColorSpace =
      THREE.SRGBColorSpace;
  }

  public onRemove(): void {
    this.aircraftModel.traverse(
      (object) => {
        if (
          !(object instanceof THREE.Mesh)
        ) {
          return;
        }

        object.geometry.dispose();

        if (
          Array.isArray(object.material)
        ) {
          for (
            const material of object.material
          ) {
            material.dispose();
          }
        } else {
          object.material.dispose();
        }
      },
    );

    this.rayGeometry.dispose();
    this.rayMaterial.dispose();

    this.dropGeometry.dispose();
    this.dropMaterial.dispose();

    this.renderer?.dispose();

    this.renderer = undefined;
    this.map = undefined;
  }

  public setPose(
    pose: AircraftMapPose | undefined,
  ): void {
    this.pose = pose;

    this.updateAircraftTransform();
    this.updateRays();
    this.updateDropLine();

    this.map?.triggerRepaint();
  }

  public setFootprint(
    corners: FootprintCorner[],
  ): void {
    this.footprint =
      corners.slice(0, MAX_RAYS);

    this.updateRays();

    this.map?.triggerRepaint();
  }

  public render(
    firstArgument: unknown,
    secondArgument?: unknown,
  ): void {
    if (
      this.renderer == undefined ||
      this.pose == undefined
    ) {
      return;
    }

    const projection =
      projectionMatrixFromArguments(
        firstArgument,
        secondArgument,
      );

    if (projection == undefined) {
      return;
    }

    this.camera.projectionMatrix.fromArray(
      Array.from(projection),
    );

    this.renderer.resetState();

    this.renderer.render(
      this.scene,
      this.camera,
    );
  }

  private updateAircraftTransform(): void {
    const pose = this.pose;

    if (pose == undefined) {
      return;
    }

    const coordinate =
      maplibregl.MercatorCoordinate.fromLngLat(
        [
          pose.longitude,
          pose.latitude,
        ],
        pose.heightM,
      );

    const unitsPerMeter =
      coordinate.meterInMercatorCoordinateUnits();

    const yaw =
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        -degreesToRadians(
          pose.headingDeg,
        ),
      );

    const pitch =
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        degreesToRadians(
          pose.pitchDeg,
        ),
      );

    const roll =
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        degreesToRadians(
          pose.rollDeg,
        ),
      );

    const orientation =
      yaw
        .clone()
        .multiply(pitch)
        .multiply(roll);

    const translation =
      new THREE.Matrix4().makeTranslation(
        coordinate.x,
        coordinate.y,
        coordinate.z,
      );

    const scale =
      new THREE.Matrix4().makeScale(
        unitsPerMeter,
        -unitsPerMeter,
        unitsPerMeter,
      );

    const rotation =
      new THREE.Matrix4().makeRotationFromQuaternion(
        orientation,
      );

    this.aircraftRoot.matrix
      .identity()
      .multiply(translation)
      .multiply(scale)
      .multiply(rotation);

    this.aircraftRoot.matrixWorldNeedsUpdate =
      true;
  }

  private updateRays(): void {
    const pose = this.pose;

    if (
      pose == undefined ||
      this.footprint.length < 3
    ) {
      this.rayGeometry.setDrawRange(
        0,
        0,
      );

      return;
    }

    const aircraftCoordinate =
      maplibregl.MercatorCoordinate.fromLngLat(
        [
          pose.longitude,
          pose.latitude,
        ],
        pose.heightM,
      );

    let cursor = 0;

    for (
      const corner of this.footprint
    ) {
      const groundCoordinate =
        maplibregl.MercatorCoordinate.fromLngLat(
          [
            corner.longitude,
            corner.latitude,
          ],
          0,
        );

      this.rayPositions[cursor++] =
        aircraftCoordinate.x;

      this.rayPositions[cursor++] =
        aircraftCoordinate.y;

      this.rayPositions[cursor++] =
        aircraftCoordinate.z;

      this.rayPositions[cursor++] =
        groundCoordinate.x;

      this.rayPositions[cursor++] =
        groundCoordinate.y;

      this.rayPositions[cursor++] =
        groundCoordinate.z;
    }

    const attribute =
      this.rayGeometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;

    attribute.needsUpdate = true;

    this.rayGeometry.setDrawRange(
      0,
      this.footprint.length * 2,
    );

    this.rayGeometry.computeBoundingSphere();
  }

  private updateDropLine(): void {
    const pose = this.pose;

    if (pose == undefined) {
      this.dropGeometry.setDrawRange(
        0,
        0,
      );

      return;
    }

    const aircraftCoordinate =
      maplibregl.MercatorCoordinate.fromLngLat(
        [
          pose.longitude,
          pose.latitude,
        ],
        pose.heightM,
      );

    const groundCoordinate =
      maplibregl.MercatorCoordinate.fromLngLat(
        [
          pose.longitude,
          pose.latitude,
        ],
        0,
      );

    this.dropPositions[0] =
      aircraftCoordinate.x;

    this.dropPositions[1] =
      aircraftCoordinate.y;

    this.dropPositions[2] =
      aircraftCoordinate.z;

    this.dropPositions[3] =
      groundCoordinate.x;

    this.dropPositions[4] =
      groundCoordinate.y;

    this.dropPositions[5] =
      groundCoordinate.z;

    const attribute =
      this.dropGeometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;

    attribute.needsUpdate = true;

    this.dropGeometry.setDrawRange(
      0,
      2,
    );

    this.dropGeometry.computeBoundingSphere();
  }
}