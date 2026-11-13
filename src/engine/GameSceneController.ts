import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
  EYE_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  hasLineOfSight,
  raycastActorHitbox,
  raycastObstacles,
  resolveCircleAabbCollision,
} from '../game/arenaPhysics';
import { CLASS_SPECS } from '../game/classes';
import type {
  AppState,
  BoardGrid,
  ChessMove,
  Difficulty,
  DuelConfig,
  DuelHudSnapshot,
  PieceColor,
  PieceType,
  PlayPhase,
  SquareCoord,
} from '../game/types';
import { AudioEngine } from './audio';
import {
  createChessPieceMesh,
  createViewModelWeapon,
  type PieceMaterialPalette,
} from './pieceModels';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';

const SQUARE_SIZE = 4.0;
const BOARD_PIECE_SCALE = 1.55;
const DUEL_ENEMY_SCALE = 1.25;
const GRAVITY = 24.0;

// Pre-allocated scratch math helpers (zero GC inside tick loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

interface PieceVisual {
  id: string;
  type: PieceType;
  color: PieceColor;
  group: THREE.Group;
  targetPos: THREE.Vector3;
  baseScale: number;
}

interface ActiveProjectile {
  active: boolean;
  fromPlayer: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  color: number;
  mesh: THREE.Mesh;
}

interface ParticleSlot {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

export interface SceneCallbacks {
  onSquareClick: (coord: SquareCoord) => void;
  onDuelHudUpdate: (snapshot: DuelHudSnapshot) => void;
  onDuelComplete: (
    playerWon: boolean,
    stats: { shotsFired: number; shotsHit: number },
  ) => void;
  onPauseRequest: () => void;
}

function squareToWorld(row: number, col: number): { x: number; z: number } {
  return {
    x: (col - 3.5) * SQUARE_SIZE,
    z: (row - 3.5) * SQUARE_SIZE,
  };
}

export class GameSceneController {
  private mountEl: HTMLElement;
  private callbacks: SceneCallbacks;
  public audio = new AudioEngine();

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextureSet;
  private palette: PieceMaterialPalette;
  private isSoftwareGl: boolean;

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();

  // App & gameplay state mirrored from React
  private appState: AppState = 'title';
  private playPhase: PlayPhase = 'board';
  private difficulty: Difficulty = 'tactician';
  private boardFlipped = false;

  // Board visuals
  private boardGroup = new THREE.Group();
  private tileHitboxes: THREE.Mesh[] = [];
  private highlightPool: THREE.Mesh[] = [];
  private hoverMarker: THREE.Mesh;
  private selectedMarker: THREE.Mesh;
  private pieceVisuals = new Map<string, PieceVisual>();

  // Arena cover pillars (animate up during duel)
  private obstacleMeshes: { mesh: THREE.Group; targetY: number }[] = [];
  private obstaclesRaise = 0; // 0 = retracted, 1 = raised

  // Camera rig
  private camPos = new THREE.Vector3(0, 22, 26);
  private camLook = new THREE.Vector3(0, 0, 0);
  private titleOrbitAngle = 0.45;
  private pointerParallax = { x: 0, y: 0 };

  // Input state
  private keys = new Set<string>();
  private mouseDownLeft = false;
  private pointerLocked = false;
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private lastHoverCheck = 0;
  private hoveredSquare: SquareCoord | null = null;
  private lastMouseClient = { x: 0, y: 0, has: false };

  // Duel simulation state
  private duelConfig: DuelConfig | null = null;
  private duelPlayerPos = new THREE.Vector3(0, 0, 11);
  private duelPlayerVel = new THREE.Vector3();
  private duelPlayerGrounded = true;
  private duelYaw = 0;
  private duelPitch = 0;
  private duelPlayerHp = 100;
  private duelPlayerMaxHp = 100;
  private duelAmmo = 18;
  private duelReloadTimer = 0;
  private duelFireCooldown = 0;
  private duelAbilityCooldown = 0;
  private duelAbilityActiveTimer = 0;
  private duelHitMarkerTimer = 0;
  private duelLastHitCrit = false;
  private duelShotsFired = 0;
  private duelShotsHit = 0;
  private duelTrauma = 0;
  private hitstopTimer = 0;
  private duelEndTimer = 0;
  private duelOutcomeWon: boolean | null = null;
  private duelBannerTimer = 0;
  private duelBannerText: string | null = null;
  private walkBobPhase = 0;
  private weaponRecoil = 0;
  private muzzleFlashTimer = 0;

  // Enemy AI state in duel
  private enemyGroup: THREE.Group | null = null;
  private enemyPos = new THREE.Vector3(0, 0, -11);
  private enemyVel = new THREE.Vector3();
  private enemyHp = 100;
  private enemyMaxHp = 100;
  private enemyFireCooldown = 0.9;
  private enemyTelegraphTimer = 0;
  private enemyTelegraphActive = false;
  private enemyStrafeDir = 1;
  private enemyStrafeSwitchTimer = 1.4;
  private enemyHitFlashTimer = 0;
  private enemyShieldTimer = 0;
  private enemyAbilityCooldown = 5.0;
  private enemyKoAngle = 0;

  // Viewmodel & visual FX
  private viewModelAnchor = new THREE.Group();
  private currentViewModel: THREE.Group | null = null;
  private muzzleLight: THREE.PointLight;
  private muzzleFlashMesh: THREE.Mesh;
  private beamLine: THREE.Mesh;
  private beamTimer = 0;
  private enemyTelegraphLine: THREE.Mesh;

  // Pooled projectiles & particles
  private projectiles: ActiveProjectile[] = [];
  private particleMesh: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private hudEmitAccum = 0;

  // Shared disposable geos/mats
  private extraDisposables: { dispose: () => void }[] = [];

  constructor(mountEl: HTMLElement, callbacks: SceneCallbacks) {
    this.mountEl = mountEl;
    this.callbacks = callbacks;

    // Detect software WebGL
    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = mountEl.clientWidth || window.innerWidth;
    const height = mountEl.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.isSoftwareGl,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    mountEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const bgHex = 0x131722;
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, 0.0115);

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.1, 220);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.scene.add(this.camera);

    // Studio Environment reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    // Lighting rig: warm key + cool hemi + rim
    const hemi = new THREE.HemisphereLight(0x8aa8d6, 0x26201a, 0.72);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    keyLight.position.set(18, 32, 16);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 4;
    keyLight.shadow.camera.far = 85;
    const d = 24;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7ca2e8, 0.75);
    rimLight.position.set(-22, 18, -20);
    this.scene.add(rimLight);

    // Shared Piece Material Palette
    this.palette = {
      whiteBody: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.textures.ivoryMarbleMap,
        bumpMap: this.textures.stoneBumpMap,
        bumpScale: 0.015,
        roughness: 0.36,
        metalness: 0.08,
      }),
      blackBody: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.textures.obsidianMarbleMap,
        bumpMap: this.textures.stoneBumpMap,
        bumpScale: 0.015,
        roughness: 0.32,
        metalness: 0.14,
      }),
      whiteTrim: new THREE.MeshStandardMaterial({
        color: 0xd4a853,
        roughnessMap: this.textures.brushedMetalRoughness,
        roughness: 0.24,
        metalness: 0.88,
      }),
      blackTrim: new THREE.MeshStandardMaterial({
        color: 0xb68a44,
        roughnessMap: this.textures.brushedMetalRoughness,
        roughness: 0.28,
        metalness: 0.85,
      }),
      shadowPlaneGeo: new THREE.CircleGeometry(0.74, 16),
      shadowMat: new THREE.MeshBasicMaterial({
        map: this.textures.contactShadowMap,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    };

    // Build Architectural Sanctuary & Chessboard
    this.buildEnvironment();
    this.hoverMarker = this.createSquareMarker(0xf3efe6, 0.35);
    this.selectedMarker = this.createSquareMarker(0xd4a853, 0.75);
    this.hoverMarker.visible = false;
    this.selectedMarker.visible = false;
    this.scene.add(this.hoverMarker, this.selectedMarker);

    // Viewmodel setup
    this.camera.add(this.viewModelAnchor);
    this.viewModelAnchor.visible = false;
    this.muzzleLight = new THREE.PointLight(0xffd28a, 0, 8);
    this.muzzleLight.position.set(0.24, -0.18, -0.8);
    this.camera.add(this.muzzleLight);

    const flashGeo = new THREE.OctahedronGeometry(0.09, 0);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe4a0,
      transparent: true,
      opacity: 0.9,
    });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.visible = false;
    this.viewModelAnchor.add(this.muzzleFlashMesh);

    // Hitscan Rail Beam & Enemy Telegraph Line
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xa78bfa,
      transparent: true,
      opacity: 0.85,
    });
    this.beamLine = new THREE.Mesh(beamGeo, beamMat);
    this.beamLine.visible = false;
    this.scene.add(this.beamLine);

    const teleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
    teleGeo.rotateX(Math.PI / 2);
    const teleMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.75,
    });
    this.enemyTelegraphLine = new THREE.Mesh(teleGeo, teleMat);
    this.enemyTelegraphLine.visible = false;
    this.scene.add(this.enemyTelegraphLine);

    this.extraDisposables.push(flashGeo, flashMat, beamGeo, beamMat, teleGeo, teleMat);

    // Projectile Pool (36 bolts)
    const projGeo = new THREE.SphereGeometry(0.11, 8, 8);
    this.extraDisposables.push(projGeo);
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const mesh = new THREE.Mesh(projGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.extraDisposables.push(mat);
      this.projectiles.push({
        active: false,
        fromPlayer: true,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        damage: 0,
        life: 0,
        color: 0x38bdf8,
        mesh,
      });
    }

    // Pooled InstancedMesh Particles (140 sparks)
    const pGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, 140);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    this.extraDisposables.push(pGeo, pMat);

    for (let i = 0; i < 140; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -50, 0),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.5,
        size: 0,
        color: new THREE.Color(0xffffff),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.loop);
  }

  private createSquareMarker(hex: number, opacity: number): THREE.Mesh {
    const outer = SQUARE_SIZE * 0.44;
    const inner = SQUARE_SIZE * 0.34;
    const shape = new THREE.Shape();
    shape.moveTo(-outer, -outer);
    shape.lineTo(outer, -outer);
    shape.lineTo(outer, outer);
    shape.lineTo(-outer, outer);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner);
    hole.lineTo(-inner, inner);
    hole.lineTo(inner, inner);
    hole.lineTo(inner, -inner);
    hole.closePath();
    shape.holes.push(hole);

    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.035;
    this.extraDisposables.push(geo, mat);
    return mesh;
  }

  private buildEnvironment(): void {
    // 1. Extended Hall Floor (no floating void!)
    const hallGeo = new THREE.PlaneGeometry(180, 180);
    hallGeo.rotateX(-Math.PI / 2);
    const hallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.hallFloorMap,
      roughness: 0.78,
      metalness: 0.08,
    });
    const hallFloor = new THREE.Mesh(hallGeo, hallMat);
    hallFloor.position.y = -0.45;
    hallFloor.receiveShadow = true;
    this.scene.add(hallFloor);
    this.extraDisposables.push(hallGeo, hallMat);

    // 2. Stepped Chessboard Plinth Frame
    const plinthGeo = new THREE.BoxGeometry(34.4, 0.48, 34.4);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e29,
      roughness: 0.45,
      metalness: 0.25,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.25;
    plinth.receiveShadow = true;
    this.scene.add(plinth);

    const goldRimGeo = new THREE.BoxGeometry(32.6, 0.1, 32.6);
    const goldRimMat = new THREE.MeshStandardMaterial({
      color: 0xd4a853,
      roughness: 0.25,
      metalness: 0.88,
    });
    const goldRim = new THREE.Mesh(goldRimGeo, goldRimMat);
    goldRim.position.y = -0.1;
    this.scene.add(goldRim);
    this.extraDisposables.push(plinthGeo, plinthMat, goldRimGeo, goldRimMat);

    // 3. 8x8 Marble Tiles + Invisible Click Hitboxes
    const tileGeo = new THREE.BoxGeometry(SQUARE_SIZE, 0.16, SQUARE_SIZE);
    const ivoryTileMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.ivoryMarbleMap,
      bumpMap: this.textures.stoneBumpMap,
      bumpScale: 0.01,
      roughness: 0.34,
      metalness: 0.05,
    });
    const obsidianTileMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.obsidianMarbleMap,
      bumpMap: this.textures.stoneBumpMap,
      bumpScale: 0.01,
      roughness: 0.3,
      metalness: 0.1,
    });
    const hitGeo = new THREE.PlaneGeometry(SQUARE_SIZE, SQUARE_SIZE);
    hitGeo.rotateX(-Math.PI / 2);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.extraDisposables.push(
      tileGeo,
      ivoryTileMat,
      obsidianTileMat,
      hitGeo,
      hitMat,
    );

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const { x, z } = squareToWorld(r, c);
        const tile = new THREE.Mesh(
          tileGeo,
          isLight ? ivoryTileMat : obsidianTileMat,
        );
        tile.position.set(x, -0.08, z);
        tile.receiveShadow = true;
        this.boardGroup.add(tile);

        const hitbox = new THREE.Mesh(hitGeo, hitMat);
        hitbox.position.set(x, 0.01, z);
        hitbox.userData = { row: r, col: c };
        this.boardGroup.add(hitbox);
        this.tileHitboxes.push(hitbox);
      }
    }
    this.scene.add(this.boardGroup);

    // 4. Perimeter Colonnade Pillars (landmark silhouettes in spawn & board views)
    const colShaftGeo = new THREE.CylinderGeometry(1.15, 1.32, 14, 12);
    const colBaseGeo = new THREE.BoxGeometry(3.2, 0.9, 3.2);
    const colCapGeo = new THREE.BoxGeometry(3.0, 0.7, 3.0);
    const colMat = new THREE.MeshStandardMaterial({
      color: 0x262b38,
      roughness: 0.65,
      metalness: 0.12,
    });
    this.extraDisposables.push(colShaftGeo, colBaseGeo, colCapGeo, colMat);

    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const rad = 29;
      const colGroup = new THREE.Group();
      colGroup.position.set(Math.cos(ang) * rad, -0.45, Math.sin(ang) * rad);

      const base = new THREE.Mesh(colBaseGeo, colMat);
      base.position.y = 0.45;
      const shaft = new THREE.Mesh(colShaftGeo, colMat);
      shaft.position.y = 7.4;
      const cap = new THREE.Mesh(colCapGeo, goldRimMat);
      cap.position.y = 14.5;

      colGroup.add(base, shaft, cap);
      this.scene.add(colGroup);
    }

    // 5. Retractable Tactical Cover Monoliths (rise during FPS Duel!)
    const obBodyMat = new THREE.MeshStandardMaterial({
      color: 0x282f3f,
      bumpMap: this.textures.stoneBumpMap,
      bumpScale: 0.02,
      roughness: 0.52,
      metalness: 0.18,
    });
    this.extraDisposables.push(obBodyMat);

    for (const ob of ARENA_OBSTACLES) {
      const g = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(ob.halfW * 2, ob.height, ob.halfD * 2);
      const body = new THREE.Mesh(bodyGeo, obBodyMat);
      body.position.y = ob.height / 2;
      body.castShadow = true;
      body.receiveShadow = true;

      const capGeo = new THREE.BoxGeometry(
        ob.halfW * 2 + 0.14,
        0.14,
        ob.halfD * 2 + 0.14,
      );
      const cap = new THREE.Mesh(capGeo, goldRimMat);
      cap.position.y = ob.height + 0.02;

      const baseTrim = new THREE.Mesh(capGeo, goldRimMat);
      baseTrim.position.y = 0.07;

      g.add(body, cap, baseTrim);
      g.position.set(ob.x, -ob.height - 0.3, ob.z);
      this.scene.add(g);
      this.obstacleMeshes.push({ mesh: g, targetY: -ob.height - 0.3 });
      this.extraDisposables.push(bodyGeo, capGeo);
    }

    // 6. Pool of legal move square markers (max 28)
    for (let i = 0; i < 28; i++) {
      const m = this.createSquareMarker(0x10b981, 0.72);
      m.visible = false;
      this.scene.add(m);
      this.highlightPool.push(m);
    }
  }

  public syncBoardState(
    board: BoardGrid,
    selected: SquareCoord | null,
    legalMoves: ChessMove[],
  ): void {
    const aliveIds = new Set<string>();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        aliveIds.add(piece.id);
        const { x, z } = squareToWorld(r, c);
        const existing = this.pieceVisuals.get(piece.id);

        if (existing && existing.type === piece.type) {
          existing.targetPos.set(x, 0, z);
        } else {
          if (existing) {
            this.scene.remove(existing.group);
          }
          const group = createChessPieceMesh(
            piece.type,
            piece.color,
            this.palette,
          );
          group.position.set(x, 0, z);
          group.scale.setScalar(BOARD_PIECE_SCALE);
          this.scene.add(group);
          this.pieceVisuals.set(piece.id, {
            id: piece.id,
            type: piece.type,
            color: piece.color,
            group,
            targetPos: new THREE.Vector3(x, 0, z),
            baseScale: BOARD_PIECE_SCALE,
          });
        }
      }
    }

    // Remove captured pieces
    for (const [id, vis] of this.pieceVisuals.entries()) {
      if (!aliveIds.has(id)) {
        this.scene.remove(vis.group);
        this.pieceVisuals.delete(id);
      }
    }

    // Selected marker
    if (selected && this.playPhase === 'board') {
      const { x, z } = squareToWorld(selected.row, selected.col);
      this.selectedMarker.position.set(x, 0.04, z);
      this.selectedMarker.visible = true;
    } else {
      this.selectedMarker.visible = false;
    }

    // Legal move markers
    for (let i = 0; i < this.highlightPool.length; i++) {
      const marker = this.highlightPool[i];
      if (i < legalMoves.length && this.playPhase === 'board') {
        const mv = legalMoves[i];
        const { x, z } = squareToWorld(mv.to.row, mv.to.col);
        marker.position.set(x, 0.036, z);
        const mat = marker.material as THREE.MeshBasicMaterial;
        mat.color.setHex(mv.captured ? 0xef4444 : 0x10b981);
        marker.visible = true;
      } else {
        marker.visible = false;
      }
    }
  }

  public setAppState(next: AppState): void {
    this.appState = next;
    if (next !== 'playing') {
      this.keys.clear();
      this.mouseDownLeft = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
  }

  public setDifficulty(diff: Difficulty): void {
    this.difficulty = diff;
  }

  public flipBoardCamera(): void {
    this.boardFlipped = !this.boardFlipped;
  }

  public startBoardPhase(): void {
    this.playPhase = 'board';
    this.duelConfig = null;
    this.viewModelAnchor.visible = false;
    this.enemyTelegraphLine.visible = false;
    if (this.enemyGroup) {
      this.scene.remove(this.enemyGroup);
      this.enemyGroup = null;
    }
    for (const p of this.projectiles) {
      p.active = false;
      p.mesh.visible = false;
    }
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    for (const vis of this.pieceVisuals.values()) {
      vis.group.visible = true;
      vis.group.position.y = 0;
    }
  }

  public startDuel(config: DuelConfig): void {
    this.duelConfig = config;
    this.playPhase = 'duel';
    this.keys.clear();
    this.mouseDownLeft = false;
    this.hoverMarker.visible = false;
    this.selectedMarker.visible = false;
    for (const m of this.highlightPool) m.visible = false;

    // Hide standard board pieces during the arena duel
    for (const vis of this.pieceVisuals.values()) {
      vis.group.visible = false;
    }

    const playerPiece = config.isPlayerAttacker
      ? config.attacker
      : config.defender;
    const enemyPiece = config.isPlayerAttacker
      ? config.defender
      : config.attacker;

    const pSpec = CLASS_SPECS[playerPiece.type];
    const eSpec = CLASS_SPECS[enemyPiece.type];

    // Spawn player on +Z side facing -Z (clear sightline down x = 0)
    this.duelPlayerPos.set(0, 0, 11.2);
    this.duelPlayerVel.set(0, 0, 0);
    this.duelPlayerGrounded = true;
    this.duelYaw = 0;
    this.duelPitch = 0;
    this.duelPlayerHp = pSpec.maxHp;
    this.duelPlayerMaxHp = pSpec.maxHp;
    this.duelAmmo = pSpec.magSize;
    this.duelReloadTimer = 0;
    this.duelFireCooldown = 0;
    this.duelAbilityCooldown = 0;
    this.duelAbilityActiveTimer = 0;
    this.duelHitMarkerTimer = 0;
    this.duelShotsFired = 0;
    this.duelShotsHit = 0;
    this.duelTrauma = 0;
    this.hitstopTimer = 0;
    this.duelEndTimer = 0;
    this.duelOutcomeWon = null;
    this.duelBannerText = `${pSpec.label.toUpperCase()} VS ${eSpec.label.toUpperCase()}`;
    this.duelBannerTimer = 1.6;

    // Setup 1st-person 3D weapon viewmodel
    if (this.currentViewModel) {
      this.viewModelAnchor.remove(this.currentViewModel);
    }
    const vm = createViewModelWeapon(playerPiece.type, playerPiece.color);
    this.currentViewModel = vm.group;
    this.viewModelAnchor.add(vm.group);
    this.viewModelAnchor.scale.setScalar(0.8);
    this.viewModelAnchor.position.set(0.32, -0.26, -0.56);
    this.viewModelAnchor.visible = true;
    this.muzzleFlashMesh.position.copy(vm.muzzleOffset);
    this.muzzleFlashMesh.visible = false;

    // Spawn Enemy combatant on -Z side facing +Z
    if (this.enemyGroup) {
      this.scene.remove(this.enemyGroup);
    }
    this.enemyGroup = createChessPieceMesh(
      enemyPiece.type,
      enemyPiece.color,
      this.palette,
    );
    this.enemyGroup.scale.setScalar(DUEL_ENEMY_SCALE);
    this.enemyPos.set(0, 0, -11.2);
    this.enemyVel.set(0, 0, 0);
    this.enemyGroup.position.copy(this.enemyPos);
    this.enemyGroup.rotation.y = 0;
    this.scene.add(this.enemyGroup);

    this.enemyMaxHp = eSpec.maxHp;
    this.enemyHp = eSpec.maxHp;
    this.enemyFireCooldown = 1.05;
    this.enemyTelegraphTimer = 0;
    this.enemyTelegraphActive = false;
    this.enemyStrafeDir = Math.random() < 0.5 ? -1 : 1;
    this.enemyStrafeSwitchTimer = 1.5;
    this.enemyHitFlashTimer = 0;
    this.enemyShieldTimer = 0;
    this.enemyAbilityCooldown = 4.5;
    this.enemyKoAngle = 0;

    // Snap camera immediately into player eyes for responsive FPS feel
    this.camPos.set(this.duelPlayerPos.x, EYE_HEIGHT, this.duelPlayerPos.z);
    this.camera.position.copy(this.camPos);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.duelPitch, this.duelYaw, 0);

    this.audio.playDuelHorn();
    this.emitDuelHud();
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', this.handlePointerMove);
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('contextmenu', this.handleContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleBlur);
    document.removeEventListener(
      'pointerlockchange',
      this.handlePointerLockChange,
    );

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointermove', this.handlePointerMove);
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.mountEl.clientWidth || window.innerWidth;
    const height = this.mountEl.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  };

  private handleBlur = (): void => {
    this.keys.clear();
    this.mouseDownLeft = false;
    this.lastMouseClient.has = false;
  };

  private handlePointerLockChange = (): void => {
    this.pointerLocked =
      document.pointerLockElement === this.renderer.domElement;
    if (this.playPhase === 'duel') {
      this.emitDuelHud();
    }
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.code);

    if (this.appState !== 'playing') return;

    if (this.playPhase === 'board') {
      if (e.code === 'KeyC') {
        this.flipBoardCamera();
      }
      return;
    }

    if (this.playPhase === 'duel') {
      if (e.code === 'KeyR') {
        this.triggerReload();
      } else if (e.code === 'KeyE') {
        this.triggerPlayerAbility();
      } else if (e.code === 'KeyF') {
        this.mouseDownLeft = true;
        this.attemptPlayerFire();
      } else if (e.code === 'Space' && this.duelPlayerGrounded && this.duelConfig) {
        const playerPiece = this.duelConfig.isPlayerAttacker
          ? this.duelConfig.attacker
          : this.duelConfig.defender;
        this.duelPlayerVel.y = CLASS_SPECS[playerPiece.type].jumpSpeed;
        this.duelPlayerGrounded = false;
        this.audio.playJump();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === 'KeyF') {
      this.mouseDownLeft = false;
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    this.pointerParallax.x = nx;
    this.pointerParallax.y = ny;

    if (this.appState !== 'playing') return;

    if (this.playPhase === 'duel') {
      const sens = 0.0024;
      if (this.pointerLocked) {
        this.duelYaw -= e.movementX * sens;
        this.duelPitch -= e.movementY * sens;
      } else if (this.lastMouseClient.has) {
        // Fallback smooth look when PointerLock is unavailable/declined (e.g. iframe)
        const dx = e.clientX - this.lastMouseClient.x;
        const dy = e.clientY - this.lastMouseClient.y;
        this.duelYaw -= dx * sens * 0.85;
        this.duelPitch -= dy * sens * 0.85;
      }
      this.lastMouseClient = { x: e.clientX, y: e.clientY, has: true };
      this.duelPitch = THREE.MathUtils.clamp(this.duelPitch, -1.15, 1.15);
      return;
    }

    if (this.playPhase === 'board') {
      const now = performance.now();
      if (now - this.lastHoverCheck < 45) return;
      this.lastHoverCheck = now;

      this.pointerNdc.set(nx, ny);
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const hits = this.raycaster.intersectObjects(this.tileHitboxes, false);
      if (hits.length > 0) {
        const { row, col } = hits[0].object.userData as SquareCoord;
        this.hoveredSquare = { row, col };
        const { x, z } = squareToWorld(row, col);
        this.hoverMarker.position.set(x, 0.032, z);
        this.hoverMarker.visible = true;
      } else {
        this.hoveredSquare = null;
        this.hoverMarker.visible = false;
      }
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.appState !== 'playing') return;

    if (this.playPhase === 'board' && e.button === 0) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointerNdc.set(
        ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const hits = this.raycaster.intersectObjects(this.tileHitboxes, false);
      if (hits.length > 0) {
        const coord = hits[0].object.userData as SquareCoord;
        this.callbacks.onSquareClick(coord);
      }
      return;
    }

    if (this.playPhase === 'duel') {
      // Request PointerLock softly on canvas interaction
      if (!this.pointerLocked) {
        try {
          this.renderer.domElement.requestPointerLock?.();
        } catch {
          // Ignore in restricted sandboxes
        }
      }
      if (e.button === 0) {
        this.mouseDownLeft = true;
        this.attemptPlayerFire();
      } else if (e.button === 2) {
        this.triggerPlayerAbility();
      }
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.mouseDownLeft = false;
    }
  };

  private triggerReload(): void {
    if (!this.duelConfig) return;
    const playerPiece = this.duelConfig.isPlayerAttacker
      ? this.duelConfig.attacker
      : this.duelConfig.defender;
    const spec = CLASS_SPECS[playerPiece.type];
    if (this.duelReloadTimer <= 0 && this.duelAmmo < spec.magSize) {
      this.duelReloadTimer = spec.reloadTime;
      this.audio.playReload();
      this.emitDuelHud();
    }
  }

  private triggerPlayerAbility(): void {
    if (!this.duelConfig || this.duelAbilityCooldown > 0 || this.duelOutcomeWon !== null) {
      return;
    }
    const playerPiece = this.duelConfig.isPlayerAttacker
      ? this.duelConfig.attacker
      : this.duelConfig.defender;
    const spec = CLASS_SPECS[playerPiece.type];
    this.duelAbilityCooldown = spec.abilityCooldown;
    this.audio.playAbility();

    const fwdX = -Math.sin(this.duelYaw);
    const fwdZ = -Math.cos(this.duelYaw);

    switch (playerPiece.type) {
      case 'pawn':
        this.duelPlayerVel.x = fwdX * 19;
        this.duelPlayerVel.z = fwdZ * 19;
        this.duelAmmo = spec.magSize;
        this.duelReloadTimer = 0;
        break;
      case 'rook':
        this.duelAbilityActiveTimer = 3.0; // Aegis damage shield
        break;
      case 'knight':
        this.duelPlayerVel.x = fwdX * 16;
        this.duelPlayerVel.z = fwdZ * 16;
        this.duelPlayerVel.y = 10.5;
        this.duelPlayerGrounded = false;
        break;
      case 'bishop':
        this.duelPlayerVel.x = -fwdX * 17;
        this.duelPlayerVel.z = -fwdZ * 17;
        this.duelAmmo = spec.magSize;
        this.duelReloadTimer = 0;
        this.duelFireCooldown = 0;
        break;
      case 'queen':
        // Fire 5-bolt spread burst
        this.fireSpreadVolley(spec, 5, 0.085);
        break;
      case 'king':
        this.duelPlayerHp = Math.min(this.duelPlayerMaxHp, this.duelPlayerHp + 45);
        this.duelAbilityActiveTimer = 2.5;
        break;
    }
    this.emitDuelHud();
  }

  private fireSpreadVolley(
    spec: (typeof CLASS_SPECS)[PieceType],
    count: number,
    arcSpread: number,
  ): void {
    this.audio.playWeaponFire('queen');
    this.weaponRecoil = 1.0;
    this.muzzleFlashTimer = 0.07;

    this.camera.getWorldDirection(_v1);
    const originX = this.camera.position.x;
    const originY = this.camera.position.y - 0.06;
    const originZ = this.camera.position.z;

    for (let i = 0; i < count; i++) {
      const yawOff = (i - (count - 1) / 2) * (arcSpread / count);
      _v2.copy(_v1);
      _v2.applyAxisAngle(_v3.set(0, 1, 0), yawOff).normalize();
      this.spawnProjectile(
        true,
        originX,
        originY,
        originZ,
        _v2.x,
        _v2.y,
        _v2.z,
        spec.projectileSpeed,
        spec.damage * 1.1,
        0xe11d48,
      );
    }
  }

  private attemptPlayerFire(): void {
    if (!this.duelConfig || this.duelOutcomeWon !== null) return;
    if (this.duelFireCooldown > 0 || this.duelReloadTimer > 0) return;

    const playerPiece = this.duelConfig.isPlayerAttacker
      ? this.duelConfig.attacker
      : this.duelConfig.defender;
    const spec = CLASS_SPECS[playerPiece.type];

    if (this.duelAmmo <= 0) {
      this.triggerReload();
      return;
    }

    this.duelAmmo--;
    this.duelFireCooldown = spec.fireInterval;
    this.duelShotsFired++;
    this.weaponRecoil = 1.0;
    this.muzzleFlashTimer = 0.065;
    this.duelTrauma = Math.min(0.45, this.duelTrauma + 0.12);
    this.audio.playWeaponFire(playerPiece.type);

    if (this.duelAmmo === 0) {
      this.duelReloadTimer = spec.reloadTime;
    }
    this.emitDuelHud();

    this.camera.getWorldDirection(_v1);
    const ox = this.camera.position.x;
    const oy = this.camera.position.y - 0.04;
    const oz = this.camera.position.z;

    const accentHex = parseInt(spec.accentHex.slice(1), 16);

    for (let p = 0; p < spec.pellets; p++) {
      const sx = (Math.random() - 0.5) * spec.spreadRad * 2;
      const sy = (Math.random() - 0.5) * spec.spreadRad * 2;
      _v2.set(_v1.x + sx, _v1.y + sy, _v1.z).normalize();

      if (spec.projectileSpeed === 0) {
        // Instant hitscan railgun beam
        const obDist = raycastObstacles(
          ox,
          oy,
          oz,
          _v2.x,
          _v2.y,
          _v2.z,
          spec.range,
          ARENA_OBSTACLES,
        );
        const actorHit = raycastActorHitbox(
          ox,
          oy,
          oz,
          _v2.x,
          _v2.y,
          _v2.z,
          this.enemyPos.x,
          this.enemyPos.y,
          this.enemyPos.z,
          PLAYER_RADIUS * 1.15,
          PLAYER_HEIGHT * DUEL_ENEMY_SCALE,
          obDist,
        );

        const endDist = actorHit.hit ? actorHit.distance : obDist;
        _v3.set(ox + _v2.x * endDist, oy + _v2.y * endDist, oz + _v2.z * endDist);
        this.showBeam(
          _v1.set(ox + _v2.x * 0.5, oy - 0.08, oz + _v2.z * 0.5),
          _v3,
          accentHex,
        );

        if (actorHit.hit) {
          const dmg = Math.round(spec.damage * (actorHit.headshot ? 1.45 : 1));
          this.applyDamageToEnemy(dmg, actorHit.headshot, _v3);
        } else {
          this.spawnParticleBurst(_v3, 0xcbd5e1, 5);
        }
      } else {
        this.spawnProjectile(
          true,
          ox + _v2.x * 0.45,
          oy,
          oz + _v2.z * 0.45,
          _v2.x,
          _v2.y,
          _v2.z,
          spec.projectileSpeed,
          spec.damage,
          accentHex,
        );
      }
    }
  }

  private showBeam(start: THREE.Vector3, end: THREE.Vector3, hex: number): void {
    const dist = start.distanceTo(end);
    this.beamLine.position.copy(start).lerp(end, 0.5);
    this.beamLine.scale.set(1, 1, Math.max(0.1, dist));
    this.beamLine.lookAt(end);
    (this.beamLine.material as THREE.MeshBasicMaterial).color.setHex(hex);
    this.beamLine.visible = true;
    this.beamTimer = 0.11;
  }

  private spawnProjectile(
    fromPlayer: boolean,
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    speed: number,
    damage: number,
    colorHex: number,
  ): void {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.fromPlayer = fromPlayer;
    slot.pos.set(x, y, z);
    slot.vel.set(dx * speed, dy * speed, dz * speed);
    slot.damage = damage;
    slot.life = 1.6;
    slot.color = colorHex;
    (slot.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
    slot.mesh.position.copy(slot.pos);
    slot.mesh.visible = true;
  }

  private spawnParticleBurst(
    origin: THREE.Vector3,
    hex: number,
    count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particles.length;
      slot.active = true;
      slot.pos.copy(origin);
      slot.vel.set(
        (Math.random() - 0.5) * 9,
        Math.random() * 6 + 1.5,
        (Math.random() - 0.5) * 9,
      );
      slot.maxLife = 0.35 + Math.random() * 0.25;
      slot.life = slot.maxLife;
      slot.size = 0.7 + Math.random() * 0.8;
      slot.color.setHex(hex);
    }
  }

  private applyDamageToEnemy(
    amount: number,
    crit: boolean,
    hitPoint: THREE.Vector3,
  ): void {
    if (this.duelOutcomeWon !== null) return;
    const dmg = this.enemyShieldTimer > 0 ? Math.round(amount * 0.45) : amount;
    this.enemyHp = Math.max(0, this.enemyHp - dmg);
    this.duelShotsHit++;
    this.duelHitMarkerTimer = 0.16;
    this.duelLastHitCrit = crit;
    this.enemyHitFlashTimer = 0.065;
    this.audio.playHitMarker(crit);
    this.spawnParticleBurst(hitPoint, crit ? 0xfbbf24 : 0x38bdf8, crit ? 14 : 8);

    if (dmg >= 35 || this.enemyHp <= 0) {
      this.hitstopTimer = this.enemyHp <= 0 ? 0.07 : 0.035;
    }

    if (this.enemyHp <= 0) {
      this.duelOutcomeWon = true;
      this.duelEndTimer = 0.9;
      this.duelBannerText = 'DUEL VICTORY';
      this.duelBannerTimer = 1.5;
      this.spawnParticleBurst(
        _v1.set(this.enemyPos.x, 1.3, this.enemyPos.z),
        0xd4a853,
        28,
      );
      this.audio.playVictory();
    }
    this.emitDuelHud();
  }

  private applyDamageToPlayer(amount: number): void {
    if (this.duelOutcomeWon !== null) return;
    const isRookShield =
      this.duelAbilityActiveTimer > 0 &&
      this.duelConfig &&
      (this.duelConfig.isPlayerAttacker
        ? this.duelConfig.attacker.type
        : this.duelConfig.defender.type) === 'rook';

    const dmg = isRookShield ? Math.round(amount * 0.45) : amount;
    this.duelPlayerHp = Math.max(0, this.duelPlayerHp - dmg);
    this.duelTrauma = Math.min(0.85, this.duelTrauma + 0.35);
    this.audio.playPlayerHurt();

    if (this.duelPlayerHp <= 0) {
      this.duelOutcomeWon = false;
      this.duelEndTimer = 0.9;
      this.duelBannerText = 'PIECE SHATTERED';
      this.duelBannerTimer = 1.5;
      this.audio.playDefeat();
    }
    this.emitDuelHud();
  }

  private updateDuel(rawDt: number): void {
    if (!this.duelConfig) return;

    // Real-dt visual timers tick even during hitstop
    if (this.duelHitMarkerTimer > 0) this.duelHitMarkerTimer -= rawDt;
    if (this.duelBannerTimer > 0) {
      this.duelBannerTimer -= rawDt;
      if (this.duelBannerTimer <= 0) this.duelBannerText = null;
    }
    if (this.enemyHitFlashTimer > 0) this.enemyHitFlashTimer -= rawDt;
    if (this.beamTimer > 0) {
      this.beamTimer -= rawDt;
      if (this.beamTimer <= 0) this.beamLine.visible = false;
    }
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= rawDt;
      this.muzzleFlashMesh.visible = this.muzzleFlashTimer > 0;
      this.muzzleLight.intensity = this.muzzleFlashTimer > 0 ? 4.5 : 0;
    }
    this.duelTrauma = Math.max(0, this.duelTrauma - rawDt * 1.8);
    this.weaponRecoil = THREE.MathUtils.damp(this.weaponRecoil, 0, 14, rawDt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= rawDt;
      return;
    }

    const dt = this.duelOutcomeWon !== null ? rawDt * 0.35 : rawDt;

    // End beat countdown
    if (this.duelOutcomeWon !== null) {
      this.duelEndTimer -= rawDt;
      if (this.enemyGroup && this.duelOutcomeWon) {
        this.enemyKoAngle = Math.min(Math.PI / 2, this.enemyKoAngle + rawDt * 3.8);
        this.enemyGroup.rotation.x = this.enemyKoAngle;
      }
      if (this.duelEndTimer <= 0) {
        const won = this.duelOutcomeWon;
        const stats = {
          shotsFired: this.duelShotsFired,
          shotsHit: this.duelShotsHit,
        };
        this.duelOutcomeWon = null;
        this.callbacks.onDuelComplete(won, stats);
        return;
      }
    }

    const playerPiece = this.duelConfig.isPlayerAttacker
      ? this.duelConfig.attacker
      : this.duelConfig.defender;
    const enemyPiece = this.duelConfig.isPlayerAttacker
      ? this.duelConfig.defender
      : this.duelConfig.attacker;
    const pSpec = CLASS_SPECS[playerPiece.type];
    const eSpec = CLASS_SPECS[enemyPiece.type];

    // Keyboard turn fallback (ArrowLeft / ArrowRight)
    if (this.keys.has('ArrowLeft')) this.duelYaw += 2.1 * dt;
    if (this.keys.has('ArrowRight')) this.duelYaw -= 2.1 * dt;

    // Player movement
    const fwdInput =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const strafeInput =
      (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);

    const fwdX = -Math.sin(this.duelYaw);
    const fwdZ = -Math.cos(this.duelYaw);
    const rightX = Math.cos(this.duelYaw);
    const rightZ = -Math.sin(this.duelYaw);

    let moveX = fwdX * fwdInput + rightX * strafeInput;
    let moveZ = fwdZ * fwdInput + rightZ * strafeInput;
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 1e-4) {
      moveX /= moveLen;
      moveZ /= moveLen;
    }

    const sprintMult =
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1.24 : 1.0;
    const kingBoost =
      playerPiece.type === 'king' && this.duelAbilityActiveTimer > 0 ? 1.3 : 1.0;
    const targetSpeed = pSpec.moveSpeed * sprintMult * kingBoost;

    this.duelPlayerVel.x = THREE.MathUtils.damp(
      this.duelPlayerVel.x,
      moveX * targetSpeed,
      12,
      dt,
    );
    this.duelPlayerVel.z = THREE.MathUtils.damp(
      this.duelPlayerVel.z,
      moveZ * targetSpeed,
      12,
      dt,
    );
    this.duelPlayerVel.y -= GRAVITY * dt;

    this.duelPlayerPos.x += this.duelPlayerVel.x * dt;
    this.duelPlayerPos.z += this.duelPlayerVel.z * dt;
    this.duelPlayerPos.y += this.duelPlayerVel.y * dt;

    if (this.duelPlayerPos.y <= 0) {
      this.duelPlayerPos.y = 0;
      this.duelPlayerVel.y = 0;
      this.duelPlayerGrounded = true;
    }

    const resolved = resolveCircleAabbCollision(
      this.duelPlayerPos.x,
      this.duelPlayerPos.z,
      PLAYER_RADIUS,
      ARENA_OBSTACLES,
      ARENA_HALF_SIZE,
    );
    this.duelPlayerPos.x = resolved.x;
    this.duelPlayerPos.z = resolved.z;

    // Weapon timers
    if (this.duelFireCooldown > 0) this.duelFireCooldown -= dt;
    if (this.duelAbilityCooldown > 0) {
      this.duelAbilityCooldown = Math.max(0, this.duelAbilityCooldown - dt);
    }
    if (this.duelAbilityActiveTimer > 0) {
      this.duelAbilityActiveTimer = Math.max(0, this.duelAbilityActiveTimer - dt);
    }
    if (this.duelReloadTimer > 0) {
      this.duelReloadTimer -= dt;
      if (this.duelReloadTimer <= 0) {
        this.duelReloadTimer = 0;
        this.duelAmmo = pSpec.magSize;
      }
    }

    if (this.mouseDownLeft && this.duelOutcomeWon === null) {
      this.attemptPlayerFire();
    }

    // Camera & viewmodel sync
    const horizSpeed = Math.hypot(this.duelPlayerVel.x, this.duelPlayerVel.z);
    if (this.duelPlayerGrounded && horizSpeed > 0.5) {
      this.walkBobPhase += horizSpeed * dt * 1.45;
    }
    const bobY = Math.sin(this.walkBobPhase) * 0.035;
    const shake = this.duelTrauma * this.duelTrauma * 0.055;

    this.camera.position.set(
      this.duelPlayerPos.x + (Math.random() - 0.5) * shake,
      this.duelPlayerPos.y + EYE_HEIGHT + bobY + (Math.random() - 0.5) * shake,
      this.duelPlayerPos.z,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      this.duelPitch + this.weaponRecoil * 0.025,
      this.duelYaw,
      (Math.random() - 0.5) * shake * 0.8,
    );

    const reloadDip = this.duelReloadTimer > 0 ? -0.18 : 0;
    this.viewModelAnchor.position.set(
      0.32 + Math.cos(this.walkBobPhase * 0.5) * 0.012,
      -0.26 + Math.sin(this.walkBobPhase) * 0.01 + reloadDip,
      -0.56 + this.weaponRecoil * 0.08,
    );
    this.viewModelAnchor.rotation.x =
      this.weaponRecoil * 0.18 + (this.duelReloadTimer > 0 ? -0.45 : 0);

    // Update Enemy AI
    if (this.duelOutcomeWon === null) {
      this.updateDuelEnemyAI(dt, eSpec);
    }

    // Update Projectiles
    this.updateProjectiles(dt);

    // Emit HUD at ~10Hz
    this.hudEmitAccum += rawDt;
    if (this.hudEmitAccum >= 0.09) {
      this.hudEmitAccum = 0;
      this.emitDuelHud();
    }
  }

  private updateDuelEnemyAI(
    dt: number,
    eSpec: (typeof CLASS_SPECS)[PieceType],
  ): void {
    const toPlayerX = this.duelPlayerPos.x - this.enemyPos.x;
    const toPlayerZ = this.duelPlayerPos.z - this.enemyPos.z;
    const dist = Math.max(0.01, Math.hypot(toPlayerX, toPlayerZ));
    const dirX = toPlayerX / dist;
    const dirZ = toPlayerZ / dist;

    // Face player
    if (this.enemyGroup) {
      this.enemyGroup.rotation.y = Math.atan2(dirX, dirZ);
      // Hit flash visual feedback
      const flash = this.enemyHitFlashTimer > 0;
      this.enemyGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat && mat.emissive && mat.emissiveIntensity < 1.0) {
            mat.emissive.setHex(flash ? 0xffffff : 0x000000);
            mat.emissiveIntensity = flash ? 0.65 : 0;
          }
        }
      });
    }

    this.enemyStrafeSwitchTimer -= dt;
    if (this.enemyStrafeSwitchTimer <= 0) {
      this.enemyStrafeDir *= -1;
      this.enemyStrafeSwitchTimer = 1.2 + Math.random() * 1.4;
    }

    // Distinct AI movement policies
    let desiredForward = 0;
    if (eSpec.aiPolicy === 'kiter') {
      desiredForward = dist < 11 ? -0.9 : dist > 18 ? 0.7 : 0;
    } else if (eSpec.aiPolicy === 'brawler') {
      desiredForward = dist > 7.5 ? 1.0 : dist < 4.5 ? -0.5 : 0.15;
    } else {
      // skirmisher
      desiredForward = dist > 12 ? 0.85 : dist < 6 ? -0.6 : 0.2;
    }

    const strafeX = -dirZ * this.enemyStrafeDir;
    const strafeZ = dirX * this.enemyStrafeDir;
    const diffSpeedMult =
      this.difficulty === 'recruit'
        ? 0.72
        : this.difficulty === 'tactician'
          ? 0.92
          : 1.08;

    const moveX = (dirX * desiredForward + strafeX * 0.95) * eSpec.moveSpeed * diffSpeedMult;
    const moveZ = (dirZ * desiredForward + strafeZ * 0.95) * eSpec.moveSpeed * diffSpeedMult;

    this.enemyPos.x += moveX * dt;
    this.enemyPos.z += moveZ * dt;
    const eResolved = resolveCircleAabbCollision(
      this.enemyPos.x,
      this.enemyPos.z,
      PLAYER_RADIUS * 1.15,
      ARENA_OBSTACLES,
      ARENA_HALF_SIZE,
    );
    this.enemyPos.x = eResolved.x;
    this.enemyPos.z = eResolved.z;
    if (this.enemyGroup) {
      this.enemyGroup.position.set(this.enemyPos.x, 0, this.enemyPos.z);
    }

    // Enemy ability usage
    if (this.enemyShieldTimer > 0) this.enemyShieldTimer -= dt;
    if (this.enemyAbilityCooldown > 0) this.enemyAbilityCooldown -= dt;
    if (this.enemyAbilityCooldown <= 0 && this.enemyHp < this.enemyMaxHp * 0.65) {
      this.enemyAbilityCooldown = 7.0;
      if (eSpec.type === 'rook') {
        this.enemyShieldTimer = 2.5;
      } else if (eSpec.type === 'king') {
        this.enemyHp = Math.min(this.enemyMaxHp, this.enemyHp + 35);
      }
    }

    // Line-of-sight & telegraphed firing
    const eyeY = 1.65;
    const los = hasLineOfSight(
      this.enemyPos.x,
      eyeY,
      this.enemyPos.z,
      this.duelPlayerPos.x,
      this.duelPlayerPos.y + EYE_HEIGHT * 0.85,
      this.duelPlayerPos.z,
      ARENA_OBSTACLES,
    );

    if (this.enemyTelegraphActive) {
      this.enemyTelegraphTimer -= dt;
      // Update telegraph beam
      _v1.set(this.enemyPos.x, eyeY, this.enemyPos.z);
      _v2.set(
        this.duelPlayerPos.x,
        this.duelPlayerPos.y + EYE_HEIGHT * 0.82,
        this.duelPlayerPos.z,
      );
      const beamDist = _v1.distanceTo(_v2);
      this.enemyTelegraphLine.position.copy(_v1).lerp(_v2, 0.5);
      this.enemyTelegraphLine.scale.set(1, 1, Math.max(0.1, beamDist));
      this.enemyTelegraphLine.lookAt(_v2);
      this.enemyTelegraphLine.visible = true;

      if (this.enemyTelegraphTimer <= 0) {
        this.enemyTelegraphActive = false;
        this.enemyTelegraphLine.visible = false;
        this.fireEnemyWeapon(eSpec);
      }
      return;
    }

    this.enemyTelegraphLine.visible = false;
    this.enemyFireCooldown -= dt;

    if (this.enemyFireCooldown <= 0 && los) {
      const fireCadenceMult =
        this.difficulty === 'recruit'
          ? 1.65
          : this.difficulty === 'tactician'
            ? 1.25
            : 0.98;
      this.enemyFireCooldown =
        Math.max(0.32, eSpec.fireInterval * 1.45) * fireCadenceMult;

      // Telegraph heavy/high-damage shots (> 10% player HP)
      if (eSpec.damage >= 18 || eSpec.pellets > 1) {
        this.enemyTelegraphActive = true;
        this.enemyTelegraphTimer = 0.36;
        this.audio.playTelegraph();
      } else {
        this.fireEnemyWeapon(eSpec);
      }
    }
  }

  private fireEnemyWeapon(eSpec: (typeof CLASS_SPECS)[PieceType]): void {
    this.audio.playWeaponFire(eSpec.type, true);
    const ox = this.enemyPos.x;
    const oy = 1.65;
    const oz = this.enemyPos.z;

    const tx = this.duelPlayerPos.x;
    const ty = this.duelPlayerPos.y + EYE_HEIGHT * 0.85;
    const tz = this.duelPlayerPos.z;

    const baseDx = tx - ox;
    const baseDy = ty - oy;
    const baseDz = tz - oz;
    const len = Math.max(0.01, Math.hypot(baseDx, baseDy, baseDz));

    const inaccuracy =
      this.difficulty === 'recruit'
        ? 0.085
        : this.difficulty === 'tactician'
          ? 0.045
          : 0.02;

    const accentHex = parseInt(eSpec.accentHex.slice(1), 16);
    const dmgScale =
      this.difficulty === 'recruit'
        ? 0.72
        : this.difficulty === 'tactician'
          ? 0.9
          : 1.05;

    for (let p = 0; p < eSpec.pellets; p++) {
      const sx = (Math.random() - 0.5) * (inaccuracy + eSpec.spreadRad);
      const sy = (Math.random() - 0.5) * (inaccuracy + eSpec.spreadRad) * 0.6;
      const sz = (Math.random() - 0.5) * (inaccuracy + eSpec.spreadRad);
      _v2.set(baseDx / len + sx, baseDy / len + sy, baseDz / len + sz).normalize();

      const speed = eSpec.projectileSpeed === 0 ? 78 : eSpec.projectileSpeed * 0.78;
      this.spawnProjectile(
        false,
        ox + _v2.x * 0.7,
        oy,
        oz + _v2.z * 0.7,
        _v2.x,
        _v2.y,
        _v2.z,
        speed,
        Math.round(eSpec.damage * dmgScale),
        accentHex,
      );
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      const stepDist = p.vel.length() * dt;
      if (stepDist < 1e-5) continue;
      _v1.copy(p.vel).divideScalar(p.vel.length());

      const obDist = raycastObstacles(
        p.pos.x,
        p.pos.y,
        p.pos.z,
        _v1.x,
        _v1.y,
        _v1.z,
        stepDist,
        ARENA_OBSTACLES,
      );

      if (p.fromPlayer) {
        const hit = raycastActorHitbox(
          p.pos.x,
          p.pos.y,
          p.pos.z,
          _v1.x,
          _v1.y,
          _v1.z,
          this.enemyPos.x,
          this.enemyPos.y,
          this.enemyPos.z,
          PLAYER_RADIUS * 1.18,
          PLAYER_HEIGHT * DUEL_ENEMY_SCALE,
          obDist,
        );
        if (hit.hit) {
          _v2.copy(p.pos).addScaledVector(_v1, hit.distance);
          const dmg = Math.round(p.damage * (hit.headshot ? 1.35 : 1));
          this.applyDamageToEnemy(dmg, hit.headshot, _v2);
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
      } else {
        const hit = raycastActorHitbox(
          p.pos.x,
          p.pos.y,
          p.pos.z,
          _v1.x,
          _v1.y,
          _v1.z,
          this.duelPlayerPos.x,
          this.duelPlayerPos.y,
          this.duelPlayerPos.z,
          PLAYER_RADIUS,
          PLAYER_HEIGHT,
          obDist,
        );
        if (hit.hit) {
          this.applyDamageToPlayer(p.damage);
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
      }

      if (obDist < stepDist) {
        _v2.copy(p.pos).addScaledVector(_v1, obDist);
        this.spawnParticleBurst(_v2, p.color, 4);
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      p.pos.addScaledVector(p.vel, dt);
      if (
        Math.abs(p.pos.x) > ARENA_HALF_SIZE + 2 ||
        Math.abs(p.pos.z) > ARENA_HALF_SIZE + 2
      ) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.copy(p.pos);
    }
  }

  private updateParticles(dt: number): void {
    let dirty = false;
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active) continue;
      dirty = true;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      pt.vel.y -= 14 * dt;
      pt.pos.addScaledVector(pt.vel, dt);
      if (pt.pos.y < 0.05) {
        pt.pos.y = 0.05;
        pt.vel.y *= -0.4;
      }
      const s = pt.size * (pt.life / pt.maxLife);
      _scale.set(s, s, s);
      _mat4.compose(pt.pos, _quat.identity(), _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, pt.color);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private emitDuelHud(): void {
    if (!this.duelConfig) return;
    const playerPiece = this.duelConfig.isPlayerAttacker
      ? this.duelConfig.attacker
      : this.duelConfig.defender;
    const enemyPiece = this.duelConfig.isPlayerAttacker
      ? this.duelConfig.defender
      : this.duelConfig.attacker;
    const pSpec = CLASS_SPECS[playerPiece.type];

    this.callbacks.onDuelHudUpdate({
      playerType: playerPiece.type,
      playerColor: playerPiece.color,
      playerHp: Math.round(this.duelPlayerHp),
      playerMaxHp: this.duelPlayerMaxHp,
      enemyType: enemyPiece.type,
      enemyColor: enemyPiece.color,
      enemyHp: Math.round(this.enemyHp),
      enemyMaxHp: this.enemyMaxHp,
      ammo: this.duelAmmo,
      magSize: pSpec.magSize,
      isReloading: this.duelReloadTimer > 0,
      reloadProgress:
        this.duelReloadTimer > 0
          ? 1 - this.duelReloadTimer / pSpec.reloadTime
          : 1,
      abilityCooldownRemaining: this.duelAbilityCooldown,
      abilityCooldownTotal: pSpec.abilityCooldown,
      abilityActive: this.duelAbilityActiveTimer > 0,
      pointerLocked: this.pointerLocked,
      hitMarkerTimer: this.duelHitMarkerTimer,
      lastHitCrit: this.duelLastHitCrit,
      enemyTelegraphing: this.enemyTelegraphActive,
      duelBanner: this.duelBannerText,
    });
  }

  private loop = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    // Animate cover monoliths smoothly up in duel, retracted on board
    const targetRaise = this.playPhase === 'duel' ? 1 : 0;
    this.obstaclesRaise = THREE.MathUtils.damp(
      this.obstaclesRaise,
      targetRaise,
      7.5,
      rawDt,
    );
    for (let i = 0; i < this.obstacleMeshes.length; i++) {
      const ob = ARENA_OBSTACLES[i];
      const y = THREE.MathUtils.lerp(-ob.height - 0.35, 0, this.obstaclesRaise);
      this.obstacleMeshes[i].mesh.position.y = y;
    }

    // Update particles always
    this.updateParticles(rawDt);

    if (this.appState === 'title') {
      // Live Title Screen Camera Tour around the Chessboard
      this.titleOrbitAngle += rawDt * 0.16;
      const radius = 29;
      const targetX =
        Math.sin(this.titleOrbitAngle) * radius + this.pointerParallax.x * 2.2;
      const targetZ =
        Math.cos(this.titleOrbitAngle) * radius + this.pointerParallax.y * 1.5;
      const targetY = 16.5 + Math.sin(this.titleOrbitAngle * 0.7) * 1.4;

      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, targetX, 4, rawDt);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, targetY, 4, rawDt);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, targetZ, 4, rawDt);
      this.camLook.set(0, 1.2, 0);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    } else if (this.appState === 'playing') {
      if (this.playPhase === 'board') {
        // Smooth piece positions
        for (const vis of this.pieceVisuals.values()) {
          vis.group.position.x = THREE.MathUtils.damp(
            vis.group.position.x,
            vis.targetPos.x,
            12,
            rawDt,
          );
          vis.group.position.z = THREE.MathUtils.damp(
            vis.group.position.z,
            vis.targetPos.z,
            12,
            rawDt,
          );
        }
        const zTarget = this.boardFlipped ? -24.5 : 24.5;
        const zLook = this.boardFlipped ? -1.5 : 1.5;
        this.camPos.x = THREE.MathUtils.damp(
          this.camPos.x,
          this.pointerParallax.x * 1.4,
          6,
          rawDt,
        );
        this.camPos.y = THREE.MathUtils.damp(this.camPos.y, 26.5, 6, rawDt);
        this.camPos.z = THREE.MathUtils.damp(this.camPos.z, zTarget, 6, rawDt);
        this.camLook.x = THREE.MathUtils.damp(this.camLook.x, 0, 6, rawDt);
        this.camLook.y = THREE.MathUtils.damp(this.camLook.y, 0, 6, rawDt);
        this.camLook.z = THREE.MathUtils.damp(this.camLook.z, zLook, 6, rawDt);
        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);
      } else if (this.playPhase === 'duel') {
        this.updateDuel(rawDt);
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.loop);
    } else {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || !gl.fenceSync) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();

    this.textures.dispose();
    this.palette.whiteBody.dispose();
    this.palette.blackBody.dispose();
    this.palette.whiteTrim.dispose();
    this.palette.blackTrim.dispose();
    this.palette.shadowPlaneGeo.dispose();
    this.palette.shadowMat.dispose();
    for (const d of this.extraDisposables) {
      d.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mountEl) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
