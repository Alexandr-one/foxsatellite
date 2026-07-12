import * as THREE from "three";

const AIRCRAFT_VISUAL_SCALE = 3.8;

function createMaterial(
  color: THREE.ColorRepresentation,
  roughness = 0.65,
  metalness = 0.08,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    flatShading: false,
    side: THREE.DoubleSide,
  });
}

function createTaperedWingGeometry(
  halfSpan: number,
  rootChord: number,
  tipChord: number,
  thickness: number,
  sweep: number,
): THREE.BufferGeometry {
  const halfThickness = thickness / 2;


  const positions = new Float32Array([
    
    0,
    rootChord * 0.45,
    halfThickness,

    halfSpan,
    tipChord * 0.35 - sweep,
    halfThickness,

    halfSpan,
    -tipChord * 0.65 - sweep,
    halfThickness,

    0,
    rootChord * 0.45,
    halfThickness,

    halfSpan,
    -tipChord * 0.65 - sweep,
    halfThickness,

    0,
    -rootChord * 0.55,
    halfThickness,

  
    0,
    rootChord * 0.45,
    halfThickness,

    0,
    -rootChord * 0.55,
    halfThickness,

    -halfSpan,
    -tipChord * 0.65 - sweep,
    halfThickness,

    0,
    rootChord * 0.45,
    halfThickness,

    -halfSpan,
    -tipChord * 0.65 - sweep,
    halfThickness,

    -halfSpan,
    tipChord * 0.35 - sweep,
    halfThickness,

    0,
    rootChord * 0.45,
    -halfThickness,

    halfSpan,
    -tipChord * 0.65 - sweep,
    -halfThickness,

    halfSpan,
    tipChord * 0.35 - sweep,
    -halfThickness,

    0,
    rootChord * 0.45,
    -halfThickness,

    0,
    -rootChord * 0.55,
    -halfThickness,

    halfSpan,
    -tipChord * 0.65 - sweep,
    -halfThickness,

    0,
    rootChord * 0.45,
    -halfThickness,

    -halfSpan,
    tipChord * 0.35 - sweep,
    -halfThickness,

    -halfSpan,
    -tipChord * 0.65 - sweep,
    -halfThickness,

    0,
    rootChord * 0.45,
    -halfThickness,

    -halfSpan,
    -tipChord * 0.65 - sweep,
    -halfThickness,

    0,
    -rootChord * 0.55,
    -halfThickness,

    0,
    rootChord * 0.45,
    halfThickness,

    0,
    rootChord * 0.45,
    -halfThickness,

    halfSpan,
    tipChord * 0.35 - sweep,
    -halfThickness,

    0,
    rootChord * 0.45,
    halfThickness,

    halfSpan,
    tipChord * 0.35 - sweep,
    -halfThickness,

    halfSpan,
    tipChord * 0.35 - sweep,
    halfThickness,

    0,
    -rootChord * 0.55,
    halfThickness,

    halfSpan,
    -tipChord * 0.65 - sweep,
    halfThickness,

    halfSpan,
    -tipChord * 0.65 - sweep,
    -halfThickness,

    0,
    -rootChord * 0.55,
    halfThickness,

    halfSpan,
    -tipChord * 0.65 - sweep,
    -halfThickness,

    0,
    -rootChord * 0.55,
    -halfThickness,

    0,
    rootChord * 0.45,
    halfThickness,

    -halfSpan,
    tipChord * 0.35 - sweep,
    -halfThickness,

    0,
    rootChord * 0.45,
    -halfThickness,

    0,
    rootChord * 0.45,
    halfThickness,

    -halfSpan,
    tipChord * 0.35 - sweep,
    halfThickness,

    -halfSpan,
    tipChord * 0.35 - sweep,
    -halfThickness,

    0,
    -rootChord * 0.55,
    halfThickness,

    0,
    -rootChord * 0.55,
    -halfThickness,

    -halfSpan,
    -tipChord * 0.65 - sweep,
    -halfThickness,

    0,
    -rootChord * 0.55,
    halfThickness,

    -halfSpan,
    -tipChord * 0.65 - sweep,
    -halfThickness,

    -halfSpan,
    -tipChord * 0.65 - sweep,
    halfThickness,
  ]);

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function createVerticalTailGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array([
    -0.11,
    -3.1,
    0,

    -0.11,
    -4.6,
    0,

    -0.11,
    -4.2,
    2.1,

    0.11,
    -3.1,
    0,

    0.11,
    -4.2,
    2.1,

    0.11,
    -4.6,
    0,

    -0.11,
    -3.1,
    0,

    -0.11,
    -4.2,
    2.1,

    0.11,
    -4.2,
    2.1,

    -0.11,
    -3.1,
    0,

    0.11,
    -4.2,
    2.1,

    0.11,
    -3.1,
    0,

    -0.11,
    -4.6,
    0,

    0.11,
    -4.2,
    2.1,

    -0.11,
    -4.2,
    2.1,

    -0.11,
    -4.6,
    0,

    0.11,
    -4.6,
    0,

    0.11,
    -4.2,
    2.1,
  ]);

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function createEngine(
  x: number,
): THREE.Group {
  const group = new THREE.Group();

  const engineMaterial = createMaterial(
    "#44515f",
    0.4,
    0.25,
  );

  const intakeMaterial = createMaterial(
    "#151b22",
    0.35,
    0.45,
  );

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      0.32,
      0.95,
      3,
      10,
    ),
    engineMaterial,
  );

  body.position.set(
    x,
    0,
    -0.42,
  );

  group.add(body);

  const intake = new THREE.Mesh(
    new THREE.TorusGeometry(
      0.3,
      0.055,
      6,
      14,
    ),
    intakeMaterial,
  );

  intake.rotation.x = Math.PI / 2;

  intake.position.set(
    x,
    0.56,
    -0.42,
  );

  group.add(intake);

  return group;
}

function createNavigationLight(
  color: THREE.ColorRepresentation,
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    0.12,
    8,
    6,
  );

  const material = new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
  });

  return new THREE.Mesh(
    geometry,
    material,
  );
}

export function createAircraftModel(): THREE.Group {
  const aircraft = new THREE.Group();

  aircraft.name = "aircraft-model";

  const bodyMaterial = createMaterial(
    "#d8dde3",
    0.55,
    0.12,
  );

  const wingMaterial = createMaterial(
    "#aeb8c4",
    0.62,
    0.08,
  );

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: "#173f63",
    roughness: 0.18,
    metalness: 0.18,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });

  const fuselage = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      0.68,
      6.1,
      5,
      14,
    ),
    bodyMaterial,
  );

  fuselage.name = "fuselage";

  fuselage.scale.set(
    0.92,
    1,
    0.9,
  );

  fuselage.position.y = 0.15;

  aircraft.add(fuselage);

  const wings = new THREE.Mesh(
    createTaperedWingGeometry(
      5.6,
      2.8,
      1.05,
      0.18,
      0.65,
    ),
    wingMaterial,
  );

  wings.name = "main-wings";

  wings.position.set(
    0,
    0.1,
    0.02,
  );

  aircraft.add(wings);

  const stabilizer = new THREE.Mesh(
    createTaperedWingGeometry(
      2.25,
      1.15,
      0.46,
      0.12,
      0.2,
    ),
    wingMaterial,
  );

  stabilizer.name = "horizontal-stabilizer";

  stabilizer.position.set(
    0,
    -3.55,
    0.45,
  );

  aircraft.add(stabilizer);

  const verticalTail = new THREE.Mesh(
    createVerticalTailGeometry(),
    wingMaterial,
  );

  verticalTail.name = "vertical-tail";

  aircraft.add(verticalTail);

  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.72,
      14,
      8,
    ),
    glassMaterial,
  );

  cockpit.name = "cockpit";

  cockpit.scale.set(
    0.75,
    1.4,
    0.52,
  );

  cockpit.position.set(
    0,
    2.25,
    0.68,
  );

  aircraft.add(cockpit);

  aircraft.add(
    createEngine(-1.75),
  );

  aircraft.add(
    createEngine(1.75),
  );

  const leftLight = createNavigationLight(
    "#ff2020",
  );

  leftLight.name = "left-navigation-light";

  leftLight.position.set(
    -5.55,
    -0.45,
    0.03,
  );

  aircraft.add(leftLight);

  const rightLight = createNavigationLight(
    "#20ff72",
  );

  rightLight.name = "right-navigation-light";

  rightLight.position.set(
    5.55,
    -0.45,
    0.03,
  );

  aircraft.add(rightLight);

  const tailLight = createNavigationLight(
    "#ffffff",
  );

  tailLight.name = "tail-navigation-light";

  tailLight.position.set(
    0,
    -4.85,
    0.15,
  );

  aircraft.add(tailLight);

  aircraft.traverse((object) => {
    object.frustumCulled = false;

    if (!(object instanceof THREE.Mesh)) {
      return;
    }

    object.castShadow = false;
    object.receiveShadow = false;

    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
  });

  aircraft.scale.setScalar(
    AIRCRAFT_VISUAL_SCALE,
  );

  aircraft.updateMatrix();
  aircraft.updateMatrixWorld(true);

  return aircraft;
}