import maplibregl, {
  CustomLayerInterface,
  Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";

export type Aircraft3DPose = {
  longitude: number;
  latitude: number;
  altitudeM: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
};

export type FootprintCorner = {
  longitude: number;
  latitude: number;
};

type MapLibreRenderArguments = {
  defaultProjectionData?: {
    mainMatrix?: ArrayLike<number>;
  };
  projectionMatrix?: ArrayLike<number>;
  modelViewProjectionMatrix?: ArrayLike<number>;
};

const AIRCRAFT_LAYER_ID = "aircraft-3d-layer";

const MODEL_LENGTH_M = 42;
const MODEL_WINGSPAN_M = 48;
const MODEL_HEIGHT_M = 9;

const MODEL_VISUAL_SCALE = 1.8;

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function createMaterial(
  color: THREE.ColorRepresentation,
  roughness = 0.62,
  metalness = 0.1,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    side: THREE.DoubleSide,
  });
}

function createWingGeometry(
  spanM: number,
  rootChordM: number,
  tipChordM: number,
  thicknessM: number,
): THREE.BufferGeometry {
  const halfSpan = spanM / 2;
  const rootFront = rootChordM * 0.42;
  const rootBack = -rootChordM * 0.58;
  const tipFront = tipChordM * 0.36;
  const tipBack = -tipChordM * 0.64;
  const halfThickness = thicknessM / 2;

  const vertices = new Float32Array([
    0,
    rootFront,
    halfThickness,
    halfSpan,
    tipFront,
    halfThickness,
    halfSpan,
    tipBack,
    halfThickness,

    0,
    rootFront,
    halfThickness,
    halfSpan,
    tipBack,
    halfThickness,
    0,
    rootBack,
    halfThickness,

    0,
    rootFront,
    halfThickness,
    0,
    rootBack,
    halfThickness,
    -halfSpan,
    tipBack,
    halfThickness,

    0,
    rootFront,
    halfThickness,
    -halfSpan,
    tipBack,
    halfThickness,
    -halfSpan,
    tipFront,
    halfThickness,

    0,
    rootFront,
    -halfThickness,
    halfSpan,
    tipBack,
    -halfThickness,
    halfSpan,
    tipFront,
    -halfThickness,

    0,
    rootFront,
    -halfThickness,
    0,
    rootBack,
    -halfThickness,
    halfSpan,
    tipBack,
    -halfThickness,

    0,
    rootFront,
    -halfThickness,
    -halfSpan,
    tipBack,
    -halfThickness,
    0,
    rootBack,
    -halfThickness,

    0,
    rootFront,
    -halfThickness,
    -halfSpan,
    tipFront,
    -halfThickness,
    -halfSpan,
    tipBack,
    -halfThickness,

    0,
    rootFront,
    halfThickness,
    0,
    rootFront,
    -halfThickness,
    halfSpan,
    tipFront,
    -halfThickness,

    0,
    rootFront,
    halfThickness,
    halfSpan,
    tipFront,
    -halfThickness,
    halfSpan,
    tipFront,
    halfThickness,

    0,
    rootBack,
    halfThickness,
    halfSpan,
    tipBack,
    halfThickness,
    halfSpan,
    tipBack,
    -halfThickness,

    0,
    rootBack,
    halfThickness,
    halfSpan,
    tipBack,
    -halfThickness,
    0,
    rootBack,
    -halfThickness,

    0,
    rootFront,
    halfThickness,
    -halfSpan,
    tipFront,
    -halfThickness,
    0,
    rootFront,
    -halfThickness,

    0,
    rootFront,
    halfThickness,
    -halfSpan,
    tipFront,
    halfThickness,
    -halfSpan,
    tipFront,
    -halfThickness,

    0,
    rootBack,
    halfThickness,
    -halfSpan,
    tipBack,
    -halfThickness,
    -halfSpan,
    tipBack,
    halfThickness,

    0,
    rootBack,
    halfThickness,
    0,
    rootBack,
    -halfThickness,
    -halfSpan,
    tipBack,
    -halfThickness,
  ]);

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(vertices, 3),
  );

  geometry.computeVertexNormals();

  return geometry;
}

function createVerticalTailGeometry(): THREE.BufferGeometry {
  const halfThickness = 0.5;

  const vertices = new Float32Array([
    halfThickness,
    -13,
    0,
    halfThickness,
    -17,
    0,
    halfThickness,
    -16,
    7,

    -halfThickness,
    -13,
    0,
    -halfThickness,
    -16,
    7,
    -halfThickness,
    -17,
    0,

    halfThickness,
    -13,
    0,
    -halfThickness,
    -13,
    0,
    -halfThickness,
    -16,
    7,

    halfThickness,
    -13,
    0,
    -halfThickness,
    -16,
    7,
    halfThickness,
    -16,
    7,

    halfThickness,
    -17,
    0,
    halfThickness,
    -16,
    7,
    -halfThickness,
    -16,
    7,

    halfThickness,
    -17,
    0,
    -halfThickness,
    -16,
    7,
    -halfThickness,
    -17,
    0,

    halfThickness,
    -13,
    0,
    halfThickness,
    -17,
    0,
    -halfThickness,
    -17,
    0,

    halfThickness,
    -13,
    0,
    -halfThickness,
    -17,
    0,
    -halfThickness,
    -13,
    0,
  ]);

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(vertices, 3),
  );

  geometry.computeVertexNormals();

  return geometry;
}

function createAircraftModel(): THREE.Group {
  const aircraft = new THREE.Group();

  const bodyMaterial = createMaterial("#d7dce3", 0.5, 0.24);
  const wingMaterial = createMaterial("#b8c2cf", 0.55, 0.18);
  const darkMaterial = createMaterial("#303b49", 0.38, 0.3);
  const engineMaterial = createMaterial("#4c5968", 0.46, 0.42);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: "#174b78",
    roughness: 0.16,
    metalness: 0.25,
    transparent: true,
    opacity: 0.88,
  });

  const fuselageGeometry = new THREE.CylinderGeometry(
    MODEL_HEIGHT_M * 0.28,
    MODEL_HEIGHT_M * 0.38,
    MODEL_LENGTH_M * 0.76,
    24,
    1,
    false,
  );

  const fuselage = new THREE.Mesh(
    fuselageGeometry,
    bodyMaterial,
  );

  fuselage.position.y = -1;
  fuselage.castShadow = true;
  aircraft.add(fuselage);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(
      MODEL_HEIGHT_M * 0.28,
      MODEL_LENGTH_M * 0.24,
      24,
    ),
    bodyMaterial,
  );

  nose.position.y = MODEL_LENGTH_M * 0.5 - 0.6;
  nose.castShadow = true;
  aircraft.add(nose);

  const tailCone = new THREE.Mesh(
    new THREE.ConeGeometry(
      MODEL_HEIGHT_M * 0.37,
      MODEL_LENGTH_M * 0.18,
      24,
    ),
    bodyMaterial,
  );

  tailCone.rotation.z = Math.PI;
  tailCone.position.y = -MODEL_LENGTH_M * 0.47;
  tailCone.castShadow = true;
  aircraft.add(tailCone);

  const wings = new THREE.Mesh(
    createWingGeometry(
      MODEL_WINGSPAN_M,
      11,
      4.4,
      0.85,
    ),
    wingMaterial,
  );

  wings.position.y = -1.5;
  wings.position.z = 0.1;
  wings.castShadow = true;
  aircraft.add(wings);

  const stabilizer = new THREE.Mesh(
    createWingGeometry(
      17,
      5.5,
      2.3,
      0.55,
    ),
    wingMaterial,
  );

  stabilizer.position.y = -15;
  stabilizer.position.z = 1.4;
  stabilizer.castShadow = true;
  aircraft.add(stabilizer);

  const verticalTail = new THREE.Mesh(
    createVerticalTailGeometry(),
    wingMaterial,
  );

  verticalTail.castShadow = true;
  aircraft.add(verticalTail);

  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(3.1, 20, 12),
    windowMaterial,
  );

  cockpit.scale.set(0.72, 1.35, 0.55);
  cockpit.position.set(0, 11.5, 2.15);
  cockpit.castShadow = true;
  aircraft.add(cockpit);

  const engineGeometry = new THREE.CylinderGeometry(
    1.65,
    1.9,
    5.8,
    20,
  );

  for (const x of [-9.5, 9.5]) {
    const engine = new THREE.Mesh(
      engineGeometry,
      engineMaterial,
    );

    engine.position.set(x, 0.7, -1.8);
    engine.castShadow = true;
    aircraft.add(engine);

    const intake = new THREE.Mesh(
      new THREE.TorusGeometry(1.7, 0.22, 10, 24),
      darkMaterial,
    );

    intake.rotation.x = Math.PI / 2;
    intake.position.set(x, 3.65, -1.8);
    aircraft.add(intake);
  }

  const lightGeometry = new THREE.SphereGeometry(0.65, 12, 8);

  const leftLight = new THREE.Mesh(
    lightGeometry,
    new THREE.MeshBasicMaterial({ color: "#ff3030" }),
  );

  leftLight.position.set(
    -MODEL_WINGSPAN_M / 2,
    -2.8,
    0.2,
  );

  aircraft.add(leftLight);

  const rightLight = new THREE.Mesh(
    lightGeometry,
    new THREE.MeshBasicMaterial({ color: "#20ff75" }),
  );

  rightLight.position.set(
    MODEL_WINGSPAN_M / 2,
    -2.8,
    0.2,
  );

  aircraft.add(rightLight);

  aircraft.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    const edges = new THREE.EdgesGeometry(object.geometry, 28);

    const outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: "#17202b",
        transparent: true,
        opacity: 0.42,
      }),
    );

    object.add(outline);
  });

  aircraft.scale.setScalar(MODEL_VISUAL_SCALE);

  return aircraft;
}

function matrixFromUnknownArguments(
  firstArgument: unknown,
  secondArgument: unknown,
): ArrayLike<number> | undefined {
  /*
   * MapLibre 5: render(gl, args)
   */
  const modernArguments =
    secondArgument as MapLibreRenderArguments | undefined;

  const modernMatrix =
    modernArguments?.defaultProjectionData?.mainMatrix ??
    modernArguments?.projectionMatrix ??
    modernArguments?.modelViewProjectionMatrix;

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

  const singleArgument =
    firstArgument as MapLibreRenderArguments | undefined;

  return (
    singleArgument?.defaultProjectionData?.mainMatrix ??
    singleArgument?.projectionMatrix ??
    singleArgument?.modelViewProjectionMatrix
  );
}

export class ThreeAircraftLayer {
  public readonly id = AIRCRAFT_LAYER_ID;
  public readonly type = "custom" as const;
  public readonly renderingMode = "3d" as const;

  private map: MapLibreMap | undefined;
  private renderer: THREE.WebGLRenderer | undefined;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly root = new THREE.Group();
  private readonly aircraft = createAircraftModel();

  private pose: Aircraft3DPose | undefined;
  private footprint: FootprintCorner[] = [];

  private raysGeometry: THREE.BufferGeometry | undefined;
  private rays: THREE.LineSegments | undefined;

  public constructor() {
    this.root.matrixAutoUpdate = false;
    this.root.add(this.aircraft);
    this.scene.add(this.root);

    const ambientLight = new THREE.AmbientLight("#ffffff", 1.45);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight("#ffffff", 2.2);
    sunLight.position.set(-300, -180, 650);
    this.scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight("#89bfff", 0.65);
    fillLight.position.set(250, 180, 160);
    this.scene.add(fillLight);
  }

  public asMapLibreLayer(): CustomLayerInterface {
    return this as unknown as CustomLayerInterface;
  }

  public onAdd(
    map: MapLibreMap,
    gl: WebGLRenderingContext | WebGL2RenderingContext,
  ): void {
    this.map = map;

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });

    this.renderer.autoClear = false;
  }

  public onRemove(): void {
    this.disposeRays();

    this.aircraft.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      object.geometry.dispose();

      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          material.dispose();
        }
      } else {
        object.material.dispose();
      }
    });

    this.renderer = undefined;
    this.map = undefined;
  }

  public setPose(pose: Aircraft3DPose | undefined): void {
    this.pose = pose;
    this.updateTransform();
    this.updateRays();
    this.map?.triggerRepaint();
  }

  public setFootprint(corners: FootprintCorner[]): void {
    this.footprint = corners.slice(0, 4);
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

    const projectionMatrix = matrixFromUnknownArguments(
      firstArgument,
      secondArgument,
    );

    if (projectionMatrix == undefined) {
      return;
    }

    this.camera.projectionMatrix.fromArray(
      Array.from(projectionMatrix),
    );

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  private updateTransform(): void {
    const pose = this.pose;

    if (pose == undefined) {
      return;
    }

    const mercator =
      maplibregl.MercatorCoordinate.fromLngLat(
        [pose.longitude, pose.latitude],
        pose.altitudeM,
      );

    const unitsPerMeter =
      mercator.meterInMercatorCoordinateUnits();

    const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      -degreesToRadians(pose.yawDeg),
    );

    const pitchQuaternion =
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        degreesToRadians(pose.pitchDeg),
      );

    const rollQuaternion =
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        degreesToRadians(pose.rollDeg),
      );

    const orientation = yawQuaternion
      .clone()
      .multiply(pitchQuaternion)
      .multiply(rollQuaternion);

    const translation = new THREE.Matrix4().makeTranslation(
      mercator.x,
      mercator.y,
      mercator.z,
    );

    const mercatorScale = new THREE.Matrix4().makeScale(
      unitsPerMeter,
      -unitsPerMeter,
      unitsPerMeter,
    );

    const rotation = new THREE.Matrix4().makeRotationFromQuaternion(
      orientation,
    );

    this.root.matrix
      .identity()
      .multiply(translation)
      .multiply(mercatorScale)
      .multiply(rotation);

    this.root.matrixWorldNeedsUpdate = true;
  }

  private updateRays(): void {
    const pose = this.pose;

    this.disposeRays();

    if (
      pose == undefined ||
      this.footprint.length < 3
    ) {
      return;
    }

    const aircraftMercator =
      maplibregl.MercatorCoordinate.fromLngLat(
        [pose.longitude, pose.latitude],
        pose.altitudeM,
      );

    const vertices: number[] = [];

    for (const corner of this.footprint.slice(0, 4)) {
      const groundMercator =
        maplibregl.MercatorCoordinate.fromLngLat(
          [corner.longitude, corner.latitude],
          0,
        );

      vertices.push(
        aircraftMercator.x,
        aircraftMercator.y,
        aircraftMercator.z,
        groundMercator.x,
        groundMercator.y,
        groundMercator.z,
      );
    }

    this.raysGeometry = new THREE.BufferGeometry();

    this.raysGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );

    this.rays = new THREE.LineSegments(
      this.raysGeometry,
      new THREE.LineBasicMaterial({
        color: "#64d8ff",
        transparent: true,
        opacity: 0.84,
        depthTest: true,
      }),
    );

    this.scene.add(this.rays);
  }

  private disposeRays(): void {
    if (this.rays != undefined) {
      this.scene.remove(this.rays);

      const material = this.rays.material;

      if (Array.isArray(material)) {
        for (const item of material) {
          item.dispose();
        }
      } else {
        material.dispose();
      }
    }

    this.raysGeometry?.dispose();

    this.rays = undefined;
    this.raysGeometry = undefined;
  }
}