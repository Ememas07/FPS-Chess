import * as THREE from 'three';

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export interface ProceduralTextureSet {
  ivoryMarbleMap: THREE.CanvasTexture;
  obsidianMarbleMap: THREE.CanvasTexture;
  stoneBumpMap: THREE.CanvasTexture;
  hallFloorMap: THREE.CanvasTexture;
  brushedMetalRoughness: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(
  maxAnisotropy: number,
): ProceduralTextureSet {
  const size = 256;

  // 1. Ivory Marble
  const [ivoryCanvas, ivoryCtx] = createCanvas(size);
  ivoryCtx.fillStyle = '#ebe4d6';
  ivoryCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < 14; i++) {
    ivoryCtx.strokeStyle =
      i % 2 === 0 ? 'rgba(182, 168, 146, 0.28)' : 'rgba(255, 252, 245, 0.35)';
    ivoryCtx.lineWidth = 1 + (i % 3);
    ivoryCtx.beginPath();
    let x = (i * 37) % size;
    let y = 0;
    ivoryCtx.moveTo(x, y);
    for (let step = 0; step < 8; step++) {
      x += Math.sin(step * 1.4 + i) * 26;
      y += size / 8;
      ivoryCtx.lineTo(x, y);
    }
    ivoryCtx.stroke();
  }
  const ivoryMarbleMap = new THREE.CanvasTexture(ivoryCanvas);
  ivoryMarbleMap.colorSpace = THREE.SRGBColorSpace;
  ivoryMarbleMap.wrapS = ivoryMarbleMap.wrapT = THREE.RepeatWrapping;
  ivoryMarbleMap.anisotropy = maxAnisotropy;

  // 2. Obsidian Marble
  const [obsCanvas, obsCtx] = createCanvas(size);
  obsCtx.fillStyle = '#1b1f29';
  obsCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < 16; i++) {
    obsCtx.strokeStyle =
      i % 3 === 0 ? 'rgba(212, 168, 83, 0.16)' : 'rgba(65, 76, 98, 0.32)';
    obsCtx.lineWidth = 1 + (i % 2);
    obsCtx.beginPath();
    let x = (i * 43) % size;
    let y = 0;
    obsCtx.moveTo(x, y);
    for (let step = 0; step < 8; step++) {
      x += Math.cos(step * 1.3 + i) * 24;
      y += size / 8;
      obsCtx.lineTo(x, y);
    }
    obsCtx.stroke();
  }
  const obsidianMarbleMap = new THREE.CanvasTexture(obsCanvas);
  obsidianMarbleMap.colorSpace = THREE.SRGBColorSpace;
  obsidianMarbleMap.wrapS = obsidianMarbleMap.wrapT = THREE.RepeatWrapping;
  obsidianMarbleMap.anisotropy = maxAnisotropy;

  // 3. Stone micro-bump (linear space)
  const [bumpCanvas, bumpCtx] = createCanvas(size);
  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < 650; i++) {
    const shade = 110 + ((i * 29) % 36);
    bumpCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    bumpCtx.fillRect(x, y, 2, 2);
  }
  const stoneBumpMap = new THREE.CanvasTexture(bumpCanvas);
  stoneBumpMap.wrapS = stoneBumpMap.wrapT = THREE.RepeatWrapping;
  stoneBumpMap.anisotropy = maxAnisotropy;

  // 4. Surrounding Hall Travertine/Slate Grid Floor
  const [hallCanvas, hallCtx] = createCanvas(size);
  hallCtx.fillStyle = '#252934';
  hallCtx.fillRect(0, 0, size, size);
  hallCtx.strokeStyle = '#181b24';
  hallCtx.lineWidth = 3;
  hallCtx.strokeRect(1.5, 1.5, size - 3, size - 3);
  hallCtx.strokeStyle = 'rgba(212, 168, 83, 0.08)';
  hallCtx.lineWidth = 1;
  hallCtx.strokeRect(10, 10, size - 20, size - 20);
  const hallFloorMap = new THREE.CanvasTexture(hallCanvas);
  hallFloorMap.colorSpace = THREE.SRGBColorSpace;
  hallFloorMap.wrapS = hallFloorMap.wrapT = THREE.RepeatWrapping;
  hallFloorMap.repeat.set(16, 16);
  hallFloorMap.anisotropy = maxAnisotropy;

  // 5. Brushed metal roughness map (linear)
  const [metalCanvas, metalCtx] = createCanvas(128);
  metalCtx.fillStyle = '#555555';
  metalCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    const v = 70 + ((y * 17) % 30);
    metalCtx.fillStyle = `rgb(${v},${v},${v})`;
    metalCtx.fillRect(0, y, 128, 1);
  }
  const brushedMetalRoughness = new THREE.CanvasTexture(metalCanvas);
  brushedMetalRoughness.wrapS = brushedMetalRoughness.wrapT = THREE.RepeatWrapping;

  // 6. Soft Radial Contact Shadow
  const [shadCanvas, shadCtx] = createCanvas(128);
  const grad = shadCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shadCtx.fillStyle = grad;
  shadCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  return {
    ivoryMarbleMap,
    obsidianMarbleMap,
    stoneBumpMap,
    hallFloorMap,
    brushedMetalRoughness,
    contactShadowMap,
    dispose: () => {
      ivoryMarbleMap.dispose();
      obsidianMarbleMap.dispose();
      stoneBumpMap.dispose();
      hallFloorMap.dispose();
      brushedMetalRoughness.dispose();
      contactShadowMap.dispose();
    },
  };
}
