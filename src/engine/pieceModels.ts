import * as THREE from 'three';
import { CLASS_SPECS } from '../game/classes';
import type { PieceColor, PieceType } from '../game/types';

export interface PieceMaterialPalette {
  whiteBody: THREE.MeshStandardMaterial;
  blackBody: THREE.MeshStandardMaterial;
  whiteTrim: THREE.MeshStandardMaterial;
  blackTrim: THREE.MeshStandardMaterial;
  shadowPlaneGeo: THREE.CircleGeometry;
  shadowMat: THREE.MeshBasicMaterial;
}

function makeLathe(points: [number, number][], segments = 20): THREE.LatheGeometry {
  const vecs = points.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(vecs, segments);
}

/**
 * Builds a composite 4-9 part procedural chess piece pivoted at bottom-center (y = 0).
 */
export function createChessPieceMesh(
  type: PieceType,
  color: PieceColor,
  palette: PieceMaterialPalette,
): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = color === 'white' ? palette.whiteBody : palette.blackBody;
  const trimMat = color === 'white' ? palette.whiteTrim : palette.blackTrim;

  // Accent emissive crystal/visor for FPS weapon identity
  const accentColor = new THREE.Color(CLASS_SPECS[type].accentHex);
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.75,
    roughness: 0.2,
    metalness: 0.3,
  });

  // Grounding contact shadow disc
  const shadowDisc = new THREE.Mesh(palette.shadowPlaneGeo, palette.shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  group.add(shadowDisc);

  // Shared stepped plinth base
  const baseRing = new THREE.Mesh(
    makeLathe([
      [0, 0],
      [0.62, 0],
      [0.64, 0.1],
      [0.56, 0.22],
      [0.44, 0.32],
      [0.48, 0.38],
      [0.36, 0.44],
      [0, 0.44],
    ]),
    bodyMat,
  );
  baseRing.castShadow = true;
  baseRing.receiveShadow = true;
  group.add(baseRing);

  // Metallic collar band at base
  const baseCollar = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.045, 8, 22),
    trimMat,
  );
  baseCollar.rotation.x = Math.PI / 2;
  baseCollar.position.y = 0.35;
  group.add(baseCollar);

  if (type === 'pawn') {
    const stem = new THREE.Mesh(
      makeLathe([
        [0.34, 0.44],
        [0.26, 0.78],
        [0.19, 1.15],
        [0.3, 1.24],
        [0.2, 1.3],
        [0, 1.3],
      ]),
      bodyMat,
    );
    stem.castShadow = true;
    group.add(stem);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), bodyMat);
    head.position.y = 1.54;
    head.castShadow = true;
    group.add(head);

    const visor = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.035, 8, 18),
      accentMat,
    );
    visor.rotation.x = Math.PI / 2;
    visor.position.y = 1.54;
    group.add(visor);
  } else if (type === 'rook') {
    const tower = new THREE.Mesh(
      makeLathe([
        [0.38, 0.44],
        [0.33, 0.95],
        [0.31, 1.42],
        [0.44, 1.54],
        [0.44, 1.76],
        [0.28, 1.76],
        [0, 1.76],
      ]),
      bodyMat,
    );
    tower.castShadow = true;
    group.add(tower);

    const crownBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.045, 8, 20),
      trimMat,
    );
    crownBand.rotation.x = Math.PI / 2;
    crownBand.position.y = 1.54;
    group.add(crownBand);

    // 4 crenellation battlements
    const battlementGeo = new THREE.BoxGeometry(0.22, 0.24, 0.16);
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const merlon = new THREE.Mesh(battlementGeo, bodyMat);
      merlon.position.set(Math.cos(ang) * 0.34, 1.88, Math.sin(ang) * 0.34);
      merlon.rotation.y = -ang;
      merlon.castShadow = true;
      group.add(merlon);
    }

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.18, 12),
      accentMat,
    );
    core.position.y = 1.82;
    group.add(core);
  } else if (type === 'knight') {
    const neckCollar = new THREE.Mesh(
      makeLathe([
        [0.35, 0.44],
        [0.3, 0.72],
        [0.4, 0.78],
        [0, 0.78],
      ]),
      trimMat,
    );
    group.add(neckCollar);

    // Sculpted extruded horse silhouette
    const shape = new THREE.Shape();
    shape.moveTo(-0.28, 0.76);
    shape.lineTo(0.28, 0.76);
    shape.lineTo(0.26, 1.24);
    shape.lineTo(0.46, 1.48);
    shape.lineTo(0.38, 1.66);
    shape.lineTo(0.14, 1.74);
    shape.lineTo(0.06, 2.02); // ear tip
    shape.lineTo(-0.14, 1.88);
    shape.lineTo(-0.32, 1.55);
    shape.lineTo(-0.34, 1.12);
    shape.closePath();

    const horseGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.05,
    });
    horseGeo.translate(0, 0, -0.16);
    const horseMesh = new THREE.Mesh(horseGeo, bodyMat);
    // Rotate so horse faces -Z for White, +Z for Black (group rotation handles color)
    horseMesh.rotation.y = Math.PI / 2;
    horseMesh.castShadow = true;
    group.add(horseMesh);

    const crest = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.56, 0.14),
      accentMat,
    );
    crest.position.set(0, 1.44, 0.24);
    crest.rotation.x = 0.22;
    group.add(crest);
  } else if (type === 'bishop') {
    const stem = new THREE.Mesh(
      makeLathe([
        [0.35, 0.44],
        [0.24, 0.96],
        [0.19, 1.34],
        [0.32, 1.44],
        [0.22, 1.5],
        [0.3, 1.76],
        [0.22, 2.04],
        [0.08, 2.18],
        [0, 2.22],
      ]),
      bodyMat,
    );
    stem.castShadow = true;
    group.add(stem);

    const sash = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.04, 8, 18),
      trimMat,
    );
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 1.44;
    group.add(sash);

    const prismOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      accentMat,
    );
    prismOrb.position.y = 2.28;
    group.add(prismOrb);
  } else if (type === 'queen') {
    const body = new THREE.Mesh(
      makeLathe([
        [0.4, 0.44],
        [0.27, 1.05],
        [0.22, 1.56],
        [0.36, 1.66],
        [0.25, 1.74],
        [0.38, 2.16],
        [0.24, 2.2],
        [0, 2.2],
      ]),
      bodyMat,
    );
    body.castShadow = true;
    group.add(body);

    const neckBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.045, 8, 22),
      trimMat,
    );
    neckBand.rotation.x = Math.PI / 2;
    neckBand.position.y = 1.67;
    group.add(neckBand);

    // 6-point coronet
    const spikeGeo = new THREE.ConeGeometry(0.075, 0.28, 6);
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI * 2) / 6;
      const spike = new THREE.Mesh(spikeGeo, trimMat);
      spike.position.set(Math.cos(ang) * 0.28, 2.3, Math.sin(ang) * 0.28);
      group.add(spike);
    }

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 1), accentMat);
    gem.position.y = 2.42;
    group.add(gem);
  } else {
    // KING
    const body = new THREE.Mesh(
      makeLathe([
        [0.42, 0.44],
        [0.29, 1.15],
        [0.24, 1.68],
        [0.4, 1.8],
        [0.28, 1.88],
        [0.42, 2.28],
        [0.3, 2.34],
        [0, 2.34],
      ]),
      bodyMat,
    );
    body.castShadow = true;
    group.add(body);

    const crownBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.39, 0.05, 8, 22),
      trimMat,
    );
    crownBand.rotation.x = Math.PI / 2;
    crownBand.position.y = 1.8;
    group.add(crownBand);

    // Cross finial
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), trimMat);
    vBar.position.y = 2.58;
    group.add(vBar);

    const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.14), trimMat);
    hBar.position.y = 2.66;
    group.add(hBar);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.13, 0),
      accentMat,
    );
    core.position.y = 2.38;
    group.add(core);
  }

  // Face forward toward the opposing side
  group.rotation.y = color === 'white' ? 0 : Math.PI;
  return group;
}

/**
 * Builds a composite 4-7 part 3D first-person weapon viewmodel for each piece class.
 */
export function createViewModelWeapon(
  type: PieceType,
  color: PieceColor,
): { group: THREE.Group; muzzleOffset: THREE.Vector3 } {
  const root = new THREE.Group();
  const hullColor = color === 'white' ? 0xe5dfd1 : 0x202532;
  const hullMat = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.42,
    metalness: 0.25,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3b4252,
    roughness: 0.26,
    metalness: 0.85,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4a853,
    roughness: 0.22,
    metalness: 0.9,
  });
  const accentColor = new THREE.Color(CLASS_SPECS[type].accentHex);
  const glowMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 1.4,
    roughness: 0.15,
  });

  // Shared ergonomic grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.11), hullMat);
  grip.position.set(0, -0.14, 0.12);
  grip.rotation.x = 0.28;
  root.add(grip);

  let muzzleZ = -0.68;

  if (type === 'pawn') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.56), hullMat);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.028, 0.36, 12),
      steelMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.44);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.36), glowMat);
    rail.position.set(0, 0.075, -0.05);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), goldMat);
    sight.position.set(0, 0.1, 0.02);
    root.add(body, barrel, rail, sight);
    muzzleZ = -0.64;
  } else if (type === 'rook') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.52), hullMat);
    for (const xOff of [-0.042, 0.042]) {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.04, 0.42, 12),
        steelMat,
      );
      b.rotation.x = Math.PI / 2;
      b.position.set(xOff, 0.02, -0.42);
      root.add(b);
    }
    const shieldRing = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.04, 0.22), goldMat);
    shieldRing.position.set(0, 0.11, -0.1);
    const heatCore = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.26), glowMat);
    heatCore.position.set(0, -0.02, -0.14);
    root.add(chassis, shieldRing, heatCore);
    muzzleZ = -0.64;
  } else if (type === 'knight') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.42), hullMat);
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.3), steelMat);
    shroud.position.set(0, 0.03, -0.24);
    const arcCoil = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.015, 8, 16),
      glowMat,
    );
    arcCoil.position.set(0, 0.02, -0.4);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.18), goldMat);
    crest.position.set(0, 0.09, -0.05);
    root.add(frame, shroud, arcCoil, crest);
    muzzleZ = -0.48;
  } else if (type === 'bishop') {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.58), hullMat);
    const upperRail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.64), steelMat);
    upperRail.position.set(0, 0.06, -0.35);
    const lowerRail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.64), steelMat);
    lowerRail.position.set(0, -0.02, -0.35);
    const beamCore = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.025, 0.6), glowMat);
    beamCore.position.set(0, 0.02, -0.35);
    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.036, 0.22, 12),
      goldMat,
    );
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.12, -0.04);
    root.add(receiver, upperRail, lowerRail, beamCore, scope);
    muzzleZ = -0.7;
  } else if (type === 'queen') {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.48), hullMat);
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.16, 14),
      goldMat,
    );
    drum.position.set(0, -0.1, -0.12);
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(0, 0.01, -0.46);
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2;
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.44, 8),
        steelMat,
      );
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(ang) * 0.036, Math.sin(ang) * 0.036, 0);
      barrelGroup.add(b);
    }
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.42, 10),
      glowMat,
    );
    core.rotation.x = Math.PI / 2;
    barrelGroup.add(core);
    root.add(housing, drum, barrelGroup);
    muzzleZ = -0.7;
  } else {
    // KING Scepter Cannon
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.56), hullMat);
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.056, 0.16, 12),
      goldMat,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.02, -0.34);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), glowMat);
    orb.position.set(0, 0.02, -0.48);
    const crownProngs = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.18), goldMat);
    crownProngs.position.set(0, 0.09, -0.44);
    root.add(body, collar, orb, crownProngs);
    muzzleZ = -0.58;
  }

  return {
    group: root,
    muzzleOffset: new THREE.Vector3(0, 0.02, muzzleZ),
  };
}
