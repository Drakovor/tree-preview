import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createIcons, Eye, Map, RefreshCw } from "lucide";
import authoredMapUrl from "./assets/moba_quality_chunk.glb?url";

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
const isSmallViewport = Math.min(window.innerWidth, window.innerHeight) < 740;
const qualityProfile = isCoarsePointer || isSmallViewport ? "mobile" : "desktop";
const renderPixelRatio = Math.min(window.devicePixelRatio, qualityProfile === "mobile" ? 1.25 : 1.75);
renderer.setPixelRatio(renderPixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x243036);

const ORTHO_VIEW_SIZE = 46;
const camera = new THREE.OrthographicCamera(
  -ORTHO_VIEW_SIZE / 2,
  ORTHO_VIEW_SIZE / 2,
  ORTHO_VIEW_SIZE / 2,
  -ORTHO_VIEW_SIZE / 2,
  0.1,
  160,
);
camera.position.set(34, 33, 40);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 18;
controls.maxDistance = 64;
controls.minZoom = 1.0;
controls.maxZoom = 2.35;
controls.maxPolarAngle = Math.PI * 0.43;
controls.target.set(2, 0, -2);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const ssaoPass = new SSAOPass(scene, camera, 1, 1, 24);
ssaoPass.kernelRadius = qualityProfile === "mobile" ? 3 : 5;
ssaoPass.minDistance = 0.004;
ssaoPass.maxDistance = qualityProfile === "mobile" ? 0.085 : 0.115;
composer.addPass(ssaoPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.34, 0.86);
composer.addPass(bloomPass);

const state = {
  flow: 0.55,
  detail: qualityProfile === "mobile" ? 0.72 : 0.9,
  theme: "dawn",
  showObjectiveFX: true,
  qualityProfile,
  waterShaders: [],
  foliageShaders: [],
  objectiveShaders: [],
  assetLoaded: false,
  authoredMeshCount: 0,
  mapRoot: new THREE.Group(),
};

const GameArtGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.78 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;

    vec3 saturateColor(vec3 color, float amount) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luma), color, amount);
    }

    void main() {
      vec4 inputColor = texture2D(tDiffuse, vUv);
      vec3 color = inputColor.rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float greenMask = smoothstep(0.02, 0.2, color.g - max(color.r, color.b) * 0.82);
      float goldMask = smoothstep(0.03, 0.24, color.r - color.b) * smoothstep(0.0, 0.18, color.g - color.b * 0.78);
      float neutralStone = 1.0 - smoothstep(0.05, 0.18, abs(color.r - color.g) + abs(color.g - color.b));

      color = saturateColor(color, 1.08 + uStrength * 0.18);
      color = mix(color, color * vec3(0.94, 1.05, 0.96), greenMask * 0.18 * uStrength);
      color = mix(color, color * vec3(1.08, 1.02, 0.86), goldMask * 0.14 * uStrength);
      color = mix(color, color * vec3(0.92, 1.0, 0.88), neutralStone * smoothstep(0.22, 0.78, luma) * 0.12 * uStrength);
      color = mix(color * vec3(0.86, 0.93, 1.02), color, smoothstep(0.18, 0.62, luma));
      color += vec3(0.035, 0.028, 0.014) * smoothstep(0.56, 0.96, luma) * uStrength;
      float vignette = smoothstep(0.92, 0.18, distance(vUv, vec2(0.52, 0.52)));
      color *= 0.9 + vignette * 0.12;
      color = pow(max(color, vec3(0.0)), vec3(0.96));
      gl_FragColor = vec4(color, inputColor.a);
    }
  `,
};

const gameArtGradePass = new ShaderPass(GameArtGradeShader);
composer.addPass(gameArtGradePass);
const fxaaPass = new ShaderPass(FXAAShader);
composer.addPass(fxaaPass);
composer.addPass(new OutputPass());

window.__MOBA_DEBUG__ = () => ({
  camera: camera.position.toArray().map((value) => Number(value.toFixed(3))),
  target: controls.target.toArray().map((value) => Number(value.toFixed(3))),
  zoom: Number(camera.zoom.toFixed(3)),
  objects: scene.children.length,
  theme: state.theme,
  flow: state.flow,
  detail: state.detail,
  qualityProfile: state.qualityProfile,
  pixelRatio: renderPixelRatio,
  assetLoaded: state.assetLoaded,
  authoredMeshCount: state.authoredMeshCount,
});

const tmpColor = new THREE.Color();
const tmpVector = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const matrix = new THREE.Matrix4();

const laneMid = [
  [-31, -18],
  [-20, -12],
  [-7, -8],
  [6, -2],
  [17, 7],
  [31, 15],
];
const laneTop = [
  [-31, 8],
  [-23, 15],
  [-12, 17],
  [-3, 14],
  [8, 16],
  [19, 21],
  [30, 23],
];
const laneLower = [
  [-30, -21],
  [-22, -16],
  [-16, -9],
  [-9, -4],
  [-1, -7],
  [7, -13],
  [18, -15],
  [30, -8],
];
const river = [
  [-32, 2],
  [-18, -1],
  [-6, -4],
  [7, -2],
  [19, 2],
  [32, 4],
];
const highWallA = [
  [-26, -4],
  [-17, 2],
  [-7, 3],
  [2, 1],
  [12, 5],
  [25, 12],
];
const highWallB = [
  [-25, -10],
  [-13, -14],
  [0, -14],
  [12, -10],
  [25, -5],
];
const upperJungleArc = [
  [-24, 13],
  [-13, 18],
  [1, 18],
  [15, 20],
  [28, 23],
];
const lowerJungleArc = [
  [-25, -25],
  [-10, -28],
  [6, -27],
  [22, -21],
  [31, -15],
];
const jungleZones = [
  [-21, 16, 9, 4],
  [-2, 20, 10, 4],
  [18, 20, 9, 4],
  [-20, -25, 10, 4],
  [3, -27, 10, 4],
  [24, -18, 7, 4],
  [-19, -1, 5, 3],
  [14, 9, 5, 3],
];
const brushPatchSpecs = [
  [-13, 5.5, 4.4, 1.4, 420],
  [10.5, 8.8, 4.6, 1.5, 420],
  [-9.5, -16.5, 5.0, 1.6, 460],
  [18.8, -10.2, 4.4, 1.5, 390],
  [1.2, 4.4, 2.4, 1.1, 190],
];

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(884233);

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x, z) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, ux), THREE.MathUtils.lerp(c, d, ux), uz);
}

function nearestOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq > 0 ? THREE.MathUtils.clamp((apx * abx + apz * abz) / lenSq, 0, 1) : 0;
  return {
    x: ax + abx * t,
    z: az + abz * t,
    t,
    dist: Math.hypot(px - (ax + abx * t), pz - (az + abz * t)),
    angle: Math.atan2(abz, abx),
  };
}

function distanceToPath(px, pz, points) {
  let best = { dist: Infinity, x: 0, z: 0, t: 0, angle: 0, segment: 0 };
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const hit = nearestOnSegment(px, pz, a[0], a[1], b[0], b[1]);
    if (hit.dist < best.dist) {
      best = { ...hit, segment: i };
    }
  }
  return best;
}

function pathPoint(points, t) {
  const clamped = THREE.MathUtils.clamp(t, 0, 0.9999);
  const scaled = clamped * (points.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = points[index];
  const b = points[index + 1];
  return {
    x: THREE.MathUtils.lerp(a[0], b[0], local),
    z: THREE.MathUtils.lerp(a[1], b[1], local),
    angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}

function terrainInfo(x, z) {
  const mid = distanceToPath(x, z, laneMid);
  const top = distanceToPath(x, z, laneTop);
  const low = distanceToPath(x, z, laneLower);
  const riv = distanceToPath(x, z, river);
  const wallA = distanceToPath(x, z, highWallA);
  const wallB = distanceToPath(x, z, highWallB);
  const upper = distanceToPath(x, z, upperJungleArc);
  const lower = distanceToPath(x, z, lowerJungleArc);
  const laneDist = Math.min(mid.dist, top.dist, low.dist);
  const laneMask = 1 - smoothstep(1.8, 3.8, laneDist);
  const shoulderMask = 1 - smoothstep(4.2, 7.4, laneDist);
  const riverMask = 1 - smoothstep(2.3, 4.7, riv.dist);
  const wallMask = Math.max(
    1 - smoothstep(1.1, 2.6, wallA.dist),
    1 - smoothstep(1.0, 2.4, wallB.dist),
    1 - smoothstep(1.1, 2.6, upper.dist),
    1 - smoothstep(1.1, 2.5, lower.dist),
  );
  const jungleMask = Math.max(1 - smoothstep(6.2, 12.2, upper.dist), 1 - smoothstep(6.2, 12.2, lower.dist));
  const objectiveMask = 1 - smoothstep(5.4, 8.4, Math.hypot(x - 6.5, z - 1.2));
  const n = noise2(x * 0.18, z * 0.18) * 0.5 + noise2(x * 0.48 + 8.0, z * 0.48 - 2.0) * 0.28;
  const height =
    -riverMask * 0.55 -
    laneMask * 0.15 +
    shoulderMask * 0.08 +
    wallMask * 1.25 +
    jungleMask * 0.28 +
    objectiveMask * 0.18 +
    n * 0.38;
  return { laneMask, shoulderMask, riverMask, wallMask, jungleMask, objectiveMask, height, noise: n, laneDist };
}

function colorForTerrain(x, z, info) {
  const grassA = new THREE.Color(0x315c32);
  const grassB = new THREE.Color(0x6d8d4b);
  const jungle = new THREE.Color(0x2a5032);
  const lane = new THREE.Color(0x8f7a55);
  const laneLight = new THREE.Color(0xcbb77c);
  const riverBed = new THREE.Color(0x3f8a88);
  const rock = new THREE.Color(0x727966);
  const objective = new THREE.Color(0x777f67);
  const color = grassA.clone().lerp(grassB, smoothstep(0.15, 0.78, info.noise));
  color.lerp(jungle, info.jungleMask * 0.42);
  color.lerp(lane.clone().lerp(laneLight, 0.25 + info.noise * 0.3), info.laneMask * 0.9);
  color.lerp(riverBed, info.riverMask * 0.82);
  color.lerp(objective, info.objectiveMask * 0.44);
  color.lerp(rock, info.wallMask * 0.78);
  color.offsetHSL(0, 0, (noise2(x * 0.95, z * 0.95) - 0.5) * 0.045);
  return color;
}

function worldToTexturePoint(x, z, textureWidth, textureHeight) {
  return {
    x: ((x + 35) / 70) * textureWidth,
    y: ((27 - z) / 54) * textureHeight,
  };
}

function drawWorldPath(context, points, textureWidth, textureHeight, worldWidth, strokeStyle, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = worldWidth * (textureWidth / 70);
  context.strokeStyle = strokeStyle;
  const first = worldToTexturePoint(points[0][0], points[0][1], textureWidth, textureHeight);
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = worldToTexturePoint(points[i][0], points[i][1], textureWidth, textureHeight);
    const previous = worldToTexturePoint(points[i - 1][0], points[i - 1][1], textureWidth, textureHeight);
    const midX = (previous.x + point.x) * 0.5;
    const midY = (previous.y + point.y) * 0.5;
    context.quadraticCurveTo(previous.x, previous.y, midX, midY);
  }
  const last = worldToTexturePoint(points[points.length - 1][0], points[points.length - 1][1], textureWidth, textureHeight);
  context.lineTo(last.x, last.y);
  context.stroke();
  context.restore();
}

function drawWorldRing(context, x, z, radius, textureWidth, textureHeight, strokeStyle, alpha = 1, worldWidth = 0.18) {
  const center = worldToTexturePoint(x, z, textureWidth, textureHeight);
  const pxRadius = radius * (textureWidth / 70);
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = strokeStyle;
  context.lineWidth = worldWidth * (textureWidth / 70);
  context.beginPath();
  context.ellipse(center.x, center.y, pxRadius, pxRadius * 1.2, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function createPaintedTerrainTexture() {
  const width = 1120;
  const height = 864;
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = width;
  canvasTexture.height = height;
  const context = canvasTexture.getContext("2d");
  const image = context.createImageData(width, height);
  const data = image.data;
  for (let py = 0; py < height; py += 1) {
    const z = THREE.MathUtils.lerp(27, -27, py / (height - 1));
    for (let px = 0; px < width; px += 1) {
      const x = THREE.MathUtils.lerp(-35, 35, px / (width - 1));
      const info = terrainInfo(x, z);
      const color = colorForTerrain(x, z, info);
      const laneEdge = smoothstep(0.28, 0.72, info.shoulderMask) * (1 - info.laneMask);
      const riverEdge = smoothstep(0.18, 0.82, info.riverMask) * (1 - smoothstep(0.75, 1.0, info.riverMask));
      const grain = noise2(x * 1.7 + 4.0, z * 1.7 - 8.0);
      color.offsetHSL(0.0, 0.02 * (grain - 0.5), 0.055 * (grain - 0.5));
      color.lerp(new THREE.Color(0xc9b87f), laneEdge * 0.16);
      color.lerp(new THREE.Color(0xa4edd2), riverEdge * 0.24);
      const index = (py * width + px) * 4;
      data[index] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
      data[index + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
      data[index + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  context.globalCompositeOperation = "multiply";
  [laneMid, laneTop, laneLower].forEach((lane, index) => {
    drawWorldPath(context, lane, width, height, index === 0 ? 7.2 : 6.1, "rgba(54, 39, 23, 1)", 0.18);
    drawWorldPath(context, lane, width, height, index === 0 ? 4.5 : 3.9, "rgba(124, 91, 50, 1)", 0.12);
  });
  drawWorldPath(context, river, width, height, 6.7, "rgba(14, 77, 76, 1)", 0.22);
  [highWallA, highWallB, upperJungleArc, lowerJungleArc].forEach((wall) => {
    drawWorldPath(context, wall, width, height, 3.4, "rgba(18, 30, 23, 1)", 0.18);
  });

  context.globalCompositeOperation = "screen";
  [laneMid, laneTop, laneLower].forEach((lane, index) => {
    drawWorldPath(context, lane, width, height, index === 0 ? 2.5 : 2.1, "rgba(255, 226, 151, 1)", index === 0 ? 0.15 : 0.12);
    drawWorldPath(context, lane, width, height, 0.28, "rgba(255, 244, 182, 1)", 0.22);
  });
  drawWorldPath(context, river, width, height, 0.42, "rgba(160, 255, 219, 1)", 0.35);
  drawWorldRing(context, 6.5, 1.2, 4.4, width, height, "rgba(143, 255, 218, 1)", 0.32, 0.22);
  drawWorldRing(context, -17.5, 14.6, 2.4, width, height, "rgba(125, 201, 255, 1)", 0.18, 0.16);
  drawWorldRing(context, 19.5, -16.2, 2.4, width, height, "rgba(255, 155, 92, 1)", 0.18, 0.16);
  drawWorldRing(context, -1.8, -18.6, 2.2, width, height, "rgba(198, 255, 142, 1)", 0.16, 0.14);
  context.globalCompositeOperation = "source-over";

  const strokeRng = mulberry32(229144);
  context.globalCompositeOperation = "overlay";
  for (let i = 0; i < 3600; i += 1) {
    const x = strokeRng() * width;
    const y = strokeRng() * height;
    const worldX = THREE.MathUtils.lerp(-35, 35, x / width);
    const worldZ = THREE.MathUtils.lerp(27, -27, y / height);
    const info = terrainInfo(worldX, worldZ);
    const length = info.laneMask > 0.4 ? 18 + strokeRng() * 42 : 6 + strokeRng() * 24;
    const alpha = info.riverMask > 0.25 ? 0.04 : info.laneMask > 0.35 ? 0.034 : 0.038;
    context.strokeStyle =
      info.laneMask > 0.35
        ? `rgba(229, 210, 154, ${alpha})`
        : info.riverMask > 0.25
          ? `rgba(174, 255, 222, ${alpha})`
          : `rgba(210, 241, 155, ${alpha})`;
    context.lineWidth = 1 + strokeRng() * 2.5;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(strokeRng() * Math.PI * 2) * length, y + Math.sin(strokeRng() * Math.PI * 2) * length * 0.45);
    context.stroke();
  }
  context.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createTerrainMicroReliefTexture() {
  const width = 640;
  const height = 480;
  const reliefCanvas = document.createElement("canvas");
  reliefCanvas.width = width;
  reliefCanvas.height = height;
  const context = reliefCanvas.getContext("2d");
  const image = context.createImageData(width, height);
  const data = image.data;
  for (let py = 0; py < height; py += 1) {
    const z = THREE.MathUtils.lerp(27, -27, py / (height - 1));
    for (let px = 0; px < width; px += 1) {
      const x = THREE.MathUtils.lerp(-35, 35, px / (width - 1));
      const info = terrainInfo(x, z);
      const stoneGrain = noise2(x * 2.6 + 11.0, z * 2.6 - 5.0);
      const fineGrain = noise2(x * 8.0 - 3.0, z * 8.0 + 4.0);
      const laneRuts = Math.abs(Math.sin((x * 0.32 + z * 0.52) * 5.2));
      const cliffStrata = Math.abs(Math.sin((x * 0.42 - z * 0.28) * 8.5));
      let value = 0.48 + stoneGrain * 0.14 + fineGrain * 0.08;
      value += info.laneMask * (0.1 - laneRuts * 0.18);
      value += info.wallMask * (0.18 + cliffStrata * 0.16);
      value -= info.riverMask * 0.22;
      value += info.jungleMask * (noise2(x * 5.2, z * 5.2) - 0.5) * 0.1;
      const shade = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
      const index = (py * width + px) * 4;
      data[index] = shade;
      data[index + 1] = shade;
      data[index + 2] = shade;
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const strokeRng = mulberry32(771113);
  context.globalCompositeOperation = "overlay";
  context.strokeStyle = "rgba(255,255,255,0.24)";
  for (let i = 0; i < 620; i += 1) {
    const x = strokeRng() * width;
    const y = strokeRng() * height;
    const worldX = THREE.MathUtils.lerp(-35, 35, x / width);
    const worldZ = THREE.MathUtils.lerp(27, -27, y / height);
    const info = terrainInfo(worldX, worldZ);
    const length = info.wallMask > 0.35 ? 22 + strokeRng() * 44 : info.laneMask > 0.35 ? 16 + strokeRng() * 26 : 5 + strokeRng() * 18;
    context.lineWidth = info.wallMask > 0.35 ? 2.2 : 1.2;
    context.globalAlpha = info.riverMask > 0.25 ? 0.025 : info.wallMask > 0.35 ? 0.08 : 0.045;
    const angle = info.wallMask > 0.35 ? -0.25 + strokeRng() * 0.7 : strokeRng() * Math.PI * 2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length * 0.42);
    context.stroke();
  }
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(reliefCanvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createTerrain() {
  const width = 70;
  const depth = 54;
  const segX = 210;
  const segZ = 162;
  const geometry = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  const uvs2 = [];
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const info = terrainInfo(x, z);
    position.setY(i, info.height);
    const color = colorForTerrain(x, z, info);
    colors.push(color.r, color.g, color.b);
    uvs2.push(info.laneMask, info.riverMask, info.wallMask, info.jungleMask);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("mapMask", new THREE.Float32BufferAttribute(uvs2, 4));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: createPaintedTerrainTexture(),
    bumpMap: createTerrainMicroReliefTexture(),
    bumpScale: 0.18,
    vertexColors: false,
    roughness: 0.93,
    metalness: 0,
    emissive: 0x10180f,
    emissiveIntensity: 0.035,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        attribute vec4 mapMask;
        varying vec3 vMapWorldPosition;
        varying vec4 vMapMask;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vMapWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vMapMask = mapMask;
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vMapWorldPosition;
        varying vec4 vMapMask;
        float hashMap(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float grainA = hashMap(floor(vMapWorldPosition.xz * 2.8));
        float grainB = hashMap(floor(vMapWorldPosition.xz * 8.5));
        float brush = sin(vMapWorldPosition.x * 1.7 + vMapWorldPosition.z * 2.3) * 0.5 + 0.5;
        float laneWear = smoothstep(0.18, 0.85, vMapMask.x) * (0.65 + brush * 0.35);
        float cliffCool = smoothstep(0.22, 0.92, vMapMask.z);
        float jungleCool = smoothstep(0.18, 0.85, vMapMask.w);
        float riverInset = smoothstep(0.18, 0.92, vMapMask.y);
        diffuseColor.rgb *= 0.91 + grainA * 0.085 + grainB * 0.035;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.66, 0.52, 0.3), laneWear * 0.18);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.29, 0.2), jungleCool * 0.11);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.38, 0.34), cliffCool * 0.18);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.36, 0.36), riverInset * 0.18);
        diffuseColor.rgb += vec3(0.06, 0.045, 0.018) * laneWear;
        diffuseColor.rgb -= vec3(0.016, 0.018, 0.014) * cliffCool;
      `,
      );
  };

  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = "OriginalMobaTerrain_NoFog";
  terrain.receiveShadow = true;
  return terrain;
}

function createMapUnderlay() {
  const geometry = new THREE.PlaneGeometry(240, 190, 36, 30);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, -1.18 + noise2(x * 0.08, z * 0.08) * 0.16);
    const water = new THREE.Color(0x17292d).lerp(new THREE.Color(0x233831), noise2(x * 0.12 + 4, z * 0.12));
    colors.push(water.r, water.g, water.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
  });
  const underlay = new THREE.Mesh(geometry, material);
  underlay.name = "NaturalChunkUnderlay";
  underlay.receiveShadow = true;
  return underlay;
}

function createRiverRibbon() {
  const left = [];
  const right = [];
  const center = [];
  const steps = 96;
  for (let i = 0; i <= steps; i += 1) {
    const p = pathPoint(river, i / steps);
    const next = pathPoint(river, Math.min(1, (i + 1) / steps));
    const angle = Math.atan2(next.z - p.z, next.x - p.x);
    const width = 2.7 + Math.sin(i * 0.27) * 0.45;
    const nx = -Math.sin(angle);
    const nz = Math.cos(angle);
    const info = terrainInfo(p.x, p.z);
    center.push(new THREE.Vector3(p.x, info.height + 0.08, p.z));
    left.push(new THREE.Vector3(p.x + nx * width, info.height + 0.1, p.z + nz * width));
    right.push(new THREE.Vector3(p.x - nx * width, info.height + 0.1, p.z - nz * width));
  }
  const vertices = [];
  const uvs = [];
  for (let i = 0; i < steps; i += 1) {
    const a = left[i];
    const b = right[i];
    const c = left[i + 1];
    const d = right[i + 1];
    vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...b.toArray(), ...d.toArray(), ...c.toArray());
    const v0 = i / steps;
    const v1 = (i + 1) / steps;
    uvs.push(0, v0, 1, v0, 0, v1, 1, v0, 1, v1, 0, v1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: state.flow },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlow;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      float bands(float v) {
        return smoothstep(0.48, 1.0, sin(v) * 0.5 + 0.5);
      }
      void main() {
        float center = 1.0 - smoothstep(0.42, 0.52, abs(vUv.x - 0.5));
        float lineA = bands((vUv.y * 24.0 - uTime * 1.7 * uFlow) + sin(vWorldPosition.x * 0.38) * 0.6);
        float lineB = bands(vUv.y * 51.0 + vWorldPosition.x * 0.8 + uTime * 0.65);
        vec3 deep = vec3(0.035, 0.24, 0.28);
        vec3 mid = vec3(0.11, 0.56, 0.58);
        vec3 light = vec3(0.56, 1.0, 0.82);
        float foam = (1.0 - smoothstep(0.04, 0.16, vUv.x)) + (1.0 - smoothstep(0.04, 0.16, 1.0 - vUv.x));
        foam *= 0.55 + lineB * 0.35;
        vec3 color = mix(deep, mid, center * 0.68 + lineA * 0.16);
        color = mix(color, light, (lineA * 0.18 + lineB * 0.08) * center);
        color = mix(color, vec3(0.75, 1.0, 0.84), clamp(foam, 0.0, 1.0) * 0.34);
        float edge = smoothstep(0.02, 0.18, vUv.x) * smoothstep(0.02, 0.18, 1.0 - vUv.x);
        gl_FragColor = vec4(color, 0.84 * edge);
      }
    `,
  });
  state.waterShaders.push(material);
  const riverMesh = new THREE.Mesh(geometry, material);
  riverMesh.name = "RunicRiver_NoFog";
  return riverMesh;
}

function createReedGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.035, 0, 0,
        0.035, 0, 0,
        0.012, 0.86, 0.018,
        -0.035, 0, 0,
        0.012, 0.86, 0.018,
        -0.018, 0.45, -0.012,
      ],
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function addRiverBankDetails(group) {
  const reedGeometry = createReedGeometry();
  const reedMaterial = new THREE.MeshBasicMaterial({
    color: 0x87b86c,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const reedCount = 620;
  const reeds = new THREE.InstancedMesh(reedGeometry, reedMaterial, reedCount);
  reeds.name = "ReadableRiverBankReeds";
  const pebbleGeometry = new THREE.DodecahedronGeometry(0.11, 0);
  const pebbleMaterial = new THREE.MeshStandardMaterial({ color: 0xb9ba9a, roughness: 0.94, metalness: 0, flatShading: true });
  const pebbleCount = 360;
  const pebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, pebbleCount);
  pebbles.name = "ReadableRiverBankPebbles";
  pebbles.castShadow = true;
  pebbles.receiveShadow = true;

  for (let i = 0; i < reedCount; i += 1) {
    const p = pathPoint(river, rng());
    const side = rng() > 0.5 ? 1 : -1;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const offset = side * (2.65 + rng() * 1.25);
    const x = p.x + nx * offset + (rng() - 0.5) * 0.8;
    const z = p.z + nz * offset + (rng() - 0.5) * 0.8;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.08, z);
    tmpQuat.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.24, rng() * Math.PI * 2, (rng() - 0.5) * 0.18));
    const s = 0.55 + rng() * 1.2;
    tmpScale.set(s * (0.55 + rng() * 0.7), s * (0.65 + rng() * 0.9), s);
    reeds.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  reeds.instanceMatrix.needsUpdate = true;
  group.add(reeds);

  let pebbleMade = 0;
  let pebbleAttempts = 0;
  while (pebbleMade < pebbleCount && pebbleAttempts < pebbleCount * 5) {
    pebbleAttempts += 1;
    const p = pathPoint(river, rng());
    const side = rng() > 0.5 ? 1 : -1;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const offset = side * (2.25 + rng() * 1.95);
    const x = p.x + nx * offset + (rng() - 0.5) * 1.4;
    const z = p.z + nz * offset + (rng() - 0.5) * 1.4;
    const info = terrainInfo(x, z);
    if (info.laneMask > 0.42 || info.wallMask > 0.4) {
      continue;
    }
    tmpVector.set(x, info.height + 0.11, z);
    tmpQuat.setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI));
    const s = 0.45 + rng() * 1.0;
    tmpScale.set(s * (0.7 + rng() * 0.9), s * 0.42, s * (0.6 + rng() * 0.8));
    pebbles.setMatrixAt(pebbleMade, matrix.compose(tmpVector, tmpQuat, tmpScale));
    pebbleMade += 1;
  }
  pebbles.count = pebbleMade;
  pebbles.instanceMatrix.needsUpdate = true;
  group.add(pebbles);
}

function addPathEdgeBrushStrokes(points, count, group, colorHex, opacity, baseOffset = 2.35) {
  const geometry = new THREE.CircleGeometry(1, 24);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const strokes = new THREE.InstancedMesh(geometry, material, count);
  strokes.name = "HandPaintedLaneEdgeStrokes";
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + rng() * 0.8) / count);
    const side = rng() > 0.5 ? 1 : -1;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const offset = side * (baseOffset + rng() * 1.9);
    const x = p.x + nx * offset + (rng() - 0.5) * 0.65;
    const z = p.z + nz * offset + (rng() - 0.5) * 0.65;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.072, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (rng() - 0.5) * 0.5));
    tmpScale.set(1.4 + rng() * 2.5, 0.22 + rng() * 0.62, 1);
    strokes.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  strokes.instanceMatrix.needsUpdate = true;
  group.add(strokes);
}

function createLaneStones(points, count, colorHex, offsetSide = 0) {
  const geometry = new THREE.BoxGeometry(0.95, 0.08, 0.48, 1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    emissive: 0x10120c,
    emissiveIntensity: 0.015,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "PaintedLaneStoneInlays";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + 0.5) / count);
    const side = offsetSide + (rng() - 0.5) * 0.55;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side + (rng() - 0.5) * 0.6;
    const z = p.z + nz * side + (rng() - 0.5) * 0.45;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.08, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, -p.angle + (rng() - 0.5) * 0.6, 0));
    tmpScale.set(0.75 + rng() * 0.8, 1, 0.55 + rng() * 0.7);
    mesh.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createLaneRunes(points, count, teamColor, group, offsetSide = 0) {
  const geometry = new THREE.PlaneGeometry(0.55, 0.22, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: teamColor,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "LaneReadabilityRunes";
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + 0.35) / count);
    const side = offsetSide + (rng() - 0.5) * 0.35;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side;
    const z = p.z + nz * side;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.13, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, -p.angle + (rng() - 0.5) * 0.2, 0));
    tmpScale.set(0.7 + rng() * 0.8, 1, 0.8 + rng() * 0.6);
    mesh.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function createLanePebbleFlow(points, count, group) {
  const geometry = new THREE.CapsuleGeometry(0.09, 0.22, 3, 6);
  const material = new THREE.MeshStandardMaterial({
    color: 0xbda46e,
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
    emissive: 0x100c07,
    emissiveIntensity: 0.015,
  });
  const pebbles = new THREE.InstancedMesh(geometry, material, count);
  pebbles.name = "LanePebbleFlow";
  pebbles.castShadow = true;
  pebbles.receiveShadow = true;
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, rng());
    const side = (rng() - 0.5) * 2.8;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side + (rng() - 0.5) * 0.5;
    const z = p.z + nz * side + (rng() - 0.5) * 0.5;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.1, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, -p.angle + (rng() - 0.5) * 1.2, Math.PI * 0.5));
    const s = 0.7 + rng() * 1.4;
    tmpScale.set(s, s * (0.55 + rng() * 0.5), s);
    pebbles.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  pebbles.instanceMatrix.needsUpdate = true;
  group.add(pebbles);
}

function addLaneWearBands(points, count, group, colorHex = 0xf1dc9c, opacity = 0.07, edgeBias = 0.65) {
  const geometry = new THREE.CircleGeometry(1, 28);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bands = new THREE.InstancedMesh(geometry, material, count);
  bands.name = "HandPaintedLaneWearBands";
  let made = 0;
  let attempts = 0;
  while (made < count && attempts < count * 8) {
    attempts += 1;
    const p = pathPoint(points, (made + rng() * 0.8) / count);
    const side = (rng() - 0.5) * 2.2 * edgeBias;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side + (rng() - 0.5) * 0.45;
    const z = p.z + nz * side + (rng() - 0.5) * 0.45;
    const info = terrainInfo(x, z);
    if (info.riverMask > 0.25 || info.wallMask > 0.32) {
      continue;
    }
    tmpVector.set(x, info.height + 0.083, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (rng() - 0.5) * 0.35));
    tmpScale.set(1.5 + rng() * 3.2, 0.22 + rng() * 0.48, 1);
    bands.setMatrixAt(made, matrix.compose(tmpVector, tmpQuat, tmpScale));
    made += 1;
  }
  bands.count = made;
  bands.instanceMatrix.needsUpdate = true;
  group.add(bands);
}

function createRockGeometry() {
  const geometry = new THREE.DodecahedronGeometry(1, 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const warp = 0.82 + noise2(x * 2.3 + 4.1, z * 2.3 - 1.8) * 0.36;
    position.setXYZ(i, x * warp * 1.08, y * (0.6 + warp * 0.32), z * warp);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createPaintedRockMaterial(tint) {
  const material = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.96,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    emissive: 0x161c14,
    emissiveIntensity: 0.06,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vRockLocalPosition;
        varying vec3 vRockWorldNormal;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vRockLocalPosition = position;
        vRockWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vRockLocalPosition;
        varying vec3 vRockWorldNormal;
        float rockHash(vec3 p) {
          return fract(sin(dot(p, vec3(19.13, 47.41, 83.17))) * 43758.5453);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float topLight = smoothstep(-0.15, 0.85, vRockLocalPosition.y);
        float faceLight = clamp(dot(normalize(vRockWorldNormal), normalize(vec3(-0.35, 0.78, 0.52))) * 0.5 + 0.5, 0.0, 1.0);
        float grain = rockHash(floor(vRockLocalPosition * 8.0));
        float ledgeMoss = smoothstep(0.42, 0.92, topLight) * (0.35 + grain * 0.65);
        diffuseColor.rgb *= 0.64 + topLight * 0.2 + faceLight * 0.14 + grain * 0.05;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64, 0.58, 0.38), topLight * 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.45, 0.23), ledgeMoss * 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.18, 0.14), (1.0 - topLight) * 0.18);
        diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.1, 0.13, 0.11));
      `,
      );
  };
  return material;
}

function addWallRocks(points, count, group, tint = 0x68705d) {
  const geometry = createRockGeometry();
  const material = createPaintedRockMaterial(tint);
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  rocks.name = "JungleGameplayWallRocks";
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, i / Math.max(1, count - 1));
    const x = p.x + (rng() - 0.5) * 1.5;
    const z = p.z + (rng() - 0.5) * 1.25;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.45, z);
    tmpQuat.setFromEuler(new THREE.Euler(rng() * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.18));
    const s = 0.75 + rng() * 1.25;
    tmpScale.set(s * (0.9 + rng() * 0.8), s * (0.5 + rng() * 0.95), s * (0.75 + rng() * 0.65));
    rocks.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHex(tint).offsetHSL((rng() - 0.5) * 0.025, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12);
    rocks.setColorAt(i, tmpColor);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.instanceColor.needsUpdate = true;
  group.add(rocks);
}

function addCliffFaceBands(points, count, group, tint = 0x465344, sideBias = 1) {
  const geometry = new THREE.PlaneGeometry(1, 1.35, 2, 2);
  const material = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
    emissive: 0x121a12,
    emissiveIntensity: 0.045,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec2 vCliffUv;
        varying vec3 vCliffWorldPosition;
      `,
      )
      .replace(
        "#include <uv_vertex>",
        `
        #include <uv_vertex>
        vCliffUv = uv;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        transformed.x += sin(position.y * 5.0 + position.x * 1.7) * 0.045;
        vCliffUv = uv;
        vCliffWorldPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec2 vCliffUv;
        varying vec3 vCliffWorldPosition;
        float cliffHash(vec2 p) {
          return fract(sin(dot(p, vec2(41.7, 289.2))) * 26437.33);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float ledge = smoothstep(0.55, 1.0, vCliffUv.y);
        float foot = 1.0 - smoothstep(0.05, 0.45, vCliffUv.y);
        float grain = cliffHash(floor(vCliffWorldPosition.xz * 3.2 + vCliffUv * 11.0));
        diffuseColor.rgb *= 0.72 + ledge * 0.18 + grain * 0.065;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.69, 0.51), ledge * 0.08);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.27, 0.21), foot * 0.18);
        diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.13, 0.16, 0.13));
      `,
      );
  };
  const faces = new THREE.InstancedMesh(geometry, material, count);
  faces.name = "ContinuousGameplayCliffFaces";
  faces.castShadow = true;
  faces.receiveShadow = true;
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + 0.5) / count);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * sideBias * (0.2 + rng() * 0.35);
    const z = p.z + nz * sideBias * (0.2 + rng() * 0.35);
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.7, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, -p.angle + (rng() - 0.5) * 0.22, 0));
    tmpScale.set(1.8 + rng() * 2.15, 0.95 + rng() * 0.72, 1);
    faces.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHex(tint).offsetHSL((rng() - 0.5) * 0.018, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.1);
    faces.setColorAt(i, tmpColor);
  }
  faces.instanceMatrix.needsUpdate = true;
  faces.instanceColor.needsUpdate = true;
  group.add(faces);
}

function addPerimeterCliffs(group) {
  const geometry = createRockGeometry();
  const material = createPaintedRockMaterial(0x465247);
  const count = 86;
  const cliffs = new THREE.InstancedMesh(geometry, material, count);
  cliffs.name = "NaturalMapChunkPerimeterCliffs";
  cliffs.castShadow = true;
  cliffs.receiveShadow = true;
  for (let i = 0; i < count; i += 1) {
    const side = Math.floor((i / count) * 4);
    const t = (i % Math.ceil(count / 4)) / Math.ceil(count / 4);
    let x = 0;
    let z = 0;
    if (side === 0) {
      x = THREE.MathUtils.lerp(-34, 34, t);
      z = -26.8 + (rng() - 0.5) * 1.2;
    } else if (side === 1) {
      x = 34.3 + (rng() - 0.5) * 1.0;
      z = THREE.MathUtils.lerp(-26, 26, t);
    } else if (side === 2) {
      x = THREE.MathUtils.lerp(34, -34, t);
      z = 26.7 + (rng() - 0.5) * 1.2;
    } else {
      x = -34.3 + (rng() - 0.5) * 1.0;
      z = THREE.MathUtils.lerp(26, -26, t);
    }
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height - 0.22, z);
    tmpQuat.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.25));
    const s = 0.72 + rng() * 1.18;
    tmpScale.set(s * (1.15 + rng() * 0.8), s * (0.42 + rng() * 0.48), s * (1.0 + rng() * 0.62));
    cliffs.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHex(0x526052).offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1);
    cliffs.setColorAt(i, tmpColor);
  }
  cliffs.instanceMatrix.needsUpdate = true;
  cliffs.instanceColor.needsUpdate = true;
  group.add(cliffs);
}

function createSculptedCliffShelfMaterial(tint = 0x455141) {
  const material = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.94,
    metalness: 0,
    vertexColors: true,
    flatShading: false,
    emissive: 0x0f1710,
    emissiveIntensity: 0.035,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vShelfWorldPosition;
        varying vec3 vShelfNormal;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vShelfWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vShelfNormal = normalize(mat3(modelMatrix) * objectNormal);
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vShelfWorldPosition;
        varying vec3 vShelfNormal;
        float shelfHash(vec2 p) {
          return fract(sin(dot(p, vec2(91.7, 241.3))) * 53758.1);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float topFace = smoothstep(0.48, 0.86, vShelfNormal.y);
        float darkFace = 1.0 - smoothstep(0.18, 0.62, vShelfNormal.y);
        float grain = shelfHash(floor(vShelfWorldPosition.xz * 3.4));
        float strata = smoothstep(0.54, 0.62, fract(vShelfWorldPosition.y * 3.7 + vShelfWorldPosition.x * 0.13));
        float mossBreak = shelfHash(floor(vShelfWorldPosition.xz * 1.35 + 11.0));
        diffuseColor.rgb *= 0.7 + topFace * 0.2 + grain * 0.06;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.6, 0.36), topFace * (0.14 + mossBreak * 0.06));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.2, 0.15), darkFace * 0.24);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.64, 0.43), strata * topFace * 0.075);
        diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.09, 0.12, 0.1));
      `,
      );
  };
  return material;
}

function addSculptedCliffShelf(points, group, sideBias = 1, tint = 0x455141, width = 2.8, drop = 1.15, steps = 56) {
  const vertices = [];
  const colors = [];
  const baseColor = new THREE.Color(tint);
  const topColor = new THREE.Color(tint).offsetHSL(0.015, 0.04, 0.12);
  const sideColor = new THREE.Color(tint).offsetHSL(-0.01, -0.04, -0.12);

  const samples = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const p = pathPoint(points, t);
    const nx = -Math.sin(p.angle) * sideBias;
    const nz = Math.cos(p.angle) * sideBias;
    const alongWobble = Math.sin(i * 0.63) * 0.18 + (noise2(p.x * 0.12 + 3.0, p.z * 0.12 - 9.0) - 0.5) * 0.5;
    const localWidth = width * (0.82 + noise2(p.x * 0.16, p.z * 0.16) * 0.34);
    const innerX = p.x - nx * (0.28 + alongWobble * 0.18);
    const innerZ = p.z - nz * (0.28 + alongWobble * 0.18);
    const outerX = p.x + nx * localWidth;
    const outerZ = p.z + nz * localWidth;
    const midInfo = terrainInfo(p.x + nx * 0.6, p.z + nz * 0.6);
    const outerInfo = terrainInfo(outerX, outerZ);
    const topY = midInfo.height + 0.58 + noise2(p.x * 0.33, p.z * 0.33) * 0.22;
    const footY = Math.min(midInfo.height, outerInfo.height) - drop * (0.72 + noise2(p.x * 0.21 - 4.0, p.z * 0.21) * 0.5);
    samples.push({
      innerTop: [innerX, topY - 0.08, innerZ],
      outerTop: [outerX, topY + 0.06, outerZ],
      innerFoot: [innerX - nx * 0.12, footY + 0.2, innerZ - nz * 0.12],
      outerFoot: [outerX + nx * 0.18, footY, outerZ + nz * 0.18],
      shade: 0.86 + noise2(p.x * 0.44, p.z * 0.44) * 0.22,
    });
  }

  function pushVertex(point, color, shade = 1) {
    vertices.push(point[0], point[1], point[2]);
    colors.push(
      THREE.MathUtils.clamp(color.r * shade, 0, 1),
      THREE.MathUtils.clamp(color.g * shade, 0, 1),
      THREE.MathUtils.clamp(color.b * shade, 0, 1),
    );
  }

  function pushTri(a, b, c, color, shade = 1) {
    pushVertex(a, color, shade);
    pushVertex(b, color, shade);
    pushVertex(c, color, shade);
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const shadeA = a.shade;
    const shadeB = b.shade;
    pushTri(a.innerTop, a.outerTop, b.innerTop, topColor, shadeA);
    pushTri(b.innerTop, a.outerTop, b.outerTop, topColor, shadeB);
    pushTri(a.outerTop, a.outerFoot, b.outerTop, sideColor, shadeA);
    pushTri(b.outerTop, a.outerFoot, b.outerFoot, sideColor, shadeB);
    pushTri(a.innerFoot, a.innerTop, b.innerFoot, baseColor, shadeA * 0.9);
    pushTri(b.innerFoot, a.innerTop, b.innerTop, baseColor, shadeB * 0.9);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const shelf = new THREE.Mesh(geometry, createSculptedCliffShelfMaterial(tint));
  shelf.name = "ContinuousSculptedGameplayCliffShelf";
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  group.add(shelf);
  return shelf;
}

function addSculptedCliffShelves(group) {
  addSculptedCliffShelf(highWallA, group, 1, 0x445240, 2.45, 1.18, 58);
  addSculptedCliffShelf(highWallB, group, -1, 0x404d42, 2.25, 1.08, 54);
  addSculptedCliffShelf(upperJungleArc, group, -1, 0x46543f, 2.75, 1.22, 56);
  addSculptedCliffShelf(lowerJungleArc, group, 1, 0x40503f, 2.75, 1.22, 56);
}

function createPainterlyCliffBlockGeometry(seed = 1) {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 3, 2, 3);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const sideWeight = Math.max(Math.abs(x), Math.abs(z));
    const ledge = Math.sin((x + seed) * 3.4) * 0.06 + Math.cos((z - seed) * 2.7) * 0.05;
    const chip = noise2(x * 4.8 + seed * 2.1, z * 4.8 - seed) * 0.18;
    const taper = 0.82 + smoothstep(-0.45, 0.5, y) * 0.28;
    position.setXYZ(i, x * taper + ledge * sideWeight, y + chip * 0.22, z * (0.92 + chip * 0.2));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addLargeCliffCapstones(points, count, group, sideBias = 1, tint = 0x4b5848) {
  const geometry = createPainterlyCliffBlockGeometry(count);
  const material = createPaintedRockMaterial(tint);
  const capstones = new THREE.InstancedMesh(geometry, material, count);
  capstones.name = "LargePainterlyCliffCapstones";
  capstones.castShadow = true;
  capstones.receiveShadow = true;

  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + 0.5) / count);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * sideBias * (0.95 + rng() * 0.6) + (rng() - 0.5) * 0.38;
    const z = p.z + nz * sideBias * (0.95 + rng() * 0.6) + (rng() - 0.5) * 0.38;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.42, z);
    tmpQuat.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.12, -p.angle + (rng() - 0.5) * 0.32, (rng() - 0.5) * 0.08));
    const s = 1.0 + rng() * 0.75;
    tmpScale.set(s * (2.05 + rng() * 1.45), s * (0.34 + rng() * 0.26), s * (0.82 + rng() * 0.55));
    capstones.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHex(tint).offsetHSL((rng() - 0.5) * 0.018, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.09);
    capstones.setColorAt(i, tmpColor);
  }

  capstones.instanceMatrix.needsUpdate = true;
  capstones.instanceColor.needsUpdate = true;
  group.add(capstones);
}

function addHeroCliffLandmarks(group) {
  const landmarks = [
    [-24.2, -6.0, 0.2, 1.15, 0x4d5b50],
    [-7.2, 2.0, -0.18, 0.9, 0x556052],
    [17.5, 7.8, 0.45, 1.1, 0x4f5d50],
    [-18.8, -15.0, -0.42, 1.0, 0x485448],
    [20.5, -7.6, 0.35, 0.95, 0x4b584c],
  ];
  landmarks.forEach(([x, z, rotation, scale, tint], index) => {
    const info = terrainInfo(x, z);
    const landmark = new THREE.Group();
    landmark.name = "HeroSculptedGameplayCliffLandmark";
    landmark.position.set(x, info.height + 0.18, z);
    landmark.rotation.y = rotation;
    landmark.scale.setScalar(scale);
    const mat = createPaintedRockMaterial(tint);
    const main = new THREE.Mesh(createPainterlyCliffBlockGeometry(index + 11), mat);
    main.position.y = 0.42;
    main.scale.set(2.45, 0.62, 1.18);
    main.castShadow = true;
    main.receiveShadow = true;
    landmark.add(main);
    const shoulder = new THREE.Mesh(createPainterlyCliffBlockGeometry(index + 31), mat);
    shoulder.position.set(-1.25, 0.22, 0.46);
    shoulder.rotation.y = 0.38;
    shoulder.scale.set(1.45, 0.42, 0.92);
    shoulder.castShadow = true;
    shoulder.receiveShadow = true;
    landmark.add(shoulder);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 5), mat);
    crest.position.set(0.86, 0.94, -0.28);
    crest.rotation.set(0.24, 0.5, -0.15);
    crest.scale.set(0.82, 1, 0.44);
    crest.castShadow = true;
    landmark.add(crest);
    group.add(landmark);
    addGroundDecal(x, z, 2.8 * scale, 1.3 * scale, 0x06100a, 0.16, group, rotation, 0.055);
  });
}

function addPerimeterSculptedCliffs(group) {
  const perimeterShelves = [
    {
      points: [
        [-34.2, 26.4],
        [-20.5, 26.9],
        [-5.5, 26.2],
        [12.5, 26.7],
        [34.2, 26.1],
      ],
      side: -1,
      tint: 0x4b5848,
      width: 4.2,
      drop: 1.55,
      steps: 76,
    },
    {
      points: [
        [-34.2, -26.2],
        [-18.5, -26.7],
        [0.5, -25.9],
        [18.5, -26.8],
        [34.2, -26.0],
      ],
      side: 1,
      tint: 0x3f4d40,
      width: 4.35,
      drop: 1.5,
      steps: 76,
    },
    {
      points: [
        [-34.0, -25.5],
        [-34.5, -12.5],
        [-33.8, 2.0],
        [-34.3, 14.5],
        [-34.0, 25.5],
      ],
      side: 1,
      tint: 0x445241,
      width: 3.8,
      drop: 1.42,
      steps: 62,
    },
    {
      points: [
        [34.0, -25.5],
        [34.5, -10.5],
        [33.8, 5.5],
        [34.4, 17.5],
        [34.0, 25.5],
      ],
      side: -1,
      tint: 0x4a5547,
      width: 3.8,
      drop: 1.42,
      steps: 62,
    },
  ];

  perimeterShelves.forEach(({ points, side, tint, width, drop, steps }) => {
    const shelf = addSculptedCliffShelf(points, group, side, tint, width, drop, steps);
    shelf.name = "ContinuousPerimeterPaintedCliffShelf";
  });
}

function addFocusedChunkEdgeOcclusion(group) {
  const edgeBands = [
    {
      x: 0,
      z: 19.6,
      sx: 58,
      sz: 6.8,
      rotation: 0.02,
      color: 0x0b170f,
      opacity: 0.38,
    },
    {
      x: 0,
      z: -20.8,
      sx: 58,
      sz: 7.4,
      rotation: -0.04,
      color: 0x08130d,
      opacity: 0.42,
    },
    {
      x: -27.8,
      z: -0.6,
      sx: 7.4,
      sz: 42,
      rotation: 0.12,
      color: 0x07120d,
      opacity: 0.4,
    },
    {
      x: 27.8,
      z: 0.4,
      sx: 7.4,
      sz: 42,
      rotation: -0.1,
      color: 0x07120d,
      opacity: 0.4,
    },
  ];

  edgeBands.forEach(({ x, z, sx, sz, rotation, color, opacity }) => {
    const info = terrainInfo(x, z);
    const matte = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    matte.name = "FocusedChunkNaturalEdgeMatte";
    matte.position.set(x, info.height + 0.11, z);
    matte.rotation.set(-Math.PI / 2, 0, rotation);
    matte.scale.set(sx, sz, 1);
    group.add(matte);
  });
}

function addFocusedEdgeCanopyAndRoots(group) {
  const rootMat = new THREE.MeshStandardMaterial({
    color: 0x3e2f1d,
    roughness: 0.94,
    metalness: 0,
    emissive: 0x0d0804,
    emissiveIntensity: 0.04,
  });
  const edgeRootCurves = [
    [[-24, 17], [-17, 15.8], [-9, 17.0], [-2, 15.9]],
    [[10, 17.7], [18, 16.2], [25, 17.4]],
    [[-25, -17.4], [-16, -15.6], [-8, -17.2], [0, -16.0]],
    [[8, -17.8], [17, -15.8], [25, -17.4]],
    [[-24.8, -13], [-25.8, -5], [-24.5, 4], [-25.6, 12]],
    [[25.0, -13], [26.0, -4], [24.6, 5], [25.8, 13]],
  ];

  edgeRootCurves.forEach((curvePoints, index) => {
    const points = curvePoints.map(([x, z], pointIndex) => {
      const info = terrainInfo(x, z);
      return new THREE.Vector3(x, info.height + 0.22 + Math.sin(pointIndex * 1.7) * 0.1, z);
    });
    const curve = new THREE.CatmullRomCurve3(points);
    const root = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.12 + (index % 2) * 0.025, 7, false), rootMat);
    root.name = "FocusedChunkEdgeRootSilhouette";
    root.castShadow = true;
    root.receiveShadow = true;
    group.add(root);
  });

  const edgeBrushes = [
    [-22.4, 15.8, 5.0, 1.4, 150],
    [-5.0, 16.2, 4.8, 1.3, 130],
    [17.6, 16.8, 5.4, 1.4, 150],
    [-20.4, -16.3, 5.4, 1.5, 160],
    [-2.0, -16.9, 5.1, 1.4, 140],
    [18.8, -16.0, 5.3, 1.5, 160],
    [-25.2, 2.0, 1.4, 5.8, 150],
    [25.1, 0.8, 1.4, 5.8, 150],
  ];
  edgeBrushes.forEach(([x, z, radiusX, radiusZ, count]) => {
    addBrushVolumePatch(x, z, radiusX, radiusZ, Math.max(18, Math.round(count * 0.16)), group);
    addBrushPatch(x, z, radiusX, radiusZ, count, group);
  });
}

function createBrushBladeGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.06, 0, 0,
        0.06, 0, 0,
        0.015, 0.95, 0.03,
        -0.06, 0, 0,
        0.015, 0.95, 0.03,
        -0.02, 0.54, -0.03,
      ],
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function addBrushPatch(cx, cz, radiusX, radiusZ, count, group) {
  const geometry = createBrushBladeGeometry();
  const material = new THREE.MeshBasicMaterial({
    color: 0x67b84c,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    state.foliageShaders.push(shader);
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      float sway = sin(uTime * 1.4 + position.y * 2.0 + instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.42) * 0.035;
      transformed.x += sway * smoothstep(0.1, 0.9, position.y);
    `,
    );
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
  };
  const blades = new THREE.InstancedMesh(geometry, material, count);
  blades.name = "GameplayBrushPatch";
  for (let i = 0; i < count; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng());
    const x = cx + Math.cos(a) * r * radiusX;
    const z = cz + Math.sin(a) * r * radiusZ;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.02, z);
    tmpQuat.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.18, rng() * Math.PI * 2, (rng() - 0.5) * 0.2));
    const s = 0.58 + rng() * 1.1;
    tmpScale.set(s * (0.6 + rng() * 0.55), s * (0.62 + rng() * 0.78), s);
    blades.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  blades.instanceMatrix.needsUpdate = true;
  group.add(blades);
}

function createBrushVolumeGeometry() {
  const geometry = new THREE.IcosahedronGeometry(0.75, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const crown = smoothstep(-0.55, 0.75, y);
    const fringe = 0.84 + noise2(x * 4.2 + 2.0, z * 4.2 - 6.0) * 0.28;
    position.setXYZ(i, x * (1.12 + crown * 0.22) * fringe, y * 0.62 + crown * 0.12, z * (0.72 + crown * 0.18) * fringe);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createBrushVolumeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x4f8f3f,
    roughness: 0.96,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    emissive: 0x0d1c0e,
    emissiveIntensity: 0.06,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vBrushLocalPosition;
        varying vec3 vBrushWorldNormal;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vBrushLocalPosition = position;
        vBrushWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vBrushLocalPosition;
        varying vec3 vBrushWorldNormal;
        float brushVolumeHash(vec3 p) {
          return fract(sin(dot(p, vec3(53.1, 17.9, 91.4))) * 38211.7);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float top = smoothstep(-0.32, 0.62, vBrushLocalPosition.y);
        float facing = clamp(dot(normalize(vBrushWorldNormal), normalize(vec3(-0.44, 0.74, 0.5))) * 0.5 + 0.5, 0.0, 1.0);
        float grain = brushVolumeHash(floor(vBrushLocalPosition * 7.0));
        diffuseColor.rgb *= 0.66 + top * 0.22 + facing * 0.15 + grain * 0.055;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.28, 0.13), (1.0 - top) * 0.22);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.74, 0.34), top * 0.13);
        diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.08, 0.15, 0.07));
      `,
      );
  };
  return material;
}

function addBrushVolumePatch(cx, cz, radiusX, radiusZ, count, group) {
  const geometry = createBrushVolumeGeometry();
  const material = createBrushVolumeMaterial();
  const volumes = new THREE.InstancedMesh(geometry, material, count);
  volumes.name = "VolumetricGameplayBrushMass";
  volumes.castShadow = true;
  volumes.receiveShadow = true;

  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = cx + Math.cos(angle) * radius * radiusX;
    const z = cz + Math.sin(angle) * radius * radiusZ;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.5 + rng() * 0.12, z);
    tmpQuat.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.12, rng() * Math.PI * 2, (rng() - 0.5) * 0.16));
    const s = 0.48 + rng() * 0.92;
    tmpScale.set(s * (1.15 + rng() * 1.15), s * (0.46 + rng() * 0.35), s * (0.65 + rng() * 0.74));
    volumes.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHSL(0.26 + (rng() - 0.5) * 0.04, 0.28 + rng() * 0.15, 0.36 + rng() * 0.14);
    volumes.setColorAt(i, tmpColor);
  }

  volumes.instanceMatrix.needsUpdate = true;
  volumes.instanceColor.needsUpdate = true;
  group.add(volumes);
}

function createCanopyPatchTexture() {
  const size = 192;
  const patchCanvas = document.createElement("canvas");
  patchCanvas.width = size;
  patchCanvas.height = size;
  const context = patchCanvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  const patchRng = mulberry32(61523);
  const palette = ["#568d47", "#78ad55", "#9ac867", "#3f733c", "#b8d978"];
  for (let i = 0; i < 34; i += 1) {
    const x = 38 + patchRng() * 116;
    const y = 34 + patchRng() * 122;
    const rx = 16 + patchRng() * 32;
    const ry = 8 + patchRng() * 18;
    context.save();
    context.translate(x, y);
    context.rotate((patchRng() - 0.5) * Math.PI);
    context.fillStyle = palette[Math.floor(patchRng() * palette.length)];
    context.globalAlpha = 0.7 + patchRng() * 0.28;
    context.beginPath();
    context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  context.globalCompositeOperation = "screen";
  context.strokeStyle = "rgba(220, 246, 146, 0.36)";
  context.lineWidth = 2;
  for (let i = 0; i < 16; i += 1) {
    const x = 35 + patchRng() * 120;
    const y = 35 + patchRng() * 120;
    context.beginPath();
    context.moveTo(x - 18 * patchRng(), y + 10 * patchRng());
    context.quadraticCurveTo(x, y - 16 * patchRng(), x + 20 * patchRng(), y - 8 * patchRng());
    context.stroke();
  }
  context.globalCompositeOperation = "source-over";
  const texture = new THREE.CanvasTexture(patchCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createCanopyVolumeGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 3);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const top = smoothstep(-0.45, 0.78, y);
    const underside = 1 - top;
    const lobing =
      0.84 +
      noise2(x * 3.7 + 5.0, z * 3.7 - 1.0) * 0.24 +
      Math.sin(Math.atan2(z, x) * 5.0 + y * 2.0) * 0.055;
    position.setXYZ(i, x * (0.96 + top * 0.08) * lobing, y * (0.68 + underside * 0.1), z * (0.82 + top * 0.08) * lobing);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createCanopyVolumeMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x5d9447,
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    emissive: 0x10200f,
    emissiveIntensity: 0.055,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vCanopyLocalPosition;
        varying vec3 vCanopyWorldNormal;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vCanopyLocalPosition = position;
        vCanopyWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vCanopyLocalPosition;
        varying vec3 vCanopyWorldNormal;
        float canopyHash(vec3 p) {
          return fract(sin(dot(p, vec3(37.7, 83.1, 19.9))) * 44711.6);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float top = smoothstep(-0.22, 0.68, vCanopyLocalPosition.y);
        float facing = clamp(dot(normalize(vCanopyWorldNormal), normalize(vec3(-0.36, 0.84, 0.4))) * 0.5 + 0.5, 0.0, 1.0);
        float grain = canopyHash(floor(vCanopyLocalPosition * 7.0));
        float pocket = canopyHash(floor(vCanopyLocalPosition * 3.5 + 17.0));
        float brushBand = smoothstep(0.42, 0.82, sin(vCanopyWorldNormal.x * 11.0 + vCanopyWorldNormal.z * 7.0 + vCanopyLocalPosition.y * 5.0) * 0.5 + 0.5);
        float innerPocket = (1.0 - top) * (0.34 + pocket * 0.2);
        diffuseColor.rgb *= 0.54 + top * 0.27 + facing * 0.2 + grain * 0.075;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.19, 0.09), innerPocket);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.78, 0.34), top * (0.12 + brushBand * 0.08));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.47, 0.18), (1.0 - facing) * top * 0.08);
        diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.075, 0.13, 0.065));
      `,
      );
  };
  return material;
}

function addCanopyVolumeLobes(group) {
  const geometry = createCanopyVolumeGeometry();
  const material = createCanopyVolumeMaterial();
  const count = 620;
  const volumes = new THREE.InstancedMesh(geometry, material, count);
  volumes.name = "SolidPaintedJungleCanopyVolumes";
  volumes.castShadow = true;
  volumes.receiveShadow = true;

  let made = 0;
  let attempts = 0;
  while (made < count && attempts < count * 8) {
    attempts += 1;
    const zone = jungleZones[Math.floor(rng() * jungleZones.length)];
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = terrainInfo(x, z);
    if (info.laneMask > 0.12 || info.riverMask > 0.2) {
      continue;
    }
    const tier = rng();
    tmpVector.set(x, info.height + 1.05 + tier * 1.28, z);
    tmpQuat.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.16, rng() * Math.PI * 2, (rng() - 0.5) * 0.16));
    const s = 0.48 + rng() * 0.86;
    tmpScale.set(s * (0.95 + rng() * 0.92), s * (0.58 + rng() * 0.34), s * (0.72 + rng() * 0.68));
    volumes.setMatrixAt(made, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHSL(0.27 + (rng() - 0.5) * 0.04, 0.26 + rng() * 0.16, 0.34 + rng() * 0.16);
    volumes.setColorAt(made, tmpColor);
    made += 1;
  }

  volumes.count = made;
  volumes.instanceMatrix.needsUpdate = true;
  volumes.instanceColor.needsUpdate = true;
  group.add(volumes);
}

function addJungleCanopyStructure(group) {
  const trunkGeometry = new THREE.CylinderGeometry(0.08, 0.18, 1, 7, 3);
  const branchGeometry = new THREE.CylinderGeometry(0.035, 0.075, 1, 6, 2);
  const barkMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a3520,
    roughness: 0.93,
    metalness: 0,
    flatShading: true,
    emissive: 0x100905,
    emissiveIntensity: 0.045,
  });
  const trunkCount = 74;
  const branchCount = 124;
  const trunks = new THREE.InstancedMesh(trunkGeometry, barkMaterial, trunkCount);
  const branches = new THREE.InstancedMesh(branchGeometry, barkMaterial, branchCount);
  trunks.name = "JungleCanopySupportTrunks";
  branches.name = "JungleCanopySupportBranches";
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  branches.castShadow = true;
  branches.receiveShadow = true;

  let madeTrunks = 0;
  let attempts = 0;
  const anchors = [];
  while (madeTrunks < trunkCount && attempts < trunkCount * 10) {
    attempts += 1;
    const zone = jungleZones[Math.floor(rng() * jungleZones.length)];
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = terrainInfo(x, z);
    if (info.laneMask > 0.14 || info.riverMask > 0.24) {
      continue;
    }
    const height = 1.25 + rng() * 1.65;
    const lean = new THREE.Vector3((rng() - 0.5) * 0.34, 1, (rng() - 0.5) * 0.34).normalize();
    const center = new THREE.Vector3(x + lean.x * height * 0.22, info.height + height * 0.5, z + lean.z * height * 0.22);
    tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
    tmpScale.set(0.82 + rng() * 0.72, height, 0.82 + rng() * 0.58);
    trunks.setMatrixAt(madeTrunks, matrix.compose(center, tmpQuat, tmpScale));
    anchors.push({
      x: x + lean.x * height * 0.45,
      z: z + lean.z * height * 0.45,
      y: info.height + height * 0.86,
      angle: rng() * Math.PI * 2,
    });
    madeTrunks += 1;
  }

  if (anchors.length === 0) {
    return;
  }

  for (let i = 0; i < branchCount; i += 1) {
    const anchor = anchors[i % anchors.length];
    const spread = anchor.angle + (rng() - 0.5) * 1.35;
    const length = 0.75 + rng() * 1.55;
    const dir = new THREE.Vector3(Math.cos(spread) * 0.78, 0.28 + rng() * 0.2, Math.sin(spread) * 0.78).normalize();
    const center = new THREE.Vector3(
      anchor.x + dir.x * length * 0.5,
      anchor.y + dir.y * length * 0.5,
      anchor.z + dir.z * length * 0.5,
    );
    tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    tmpScale.set(0.72 + rng() * 0.6, length, 0.72 + rng() * 0.46);
    branches.setMatrixAt(i, matrix.compose(center, tmpQuat, tmpScale));
  }

  trunks.count = madeTrunks;
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(branches);
}

function addCanopyClusters(group) {
  const geometry = new THREE.PlaneGeometry(1, 0.72, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: createCanopyPatchTexture(),
    alphaTest: 0.08,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const canopyCount = 320;
  const canopy = new THREE.InstancedMesh(geometry, material, canopyCount);
  canopy.name = "PaintedJungleCanopy";
  canopy.castShadow = false;
  canopy.receiveShadow = false;
  let made = 0;
  let attempts = 0;
  while (made < canopyCount && attempts < canopyCount * 8) {
    attempts += 1;
    const zone = jungleZones[Math.floor(rng() * jungleZones.length)];
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = terrainInfo(x, z);
    if (info.laneMask > 0.1 || info.riverMask > 0.18) {
      continue;
    }
    tmpVector.set(x, info.height + 1.15 + rng() * 1.25, z);
    tmpQuat.setFromEuler(new THREE.Euler(-0.62 + (rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.62));
    const s = 1.0 + rng() * 1.72;
    tmpScale.set(s * (0.95 + rng() * 0.9), s * (0.58 + rng() * 0.64), 1);
    canopy.setMatrixAt(made, matrix.compose(tmpVector, tmpQuat, tmpScale));
    made += 1;
  }
  canopy.count = made;
  canopy.instanceMatrix.needsUpdate = true;
  group.add(canopy);
}

function addCanopyPaintHighlights(group) {
  const geometry = new THREE.PlaneGeometry(1, 0.56, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xb8d873,
    alphaMap: createLeafAlphaTexture(),
    alphaTest: 0.28,
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const count = 160;
  const highlights = new THREE.InstancedMesh(geometry, material, count);
  highlights.name = "PaintedCanopyTopHighlights";
  let made = 0;
  let attempts = 0;
  while (made < count && attempts < count * 6) {
    attempts += 1;
    const zone = jungleZones[Math.floor(rng() * jungleZones.length)];
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = terrainInfo(x, z);
    if (info.laneMask > 0.08 || info.riverMask > 0.22) {
      continue;
    }
    tmpVector.set(x, info.height + 1.75 + rng() * 1.05, z);
    tmpQuat.setFromEuler(new THREE.Euler(-0.68 + (rng() - 0.5) * 0.36, rng() * Math.PI * 2, (rng() - 0.5) * 0.5));
    const s = 0.58 + rng() * 1.05;
    tmpScale.set(s * (0.85 + rng() * 0.85), s * (0.55 + rng() * 0.45), 1);
    highlights.setMatrixAt(made, matrix.compose(tmpVector, tmpQuat, tmpScale));
    made += 1;
  }
  highlights.count = made;
  highlights.instanceMatrix.needsUpdate = true;
  group.add(highlights);
}

function createLeafAlphaTexture() {
  const size = 128;
  const leafCanvas = document.createElement("canvas");
  leafCanvas.width = size;
  leafCanvas.height = size;
  const context = leafCanvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  context.fillStyle = "rgba(255,255,255,0.96)";
  const leaves = [
    [58, 58, 42, 16, -0.38],
    [68, 42, 33, 12, 0.56],
    [45, 79, 35, 13, 0.74],
    [79, 78, 38, 14, -0.68],
    [63, 90, 27, 10, 0.1],
  ];
  leaves.forEach(([x, y, rx, ry, rotation]) => {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.beginPath();
    context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
  context.strokeStyle = "rgba(255,255,255,0.42)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(30, 94);
  context.quadraticCurveTo(62, 55, 96, 30);
  context.stroke();
  const texture = new THREE.CanvasTexture(leafCanvas);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function addCanopyLeafCards(group) {
  const geometry = new THREE.PlaneGeometry(1, 0.62, 1, 1);
  const leafAlpha = createLeafAlphaTexture();
  const material = new THREE.MeshBasicMaterial({
    color: 0x73aa56,
    alphaMap: leafAlpha,
    alphaTest: 0.38,
    side: THREE.DoubleSide,
  });
  const count = 680;
  const cards = new THREE.InstancedMesh(geometry, material, count);
  cards.name = "AlphaTestJungleLeafCards";
  let made = 0;
  let attempts = 0;
  while (made < count && attempts < count * 7) {
    attempts += 1;
    const zone = jungleZones[Math.floor(rng() * jungleZones.length)];
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = terrainInfo(x, z);
    if (info.laneMask > 0.08 || info.riverMask > 0.22) {
      continue;
    }
    tmpVector.set(x, info.height + 1.18 + rng() * 1.45, z);
    tmpQuat.setFromEuler(new THREE.Euler(-0.2 - rng() * 0.55, rng() * Math.PI * 2, (rng() - 0.5) * 0.8));
    const s = 0.82 + rng() * 1.45;
    tmpScale.set(s * (0.75 + rng() * 0.75), s * (0.58 + rng() * 0.72), 1);
    cards.setMatrixAt(made, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHSL(0.27 + (rng() - 0.5) * 0.055, 0.34 + rng() * 0.18, 0.48 + rng() * 0.18);
    cards.setColorAt(made, tmpColor);
    made += 1;
  }
  cards.count = made;
  cards.instanceMatrix.needsUpdate = true;
  cards.instanceColor.needsUpdate = true;
  group.add(cards);
}

function createPaintedFoliageMaterial(baseHex = 0x5f9949) {
  return new THREE.MeshStandardMaterial({
    color: baseHex,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
    emissive: 0x10200f,
    emissiveIntensity: 0.045,
  });
}

function createPaintedBarkMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x6a4b2d,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    emissive: 0x140b05,
    emissiveIntensity: 0.04,
  });
}

function addHeroJungleTreeClump(x, z, scale, rotation, group, foliageHex = 0x5f9949) {
  const info = terrainInfo(x, z);
  if (info.laneMask > 0.22 || info.riverMask > 0.28) {
    return;
  }
  addGroundDecal(x, z, 2.2 * scale, 1.35 * scale, 0x07120b, 0.13, group, rotation + 0.4, 0.055);

  const clump = new THREE.Group();
  clump.name = "HeroJungleTreeClump";
  clump.position.set(x, info.height + 0.02, z);
  clump.rotation.y = rotation;
  clump.scale.setScalar(scale);

  const barkMaterial = createPaintedBarkMaterial();
  const foliageMaterial = createPaintedFoliageMaterial(foliageHex);
  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.36, 2.1, 7);
  const branchGeometry = new THREE.CylinderGeometry(0.055, 0.13, 1.1, 6);

  const trunk = new THREE.Mesh(trunkGeometry, barkMaterial);
  trunk.position.y = 1.0;
  trunk.rotation.set(0.05, 0.1, -0.11);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  clump.add(trunk);

  const branchDirections = [
    new THREE.Vector3(0.58, 0.72, 0.18),
    new THREE.Vector3(-0.46, 0.68, 0.32),
    new THREE.Vector3(0.12, 0.72, -0.56),
  ];
  branchDirections.forEach((direction, index) => {
    const dir = direction.clone().normalize();
    const branch = new THREE.Mesh(branchGeometry, barkMaterial);
    const baseY = 1.15 + index * 0.22;
    branch.position.set(dir.x * 0.34, baseY + dir.y * 0.45, dir.z * 0.34);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    branch.castShadow = true;
    clump.add(branch);
  });

  const crownGeometry = new THREE.IcosahedronGeometry(0.95, 1);
  const crownOffsets = [
    [0, 2.55, 0, 1.35, 0.9, 1.12],
    [-0.75, 2.22, 0.1, 1.05, 0.74, 0.92],
    [0.82, 2.16, 0.22, 1.1, 0.72, 0.95],
    [0.16, 2.05, -0.78, 1.0, 0.68, 0.9],
    [-0.15, 2.92, -0.08, 0.88, 0.6, 0.78],
  ];
  crownOffsets.forEach(([cx, cy, cz, sx, sy, sz]) => {
    const crown = new THREE.Mesh(crownGeometry, foliageMaterial);
    crown.position.set(cx, cy, cz);
    crown.rotation.set((rng() - 0.5) * 0.36, rng() * Math.PI * 2, (rng() - 0.5) * 0.28);
    crown.scale.set(sx, sy, sz);
    crown.castShadow = true;
    crown.receiveShadow = true;
    clump.add(crown);
  });

  group.add(clump);
}

function addHeroJungleTreeClumps(group) {
  [
    [-22.2, 13.2, 1.0, 0.25, 0x527f3e],
    [16.8, 13.6, 0.92, 0.75, 0x4d7940],
    [22.8, -12.8, 1.02, -0.38, 0x587a3d],
    [-17.2, -22.8, 0.9, 0.95, 0x5b8545],
  ].forEach(([x, z, scale, rotation, color]) => addHeroJungleTreeClump(x, z, scale, rotation, group, color));
}

function addJungleMassShadows(group) {
  const geometry = new THREE.CircleGeometry(1, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0x0d2114,
    transparent: true,
    opacity: 0.032,
    depthWrite: false,
  });
  const count = 72;
  const shadows = new THREE.InstancedMesh(geometry, material, count);
  shadows.name = "BakedJungleMassShadows";
  for (let i = 0; i < count; i += 1) {
    const zone = jungleZones[Math.floor(rng() * jungleZones.length)];
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.05, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rng() * Math.PI * 2));
    tmpScale.set(1.4 + rng() * 3.3, 0.58 + rng() * 1.62, 1);
    shadows.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  shadows.instanceMatrix.needsUpdate = true;
  group.add(shadows);
}

function addPaintedGroundAccents(group) {
  const geometry = new THREE.PlaneGeometry(0.32, 0.32, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0xd8c16b,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flowers = new THREE.InstancedMesh(geometry, material, 520);
  flowers.name = "PaintedGroundFlowerAccents";
  const zones = [
    [-23, -5, 8, 3],
    [-14, 7, 6, 3],
    [8, 11, 8, 3],
    [16, -8, 7, 3],
    [-6, -17, 9, 3],
    [4, 5, 5, 2],
  ];
  let made = 0;
  let attempts = 0;
  while (made < 520 && attempts < 520 * 8) {
    attempts += 1;
    const zone = zones[Math.floor(rng() * zones.length)];
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = terrainInfo(x, z);
    if (info.laneMask > 0.42 || info.riverMask > 0.35 || info.wallMask > 0.25) {
      continue;
    }
    tmpVector.set(x, info.height + 0.08, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
    const s = 0.35 + rng() * 0.8;
    tmpScale.set(s * (0.6 + rng() * 0.7), 1, s * (0.6 + rng() * 0.7));
    flowers.setMatrixAt(made, matrix.compose(tmpVector, tmpQuat, tmpScale));
    made += 1;
  }
  flowers.count = made;
  flowers.instanceMatrix.needsUpdate = true;
  group.add(flowers);
}

function createPaintedStoneMaterial(colorHex, accentHex = 0xb7aa7a, emissiveHex = 0x10160f, emissiveIntensity = 0.03) {
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    emissive: emissiveHex,
    emissiveIntensity,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vPaintedLocalPosition;
        varying vec3 vPaintedWorldNormal;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vPaintedLocalPosition = position;
        vPaintedWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vPaintedLocalPosition;
        varying vec3 vPaintedWorldNormal;
        float paintedStoneHash(vec3 p) {
          return fract(sin(dot(p, vec3(73.7, 17.3, 41.9))) * 29371.13);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float top = smoothstep(-0.08, 0.82, vPaintedLocalPosition.y);
        float facing = clamp(dot(normalize(vPaintedWorldNormal), normalize(vec3(-0.35, 0.84, 0.4))) * 0.5 + 0.5, 0.0, 1.0);
        float grain = paintedStoneHash(floor(vPaintedLocalPosition * 7.0));
        vec3 accent = vec3(${new THREE.Color(accentHex).r.toFixed(4)}, ${new THREE.Color(accentHex).g.toFixed(4)}, ${new THREE.Color(accentHex).b.toFixed(4)});
        diffuseColor.rgb *= 0.78 + top * 0.18 + facing * 0.1 + grain * 0.04;
        diffuseColor.rgb = mix(diffuseColor.rgb, accent, top * 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.16), (1.0 - top) * 0.08);
        diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.13, 0.15, 0.12));
      `,
      );
  };
  return material;
}

function addGroundRunePad(x, z, radius, colorHex, group, spokeCount = 8) {
  const info = terrainInfo(x, z);
  const pad = new THREE.Group();
  pad.name = "StrategicObjectiveGroundRunes";
  pad.position.set(x, info.height + 0.075, z);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const darkMaterial = new THREE.MeshBasicMaterial({
    color: 0x07120d,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const softShadow = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.08, 48), darkMaterial);
  softShadow.rotation.x = -Math.PI / 2;
  softShadow.scale.z = 0.82;
  pad.add(softShadow);

  [0.52, 0.82, 1.0].forEach((factor, index) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * factor - 0.035, radius * factor + 0.035, 64), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02 + index * 0.012;
    pad.add(ring);
  });

  for (let i = 0; i < spokeCount; i += 1) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.PlaneGeometry(radius * 0.62, 0.055), ringMaterial);
    spoke.rotation.set(-Math.PI / 2, 0, angle);
    spoke.position.set(Math.cos(angle) * radius * 0.35, 0.06, Math.sin(angle) * radius * 0.35);
    pad.add(spoke);
  }

  group.add(pad);
  return pad;
}

function addGroundDecal(x, z, sx, sz, colorHex, opacity, group, rotation = 0, yOffset = 0.09) {
  const info = terrainInfo(x, z);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const decal = new THREE.Mesh(new THREE.CircleGeometry(1, 32), material);
  decal.name = "HandPaintedGroundDecal";
  decal.position.set(x, info.height + yOffset, z);
  decal.rotation.set(-Math.PI / 2, 0, rotation);
  decal.scale.set(sx, sz, 1);
  group.add(decal);
  return decal;
}

function addStrategicGroundDecals(group) {
  [
    [6.5, 1.2, 5.8, 3.7, 0x06130d, 0.1, -0.38],
    [6.5, 1.2, 3.3, 1.1, 0xe9cf88, 0.1, 0.82],
    [-17, -11.2, 3.2, 2.1, 0x06130d, 0.12, 0.55],
    [18.4, 7.2, 3.2, 2.1, 0x06130d, 0.12, 0.55],
    [-10, -5.5, 4.8, 1.15, 0xe1c178, 0.09, 0.42],
    [10.5, 2.8, 4.5, 1.0, 0xe1c178, 0.08, 0.68],
    [-18.5, 2.5, 3.6, 1.4, 0x082019, 0.1, -0.2],
    [19.5, -2.8, 3.6, 1.4, 0x082019, 0.1, -0.2],
  ].forEach(([x, z, sx, sz, color, opacity, rotation]) => addGroundDecal(x, z, sx, sz, color, opacity, group, rotation));
}

function addStudioBakedLightingPass(group) {
  [
    [-10.5, -6.2, 6.8, 1.55, 0x060f0a, 0.105, 0.46],
    [11.4, 3.4, 6.2, 1.35, 0x060f0a, 0.092, 0.58],
    [-19.8, 7.8, 5.2, 1.55, 0x07120b, 0.08, -0.28],
    [18.8, -15.3, 5.8, 1.6, 0x07120b, 0.085, -0.25],
    [0.8, -13.9, 7.4, 1.35, 0x06100a, 0.075, 0.02],
    [-2.8, 2.2, 6.2, 1.25, 0x06130d, 0.068, -0.22],
    [15.2, 13.9, 5.4, 1.4, 0x07110b, 0.074, 0.3],
  ].forEach(([x, z, sx, sz, color, opacity, rotation]) => {
    const decal = addGroundDecal(x, z, sx, sz, color, opacity, group, rotation, 0.052);
    decal.name = "StudioBakedPaintShadow";
  });

  [
    [-16.0, -11.8, 3.6, 0.72, 0xf3d993, 0.075, 0.4],
    [15.2, 6.7, 3.8, 0.78, 0xf3d993, 0.068, 0.55],
    [-23.2, 5.9, 3.2, 0.62, 0xc7ebb0, 0.052, 0.0],
    [22.4, -9.7, 3.4, 0.7, 0xc7ebb0, 0.052, 0.08],
    [6.7, 1.1, 3.9, 0.82, 0x9ff2d6, 0.092, -0.38],
    [-4.8, 11.2, 3.4, 0.68, 0xbde7ff, 0.052, 0.25],
  ].forEach(([x, z, sx, sz, color, opacity, rotation]) => {
    const decal = addGroundDecal(x, z, sx, sz, color, opacity, group, rotation, 0.085);
    decal.name = "StudioBakedPaintHighlight";
  });
}

function addFocusedTerrainReadabilityPass(group) {
  [
    [-8.8, -3.2, 11.8, 2.15, 0x070f0a, 0.092, 0.34],
    [9.6, 2.4, 12.2, 2.0, 0x070f0a, 0.086, 0.47],
    [-18.8, 7.6, 8.0, 2.1, 0x07150e, 0.078, -0.18],
    [18.6, -8.3, 8.6, 2.15, 0x07150e, 0.08, 0.18],
    [4.4, 0.1, 8.6, 2.45, 0x06110d, 0.085, -0.34],
    [-2.6, -10.2, 9.2, 1.75, 0x06100b, 0.072, 0.14],
  ].forEach(([x, z, sx, sz, color, opacity, rotation]) => {
    const decal = addGroundDecal(x, z, sx, sz, color, opacity, group, rotation, 0.058);
    decal.name = "FocusedChunkTerrainDepthPaint";
  });

  [
    [-10.8, -4.8, 4.8, 0.62, 0xf2d88c, 0.075, 0.36],
    [9.2, 1.8, 4.6, 0.58, 0xf2d88c, 0.07, 0.52],
    [-18.4, 6.7, 3.8, 0.55, 0xbce6a0, 0.052, -0.12],
    [18.8, -8.8, 4.0, 0.55, 0xbce6a0, 0.052, 0.18],
    [5.9, 0.6, 4.2, 0.68, 0x8ff0cf, 0.078, -0.34],
  ].forEach(([x, z, sx, sz, color, opacity, rotation]) => {
    const decal = addGroundDecal(x, z, sx, sz, color, opacity, group, rotation, 0.104);
    decal.name = "FocusedChunkTerrainPaintHighlight";
  });
}

function addLaneCrackStrokes(points, count, group, colorHex = 0x4a3520, opacity = 0.16) {
  const geometry = new THREE.PlaneGeometry(1, 0.08, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cracks = new THREE.InstancedMesh(geometry, material, count);
  cracks.name = "ReadableLanePaintedCracks";
  let made = 0;
  let attempts = 0;
  while (made < count && attempts < count * 8) {
    attempts += 1;
    const p = pathPoint(points, rng());
    const side = (rng() - 0.5) * 3.2;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side + (rng() - 0.5) * 0.55;
    const z = p.z + nz * side + (rng() - 0.5) * 0.55;
    const info = terrainInfo(x, z);
    if (info.riverMask > 0.25 || info.wallMask > 0.25) {
      continue;
    }
    tmpVector.set(x, info.height + 0.105, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (rng() - 0.5) * 1.2));
    tmpScale.set(0.75 + rng() * 1.55, 0.5 + rng() * 0.75, 1);
    cracks.setMatrixAt(made, matrix.compose(tmpVector, tmpQuat, tmpScale));
    made += 1;
  }
  cracks.count = made;
  cracks.instanceMatrix.needsUpdate = true;
  group.add(cracks);
}

function addCliffCreaseShadows(points, count, group, sideBias = 1, opacity = 0.12) {
  const geometry = new THREE.CircleGeometry(1, 24);
  const material = new THREE.MeshBasicMaterial({
    color: 0x07100b,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const creases = new THREE.InstancedMesh(geometry, material, count);
  creases.name = "PaintedCliffCreaseShadows";
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + rng() * 0.8) / count);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * sideBias * (0.9 + rng() * 0.7) + (rng() - 0.5) * 0.45;
    const z = p.z + nz * sideBias * (0.9 + rng() * 0.7) + (rng() - 0.5) * 0.45;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.095, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (rng() - 0.5) * 0.45));
    tmpScale.set(1.15 + rng() * 2.1, 0.16 + rng() * 0.22, 1);
    creases.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  creases.instanceMatrix.needsUpdate = true;
  group.add(creases);
}

function addCliffRimGrass(points, count, group, sideBias = 1) {
  const geometry = createBrushBladeGeometry();
  const material = new THREE.MeshBasicMaterial({
    color: 0x7fab5c,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const grass = new THREE.InstancedMesh(geometry, material, count);
  grass.name = "PaintedCliffRimGrass";
  let made = 0;
  let attempts = 0;
  while (made < count && attempts < count * 8) {
    attempts += 1;
    const p = pathPoint(points, rng());
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * sideBias * (0.35 + rng() * 0.9) + (rng() - 0.5) * 0.45;
    const z = p.z + nz * sideBias * (0.35 + rng() * 0.9) + (rng() - 0.5) * 0.45;
    const info = terrainInfo(x, z);
    if (info.laneMask > 0.22 || info.riverMask > 0.25) {
      continue;
    }
    tmpVector.set(x, info.height + 0.2, z);
    tmpQuat.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.28, rng() * Math.PI * 2, (rng() - 0.5) * 0.24));
    const s = 0.45 + rng() * 0.9;
    tmpScale.set(s * (0.45 + rng() * 0.45), s * (0.55 + rng() * 0.75), s);
    grass.setMatrixAt(made, matrix.compose(tmpVector, tmpQuat, tmpScale));
    made += 1;
  }
  grass.count = made;
  grass.instanceMatrix.needsUpdate = true;
  group.add(grass);
}

function addBrokenLaneDebris(points, count, group, tint = 0x8f805f) {
  const slabGeometry = new THREE.BoxGeometry(0.5, 0.08, 0.28, 1, 1, 1);
  const chipGeometry = new THREE.DodecahedronGeometry(0.12, 0);
  const material = createPaintedStoneMaterial(tint, 0xc4b07a, 0x100e09, 0.025);
  const slabs = new THREE.InstancedMesh(slabGeometry, material, Math.floor(count * 0.55));
  const chips = new THREE.InstancedMesh(chipGeometry, material, Math.ceil(count * 0.45));
  slabs.name = "BrokenLaneEdgeSlabs";
  chips.name = "BrokenLaneStoneChips";
  slabs.castShadow = true;
  slabs.receiveShadow = true;
  chips.castShadow = true;
  chips.receiveShadow = true;

  for (let i = 0; i < slabs.count; i += 1) {
    const p = pathPoint(points, rng());
    const side = (rng() > 0.5 ? 1 : -1) * (1.45 + rng() * 1.35);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side + (rng() - 0.5) * 0.65;
    const z = p.z + nz * side + (rng() - 0.5) * 0.65;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.11, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, -p.angle + (rng() - 0.5) * 1.2, 0));
    const s = 0.7 + rng() * 1.2;
    tmpScale.set(s * (0.8 + rng() * 0.8), 1, s * (0.65 + rng() * 0.8));
    slabs.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }

  for (let i = 0; i < chips.count; i += 1) {
    const p = pathPoint(points, rng());
    const side = (rng() > 0.5 ? 1 : -1) * (1.2 + rng() * 1.9);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side + (rng() - 0.5) * 0.8;
    const z = p.z + nz * side + (rng() - 0.5) * 0.8;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.12, z);
    tmpQuat.setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI));
    const s = 0.5 + rng() * 1.05;
    tmpScale.set(s * (0.8 + rng() * 0.8), s * 0.35, s * (0.7 + rng() * 0.8));
    chips.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }

  slabs.instanceMatrix.needsUpdate = true;
  chips.instanceMatrix.needsUpdate = true;
  group.add(slabs);
  group.add(chips);
}

function createRuneMonolith(x, z, colorHex, group, rotation = 0, scale = 1) {
  const marker = new THREE.Group();
  const info = terrainInfo(x, z);
  marker.position.set(x, info.height + 0.08, z);
  marker.rotation.y = rotation;
  marker.scale.setScalar(scale);

  const stoneMat = createPaintedStoneMaterial(0x596452, 0xb9aa74, 0x10150e, 0.035);
  const darkMat = createPaintedStoneMaterial(0x3d493f, 0x7f7a56, 0x0b120c, 0.03);
  const glowMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.48,
    metalness: 0.02,
    emissive: new THREE.Color(colorHex),
    emissiveIntensity: 0.48,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.96, 0.26, 7), darkMat);
  base.receiveShadow = true;
  marker.add(base);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 1.95, 6), stoneMat);
  pillar.position.y = 1.08;
  pillar.scale.x = 0.82;
  pillar.castShadow = true;
  marker.add(pillar);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.78, 5), stoneMat);
  cap.position.y = 2.34;
  cap.castShadow = true;
  marker.add(cap);
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.68), new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  rune.position.set(0, 1.2, 0.31);
  marker.add(rune);
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMat);
  shard.position.y = 2.72;
  marker.add(shard);

  group.add(marker);
  addContactShadow(x, z, 1.1 * scale, 0.85 * scale, 0.16, group);
  return marker;
}

function createRuinedGateway(x, z, colorHex, group, rotation = 0, scale = 1) {
  const gateway = new THREE.Group();
  const info = terrainInfo(x, z);
  gateway.position.set(x, info.height + 0.08, z);
  gateway.rotation.y = rotation;
  gateway.scale.setScalar(scale);

  const stoneMat = createPaintedStoneMaterial(0x5c6758, 0xb8aa78, 0x10160f, 0.04);
  const darkMat = createPaintedStoneMaterial(0x3e4b42, 0x85815d, 0x0d130d, 0.035);
  const glowMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  [-0.85, 0.85].forEach((side) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.42, 2.5, 6), stoneMat);
    pillar.position.set(side, 1.25, 0);
    pillar.rotation.z = side * 0.08;
    pillar.castShadow = true;
    gateway.add(pillar);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.28, 0.64), darkMat);
    foot.position.set(side, 0.16, 0);
    foot.rotation.y = side * 0.16;
    foot.receiveShadow = true;
    gateway.add(foot);
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.5,
      emissive: new THREE.Color(colorHex),
      emissiveIntensity: 0.48,
    }));
    shard.position.set(side, 2.68, 0);
    gateway.add(shard);
  });

  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.13, 8, 32, Math.PI), stoneMat);
  arch.position.set(0, 2.35, 0);
  arch.rotation.set(0, Math.PI * 0.5, Math.PI);
  arch.castShadow = true;
  gateway.add(arch);

  const rune = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.08), glowMat);
  rune.position.set(0, 1.38, 0.06);
  rune.rotation.x = -0.12;
  gateway.add(rune);

  group.add(gateway);
  addGroundDecal(x, z, 1.9 * scale, 0.85 * scale, 0x06130d, 0.14, group, rotation, 0.08);
  return gateway;
}

function addRiverFord(group) {
  const stoneMat = createPaintedStoneMaterial(0x6a705d, 0xc8bb82, 0x10150e, 0.035);
  const path = [
    [-15.2, -2.1],
    [-12.9, -2.65],
    [-10.4, -3.1],
    [-7.7, -3.85],
    [-5.1, -4.42],
  ];
  path.forEach(([x, z], index) => {
    const info = terrainInfo(x, z);
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72 + rng() * 0.18, 0), stoneMat);
    stone.name = "ReadableRiverFordStones";
    stone.position.set(x, info.height + 0.2, z);
    stone.rotation.set((rng() - 0.5) * 0.2, -0.32 + index * 0.08, (rng() - 0.5) * 0.16);
    stone.scale.set(1.45 + rng() * 0.35, 0.18 + rng() * 0.08, 0.72 + rng() * 0.22);
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
    addGroundDecal(x, z, 1.2, 0.5, 0xaeeed0, 0.08, group, -0.3, 0.105);
  });
}

function addStoneCauseway(x, z, length, width, rotation, group, tint = 0x6a705d) {
  const causeway = new THREE.Group();
  const info = terrainInfo(x, z);
  causeway.name = "SculptedRiverCauseway";
  causeway.position.set(x, info.height + 0.18, z);
  causeway.rotation.y = rotation;

  const deckMat = createPaintedStoneMaterial(tint, 0xc8bb82, 0x11150d, 0.035);
  const edgeMat = createPaintedStoneMaterial(0x465345, 0x9c986b, 0x0e150d, 0.035);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x9ff2d6,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  addGroundDecal(x, z, length * 0.58, width * 0.82, 0x06120d, 0.18, group, rotation, 0.095);
  addGroundDecal(x, z, length * 0.48, width * 0.26, 0x9ff2d6, 0.06, group, rotation, 0.12);

  const slabCount = 7;
  for (let i = 0; i < slabCount; i += 1) {
    const t = (i / Math.max(1, slabCount - 1)) - 0.5;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(length / slabCount * 0.92, 0.18, width * (0.76 + rng() * 0.1)), deckMat);
    slab.position.set(t * length, 0.06 + Math.sin(i * 0.9) * 0.018, (rng() - 0.5) * 0.08);
    slab.rotation.set((rng() - 0.5) * 0.035, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.025);
    slab.castShadow = true;
    slab.receiveShadow = true;
    causeway.add(slab);

    if (i % 2 === 0) {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(length / slabCount * 0.55, 0.045), glowMat);
      seam.position.set(t * length + length / slabCount * 0.18, 0.18, 0);
      seam.rotation.x = -Math.PI / 2;
      causeway.add(seam);
    }
  }

  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length * 0.94, 0.22, 0.18), edgeMat);
    rail.position.set(0, 0.22, side * width * 0.52);
    rail.castShadow = true;
    rail.receiveShadow = true;
    causeway.add(rail);

    for (let i = 0; i < 4; i += 1) {
      const t = (i / 3) - 0.5;
      const anchor = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + rng() * 0.08, 0), edgeMat);
      anchor.position.set(t * length * 0.86, 0.35, side * width * 0.62);
      anchor.scale.set(1.15, 0.48, 0.86);
      anchor.rotation.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI);
      anchor.castShadow = true;
      causeway.add(anchor);
    }
  });

  const endCapMat = createPaintedStoneMaterial(0x53604f, 0xb5a978, 0x10170f, 0.03);
  [-1, 1].forEach((side) => {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.32, width * 1.2), endCapMat);
    cap.position.set(side * length * 0.53, 0.12, 0);
    cap.castShadow = true;
    cap.receiveShadow = true;
    causeway.add(cap);
  });

  group.add(causeway);
  return causeway;
}

function addRiverCauseways(group) {
  addStoneCauseway(-9.5, -3.55, 6.9, 1.65, -0.28, group, 0x6d6f5b);
  addStoneCauseway(13.2, 1.4, 6.2, 1.5, 0.42, group, 0x666c59);
}

function addJungleRootProps(group) {
  const rootMat = new THREE.MeshStandardMaterial({
    color: 0x4b3b24,
    roughness: 0.92,
    metalness: 0,
    emissive: 0x100a05,
    emissiveIntensity: 0.03,
  });
  const rootSpecs = [
    [-22.5, 10.8, -0.5, 4.8, 1.1],
    [-16.2, -18.7, 0.35, 5.4, 1.0],
    [13.4, 14.2, 0.75, 4.6, 0.9],
    [21.6, -12.4, -0.95, 4.2, 0.85],
  ];
  rootSpecs.forEach(([x, z, angle, length, scale]) => {
    const points = [];
    for (let i = 0; i < 5; i += 1) {
      const t = i / 4;
      const px = x + Math.cos(angle) * length * (t - 0.5) + Math.sin(t * Math.PI * 2) * 0.35;
      const pz = z + Math.sin(angle) * length * (t - 0.5) + Math.cos(t * Math.PI * 1.5) * 0.24;
      const info = terrainInfo(px, pz);
      points.push(new THREE.Vector3(px, info.height + 0.16 + Math.sin(t * Math.PI) * 0.12, pz));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const root = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.085 * scale, 6, false), rootMat);
    root.name = "PaintedJungleRootProp";
    root.castShadow = true;
    root.receiveShadow = true;
    group.add(root);
  });
}

function addTowerBaseArchitecture(x, z, teamColor, group, rotation = 0) {
  const info = terrainInfo(x, z);
  const baseGroup = new THREE.Group();
  baseGroup.name = "ReadableTowerGameplayPlinth";
  baseGroup.position.set(x, info.height + 0.08, z);
  baseGroup.rotation.y = rotation;

  const stoneMat = createPaintedStoneMaterial(0x6f6a55, 0xc2b279, 0x12130d, 0.04);
  const darkMat = createPaintedStoneMaterial(0x465247, 0x88855f, 0x0c120c, 0.04);
  const glowMat = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.5,
    metalness: 0.02,
    emissive: new THREE.Color(teamColor),
    emissiveIntensity: 0.46,
  });

  addGroundDecal(x, z, 3.9, 2.55, 0x050e09, 0.18, group, rotation, 0.055);
  addGroundDecal(x, z, 2.9, 0.72, teamColor, 0.06, group, rotation, 0.12);

  const stairSpecs = [
    [0, -1.95, 2.9, 0.4, 0.12],
    [0, -1.48, 2.25, 0.34, 0.18],
    [0, 1.72, 2.45, 0.34, 0.12],
  ];
  stairSpecs.forEach(([sx, sz, width, depth, height], index) => {
    const stair = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), index === 1 ? darkMat : stoneMat);
    stair.position.set(sx, height * 0.5 + index * 0.03, sz);
    stair.castShadow = true;
    stair.receiveShadow = true;
    baseGroup.add(stair);
  });

  [-1, 1].forEach((side) => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 2.7), stoneMat);
    wing.position.set(side * 2.05, 0.18, -0.08);
    wing.rotation.y = side * 0.13;
    wing.castShadow = true;
    wing.receiveShadow = true;
    baseGroup.add(wing);

    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 1.85, 5), darkMat);
    obelisk.position.set(side * 2.18, 1.0, 1.25);
    obelisk.rotation.z = side * 0.08;
    obelisk.castShadow = true;
    baseGroup.add(obelisk);

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat);
    crystal.position.set(side * 2.18, 2.08, 1.25);
    baseGroup.add(crystal);
  });

  const crest = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 0.16), new THREE.MeshBasicMaterial({
    color: teamColor,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  crest.position.set(0, 0.24, -1.42);
  crest.rotation.x = -Math.PI / 2;
  baseGroup.add(crest);

  group.add(baseGroup);
}

function addObjectiveGuardianCrown(group, x, z) {
  const info = terrainInfo(x, z);
  const crownGroup = new THREE.Group();
  crownGroup.name = "CentralObjectiveGuardianCrown";
  crownGroup.position.set(x, info.height + 0.12, z);

  const stoneMat = createPaintedStoneMaterial(0x56645c, 0xbfb27a, 0x101812, 0.05);
  const darkMat = createPaintedStoneMaterial(0x384840, 0x848460, 0x0b130f, 0.045);
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x69f1ca,
    roughness: 0.48,
    metalness: 0.02,
    emissive: 0x1c9b86,
    emissiveIntensity: 0.52,
  });

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.25;
    const radius = i % 2 === 0 ? 4.7 : 3.85;
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.62, 2.5 + (i % 2) * 0.5, 6), i % 2 === 0 ? stoneMat : darkMat);
    pylon.position.set(Math.cos(angle) * radius, 1.22, Math.sin(angle) * radius);
    pylon.rotation.set(0.08, -angle, (rng() - 0.5) * 0.14);
    pylon.castShadow = true;
    pylon.receiveShadow = true;
    crownGroup.add(pylon);

    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.65, 5), darkMat);
    blade.position.set(Math.cos(angle) * (radius * 0.88), 2.7, Math.sin(angle) * (radius * 0.88));
    blade.rotation.set(0.56, -angle, 0.12);
    blade.scale.set(0.65, 1, 0.38);
    blade.castShadow = true;
    crownGroup.add(blade);

    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), glowMat);
    shard.position.set(Math.cos(angle) * (radius * 0.72), 2.9, Math.sin(angle) * (radius * 0.72));
    crownGroup.add(shard);
  }

  [0, Math.PI * 0.5].forEach((rotation, index) => {
    const span = new THREE.Mesh(new THREE.TorusGeometry(2.95 + index * 0.42, 0.055, 8, 64, Math.PI), glowMat);
    span.position.y = 1.0 + index * 0.34;
    span.rotation.set(Math.PI * 0.5, 0, rotation + Math.PI * 0.5);
    span.scale.z = 0.48;
    crownGroup.add(span);
  });

  group.add(crownGroup);
  addGroundDecal(x, z, 6.2, 4.4, 0x06120d, 0.16, group, -0.38, 0.052);
}

function createTower(x, z, teamColor, group) {
  const tower = new THREE.Group();
  const info = terrainInfo(x, z);
  tower.position.set(x, info.height + 0.05, z);

  addGroundRunePad(x, z, 2.55, teamColor, group, 8);
  addTowerBaseArchitecture(x, z, teamColor, group, x < 0 ? 0.46 : -2.7);

  const baseMaterial = createPaintedStoneMaterial(0x746b58, 0xb8a874, 0x14170f, 0.04);
  const darkStoneMaterial = createPaintedStoneMaterial(0x4b574d, 0x928f67, 0x0d130c, 0.035);
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: teamColor,
    roughness: 0.42,
    metalness: 0.02,
    emissive: new THREE.Color(teamColor),
    emissiveIntensity: 0.8,
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.65, 0.42, 8), baseMaterial);
  base.castShadow = true;
  base.receiveShadow = true;
  tower.add(base);
  const footing = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 2.18, 0.14, 8), baseMaterial);
  footing.position.y = -0.03;
  footing.receiveShadow = true;
  tower.add(footing);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 1.1), baseMaterial);
    buttress.position.set(Math.cos(angle) * 1.25, 0.28, Math.sin(angle) * 1.25);
    buttress.rotation.y = -angle;
    buttress.castShadow = true;
    tower.add(buttress);
  }
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.16), darkStoneMaterial);
    curb.position.set(Math.cos(angle) * 1.72, 0.14, Math.sin(angle) * 1.72);
    curb.rotation.y = -angle;
    curb.castShadow = true;
    tower.add(curb);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.82, 2.5, 7), baseMaterial);
  shaft.position.y = 1.45;
  shaft.castShadow = true;
  tower.add(shaft);
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + 0.35;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.75, 0.22), darkStoneMaterial);
    rib.position.set(Math.cos(angle) * 0.66, 1.75, Math.sin(angle) * 0.66);
    rib.rotation.y = -angle;
    rib.castShadow = true;
    tower.add(rib);
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.62, 0.42, 7), glowMaterial);
  crown.position.y = 2.85;
  crown.castShadow = true;
  tower.add(crown);
  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.07, 8, 28), glowMaterial);
  crownRing.rotation.x = Math.PI / 2;
  crownRing.position.y = 3.08;
  tower.add(crownRing);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.56, 0), glowMaterial);
  crystal.position.y = 3.52;
  tower.add(crystal);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.05, 4), glowMaterial);
    wing.position.set(Math.cos(angle) * 0.88, 3.24, Math.sin(angle) * 0.88);
    wing.rotation.set(0.58, -angle, 0.18);
    wing.scale.z = 0.5;
    wing.castShadow = true;
    tower.add(wing);
  }
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: teamColor,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.34, 4.2, 10, 1, true), beamMaterial);
  beam.position.y = 5.0;
  tower.add(beam);
  const light = new THREE.PointLight(teamColor, 1.2, 8);
  light.position.y = 3.3;
  tower.add(light);
  group.add(tower);
  return tower;
}

function createObjectiveShrine(group) {
  const shrine = new THREE.Group();
  const x = 6.5;
  const z = 1.2;
  const info = terrainInfo(x, z);
  shrine.position.set(x, info.height + 0.12, z);

  addGroundRunePad(x, z, 5.15, 0x62e5bd, group, 12);
  addObjectiveGuardianCrown(group, x, z);

  const stoneMat = createPaintedStoneMaterial(0x56625b, 0xa9a070, 0x101812, 0.05);
  const darkStoneMat = createPaintedStoneMaterial(0x3f4b45, 0x85855f, 0x0d140f, 0.04);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x66c8b4,
    roughness: 0.55,
    metalness: 0.02,
    emissive: 0x1a8a7b,
    emissiveIntensity: 0.18,
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.45, 0.28, 56), stoneMat);
  disc.receiveShadow = true;
  disc.castShadow = true;
  shrine.add(disc);
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 + (i % 2) * 0.08;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.78 + rng() * 0.55, 0.16, 0.34 + rng() * 0.28), i % 3 === 0 ? darkStoneMat : stoneMat);
    slab.position.set(Math.cos(angle) * (4.05 + rng() * 0.28), 0.16, Math.sin(angle) * (4.05 + rng() * 0.28));
    slab.rotation.y = -angle + (rng() - 0.5) * 0.32;
    slab.castShadow = true;
    slab.receiveShadow = true;
    shrine.add(slab);
  }
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0x62e5bd,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const aura = new THREE.Mesh(new THREE.CircleGeometry(4.8, 64), auraMat);
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.18;
  shrine.add(aura);
  const inlayMat = new THREE.MeshBasicMaterial({
    color: 0x9ff3d0,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI * 0.125;
    const inlay = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 0.07), inlayMat);
    inlay.position.set(Math.cos(angle) * 1.28, 0.34, Math.sin(angle) * 1.28);
    inlay.rotation.set(-Math.PI / 2, 0, angle);
    shrine.add(inlay);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.1, 8, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  shrine.add(ring);
  const crystalMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uVisible: { value: 1 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uVisible;
      varying vec3 vPos;
      void main() {
        float pulse = 0.5 + 0.5 * sin(uTime * 1.7 + vPos.y * 3.0);
        vec3 color = mix(vec3(0.12, 0.75, 0.68), vec3(0.85, 1.0, 0.76), pulse);
        gl_FragColor = vec4(color, (0.72 + pulse * 0.22) * uVisible);
      }
    `,
  });
  state.objectiveShaders.push(crystalMat);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.65, 0), crystalMat);
  crystal.position.y = 2.34;
  crystal.castShadow = true;
  shrine.add(crystal);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x8effd6,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.78, 5.8, 14, 1, true), beaconMat);
  beacon.position.y = 4.12;
  shrine.add(beacon);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.15), beaconMat);
    fin.position.set(Math.cos(angle) * 0.32, 3.1, Math.sin(angle) * 0.32);
    fin.rotation.set(0, -angle, 0);
    shrine.add(fin);
  }
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + 0.22;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 1.65 + (i % 2) * 0.48, 6), stoneMat);
    pillar.position.set(Math.cos(angle) * 3.15, 0.9, Math.sin(angle) * 3.15);
    pillar.rotation.z = (rng() - 0.5) * 0.18;
    pillar.castShadow = true;
    shrine.add(pillar);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), ringMat);
    cap.position.set(Math.cos(angle) * 3.15, 1.84 + (i % 2) * 0.44, Math.sin(angle) * 3.15);
    shrine.add(cap);
  }
  const archMat = new THREE.MeshStandardMaterial({
    color: 0x71806d,
    roughness: 0.86,
    metalness: 0,
    emissive: 0x0a2a22,
    emissiveIntensity: 0.08,
  });
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + 0.42;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.14, 8, 28, Math.PI * 1.18), archMat);
    arch.position.set(Math.cos(angle) * 3.9, 1.32, Math.sin(angle) * 3.9);
    arch.rotation.set(Math.PI * 0.5, 0, -angle + Math.PI * 0.08);
    arch.scale.set(1.0, 1.35, 1.0);
    arch.castShadow = true;
    shrine.add(arch);
  }
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + 0.18;
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.45, 5), darkStoneMat);
    claw.position.set(Math.cos(angle) * 2.25, 2.05, Math.sin(angle) * 2.25);
    claw.rotation.set(0.42, -angle, (rng() - 0.5) * 0.16);
    claw.scale.set(0.78, 1, 0.5);
    claw.castShadow = true;
    shrine.add(claw);
  }
  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.07, 8, 48), ringMat);
  crownRing.position.y = 3.1;
  crownRing.rotation.x = Math.PI / 2;
  shrine.add(crownRing);
  const light = new THREE.PointLight(0x65e6c6, 3.2, 14);
  light.position.y = 3.0;
  shrine.add(light);
  group.add(shrine);
}

function createJungleCamp(x, z, hue, group) {
  const camp = new THREE.Group();
  const info = terrainInfo(x, z);
  camp.position.set(x, info.height + 0.06, z);
  const glow = new THREE.Color().setHSL(hue, 0.72, 0.58);

  addGroundRunePad(x, z, 2.65, glow, group, 6);

  const baseMat = createPaintedStoneMaterial(0x665743, 0xb69b62, 0x15110c, 0.035);
  const darkMat = createPaintedStoneMaterial(0x3f4b3f, 0x897e57, 0x0c120c, 0.03);
  const auraMat = new THREE.MeshBasicMaterial({
    color: glow,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: glow,
    roughness: 0.58,
    emissive: glow,
    emissiveIntensity: 0.42,
  });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.95, 0.18, 18), baseMat);
  pad.receiveShadow = true;
  camp.add(pad);
  const innerPad = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.22, 0.16, 9), darkMat);
  innerPad.position.y = 0.13;
  innerPad.receiveShadow = true;
  camp.add(innerPad);
  const aura = new THREE.Mesh(new THREE.CircleGeometry(2.45, 36), auraMat);
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.12;
  camp.add(aura);
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + rng() * 0.2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 + rng() * 0.26, 0), i % 2 === 0 ? baseMat : darkMat);
    stone.position.set(Math.cos(a) * (1.2 + rng() * 0.5), 0.28, Math.sin(a) * (1.1 + rng() * 0.5));
    stone.scale.y = 0.62 + rng() * 0.75;
    stone.castShadow = true;
    camp.add(stone);
  }
  const totem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 1.25, 6), darkMat);
  totem.position.y = 0.78;
  totem.castShadow = true;
  camp.add(totem);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.25;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 5), glowMat);
    horn.position.set(Math.cos(a) * 0.36, 1.32, Math.sin(a) * 0.36);
    horn.rotation.set(0.7, -a, 0);
    camp.add(horn);
  }
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 8, 28), glowMat);
  rune.rotation.x = Math.PI / 2;
  rune.position.y = 0.24;
  camp.add(rune);
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), glowMat);
  shard.position.y = 1.58;
  camp.add(shard);
  const light = new THREE.PointLight(glow, 0.95, 5.5);
  light.position.y = 1.1;
  camp.add(light);
  group.add(camp);
}

function createLaneBanner(x, z, colorHex, group) {
  const banner = new THREE.Group();
  const info = terrainInfo(x, z);
  banner.position.set(x, info.height + 0.08, z);
  const poleMat = createPaintedStoneMaterial(0x5f4830, 0xb08b55, 0x0d0905, 0.025);
  const clothMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 2.15, 6), poleMat);
  pole.position.y = 1.05;
  pole.castShadow = true;
  banner.add(pole);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 5), poleMat);
  cap.position.y = 2.28;
  banner.add(cap);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.72, 4, 3), clothMat);
  cloth.position.set(0.52, 1.55, 0);
  cloth.rotation.y = Math.PI * 0.5;
  banner.add(cloth);
  addGroundDecal(x, z, 0.72, 0.46, 0x06130d, 0.12, group, rng() * Math.PI, 0.06);
  group.add(banner);
}

function addContactShadow(x, z, sx, sz, opacity, group) {
  const info = terrainInfo(x, z);
  const material = new THREE.MeshBasicMaterial({
    color: 0x071008,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 36), material);
  shadow.position.set(x, info.height + 0.025, z);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(sx, sz, 1);
  group.add(shadow);
}

function addPathPaintedShadows(points, count, width, opacity, group) {
  const geometry = new THREE.CircleGeometry(1, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0x08120d,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const shadows = new THREE.InstancedMesh(geometry, material, count);
  shadows.name = "PaintedGameplayWallShadows";
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + 0.5) / count);
    const x = p.x + (rng() - 0.5) * 0.8;
    const z = p.z + (rng() - 0.5) * 0.8;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.055, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle));
    tmpScale.set(width * (0.65 + rng() * 0.5), width * (0.3 + rng() * 0.26), 1);
    shadows.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  shadows.instanceMatrix.needsUpdate = true;
  group.add(shadows);
}

function addCliffTopHighlights(points, count, group) {
  const geometry = new THREE.CircleGeometry(1, 18);
  const material = new THREE.MeshBasicMaterial({
    color: 0xdad6ae,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  const highlights = new THREE.InstancedMesh(geometry, material, count);
  highlights.name = "PaintedCliffTopHighlights";
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + 0.5) / count);
    const side = rng() > 0.5 ? 1 : -1;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side * (0.35 + rng() * 0.55) + (rng() - 0.5) * 0.5;
    const z = p.z + nz * side * (0.35 + rng() * 0.55) + (rng() - 0.5) * 0.5;
    const info = terrainInfo(x, z);
    tmpVector.set(x, info.height + 0.18, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (rng() - 0.5) * 0.45));
    tmpScale.set(1.1 + rng() * 1.9, 0.18 + rng() * 0.34, 1);
    highlights.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  highlights.instanceMatrix.needsUpdate = true;
  group.add(highlights);
}

const productionBounds = {
  minX: -26,
  maxX: 26,
  minZ: -18,
  maxZ: 18,
};

const productionFootprintOutline = [
  [-27.5, 9.8],
  [-24.0, 15.2],
  [-12.5, 16.8],
  [1.5, 15.6],
  [14.2, 16.0],
  [27.2, 11.6],
  [28.4, 3.6],
  [27.4, -7.8],
  [22.5, -15.8],
  [8.0, -17.6],
  [-6.8, -17.4],
  [-20.8, -16.2],
  [-28.0, -10.2],
  [-29.0, -1.6],
];

const productionLane = [
  [-23, -9.2],
  [-15.8, -7.2],
  [-8.4, -4.6],
  [-1.2, -2.2],
  [6.7, 1.0],
  [15.2, 4.3],
  [23.2, 8.3],
];

const productionRiver = [
  [-24.2, 5.6],
  [-16.4, 2.8],
  [-8.6, 0.4],
  [-0.8, -0.8],
  [7.8, -0.2],
  [16.2, 2.4],
  [24.0, 5.4],
];

const productionNorthCliff = [
  [-24.5, 10.8],
  [-17.0, 13.0],
  [-8.5, 12.2],
  [1.5, 10.8],
  [12.0, 12.2],
  [24.2, 10.2],
];

const productionSouthCliff = [
  [-24.2, -15.0],
  [-14.0, -14.4],
  [-4.2, -13.2],
  [5.6, -12.2],
  [15.8, -11.1],
  [24.5, -12.6],
];

const productionWestCliff = [
  [-24.5, 10.8],
  [-25.2, 4.8],
  [-24.2, -1.8],
  [-25.0, -8.2],
  [-24.2, -15.0],
];

const productionEastCliff = [
  [24.2, 10.2],
  [25.0, 4.4],
  [24.4, -1.7],
  [25.2, -7.1],
  [24.5, -12.6],
];

const productionBrushZones = [
  [-18.2, 9.1, 5.2, 2.3],
  [-4.8, 9.5, 6.4, 2.2],
  [14.8, 8.8, 6.0, 2.3],
  [-18.8, -12.2, 5.8, 2.2],
  [2.0, -11.3, 6.8, 2.1],
  [17.2, -8.8, 5.8, 2.4],
  [-13.2, -1.2, 3.1, 1.5],
  [11.8, 5.0, 3.2, 1.6],
];

function productionWorldToTexturePoint(x, z, textureWidth, textureHeight) {
  return {
    x: ((x - productionBounds.minX) / (productionBounds.maxX - productionBounds.minX)) * textureWidth,
    y: ((productionBounds.maxZ - z) / (productionBounds.maxZ - productionBounds.minZ)) * textureHeight,
  };
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0];
    const zi = polygon[i][1];
    const xj = polygon[j][0];
    const zj = polygon[j][1];
    const denom = Math.abs(zj - zi) < 0.0001 ? 0.0001 : zj - zi;
    const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / denom + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function drawProductionPath(context, points, textureWidth, textureHeight, worldWidth, strokeStyle, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = worldWidth * (textureWidth / (productionBounds.maxX - productionBounds.minX));
  context.strokeStyle = strokeStyle;
  const first = productionWorldToTexturePoint(points[0][0], points[0][1], textureWidth, textureHeight);
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = productionWorldToTexturePoint(points[i][0], points[i][1], textureWidth, textureHeight);
    const previous = productionWorldToTexturePoint(points[i - 1][0], points[i - 1][1], textureWidth, textureHeight);
    const midX = (previous.x + point.x) * 0.5;
    const midY = (previous.y + point.y) * 0.5;
    context.quadraticCurveTo(previous.x, previous.y, midX, midY);
  }
  const last = productionWorldToTexturePoint(points[points.length - 1][0], points[points.length - 1][1], textureWidth, textureHeight);
  context.lineTo(last.x, last.y);
  context.stroke();
  context.restore();
}

function drawProductionRing(context, x, z, radius, textureWidth, textureHeight, strokeStyle, alpha = 1, worldWidth = 0.18) {
  const center = productionWorldToTexturePoint(x, z, textureWidth, textureHeight);
  const pxRadius = radius * (textureWidth / (productionBounds.maxX - productionBounds.minX));
  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = strokeStyle;
  context.lineWidth = worldWidth * (textureWidth / (productionBounds.maxX - productionBounds.minX));
  context.beginPath();
  context.ellipse(center.x, center.y, pxRadius, pxRadius * 1.18, -0.25, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function productionTerrainInfo(x, z) {
  const lane = distanceToPath(x, z, productionLane);
  const riverPath = distanceToPath(x, z, productionRiver);
  const north = distanceToPath(x, z, productionNorthCliff);
  const south = distanceToPath(x, z, productionSouthCliff);
  const west = distanceToPath(x, z, productionWestCliff);
  const east = distanceToPath(x, z, productionEastCliff);
  const laneMask = 1 - smoothstep(1.65, 4.35, lane.dist);
  const shoulderMask = 1 - smoothstep(3.4, 7.6, lane.dist);
  const riverMask = 1 - smoothstep(1.35, 3.35, riverPath.dist);
  const riverBankMask = (1 - smoothstep(2.8, 5.4, riverPath.dist)) * (1 - riverMask * 0.72);
  const cliffMask = Math.max(
    1 - smoothstep(1.0, 3.35, north.dist),
    1 - smoothstep(1.0, 3.25, south.dist),
    1 - smoothstep(0.9, 3.1, west.dist),
    1 - smoothstep(0.9, 3.1, east.dist),
  );
  let jungleMask = 0;
  productionBrushZones.forEach(([cx, cz, rx, rz]) => {
    const oval = Math.hypot((x - cx) / rx, (z - cz) / rz);
    jungleMask = Math.max(jungleMask, 1 - smoothstep(0.52, 1.12, oval));
  });
  const edgeMask = Math.max(
    smoothstep(20.2, 25.6, Math.abs(x)),
    smoothstep(12.6, 17.6, Math.abs(z)),
  );
  const objectiveMask = 1 - smoothstep(3.0, 6.2, Math.hypot(x - 3.2, z + 0.4));
  const broadNoise = noise2(x * 0.22 - 7.0, z * 0.22 + 2.0);
  const detailNoise = noise2(x * 0.72 + 8.0, z * 0.72 - 12.0);
  const height =
    0.05 -
    riverMask * 0.48 -
    laneMask * 0.1 +
    shoulderMask * 0.08 +
    riverBankMask * 0.12 +
    cliffMask * 0.98 +
    jungleMask * 0.24 +
    edgeMask * 0.14 +
    objectiveMask * 0.15 +
    broadNoise * 0.22 +
    detailNoise * 0.06;
  return {
    laneMask,
    shoulderMask,
    riverMask,
    riverBankMask,
    cliffMask,
    jungleMask,
    edgeMask,
    objectiveMask,
    height,
    noise: broadNoise * 0.72 + detailNoise * 0.28,
    laneDist: lane.dist,
    riverDist: riverPath.dist,
  };
}

function productionTerrainColor(x, z, info) {
  const grassShadow = new THREE.Color(0x2d4930);
  const grassLight = new THREE.Color(0x759755);
  const laneDark = new THREE.Color(0x64492b);
  const laneLight = new THREE.Color(0xbfa66a);
  const riverBed = new THREE.Color(0x27666a);
  const riverLight = new THREE.Color(0x5cae9b);
  const cliff = new THREE.Color(0x5d6756);
  const moss = new THREE.Color(0x4e7c3d);
  const objective = new THREE.Color(0x78806a);
  const color = grassShadow.clone().lerp(grassLight, smoothstep(0.1, 0.82, info.noise));
  color.lerp(moss, info.jungleMask * 0.5);
  color.lerp(laneDark.clone().lerp(laneLight, 0.2 + info.noise * 0.28), info.laneMask * 0.86);
  color.lerp(riverBed.clone().lerp(riverLight, 0.28), info.riverMask * 0.84);
  color.lerp(new THREE.Color(0x90b178), info.riverBankMask * 0.16);
  color.lerp(objective, info.objectiveMask * 0.38);
  color.lerp(cliff, info.cliffMask * 0.82);
  color.lerp(new THREE.Color(0x16231b), info.edgeMask * 0.16);
  color.offsetHSL(0, 0.012 * (noise2(x * 1.4 + 4.0, z * 1.4 - 3.0) - 0.5), 0.05 * (noise2(x * 2.1, z * 2.1) - 0.5));
  return color;
}

function createProductionTerrainTexture() {
  const width = 1280;
  const height = 880;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = width;
  textureCanvas.height = height;
  const context = textureCanvas.getContext("2d");
  const image = context.createImageData(width, height);
  const data = image.data;
  for (let py = 0; py < height; py += 1) {
    const z = THREE.MathUtils.lerp(productionBounds.maxZ, productionBounds.minZ, py / (height - 1));
    for (let px = 0; px < width; px += 1) {
      const x = THREE.MathUtils.lerp(productionBounds.minX, productionBounds.maxX, px / (width - 1));
      const info = productionTerrainInfo(x, z);
      const color = productionTerrainColor(x, z, info);
      const index = (py * width + px) * 4;
      data[index] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
      data[index + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
      data[index + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  context.globalCompositeOperation = "multiply";
  drawProductionPath(context, productionLane, width, height, 7.8, "rgba(49, 34, 19, 1)", 0.2);
  drawProductionPath(context, productionLane, width, height, 4.8, "rgba(133, 93, 48, 1)", 0.13);
  drawProductionPath(context, productionRiver, width, height, 5.1, "rgba(8, 56, 61, 1)", 0.2);
  [productionNorthCliff, productionSouthCliff, productionWestCliff, productionEastCliff].forEach((points) => {
    drawProductionPath(context, points, width, height, 4.4, "rgba(7, 16, 10, 1)", 0.21);
  });

  context.globalCompositeOperation = "screen";
  drawProductionPath(context, productionLane, width, height, 1.7, "rgba(255, 226, 142, 1)", 0.1);
  drawProductionPath(context, productionLane, width, height, 0.24, "rgba(255, 245, 191, 1)", 0.18);
  drawProductionPath(context, productionRiver, width, height, 0.52, "rgba(151, 255, 222, 1)", 0.2);
  drawProductionRing(context, 3.2, -0.4, 4.6, width, height, "rgba(134, 255, 214, 1)", 0.34, 0.2);
  drawProductionRing(context, -12.6, -1.4, 2.6, width, height, "rgba(190, 240, 142, 1)", 0.18, 0.14);
  drawProductionRing(context, 12.0, 4.7, 2.4, width, height, "rgba(255, 170, 92, 1)", 0.16, 0.14);

  context.globalCompositeOperation = "overlay";
  const strokeRng = mulberry32(44581);
  for (let i = 0; i < 5200; i += 1) {
    const x = strokeRng() * width;
    const y = strokeRng() * height;
    const worldX = THREE.MathUtils.lerp(productionBounds.minX, productionBounds.maxX, x / width);
    const worldZ = THREE.MathUtils.lerp(productionBounds.maxZ, productionBounds.minZ, y / height);
    const info = productionTerrainInfo(worldX, worldZ);
    const angle = info.laneMask > 0.28 ? -0.42 + strokeRng() * 0.26 : strokeRng() * Math.PI * 2;
    const length = info.laneMask > 0.35 ? 18 + strokeRng() * 56 : info.cliffMask > 0.35 ? 10 + strokeRng() * 42 : 6 + strokeRng() * 28;
    const alpha = info.riverMask > 0.22 ? 0.026 : info.laneMask > 0.35 ? 0.044 : info.cliffMask > 0.35 ? 0.035 : 0.032;
    context.strokeStyle =
      info.laneMask > 0.35
        ? `rgba(239, 215, 143, ${alpha})`
        : info.riverMask > 0.22
          ? `rgba(182, 255, 226, ${alpha})`
          : info.cliffMask > 0.35
            ? `rgba(217, 212, 151, ${alpha})`
            : `rgba(196, 232, 137, ${alpha})`;
    context.lineWidth = 1 + strokeRng() * 2.4;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length * 0.42);
    context.stroke();
  }
  context.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createProductionReliefTexture() {
  const width = 640;
  const height = 440;
  const reliefCanvas = document.createElement("canvas");
  reliefCanvas.width = width;
  reliefCanvas.height = height;
  const context = reliefCanvas.getContext("2d");
  const image = context.createImageData(width, height);
  const data = image.data;
  for (let py = 0; py < height; py += 1) {
    const z = THREE.MathUtils.lerp(productionBounds.maxZ, productionBounds.minZ, py / (height - 1));
    for (let px = 0; px < width; px += 1) {
      const x = THREE.MathUtils.lerp(productionBounds.minX, productionBounds.maxX, px / (width - 1));
      const info = productionTerrainInfo(x, z);
      const grain = noise2(x * 2.6 + 3.0, z * 2.6 - 9.0);
      const fine = noise2(x * 9.0, z * 9.0 + 2.0);
      const strata = Math.abs(Math.sin((x * 0.36 - z * 0.24) * 8.8));
      let value = 0.46 + grain * 0.12 + fine * 0.07;
      value += info.cliffMask * (0.18 + strata * 0.16);
      value += info.laneMask * (0.06 - Math.abs(Math.sin((x + z * 0.6) * 5.3)) * 0.14);
      value -= info.riverMask * 0.22;
      value += info.jungleMask * (noise2(x * 6.0 - 4.0, z * 6.0 + 8.0) - 0.5) * 0.08;
      const shade = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
      const index = (py * width + px) * 4;
      data[index] = shade;
      data[index + 1] = shade;
      data[index + 2] = shade;
      data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(reliefCanvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function createProductionUnderlay() {
  const shape = new THREE.Shape();
  shape.moveTo(productionFootprintOutline[0][0], productionFootprintOutline[0][1]);
  for (let i = 1; i < productionFootprintOutline.length; i += 1) {
    shape.lineTo(productionFootprintOutline[i][0], productionFootprintOutline[i][1]);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 3);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -1.08, 0);
  geometry.computeVertexNormals();
  const underlay = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x14261f,
      roughness: 0.96,
      metalness: 0,
      emissive: 0x07100d,
      emissiveIntensity: 0.035,
    }),
  );
  underlay.name = "ProductionStyleTargetUnderlay";
  underlay.receiveShadow = true;
  return underlay;
}

function createProductionTerrain() {
  const width = productionBounds.maxX - productionBounds.minX;
  const depth = productionBounds.maxZ - productionBounds.minZ;
  const segX = 312;
  const segZ = 216;
  const vertices = [];
  const uvs = [];
  const mask = [];

  function pushVertex(x, z) {
    const info = productionTerrainInfo(x, z);
    vertices.push(x, info.height, z);
    uvs.push((x - productionBounds.minX) / width, (z - productionBounds.minZ) / depth);
    mask.push(info.laneMask, info.riverMask, info.cliffMask, info.jungleMask);
  }

  for (let iz = 0; iz < segZ; iz += 1) {
    const z0 = THREE.MathUtils.lerp(productionBounds.minZ, productionBounds.maxZ, iz / segZ);
    const z1 = THREE.MathUtils.lerp(productionBounds.minZ, productionBounds.maxZ, (iz + 1) / segZ);
    for (let ix = 0; ix < segX; ix += 1) {
      const x0 = THREE.MathUtils.lerp(productionBounds.minX, productionBounds.maxX, ix / segX);
      const x1 = THREE.MathUtils.lerp(productionBounds.minX, productionBounds.maxX, (ix + 1) / segX);
      const cx = (x0 + x1) * 0.5;
      const cz = (z0 + z1) * 0.5;
      if (!pointInPolygon(cx, cz, productionFootprintOutline)) {
        continue;
      }
      pushVertex(x0, z0);
      pushVertex(x0, z1);
      pushVertex(x1, z0);
      pushVertex(x1, z0);
      pushVertex(x0, z1);
      pushVertex(x1, z1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("productionMask", new THREE.Float32BufferAttribute(mask, 4));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: createProductionTerrainTexture(),
    bumpMap: createProductionReliefTexture(),
    bumpScale: 0.16,
    roughness: 0.92,
    metalness: 0,
    emissive: 0x10170f,
    emissiveIntensity: 0.045,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        attribute vec4 productionMask;
        varying vec4 vProductionMask;
        varying vec3 vProductionWorldPosition;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vProductionMask = productionMask;
        vProductionWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec4 vProductionMask;
        varying vec3 vProductionWorldPosition;
        float productionHash(vec2 p) {
          return fract(sin(dot(p, vec2(17.1, 311.7))) * 43758.5453);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float grainA = productionHash(floor(vProductionWorldPosition.xz * 3.2));
        float laneWear = smoothstep(0.22, 0.9, vProductionMask.x);
        float waterInset = smoothstep(0.14, 0.82, vProductionMask.y);
        float cliffFace = smoothstep(0.22, 0.9, vProductionMask.z);
        float foliagePocket = smoothstep(0.18, 0.88, vProductionMask.w);
        diffuseColor.rgb *= 0.9 + grainA * 0.09;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.58, 0.31), laneWear * 0.12);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.32, 0.34), waterInset * 0.16);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.38, 0.31), cliffFace * 0.14);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.27, 0.14), foliagePocket * 0.1);
        diffuseColor.rgb += vec3(0.036, 0.03, 0.014) * laneWear;
        diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.065, 0.09, 0.06));
      `,
      );
  };

  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = "ProductionStyleTargetPaintedTerrain";
  terrain.receiveShadow = true;
  return terrain;
}

function createProductionRiverRibbon() {
  const left = [];
  const right = [];
  const steps = 112;
  for (let i = 0; i <= steps; i += 1) {
    const p = pathPoint(productionRiver, i / steps);
    const next = pathPoint(productionRiver, Math.min(1, (i + 1) / steps));
    const angle = Math.atan2(next.z - p.z, next.x - p.x);
    const width = 1.62 + Math.sin(i * 0.31) * 0.22 + noise2(i * 0.12, 3.0) * 0.12;
    const nx = -Math.sin(angle);
    const nz = Math.cos(angle);
    const info = productionTerrainInfo(p.x, p.z);
    left.push(new THREE.Vector3(p.x + nx * width, info.height + 0.1, p.z + nz * width));
    right.push(new THREE.Vector3(p.x - nx * width, info.height + 0.1, p.z - nz * width));
  }
  const vertices = [];
  const uvs = [];
  for (let i = 0; i < steps; i += 1) {
    const a = left[i];
    const b = right[i];
    const c = left[i + 1];
    const d = right[i + 1];
    vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...b.toArray(), ...d.toArray(), ...c.toArray());
    const v0 = i / steps;
    const v1 = (i + 1) / steps;
    uvs.push(0, v0, 1, v0, 0, v1, 1, v0, 1, v1, 0, v1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: state.flow },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        vUv = uv;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlow;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      void main() {
        float center = 1.0 - smoothstep(0.25, 0.54, abs(vUv.x - 0.5));
        float lineA = smoothstep(0.52, 0.96, sin(vUv.y * 28.0 - uTime * 1.6 * uFlow + vWorldPosition.x * 0.32) * 0.5 + 0.5);
        float lineB = smoothstep(0.68, 0.98, sin(vUv.y * 71.0 + vWorldPosition.z * 0.52 + uTime * 0.72) * 0.5 + 0.5);
        float edgeFoam = (1.0 - smoothstep(0.02, 0.14, vUv.x)) + (1.0 - smoothstep(0.02, 0.14, 1.0 - vUv.x));
        vec3 deep = vec3(0.025, 0.18, 0.18);
        vec3 mid = vec3(0.08, 0.42, 0.38);
        vec3 bright = vec3(0.5, 0.9, 0.7);
        vec3 color = mix(deep, mid, center * 0.68 + lineA * 0.1);
        color = mix(color, bright, (lineA * 0.13 + lineB * 0.07) * center + edgeFoam * 0.12);
        color = mix(color, vec3(0.2, 0.36, 0.24), 0.12);
        float alpha = 0.64 * smoothstep(0.02, 0.18, vUv.x) * smoothstep(0.02, 0.18, 1.0 - vUv.x);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  state.waterShaders.push(material);
  const riverMesh = new THREE.Mesh(geometry, material);
  riverMesh.name = "ProductionStyleTargetWaterRibbon_NoFog";
  return riverMesh;
}

function addProductionGroundDecal(x, z, sx, sz, colorHex, opacity, group, rotation = 0, yOffset = 0.09, name = "ProductionStyleTargetPaintStroke") {
  const info = productionTerrainInfo(x, z);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const decal = new THREE.Mesh(new THREE.CircleGeometry(1, 32), material);
  decal.name = name;
  decal.position.set(x, info.height + yOffset, z);
  decal.rotation.set(-Math.PI / 2, 0, rotation);
  decal.scale.set(sx, sz, 1);
  group.add(decal);
  return decal;
}

function addProductionPaintedLighting(group) {
  [
    [-9.0, -4.6, 9.5, 1.75, 0x061008, 0.11, 0.34],
    [8.4, 1.6, 9.8, 1.55, 0x061008, 0.1, 0.42],
    [3.2, -0.4, 6.6, 3.4, 0x06120d, 0.12, -0.24],
    [-18.4, 8.7, 6.8, 1.8, 0x07110b, 0.105, -0.2],
    [17.8, -8.1, 6.4, 1.7, 0x07110b, 0.1, 0.2],
    [-20.8, -12.2, 7.4, 2.1, 0x041009, 0.12, 0.08],
    [18.8, 8.3, 7.0, 2.0, 0x041009, 0.105, -0.1],
  ].forEach(([x, z, sx, sz, color, opacity, rotation]) => {
    addProductionGroundDecal(x, z, sx, sz, color, opacity, group, rotation, 0.058, "ProductionStyleTargetPaintShadow");
  });

  [
    [-9.8, -5.2, 4.2, 0.55, 0xf4d88b, 0.085, 0.36],
    [8.8, 1.8, 4.3, 0.58, 0xf4d88b, 0.08, 0.47],
    [3.1, -0.4, 4.4, 0.68, 0x8df0cf, 0.09, -0.24],
    [-17.0, 9.7, 4.2, 0.58, 0xcde9a2, 0.065, -0.18],
    [15.5, -8.7, 4.0, 0.55, 0xcde9a2, 0.06, 0.18],
  ].forEach(([x, z, sx, sz, color, opacity, rotation]) => {
    addProductionGroundDecal(x, z, sx, sz, color, opacity, group, rotation, 0.112, "ProductionStyleTargetPaintHighlight");
  });
}

function addProductionBakedOcclusion(group) {
  [
    [-18.6, 10.0, 6.0, 2.5, -0.12, 0.16],
    [-3.6, 10.2, 7.5, 2.7, 0.08, 0.15],
    [16.6, 9.2, 6.8, 2.7, 0.16, 0.155],
    [-18.2, -13.0, 6.4, 2.7, 0.12, 0.16],
    [2.6, -12.2, 7.4, 2.7, -0.04, 0.15],
    [17.6, -9.4, 6.2, 2.7, -0.16, 0.155],
    [-13.2, -1.2, 3.8, 1.65, 0.2, 0.12],
    [11.8, 5.0, 3.8, 1.65, -0.18, 0.12],
  ].forEach(([x, z, sx, sz, rotation, opacity]) => {
    addProductionGroundDecal(x, z, sx, sz, 0x061009, opacity, group, rotation, 0.052, "ProductionStyleTargetBakedOcclusion");
    addProductionGroundDecal(x, z, sx * 0.62, sz * 0.52, 0x0c1e11, opacity * 0.62, group, rotation + 0.18, 0.058, "ProductionStyleTargetBakedOcclusion");
  });

  [
    [productionNorthCliff, 1, 38, 0.12],
    [productionSouthCliff, -1, 38, 0.12],
    [productionWestCliff, -1, 24, 0.11],
    [productionEastCliff, 1, 24, 0.11],
  ].forEach(([points, sideBias, count, opacity], blockIndex) => {
    const localRng = mulberry32(15700 + blockIndex);
    for (let i = 0; i < count; i += 1) {
      const p = pathPoint(points, (i + localRng() * 0.7) / count);
      const nx = -Math.sin(p.angle);
      const nz = Math.cos(p.angle);
      const x = p.x + nx * sideBias * (1.4 + localRng() * 1.4);
      const z = p.z + nz * sideBias * (1.4 + localRng() * 1.4);
      addProductionGroundDecal(
        x,
        z,
        1.6 + localRng() * 2.8,
        0.28 + localRng() * 0.42,
        0x061009,
        opacity * (0.72 + localRng() * 0.42),
        group,
        -p.angle + (localRng() - 0.5) * 0.32,
        0.06,
        "ProductionStyleTargetBakedOcclusion",
      );
    }
  });
}

function addProductionCliffWall(points, group, sideBias = 1, tint = 0x4d5a4b, width = 2.6, drop = 1.2, steps = 64) {
  const vertices = [];
  const colors = [];
  const baseColor = new THREE.Color(tint);
  const topColor = new THREE.Color(tint).offsetHSL(0.018, 0.035, 0.13);
  const sideColor = new THREE.Color(tint).offsetHSL(-0.012, -0.04, -0.16);
  const samples = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = pathPoint(points, i / steps);
    const nx = -Math.sin(p.angle) * sideBias;
    const nz = Math.cos(p.angle) * sideBias;
    const localWidth = width * (0.86 + noise2(p.x * 0.17 + 1.2, p.z * 0.17 - 2.0) * 0.32);
    const innerX = p.x - nx * 0.22;
    const innerZ = p.z - nz * 0.22;
    const outerX = p.x + nx * localWidth;
    const outerZ = p.z + nz * localWidth;
    const midInfo = productionTerrainInfo(p.x + nx * 0.45, p.z + nz * 0.45);
    const topY = midInfo.height + 0.5 + noise2(p.x * 0.34, p.z * 0.34) * 0.18;
    const footY = midInfo.height - drop * (0.74 + noise2(p.x * 0.24 - 8.0, p.z * 0.24) * 0.36);
    samples.push({
      innerTop: [innerX, topY - 0.05, innerZ],
      outerTop: [outerX, topY + 0.06, outerZ],
      innerFoot: [innerX - nx * 0.16, footY + 0.18, innerZ - nz * 0.16],
      outerFoot: [outerX + nx * 0.2, footY, outerZ + nz * 0.2],
      shade: 0.82 + noise2(p.x * 0.5, p.z * 0.5) * 0.28,
    });
  }

  function pushVertex(point, color, shade = 1) {
    vertices.push(point[0], point[1], point[2]);
    colors.push(
      THREE.MathUtils.clamp(color.r * shade, 0, 1),
      THREE.MathUtils.clamp(color.g * shade, 0, 1),
      THREE.MathUtils.clamp(color.b * shade, 0, 1),
    );
  }

  function pushTri(a, b, c, color, shade = 1) {
    pushVertex(a, color, shade);
    pushVertex(b, color, shade);
    pushVertex(c, color, shade);
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    pushTri(a.innerTop, a.outerTop, b.innerTop, topColor, a.shade);
    pushTri(b.innerTop, a.outerTop, b.outerTop, topColor, b.shade);
    pushTri(a.outerTop, a.outerFoot, b.outerTop, sideColor, a.shade * 0.95);
    pushTri(b.outerTop, a.outerFoot, b.outerFoot, sideColor, b.shade * 0.92);
    pushTri(a.innerFoot, a.innerTop, b.innerFoot, baseColor, a.shade * 0.86);
    pushTri(b.innerFoot, a.innerTop, b.innerTop, baseColor, b.shade * 0.86);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const cliff = new THREE.Mesh(geometry, createSculptedCliffShelfMaterial(tint));
  cliff.name = "ProductionStyleTargetContinuousCliffWall";
  cliff.castShadow = true;
  cliff.receiveShadow = true;
  group.add(cliff);
  return cliff;
}

function addProductionCapstones(points, count, group, sideBias = 1, tint = 0x53604f) {
  const geometry = createPainterlyCliffBlockGeometry(count + 90);
  const material = createPaintedRockMaterial(tint);
  const capstones = new THREE.InstancedMesh(geometry, material, count);
  capstones.name = "ProductionStyleTargetCapstones";
  capstones.castShadow = true;
  capstones.receiveShadow = true;
  const localRng = mulberry32(9200 + count * 13);
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + 0.45) / count);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * sideBias * (0.95 + localRng() * 0.75) + (localRng() - 0.5) * 0.5;
    const z = p.z + nz * sideBias * (0.95 + localRng() * 0.75) + (localRng() - 0.5) * 0.5;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.43, z);
    tmpQuat.setFromEuler(new THREE.Euler((localRng() - 0.5) * 0.1, -p.angle + (localRng() - 0.5) * 0.35, (localRng() - 0.5) * 0.08));
    const s = 0.95 + localRng() * 0.68;
    tmpScale.set(s * (2.4 + localRng() * 1.5), s * (0.34 + localRng() * 0.24), s * (0.82 + localRng() * 0.62));
    capstones.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHex(tint).offsetHSL((localRng() - 0.5) * 0.016, (localRng() - 0.5) * 0.08, (localRng() - 0.5) * 0.09);
    capstones.setColorAt(i, tmpColor);
  }
  capstones.instanceMatrix.needsUpdate = true;
  capstones.instanceColor.needsUpdate = true;
  group.add(capstones);
}

function addProductionLaneDetails(group) {
  const strokeRng = mulberry32(202044);
  const warmGeometry = new THREE.CircleGeometry(1, 28);
  const warmMaterial = new THREE.MeshBasicMaterial({
    color: 0xe8cf86,
    transparent: true,
    opacity: 0.095,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const warmStrokes = new THREE.InstancedMesh(warmGeometry, warmMaterial, 96);
  warmStrokes.name = "ProductionStyleTargetLaneDetail";
  for (let i = 0; i < 96; i += 1) {
    const p = pathPoint(productionLane, (i + strokeRng() * 0.6) / 96);
    const side = (strokeRng() - 0.5) * 3.2;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side + (strokeRng() - 0.5) * 0.42;
    const z = p.z + nz * side + (strokeRng() - 0.5) * 0.42;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.102, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (strokeRng() - 0.5) * 0.35));
    tmpScale.set(1.6 + strokeRng() * 3.6, 0.16 + strokeRng() * 0.42, 1);
    warmStrokes.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  warmStrokes.instanceMatrix.needsUpdate = true;
  group.add(warmStrokes);

  const stoneGeometry = new THREE.BoxGeometry(0.9, 0.09, 0.46, 1, 1, 1);
  const stoneMaterial = createPaintedStoneMaterial(0x8d805f, 0xd5c286, 0x110f0b, 0.02);
  const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, 58);
  stones.name = "ProductionStyleTargetLaneDetail";
  stones.castShadow = true;
  stones.receiveShadow = true;
  for (let i = 0; i < 58; i += 1) {
    const p = pathPoint(productionLane, (i + 0.4) / 58);
    const side = (strokeRng() - 0.5) * 2.7;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side + (strokeRng() - 0.5) * 0.5;
    const z = p.z + nz * side + (strokeRng() - 0.5) * 0.42;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.12, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, -p.angle + (strokeRng() - 0.5) * 0.55, 0));
    tmpScale.set(0.75 + strokeRng() * 0.82, 1, 0.5 + strokeRng() * 0.64);
    stones.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  stones.instanceMatrix.needsUpdate = true;
  group.add(stones);
}

function addProductionPathEdgePaint(points, count, group, colorHex, opacity, baseOffset, widthScale, seed, name) {
  const localRng = mulberry32(seed);
  const geometry = new THREE.CircleGeometry(1, 28);
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const strokes = new THREE.InstancedMesh(geometry, material, count);
  strokes.name = name;
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + localRng() * 0.75) / count);
    const side = localRng() > 0.5 ? 1 : -1;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const offset = side * (baseOffset + localRng() * widthScale);
    const x = p.x + nx * offset + (localRng() - 0.5) * 0.5;
    const z = p.z + nz * offset + (localRng() - 0.5) * 0.5;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.105, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (localRng() - 0.5) * 0.42));
    tmpScale.set(1.25 + localRng() * 3.1, 0.16 + localRng() * 0.42, 1);
    strokes.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  strokes.instanceMatrix.needsUpdate = true;
  group.add(strokes);
}

function addProductionTerrainPaintAccents(group) {
  addProductionPathEdgePaint(productionLane, 110, group, 0xf0d98d, 0.07, 1.45, 2.25, 8111, "ProductionStyleTargetTerrainPaintAccent");
  addProductionPathEdgePaint(productionLane, 72, group, 0x0a160d, 0.055, 3.1, 2.2, 8112, "ProductionStyleTargetTerrainPaintAccent");
  addProductionPathEdgePaint(productionRiver, 72, group, 0x9df4d2, 0.038, 1.75, 1.55, 8113, "ProductionStyleTargetTerrainPaintAccent");
  [productionNorthCliff, productionSouthCliff, productionWestCliff, productionEastCliff].forEach((points, index) => {
    addProductionPathEdgePaint(points, index < 2 ? 70 : 42, group, 0x07100a, 0.075, 0.9, 1.2, 8120 + index, "ProductionStyleTargetTerrainPaintAccent");
    addProductionPathEdgePaint(points, index < 2 ? 52 : 34, group, 0xc4d393, 0.04, 1.4, 1.0, 8130 + index, "ProductionStyleTargetTerrainPaintAccent");
  });
}

function createProductionIrregularSlabGeometry() {
  const outline = [
    [-0.58, -0.18],
    [-0.38, -0.42],
    [0.2, -0.46],
    [0.56, -0.24],
    [0.62, 0.08],
    [0.34, 0.38],
    [-0.22, 0.44],
    [-0.62, 0.2],
  ];
  const halfHeight = 0.055;
  const vertices = [];

  function push(x, y, z) {
    vertices.push(x, y, z);
  }

  for (let i = 1; i < outline.length - 1; i += 1) {
    push(outline[0][0], halfHeight, outline[0][1]);
    push(outline[i][0], halfHeight, outline[i][1]);
    push(outline[i + 1][0], halfHeight, outline[i + 1][1]);
  }
  for (let i = outline.length - 2; i > 0; i -= 1) {
    push(outline[0][0], -halfHeight, outline[0][1]);
    push(outline[i + 1][0], -halfHeight, outline[i + 1][1]);
    push(outline[i][0], -halfHeight, outline[i][1]);
  }
  for (let i = 0; i < outline.length; i += 1) {
    const next = (i + 1) % outline.length;
    const a = outline[i];
    const b = outline[next];
    push(a[0], halfHeight, a[1]);
    push(a[0], -halfHeight, a[1]);
    push(b[0], halfHeight, b[1]);
    push(b[0], halfHeight, b[1]);
    push(a[0], -halfHeight, a[1]);
    push(b[0], -halfHeight, b[1]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addProductionLaneSlabClusters(group) {
  const localRng = mulberry32(181221);
  const slabGeometry = createProductionIrregularSlabGeometry();
  const slabMaterial = createPaintedStoneMaterial(0x82775d, 0xd4c083, 0x11120d, 0.026);
  const slabCount = 46;
  const slabs = new THREE.InstancedMesh(slabGeometry, slabMaterial, slabCount);
  slabs.name = "ProductionStyleTargetLaneEmbeddedSlabs";
  slabs.castShadow = true;
  slabs.receiveShadow = true;

  const shadowGeometry = new THREE.CircleGeometry(1, 28);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x071009,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, slabCount);
  shadows.name = "ProductionStyleTargetLaneSlabShadows";

  for (let i = 0; i < slabCount; i += 1) {
    const p = pathPoint(productionLane, (i + 0.5 + localRng() * 0.34) / slabCount);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const side = (localRng() - 0.5) * (i % 5 === 0 ? 3.0 : 2.15);
    const x = p.x + nx * side + (localRng() - 0.5) * 0.42;
    const z = p.z + nz * side + (localRng() - 0.5) * 0.42;
    const info = productionTerrainInfo(x, z);
    const slabLength = 0.78 + localRng() * 1.8;
    const slabWidth = 0.44 + localRng() * 0.76;
    tmpVector.set(x, info.height + 0.13, z);
    tmpQuat.setFromEuler(new THREE.Euler((localRng() - 0.5) * 0.035, -p.angle + (localRng() - 0.5) * 0.72, (localRng() - 0.5) * 0.035));
    tmpScale.set(slabLength, 0.82 + localRng() * 0.34, slabWidth);
    slabs.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHex(i % 3 === 0 ? 0x948565 : i % 3 === 1 ? 0x746d59 : 0xa08d68);
    tmpColor.offsetHSL((localRng() - 0.5) * 0.018, (localRng() - 0.5) * 0.07, (localRng() - 0.5) * 0.09);
    slabs.setColorAt(i, tmpColor);

    tmpVector.set(x + nx * 0.08, info.height + 0.072, z + nz * 0.08);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (localRng() - 0.5) * 0.5));
    tmpScale.set(slabLength * 1.25, slabWidth * 1.15, 1);
    shadows.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  slabs.instanceMatrix.needsUpdate = true;
  slabs.instanceColor.needsUpdate = true;
  shadows.instanceMatrix.needsUpdate = true;
  group.add(shadows);
  group.add(slabs);
}

function addProductionLaneShoulderBreakup(group) {
  const localRng = mulberry32(181922);
  const geometry = new THREE.CircleGeometry(1, 24);
  const mossMaterial = new THREE.MeshBasicMaterial({
    color: 0x3c642f,
    transparent: true,
    opacity: 0.095,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const dirtMaterial = new THREE.MeshBasicMaterial({
    color: 0x0a1209,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const moss = new THREE.InstancedMesh(geometry, mossMaterial, 96);
  const dirt = new THREE.InstancedMesh(geometry, dirtMaterial, 78);
  moss.name = "ProductionStyleTargetLaneShoulderBreakup";
  dirt.name = "ProductionStyleTargetLaneShoulderBreakup";

  for (let i = 0; i < moss.count; i += 1) {
    const p = pathPoint(productionLane, (i + localRng() * 0.85) / moss.count);
    const side = localRng() > 0.5 ? 1 : -1;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side * (2.1 + localRng() * 2.1) + (localRng() - 0.5) * 0.35;
    const z = p.z + nz * side * (2.1 + localRng() * 2.1) + (localRng() - 0.5) * 0.35;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.105, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (localRng() - 0.5) * 0.72));
    tmpScale.set(0.9 + localRng() * 2.4, 0.18 + localRng() * 0.52, 1);
    moss.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }

  for (let i = 0; i < dirt.count; i += 1) {
    const p = pathPoint(productionLane, (i + localRng() * 0.9) / dirt.count);
    const side = localRng() > 0.5 ? 1 : -1;
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * side * (2.75 + localRng() * 2.45) + (localRng() - 0.5) * 0.45;
    const z = p.z + nz * side * (2.75 + localRng() * 2.45) + (localRng() - 0.5) * 0.45;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.098, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (localRng() - 0.5) * 0.8));
    tmpScale.set(1.25 + localRng() * 2.9, 0.16 + localRng() * 0.48, 1);
    dirt.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  moss.instanceMatrix.needsUpdate = true;
  dirt.instanceMatrix.needsUpdate = true;
  group.add(dirt);
  group.add(moss);
}

function addProductionWaterDetails(group) {
  const localRng = mulberry32(731090);
  const padGeometry = new THREE.CircleGeometry(1, 18);
  const padMaterial = new THREE.MeshStandardMaterial({
    color: 0x4e7f45,
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
    emissive: 0x0d1b0e,
    emissiveIntensity: 0.035,
  });
  const padCount = 30;
  const pads = new THREE.InstancedMesh(padGeometry, padMaterial, padCount);
  pads.name = "ProductionStyleTargetWaterLilyPads";
  pads.receiveShadow = true;

  const rippleGeometry = new THREE.RingGeometry(0.76, 0.82, 42);
  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: 0xb7f3d8,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const rippleCount = 34;
  const ripples = new THREE.InstancedMesh(rippleGeometry, rippleMaterial, rippleCount);
  ripples.name = "ProductionStyleTargetWaterDetailRipples";

  for (let i = 0; i < padCount; i += 1) {
    const p = pathPoint(productionRiver, (i + localRng() * 0.8) / padCount);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const side = localRng() > 0.5 ? 1 : -1;
    const x = p.x + nx * side * (0.72 + localRng() * 0.9) + (localRng() - 0.5) * 0.28;
    const z = p.z + nz * side * (0.72 + localRng() * 0.9) + (localRng() - 0.5) * 0.28;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.145, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2 + (localRng() - 0.5) * 0.035, 0, localRng() * Math.PI * 2));
    const s = 0.18 + localRng() * 0.34;
    tmpScale.set(s * (1.0 + localRng() * 0.7), s * (0.62 + localRng() * 0.34), 1);
    pads.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHex(localRng() > 0.45 ? 0x4e7f45 : 0x6b9549).offsetHSL((localRng() - 0.5) * 0.02, (localRng() - 0.5) * 0.09, (localRng() - 0.5) * 0.08);
    pads.setColorAt(i, tmpColor);
  }

  for (let i = 0; i < rippleCount; i += 1) {
    const p = pathPoint(productionRiver, (i + localRng() * 0.82) / rippleCount);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const side = localRng() > 0.5 ? 1 : -1;
    const x = p.x + nx * side * (0.52 + localRng() * 1.1);
    const z = p.z + nz * side * (0.52 + localRng() * 1.1);
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.162, z);
    tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -p.angle + (localRng() - 0.5) * 0.8));
    const s = 0.42 + localRng() * 0.72;
    tmpScale.set(s * (1.1 + localRng() * 0.8), s * (0.42 + localRng() * 0.34), 1);
    ripples.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  pads.instanceMatrix.needsUpdate = true;
  pads.instanceColor.needsUpdate = true;
  ripples.instanceMatrix.needsUpdate = true;
  group.add(pads);
  group.add(ripples);
}

function addProductionCanopyMassShadows(group) {
  const localRng = mulberry32(772201);
  const geometry = new THREE.CircleGeometry(1, 36);
  const material = new THREE.MeshBasicMaterial({
    color: 0x050d07,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const specs = [
    [-18.6, 10.0, 5.2, 2.0, -0.18],
    [-3.6, 10.2, 6.4, 2.1, 0.08],
    [16.6, 9.2, 5.9, 2.1, 0.18],
    [-18.2, -13.0, 5.4, 2.0, 0.1],
    [2.6, -12.2, 6.4, 2.0, -0.04],
    [17.6, -9.4, 5.4, 2.0, -0.16],
    [-13.2, -1.2, 3.2, 1.5, 0.22],
    [11.8, 5.0, 3.2, 1.5, -0.18],
  ];
  const shadows = new THREE.InstancedMesh(geometry, material, specs.length * 3);
  shadows.name = "ProductionStyleTargetCanopyMassShadow";
  let index = 0;
  specs.forEach(([cx, cz, rx, rz, rotation]) => {
    for (let i = 0; i < 3; i += 1) {
      const x = cx + (localRng() - 0.5) * rx * 0.38;
      const z = cz + (localRng() - 0.5) * rz * 0.4;
      const info = productionTerrainInfo(x, z);
      tmpVector.set(x, info.height + 0.066 + i * 0.004, z);
      tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rotation + (localRng() - 0.5) * 0.45));
      tmpScale.set(rx * (0.48 + localRng() * 0.28), rz * (0.46 + localRng() * 0.28), 1);
      shadows.setMatrixAt(index, matrix.compose(tmpVector, tmpQuat, tmpScale));
      index += 1;
    }
  });
  shadows.instanceMatrix.needsUpdate = true;
  group.add(shadows);
}

function addProductionCliffRimGrass(points, count, group, sideBias = 1, seed = 1) {
  const localRng = mulberry32(8600 + seed * 37);
  const geometry = createBrushBladeGeometry();
  const material = new THREE.MeshBasicMaterial({
    color: 0x8dbb63,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
  });
  const grass = new THREE.InstancedMesh(geometry, material, count);
  grass.name = "ProductionStyleTargetCliffRimGrass";
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + localRng() * 0.7) / count);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * sideBias * (0.35 + localRng() * 1.05) + (localRng() - 0.5) * 0.35;
    const z = p.z + nz * sideBias * (0.35 + localRng() * 1.05) + (localRng() - 0.5) * 0.35;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.18, z);
    tmpQuat.setFromEuler(new THREE.Euler((localRng() - 0.5) * 0.2, localRng() * Math.PI * 2, (localRng() - 0.5) * 0.18));
    const s = 0.52 + localRng() * 0.86;
    tmpScale.set(s * (0.55 + localRng() * 0.65), s * (0.6 + localRng() * 0.8), s);
    grass.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  grass.instanceMatrix.needsUpdate = true;
  group.add(grass);
}

function addProductionCanopyHighlights(group) {
  const localRng = mulberry32(99124);
  const geometry = new THREE.PlaneGeometry(1, 0.62, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xb8d978,
    alphaMap: createLeafAlphaTexture(),
    alphaTest: 0.28,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const cards = new THREE.InstancedMesh(geometry, material, 260);
  cards.name = "ProductionStyleTargetCanopyHighlights";
  const standSpecs = [
    [-18.6, 10.0, 4.8, 1.9],
    [-3.6, 10.2, 6.1, 2.1],
    [16.6, 9.2, 5.6, 2.1],
    [-18.2, -13.0, 5.0, 2.1],
    [2.6, -12.2, 6.0, 2.0],
    [17.6, -9.4, 5.0, 2.1],
  ];
  for (let i = 0; i < 260; i += 1) {
    const zone = standSpecs[i % standSpecs.length];
    const angle = localRng() * Math.PI * 2;
    const radius = Math.sqrt(localRng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 1.7 + localRng() * 1.08, z);
    tmpQuat.setFromEuler(new THREE.Euler(-0.62 + (localRng() - 0.5) * 0.34, localRng() * Math.PI * 2, (localRng() - 0.5) * 0.52));
    const s = 0.52 + localRng() * 1.08;
    tmpScale.set(s * (0.82 + localRng() * 0.8), s * (0.5 + localRng() * 0.44), 1);
    cards.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHSL(0.25 + (localRng() - 0.5) * 0.035, 0.42 + localRng() * 0.16, 0.54 + localRng() * 0.14);
    cards.setColorAt(i, tmpColor);
  }
  cards.instanceMatrix.needsUpdate = true;
  cards.instanceColor.needsUpdate = true;
  group.add(cards);
}

function createProductionLeafBrushTexture() {
  const size = 192;
  const brushCanvas = document.createElement("canvas");
  brushCanvas.width = size;
  brushCanvas.height = size;
  const context = brushCanvas.getContext("2d");
  context.clearRect(0, 0, size, size);
  const leafRng = mulberry32(551902);
  const palette = [
    "rgba(226, 244, 126, 0.9)",
    "rgba(176, 218, 92, 0.86)",
    "rgba(112, 166, 70, 0.82)",
    "rgba(72, 124, 57, 0.78)",
  ];
  for (let i = 0; i < 18; i += 1) {
    const x = 42 + leafRng() * 106;
    const y = 42 + leafRng() * 104;
    const rx = 16 + leafRng() * 34;
    const ry = 4 + leafRng() * 9;
    context.save();
    context.translate(x, y);
    context.rotate((leafRng() - 0.5) * Math.PI * 1.3);
    context.fillStyle = palette[Math.floor(leafRng() * palette.length)];
    context.beginPath();
    context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  context.globalCompositeOperation = "multiply";
  context.strokeStyle = "rgba(39, 84, 38, 0.18)";
  context.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    const x = 42 + leafRng() * 104;
    const y = 46 + leafRng() * 100;
    context.beginPath();
    context.moveTo(x - 24 * leafRng(), y + 10 * leafRng());
    context.quadraticCurveTo(x + 8 * leafRng(), y - 14 * leafRng(), x + 32 * leafRng(), y - 6 * leafRng());
    context.stroke();
  }
  context.globalCompositeOperation = "source-over";
  const texture = new THREE.CanvasTexture(brushCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function addProductionCanopyBrushCards(group) {
  const localRng = mulberry32(118902);
  const geometry = new THREE.PlaneGeometry(1, 0.54, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: createProductionLeafBrushTexture(),
    alphaTest: 0.12,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const cards = new THREE.InstancedMesh(geometry, material, 220);
  cards.name = "ProductionStyleTargetCanopyBrushCards";
  const standSpecs = [
    [-18.6, 10.0, 4.8, 1.9, 2.2],
    [-3.6, 10.2, 6.1, 2.1, 2.45],
    [16.6, 9.2, 5.6, 2.1, 2.35],
    [-18.2, -13.0, 5.0, 2.1, 2.15],
    [2.6, -12.2, 6.0, 2.0, 2.35],
    [17.6, -9.4, 5.0, 2.1, 2.12],
  ];
  for (let i = 0; i < cards.count; i += 1) {
    const zone = standSpecs[i % standSpecs.length];
    const angle = localRng() * Math.PI * 2;
    const radius = Math.sqrt(localRng());
    const x = zone[0] + Math.cos(angle) * radius * zone[2];
    const z = zone[1] + Math.sin(angle) * radius * zone[3];
    const info = productionTerrainInfo(x, z);
    const crownTier = localRng();
    tmpVector.set(x, info.height + 1.1 + crownTier * zone[4], z);
    tmpQuat.setFromEuler(new THREE.Euler(-0.54 + (localRng() - 0.5) * 0.46, localRng() * Math.PI * 2, (localRng() - 0.5) * 0.58));
    const s = 0.78 + localRng() * 1.36;
    tmpScale.set(s * (0.9 + localRng() * 0.95), s * (0.56 + localRng() * 0.48), 1);
    cards.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHSL(0.25 + (localRng() - 0.5) * 0.035, 0.32 + localRng() * 0.18, 0.48 + crownTier * 0.14);
    cards.setColorAt(i, tmpColor);
  }
  cards.instanceMatrix.needsUpdate = true;
  cards.instanceColor.needsUpdate = true;
  group.add(cards);
}

function createProductionSculptedCanopyPlateGeometry() {
  const ringCount = 18;
  const top = [];
  const lower = [];
  const vertices = [];

  for (let i = 0; i < ringCount; i += 1) {
    const t = (i / ringCount) * Math.PI * 2;
    const notch = 1 + Math.sin(t * 3.0 + 0.5) * 0.06 + Math.sin(t * 7.0 - 0.3) * 0.035;
    const x = Math.cos(t) * notch;
    const z = Math.sin(t) * (0.58 + Math.cos(t * 2.0) * 0.035) * notch;
    const rimY = 0.02 + Math.sin(t * 4.0) * 0.018;
    top.push([x, rimY, z]);
    lower.push([x * 1.02, -0.18 + Math.sin(t * 2.0) * 0.018, z * 1.02]);
  }

  function push(point) {
    vertices.push(point[0], point[1], point[2]);
  }

  const center = [0, 0.23, 0];
  for (let i = 0; i < ringCount; i += 1) {
    const next = (i + 1) % ringCount;
    push(center);
    push(top[i]);
    push(top[next]);
  }

  const underside = [0, -0.16, 0];
  for (let i = ringCount - 1; i >= 0; i -= 1) {
    const next = (i - 1 + ringCount) % ringCount;
    push(underside);
    push(lower[i]);
    push(lower[next]);
  }

  for (let i = 0; i < ringCount; i += 1) {
    const next = (i + 1) % ringCount;
    push(top[i]);
    push(lower[i]);
    push(top[next]);
    push(top[next]);
    push(lower[i]);
    push(lower[next]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createProductionSculptedCanopyMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x5f9348,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    emissive: 0x0d1b0d,
    emissiveIntensity: 0.05,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vPlateLocalPosition;
        varying vec3 vPlateWorldNormal;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vPlateLocalPosition = position;
        vPlateWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vPlateLocalPosition;
        varying vec3 vPlateWorldNormal;
        float plateHash(vec3 p) {
          return fract(sin(dot(p, vec3(21.7, 61.3, 111.1))) * 34821.13);
        }
      `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        float top = smoothstep(-0.08, 0.22, vPlateLocalPosition.y);
        float edge = smoothstep(0.62, 1.02, length(vPlateLocalPosition.xz));
        float facing = clamp(dot(normalize(vPlateWorldNormal), normalize(vec3(-0.42, 0.86, 0.32))) * 0.5 + 0.5, 0.0, 1.0);
        float grain = plateHash(floor(vPlateLocalPosition * 9.0));
        diffuseColor.rgb *= 0.56 + top * 0.24 + facing * 0.2 + grain * 0.055;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.17, 0.07), (1.0 - top) * 0.42 + edge * 0.1);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.82, 0.36), top * facing * 0.14);
        diffuseColor.rgb = max(diffuseColor.rgb, vec3(0.065, 0.115, 0.055));
      `,
      );
  };
  return material;
}

function addProductionSculptedCanopyPlates(group) {
  const localRng = mulberry32(410991);
  const plateGeometry = createProductionSculptedCanopyPlateGeometry();
  const plateMaterial = createProductionSculptedCanopyMaterial();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x071009,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const clusterSpecs = [
    [-18.6, 10.0, 4.8, 1.9, 0.04],
    [-3.6, 10.2, 6.1, 2.1, -0.08],
    [16.6, 9.2, 5.6, 2.1, 0.1],
    [-18.2, -13.0, 5.0, 2.1, 0.18],
    [2.6, -12.2, 6.0, 2.0, -0.12],
    [17.6, -9.4, 5.0, 2.1, 0.08],
  ];
  const platesPerCluster = 16;
  const plateCount = clusterSpecs.length * platesPerCluster;
  const plates = new THREE.InstancedMesh(plateGeometry, plateMaterial, plateCount);
  const underShadows = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 32), shadowMaterial, clusterSpecs.length * 5);
  plates.name = "ProductionStyleTargetSculptedCanopyPlates";
  underShadows.name = "ProductionStyleTargetSculptedCanopyPlateShadows";
  plates.castShadow = true;
  plates.receiveShadow = true;

  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.34, 1, 9, 4);
  const branchGeometry = new THREE.CylinderGeometry(0.055, 0.14, 1, 7, 3);
  const barkMaterial = createPaintedBarkMaterial();
  const trunks = new THREE.InstancedMesh(trunkGeometry, barkMaterial, clusterSpecs.length * 3);
  const branches = new THREE.InstancedMesh(branchGeometry, barkMaterial, clusterSpecs.length * 7);
  trunks.name = "ProductionStyleTargetSculptedCanopyTrunks";
  branches.name = "ProductionStyleTargetSculptedCanopyBranches";
  trunks.castShadow = true;
  branches.castShadow = true;
  trunks.receiveShadow = true;
  branches.receiveShadow = true;

  let plateIndex = 0;
  let shadowIndex = 0;
  let trunkIndex = 0;
  let branchIndex = 0;
  clusterSpecs.forEach(([cx, cz, rx, rz, rotation], clusterIndex) => {
    const clusterRng = mulberry32(411500 + clusterIndex * 29);
    const branchAnchors = [];
    for (let i = 0; i < platesPerCluster; i += 1) {
      const tier = i / (platesPerCluster - 1);
      const radial = Math.sqrt(clusterRng());
      const angle = clusterRng() * Math.PI * 2;
      const localX = Math.cos(angle) * radial * rx * (0.58 + tier * 0.18);
      const localZ = Math.sin(angle) * radial * rz * (0.62 + tier * 0.18);
      const x = cx + localX;
      const z = cz + localZ;
      const info = productionTerrainInfo(x, z);
      const height = info.height + 1.18 + tier * 1.2 + clusterRng() * 0.46;
      tmpVector.set(x, height, z);
      tmpQuat.setFromEuler(new THREE.Euler(-0.08 + (clusterRng() - 0.5) * 0.18, rotation + clusterRng() * Math.PI * 2, (clusterRng() - 0.5) * 0.12));
      const scale = 1.15 + clusterRng() * 1.25 + tier * 0.32;
      tmpScale.set(scale * (1.36 + clusterRng() * 0.72), scale * (0.78 + clusterRng() * 0.32), scale * (0.62 + clusterRng() * 0.38));
      plates.setMatrixAt(plateIndex, matrix.compose(tmpVector, tmpQuat, tmpScale));
      tmpColor.setHSL(0.25 + (clusterRng() - 0.5) * 0.028, 0.34 + clusterRng() * 0.14, 0.36 + tier * 0.17 + clusterRng() * 0.06);
      plates.setColorAt(plateIndex, tmpColor);
      plateIndex += 1;
    }

    for (let i = 0; i < 3; i += 1) {
      const angle = rotation + (i / 3) * Math.PI * 2 + (clusterRng() - 0.5) * 0.55;
      const radius = 0.15 + clusterRng() * 0.46;
      const x = cx + Math.cos(angle) * radius * rx * 0.35;
      const z = cz + Math.sin(angle) * radius * rz * 0.4;
      const info = productionTerrainInfo(x, z);
      const height = 1.2 + clusterRng() * 0.92;
      const lean = new THREE.Vector3((clusterRng() - 0.5) * 0.24, 1, (clusterRng() - 0.5) * 0.24).normalize();
      tmpVector.set(x + lean.x * height * 0.16, info.height + height * 0.5, z + lean.z * height * 0.16);
      tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
      tmpScale.set(0.84 + clusterRng() * 0.26, height, 0.84 + clusterRng() * 0.26);
      trunks.setMatrixAt(trunkIndex, matrix.compose(tmpVector, tmpQuat, tmpScale));
      branchAnchors.push({
        x: x + lean.x * height * 0.36,
        y: info.height + height * 0.86,
        z: z + lean.z * height * 0.36,
        angle,
      });
      trunkIndex += 1;
    }

    for (let i = 0; i < 7; i += 1) {
      const anchor = branchAnchors[i % branchAnchors.length];
      const spread = anchor.angle + (clusterRng() - 0.5) * 1.9;
      const length = 0.82 + clusterRng() * 1.1;
      const dir = new THREE.Vector3(Math.cos(spread) * 0.74, 0.35 + clusterRng() * 0.22, Math.sin(spread) * 0.74).normalize();
      tmpVector.set(anchor.x + dir.x * length * 0.5, anchor.y + dir.y * length * 0.5, anchor.z + dir.z * length * 0.5);
      tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      tmpScale.set(0.7 + clusterRng() * 0.34, length, 0.7 + clusterRng() * 0.34);
      branches.setMatrixAt(branchIndex, matrix.compose(tmpVector, tmpQuat, tmpScale));
      branchIndex += 1;
    }

    for (let i = 0; i < 5; i += 1) {
      const x = cx + (localRng() - 0.5) * rx * 0.62;
      const z = cz + (localRng() - 0.5) * rz * 0.62;
      const info = productionTerrainInfo(x, z);
      tmpVector.set(x, info.height + 0.071, z);
      tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rotation + (localRng() - 0.5) * 0.42));
      tmpScale.set(rx * (0.42 + localRng() * 0.28), rz * (0.48 + localRng() * 0.26), 1);
      underShadows.setMatrixAt(shadowIndex, matrix.compose(tmpVector, tmpQuat, tmpScale));
      shadowIndex += 1;
    }
  });

  plates.instanceMatrix.needsUpdate = true;
  plates.instanceColor.needsUpdate = true;
  underShadows.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  group.add(underShadows);
  group.add(trunks);
  group.add(branches);
  group.add(plates);
}

function addProductionCliffFacePaint(points, count, group, sideBias = 1, seed = 1) {
  const localRng = mulberry32(12400 + seed * 41);
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x07100a,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lightMaterial = new THREE.MeshBasicMaterial({
    color: 0xcfd29a,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shadows = new THREE.InstancedMesh(geometry, shadowMaterial, count);
  const lights = new THREE.InstancedMesh(geometry, lightMaterial, Math.floor(count * 0.62));
  shadows.name = "ProductionStyleTargetCliffFacePaint";
  lights.name = "ProductionStyleTargetCliffFacePaint";
  for (let i = 0; i < count; i += 1) {
    const p = pathPoint(points, (i + localRng() * 0.75) / count);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * sideBias * (1.25 + localRng() * 0.75) + (localRng() - 0.5) * 0.25;
    const z = p.z + nz * sideBias * (1.25 + localRng() * 0.75) + (localRng() - 0.5) * 0.25;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.36 + localRng() * 0.42, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, -p.angle + Math.PI * 0.5, 0));
    tmpScale.set(1.0 + localRng() * 2.25, 0.24 + localRng() * 0.58, 1);
    shadows.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  for (let i = 0; i < lights.count; i += 1) {
    const p = pathPoint(points, (i + localRng() * 0.75) / lights.count);
    const nx = -Math.sin(p.angle);
    const nz = Math.cos(p.angle);
    const x = p.x + nx * sideBias * (0.65 + localRng() * 0.78);
    const z = p.z + nz * sideBias * (0.65 + localRng() * 0.78);
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.78 + localRng() * 0.3, z);
    tmpQuat.setFromEuler(new THREE.Euler(0, -p.angle + Math.PI * 0.5, 0));
    tmpScale.set(0.75 + localRng() * 1.9, 0.12 + localRng() * 0.28, 1);
    lights.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  shadows.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  group.add(shadows);
  group.add(lights);
}

function addProductionOrganicEdgeBreakup(group) {
  [
    [-23.0, 13.0, 8.0, 2.6, 0x061009, 0.18, -0.2],
    [-4.0, 13.4, 9.2, 2.3, 0x07110a, 0.16, 0.08],
    [19.4, 12.3, 8.6, 2.4, 0x061009, 0.18, 0.18],
    [-22.6, -15.0, 8.8, 2.5, 0x061009, 0.18, 0.08],
    [1.8, -15.2, 9.6, 2.5, 0x07110a, 0.16, -0.04],
    [20.8, -12.6, 7.8, 2.4, 0x061009, 0.18, -0.18],
    [-26.0, -2.0, 2.4, 11.5, 0x061009, 0.17, 0.12],
    [26.0, -1.6, 2.4, 10.2, 0x061009, 0.17, -0.12],
  ].forEach(([x, z, sx, sz, color, opacity, rotation]) => {
    addProductionGroundDecal(x, z, sx, sz, color, opacity, group, rotation, 0.13, "ProductionStyleTargetOrganicEdgeMatte");
  });
  addProductionCliffRimGrass(productionNorthCliff, 180, group, 1, 1);
  addProductionCliffRimGrass(productionSouthCliff, 180, group, -1, 2);
  addProductionCliffRimGrass(productionWestCliff, 95, group, -1, 3);
  addProductionCliffRimGrass(productionEastCliff, 95, group, 1, 4);
}

function addProductionBrushPatch(cx, cz, radiusX, radiusZ, bladeCount, volumeCount, group, seed = 1) {
  const localRng = mulberry32(7000 + seed * 101);
  const volumeGeometry = createBrushVolumeGeometry();
  const volumeMaterial = createBrushVolumeMaterial();
  const volumes = new THREE.InstancedMesh(volumeGeometry, volumeMaterial, volumeCount);
  volumes.name = "ProductionStyleTargetBrushMass";
  volumes.castShadow = true;
  volumes.receiveShadow = true;
  for (let i = 0; i < volumeCount; i += 1) {
    const angle = localRng() * Math.PI * 2;
    const radius = Math.sqrt(localRng());
    const x = cx + Math.cos(angle) * radius * radiusX;
    const z = cz + Math.sin(angle) * radius * radiusZ;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.42 + localRng() * 0.12, z);
    tmpQuat.setFromEuler(new THREE.Euler((localRng() - 0.5) * 0.1, localRng() * Math.PI * 2, (localRng() - 0.5) * 0.14));
    const s = 0.58 + localRng() * 0.94;
    tmpScale.set(s * (1.25 + localRng() * 1.35), s * (0.44 + localRng() * 0.34), s * (0.66 + localRng() * 0.82));
    volumes.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHSL(0.26 + (localRng() - 0.5) * 0.035, 0.3 + localRng() * 0.16, 0.34 + localRng() * 0.14);
    volumes.setColorAt(i, tmpColor);
  }
  volumes.instanceMatrix.needsUpdate = true;
  volumes.instanceColor.needsUpdate = true;
  group.add(volumes);

  const bladeGeometry = createBrushBladeGeometry();
  const bladeMaterial = new THREE.MeshBasicMaterial({
    color: 0x76bc55,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  bladeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    state.foliageShaders.push(shader);
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      #include <begin_vertex>
      float sway = sin(uTime * 1.2 + instanceMatrix[3].x * 0.63 + instanceMatrix[3].z * 0.37 + position.y * 2.4) * 0.026;
      transformed.x += sway * smoothstep(0.12, 0.94, position.y);
    `,
    );
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
  };
  const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, bladeCount);
  blades.name = "ProductionStyleTargetBrushCards";
  for (let i = 0; i < bladeCount; i += 1) {
    const angle = localRng() * Math.PI * 2;
    const radius = Math.sqrt(localRng());
    const x = cx + Math.cos(angle) * radius * radiusX;
    const z = cz + Math.sin(angle) * radius * radiusZ;
    const info = productionTerrainInfo(x, z);
    tmpVector.set(x, info.height + 0.03, z);
    tmpQuat.setFromEuler(new THREE.Euler((localRng() - 0.5) * 0.16, localRng() * Math.PI * 2, (localRng() - 0.5) * 0.2));
    const s = 0.62 + localRng() * 1.1;
    tmpScale.set(s * (0.55 + localRng() * 0.55), s * (0.65 + localRng() * 0.75), s);
    blades.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  blades.instanceMatrix.needsUpdate = true;
  group.add(blades);
}

function addProductionCanopyStand(cx, cz, radiusX, radiusZ, count, group, seed = 1) {
  const localRng = mulberry32(9300 + seed * 113);
  const canopyGeometry = createCanopyVolumeGeometry();
  const canopyMaterial = createCanopyVolumeMaterial();
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, count);
  canopies.name = "ProductionStyleTargetCanopyMass";
  canopies.castShadow = true;
  canopies.receiveShadow = true;
  for (let i = 0; i < count; i += 1) {
    const angle = localRng() * Math.PI * 2;
    const radius = Math.sqrt(localRng());
    const x = cx + Math.cos(angle) * radius * radiusX;
    const z = cz + Math.sin(angle) * radius * radiusZ;
    const info = productionTerrainInfo(x, z);
    const tier = localRng();
    tmpVector.set(x, info.height + 1.0 + tier * 1.05, z);
    tmpQuat.setFromEuler(new THREE.Euler((localRng() - 0.5) * 0.16, localRng() * Math.PI * 2, (localRng() - 0.5) * 0.16));
    const s = 0.58 + localRng() * 0.98;
    tmpScale.set(s * (1.05 + localRng() * 1.05), s * (0.52 + localRng() * 0.36), s * (0.72 + localRng() * 0.78));
    canopies.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    tmpColor.setHSL(0.27 + (localRng() - 0.5) * 0.035, 0.27 + localRng() * 0.14, 0.34 + localRng() * 0.15);
    canopies.setColorAt(i, tmpColor);
  }
  canopies.instanceMatrix.needsUpdate = true;
  canopies.instanceColor.needsUpdate = true;
  group.add(canopies);

  const trunkGeometry = new THREE.CylinderGeometry(0.08, 0.18, 1, 7, 3);
  const branchGeometry = new THREE.CylinderGeometry(0.04, 0.09, 1, 6, 2);
  const barkMaterial = createPaintedBarkMaterial();
  const trunkCount = Math.max(5, Math.floor(count * 0.17));
  const trunks = new THREE.InstancedMesh(trunkGeometry, barkMaterial, trunkCount);
  const branches = new THREE.InstancedMesh(branchGeometry, barkMaterial, trunkCount * 2);
  trunks.name = "ProductionStyleTargetCanopyTrunks";
  branches.name = "ProductionStyleTargetCanopyBranches";
  const anchors = [];
  for (let i = 0; i < trunkCount; i += 1) {
    const angle = localRng() * Math.PI * 2;
    const radius = Math.sqrt(localRng());
    const x = cx + Math.cos(angle) * radius * radiusX * 0.82;
    const z = cz + Math.sin(angle) * radius * radiusZ * 0.82;
    const info = productionTerrainInfo(x, z);
    const height = 1.2 + localRng() * 1.35;
    const lean = new THREE.Vector3((localRng() - 0.5) * 0.32, 1, (localRng() - 0.5) * 0.32).normalize();
    tmpVector.set(x + lean.x * height * 0.18, info.height + height * 0.5, z + lean.z * height * 0.18);
    tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean);
    tmpScale.set(0.85 + localRng() * 0.55, height, 0.82 + localRng() * 0.5);
    trunks.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
    anchors.push({ x: x + lean.x * height * 0.35, y: info.height + height * 0.86, z: z + lean.z * height * 0.35, angle: localRng() * Math.PI * 2 });
  }
  for (let i = 0; i < trunkCount * 2; i += 1) {
    const anchor = anchors[i % anchors.length];
    const spread = anchor.angle + (localRng() - 0.5) * 1.2;
    const length = 0.78 + localRng() * 1.25;
    const dir = new THREE.Vector3(Math.cos(spread) * 0.74, 0.3 + localRng() * 0.2, Math.sin(spread) * 0.74).normalize();
    tmpVector.set(anchor.x + dir.x * length * 0.5, anchor.y + dir.y * length * 0.5, anchor.z + dir.z * length * 0.5);
    tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    tmpScale.set(0.75 + localRng() * 0.5, length, 0.74 + localRng() * 0.44);
    branches.setMatrixAt(i, matrix.compose(tmpVector, tmpQuat, tmpScale));
  }
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  group.add(trunks);
  group.add(branches);
}

function addProductionRootForms(group) {
  const rootMat = new THREE.MeshStandardMaterial({
    color: 0x4f3922,
    roughness: 0.94,
    metalness: 0,
    emissive: 0x100906,
    emissiveIntensity: 0.045,
  });
  [
    [[-21.5, 9.7], [-16.6, 8.7], [-10.5, 8.9], [-5.0, 8.3]],
    [[7.2, 7.4], [12.0, 8.8], [18.6, 8.5], [23.0, 7.7]],
    [[-21.5, -11.7], [-15.0, -11.0], [-8.2, -10.5], [-2.0, -10.0]],
    [[5.5, -10.0], [11.8, -9.2], [18.0, -8.8], [23.0, -9.8]],
    [[-12.6, -1.7], [-10.0, -2.8], [-6.3, -3.4], [-2.8, -3.0]],
    [[10.5, 4.6], [13.2, 4.0], [16.2, 4.6], [19.0, 5.5]],
  ].forEach((curvePoints, index) => {
    const points = curvePoints.map(([x, z], pointIndex) => {
      const info = productionTerrainInfo(x, z);
      return new THREE.Vector3(x, info.height + 0.2 + Math.sin(pointIndex * 1.5) * 0.07, z);
    });
    const curve = new THREE.CatmullRomCurve3(points);
    const root = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.12 + (index % 2) * 0.025, 7, false), rootMat);
    root.name = "ProductionStyleTargetRootForms";
    root.castShadow = true;
    root.receiveShadow = true;
    group.add(root);
  });
}

function addProductionObjective(group) {
  const x = 3.2;
  const z = -0.4;
  const info = productionTerrainInfo(x, z);
  const shrine = new THREE.Group();
  shrine.name = "ProductionStyleTargetCentralObjective";
  shrine.position.set(x, info.height + 0.08, z);
  shrine.rotation.y = -0.22;

  addProductionGroundDecal(x, z, 5.4, 3.6, 0x06100b, 0.16, group, -0.25, 0.06, "ProductionStyleTargetObjectiveShadow");
  addProductionGroundDecal(x, z, 4.1, 1.0, 0x9ff2d4, 0.08, group, -0.25, 0.12, "ProductionStyleTargetObjectiveHighlight");

  const baseMat = createPaintedStoneMaterial(0x647063, 0xb5ac76, 0x10170f, 0.045);
  const darkMat = createPaintedStoneMaterial(0x404b43, 0x827b55, 0x0c120d, 0.04);
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x70e5bd,
    roughness: 0.52,
    metalness: 0.02,
    emissive: 0x1c8d74,
    emissiveIntensity: 0.42,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.36, 0.35, 32), baseMat);
  base.castShadow = true;
  base.receiveShadow = true;
  shrine.add(base);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.82, 0.22, 18), darkMat);
  inner.position.y = 0.28;
  inner.castShadow = true;
  inner.receiveShadow = true;
  shrine.add(inner);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.08, 8, 64), glowMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.36;
  shrine.add(ring);
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + (i % 2) * 0.08;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.7 + (i % 3) * 0.12, 0.16, 0.34), i % 3 === 0 ? darkMat : baseMat);
    slab.position.set(Math.cos(angle) * 2.92, 0.34, Math.sin(angle) * 2.92);
    slab.rotation.y = -angle + 0.1;
    slab.castShadow = true;
    slab.receiveShadow = true;
    shrine.add(slab);
  }
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + 0.3;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 1.65, 6), darkMat);
    pillar.position.set(Math.cos(angle) * 2.0, 0.98, Math.sin(angle) * 2.0);
    pillar.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.08;
    pillar.castShadow = true;
    shrine.add(pillar);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.66, 5), glowMat);
    fin.position.set(Math.cos(angle) * 2.0, 1.98, Math.sin(angle) * 2.0);
    fin.rotation.set(0.42, -angle, 0.05);
    shrine.add(fin);
  }

  const crystalMaterial = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uVisible: { value: 1 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uVisible;
      varying vec3 vPos;
      void main() {
        float pulse = 0.5 + 0.5 * sin(uTime * 1.5 + vPos.y * 3.5);
        vec3 color = mix(vec3(0.12, 0.7, 0.62), vec3(0.9, 1.0, 0.72), pulse);
        gl_FragColor = vec4(color, (0.68 + pulse * 0.24) * uVisible);
      }
    `,
  });
  state.objectiveShaders.push(crystalMaterial);
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(1.08, 0), crystalMaterial);
  shard.position.y = 2.15;
  shard.scale.set(0.88, 1.34, 0.88);
  shard.castShadow = true;
  shrine.add(shard);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.62, 4.4, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9ff5d4,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  beam.position.y = 3.2;
  shrine.add(beam);
  const light = new THREE.PointLight(0x65e8c8, 2.4, 11);
  light.position.y = 2.3;
  shrine.add(light);

  group.add(shrine);
}

function addProductionRuinedGate(x, z, rotation, colorHex, group) {
  const info = productionTerrainInfo(x, z);
  const gate = new THREE.Group();
  gate.name = "ProductionStyleTargetRuinedLaneGate";
  gate.position.set(x, info.height + 0.06, z);
  gate.rotation.y = rotation;
  const stoneMat = createPaintedStoneMaterial(0x59645b, 0xb8ad78, 0x0d140f, 0.035);
  const accentMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.62,
    emissive: colorHex,
    emissiveIntensity: 0.15,
  });
  for (let i = 0; i < 2; i += 1) {
    const side = i === 0 ? -1 : 1;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.44, 2.0, 6), stoneMat);
    pillar.position.set(side * 0.82, 0.96, 0);
    pillar.rotation.z = side * 0.05;
    pillar.castShadow = true;
    gate.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.22, 0.56), stoneMat);
    cap.position.set(side * 0.82, 2.08, 0);
    cap.rotation.y = side * 0.14;
    cap.castShadow = true;
    gate.add(cap);
  }
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 30), accentMat);
  rune.rotation.x = Math.PI / 2;
  rune.position.y = 0.22;
  gate.add(rune);
  group.add(gate);
}

function addProductionStyleTarget(root) {
  const target = new THREE.Group();
  target.name = "ProductionStyleTarget_NotSummonersRift";
  root.add(target);

  target.add(createProductionUnderlay());
  target.add(createProductionTerrain());
  target.add(createProductionRiverRibbon());
  addProductionPaintedLighting(target);
  addProductionBakedOcclusion(target);
  addProductionTerrainPaintAccents(target);
  addProductionCanopyMassShadows(target);

  addProductionCliffWall(productionNorthCliff, target, 1, 0x526048, 2.85, 1.2, 72);
  addProductionCliffWall(productionSouthCliff, target, -1, 0x455443, 2.9, 1.26, 72);
  addProductionCliffWall(productionWestCliff, target, -1, 0x485844, 2.55, 1.12, 56);
  addProductionCliffWall(productionEastCliff, target, 1, 0x53604e, 2.55, 1.12, 56);
  addProductionCliffFacePaint(productionNorthCliff, 54, target, 1, 1);
  addProductionCliffFacePaint(productionSouthCliff, 54, target, -1, 2);
  addProductionCliffFacePaint(productionWestCliff, 34, target, -1, 3);
  addProductionCliffFacePaint(productionEastCliff, 34, target, 1, 4);
  addProductionOrganicEdgeBreakup(target);
  addProductionCapstones(productionNorthCliff, 18, target, 1, 0x59634f);
  addProductionCapstones(productionSouthCliff, 18, target, -1, 0x4c5a49);
  addProductionCapstones(productionWestCliff, 10, target, -1, 0x4c5b48);
  addProductionCapstones(productionEastCliff, 10, target, 1, 0x59634f);

  addProductionLaneDetails(target);
  addProductionLaneShoulderBreakup(target);
  addProductionLaneSlabClusters(target);
  productionBrushZones.forEach(([x, z, rx, rz], index) => {
    addProductionBrushPatch(x, z, rx, rz, 120 + (index % 3) * 24, 18 + (index % 2) * 8, target, index + 1);
  });
  addProductionSculptedCanopyPlates(target);
  addProductionRootForms(target);
  addProductionObjective(target);
  addProductionRuinedGate(-13.2, -5.8, 0.34, 0x79c9ff, target);
  addProductionRuinedGate(13.8, 3.8, 0.52, 0xffa45f, target);
}

function addLighting() {
  scene.add(new THREE.HemisphereLight(0xe6ffe5, 0x263026, 0.86));
  const sun = new THREE.DirectionalLight(0xffdfaa, 3.25);
  sun.position.set(-14, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.bias = -0.00022;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9ee9ff, 0.82);
  rim.position.set(18, 12, -18);
  scene.add(rim);
  const laneFill = new THREE.DirectionalLight(0xfff3bd, 0.55);
  laneFill.position.set(12, 8, 18);
  scene.add(laneFill);
}

function loadAuthoredMapAsset(root) {
  const loader = new GLTFLoader();
  loader.load(
    authoredMapUrl,
    (gltf) => {
      const asset = gltf.scene;
      asset.name = "AuthoredMobaMapChunk_ModelFirst_NoFog";
      state.assetLoaded = true;
      state.authoredMeshCount = 0;
      asset.traverse((object) => {
        if (!object.isMesh) {
          return;
        }
        state.authoredMeshCount += 1;
        object.castShadow = !object.name.toLowerCase().includes("terrain");
        object.receiveShadow = true;
        object.frustumCulled = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!material) {
            return;
          }
          material.roughness = material.name?.includes("water") ? 0.56 : Math.max(material.roughness ?? 0.82, 0.82);
          material.metalness = 0;
          if (material.name?.includes("water")) {
            material.transparent = true;
            material.opacity = 0.5;
            material.depthWrite = false;
            material.color = new THREE.Color(0x0b6964);
            material.emissive = new THREE.Color(0x063c3a);
            material.emissiveIntensity = 0.08;
          }
          if (material.name?.includes("glow")) {
            material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, 0.65);
          }
          material.needsUpdate = true;
        });
      });
      root.add(asset);
      applyDetailVisibility();
      frameMap();
    },
    undefined,
    (error) => {
      console.error("Authored GLB failed to load; falling back to procedural target.", error);
      addProductionStyleTarget(root);
    },
  );
}

function buildMap() {
  state.mapRoot.name = "ProductionMobaStyleTarget_NotSummonersRift";
  scene.add(state.mapRoot);
  const productionRoot = state.mapRoot;
  loadAuthoredMapAsset(productionRoot);
  return;
  const legacyRoot = new THREE.Group();
  legacyRoot.name = "LegacyProceduralBlockout_Hidden";
  legacyRoot.visible = false;
  productionRoot.add(legacyRoot);
  state.mapRoot = legacyRoot;
  state.mapRoot.add(createMapUnderlay());
  state.mapRoot.add(createTerrain());
  state.mapRoot.add(createRiverRibbon());
  addRiverBankDetails(state.mapRoot);
  addPerimeterCliffs(state.mapRoot);
  addSculptedCliffShelves(state.mapRoot);
  addPerimeterSculptedCliffs(state.mapRoot);
  addFocusedChunkEdgeOcclusion(state.mapRoot);
  addFocusedEdgeCanopyAndRoots(state.mapRoot);
  addLargeCliffCapstones(highWallA, 15, state.mapRoot, 1, 0x53604f);
  addLargeCliffCapstones(highWallB, 13, state.mapRoot, -1, 0x4b574c);
  addLargeCliffCapstones(upperJungleArc, 14, state.mapRoot, -1, 0x546246);
  addLargeCliffCapstones(lowerJungleArc, 14, state.mapRoot, 1, 0x4c5c47);
  addHeroCliffLandmarks(state.mapRoot);
  addStrategicGroundDecals(state.mapRoot);
  addStudioBakedLightingPass(state.mapRoot);
  addFocusedTerrainReadabilityPass(state.mapRoot);
  addRiverFord(state.mapRoot);
  addRiverCauseways(state.mapRoot);
  [laneMid, laneTop, laneLower].forEach((lane, index) => {
    addPathEdgeBrushStrokes(lane, index === 0 ? 90 : 64, state.mapRoot, 0xe5d08e, index === 0 ? 0.14 : 0.11, 2.05);
    addPathEdgeBrushStrokes(lane, index === 0 ? 66 : 46, state.mapRoot, 0x0b1b11, index === 0 ? 0.075 : 0.06, 3.1);
    state.mapRoot.add(createLaneStones(lane, index === 0 ? 58 : 40, index === 0 ? 0xb7a177 : 0x8f805f, 0));
    state.mapRoot.add(createLaneStones(lane, index === 0 ? 30 : 22, 0x5c675b, 2.2));
    state.mapRoot.add(createLaneStones(lane, index === 0 ? 30 : 22, 0x5c675b, -2.2));
    createLaneRunes(lane, index === 0 ? 18 : 12, index === 1 ? 0x7fc9ff : index === 2 ? 0xffa56f : 0xc7f3a0, state.mapRoot, 0);
    addLaneWearBands(lane, index === 0 ? 28 : 18, state.mapRoot, 0xf0daa0, index === 0 ? 0.07 : 0.055, 0.75);
    addLaneWearBands(lane, index === 0 ? 20 : 14, state.mapRoot, 0x35281a, index === 0 ? 0.045 : 0.036, 1.05);
    createLanePebbleFlow(lane, index === 0 ? 32 : 22, state.mapRoot);
    addLaneCrackStrokes(lane, index === 0 ? 38 : 24, state.mapRoot, index === 0 ? 0x4a3520 : 0x3e301f, index === 0 ? 0.13 : 0.1);
    addBrokenLaneDebris(lane, index === 0 ? 42 : 30, state.mapRoot, index === 0 ? 0x9a8a62 : 0x7f765b);
  });

  addWallRocks(highWallA, 20, state.mapRoot, 0x515b4e);
  addWallRocks(highWallB, 18, state.mapRoot, 0x4d584d);
  addWallRocks(upperJungleArc, 20, state.mapRoot, 0x53604e);
  addWallRocks(lowerJungleArc, 20, state.mapRoot, 0x4c5a4b);
  addCliffFaceBands(highWallA, 24, state.mapRoot, 0x455140, 1);
  addCliffFaceBands(highWallB, 22, state.mapRoot, 0x404d42, -1);
  addCliffFaceBands(upperJungleArc, 24, state.mapRoot, 0x46543f, -1);
  addCliffFaceBands(lowerJungleArc, 24, state.mapRoot, 0x40503f, 1);
  addCliffTopHighlights(highWallA, 44, state.mapRoot);
  addCliffTopHighlights(highWallB, 40, state.mapRoot);
  addCliffTopHighlights(upperJungleArc, 42, state.mapRoot);
  addCliffTopHighlights(lowerJungleArc, 42, state.mapRoot);
  addCliffCreaseShadows(highWallA, 30, state.mapRoot, 1, 0.12);
  addCliffCreaseShadows(highWallB, 28, state.mapRoot, -1, 0.11);
  addCliffCreaseShadows(upperJungleArc, 28, state.mapRoot, -1, 0.1);
  addCliffCreaseShadows(lowerJungleArc, 28, state.mapRoot, 1, 0.1);
  addCliffRimGrass(highWallA, 140, state.mapRoot, 1);
  addCliffRimGrass(highWallB, 120, state.mapRoot, -1);
  addCliffRimGrass(upperJungleArc, 130, state.mapRoot, -1);
  addCliffRimGrass(lowerJungleArc, 130, state.mapRoot, 1);
  addPathPaintedShadows(highWallA, 26, 2.5, 0.16, state.mapRoot);
  addPathPaintedShadows(highWallB, 24, 2.3, 0.14, state.mapRoot);
  addPathPaintedShadows(upperJungleArc, 24, 2.5, 0.13, state.mapRoot);
  addPathPaintedShadows(lowerJungleArc, 24, 2.5, 0.13, state.mapRoot);
  addJungleMassShadows(state.mapRoot);
  addJungleCanopyStructure(state.mapRoot);
  addCanopyVolumeLobes(state.mapRoot);
  addCanopyClusters(state.mapRoot);
  addCanopyPaintHighlights(state.mapRoot);
  addCanopyLeafCards(state.mapRoot);
  addHeroJungleTreeClumps(state.mapRoot);
  addJungleRootProps(state.mapRoot);
  addPaintedGroundAccents(state.mapRoot);
  brushPatchSpecs.forEach(([x, z, radiusX, radiusZ, count]) => {
    addBrushVolumePatch(x, z, radiusX, radiusZ, Math.max(18, Math.round(count * 0.13)), state.mapRoot);
    addBrushPatch(x, z, radiusX, radiusZ, count, state.mapRoot);
  });

  createTower(-17, -11.2, 0x56a8ff, state.mapRoot);
  createTower(18.4, 7.2, 0xff8c55, state.mapRoot);
  createLaneBanner(-20.8, -9.2, 0x57a8ff, state.mapRoot);
  createLaneBanner(22.0, 8.8, 0xff8c55, state.mapRoot);
  createLaneBanner(-9.2, 11.8, 0x7fc9ff, state.mapRoot);
  createLaneBanner(14.0, -17.4, 0xffa56f, state.mapRoot);
  createRuneMonolith(-11.8, -4.6, 0x82f1d1, state.mapRoot, -0.35, 0.9);
  createRuneMonolith(3.6, -6.0, 0xc8f3a0, state.mapRoot, 0.65, 0.78);
  createRuneMonolith(11.4, 4.3, 0xffb06f, state.mapRoot, 0.2, 0.78);
  createRuneMonolith(-4.8, 8.6, 0x7fc9ff, state.mapRoot, -0.8, 0.74);
  createRuinedGateway(-10.6, -4.0, 0x82f1d1, state.mapRoot, -0.34, 1.12);
  createRuinedGateway(12.8, 4.9, 0xffb06f, state.mapRoot, 0.52, 0.98);
  createRuinedGateway(-5.2, 9.4, 0x7fc9ff, state.mapRoot, -0.92, 0.92);
  createObjectiveShrine(state.mapRoot);
  createJungleCamp(-17.5, 14.6, 0.58, state.mapRoot);
  createJungleCamp(19.5, -16.2, 0.07, state.mapRoot);
  createJungleCamp(-1.8, -18.6, 0.77, state.mapRoot);

  addContactShadow(-17, -11.2, 2.8, 2.1, 0.28, state.mapRoot);
  addContactShadow(18.4, 7.2, 2.8, 2.1, 0.28, state.mapRoot);
  addContactShadow(6.5, 1.2, 4.5, 3.8, 0.22, state.mapRoot);
  state.mapRoot = productionRoot;
  addProductionStyleTarget(state.mapRoot);
}

function applyTheme() {
  const themes = {
    dawn: { bg: 0x243237, exposure: 0.84, bloom: 0.07, grade: 0.52 },
    rune: { bg: 0x202c34, exposure: 0.82, bloom: 0.14, grade: 0.62 },
    night: { bg: 0x151d29, exposure: 0.76, bloom: 0.2, grade: 0.48 },
  };
  const theme = themes[state.theme] ?? themes.dawn;
  scene.background.setHex(theme.bg);
  renderer.toneMappingExposure = theme.exposure;
  bloomPass.strength = theme.bloom;
  gameArtGradePass.uniforms.uStrength.value = theme.grade;
}

function applyDetailVisibility() {
  state.mapRoot.traverse((object) => {
    if (
      object.name === "PaintedJungleCanopy" ||
      object.name === "SolidPaintedJungleCanopyVolumes" ||
      object.name === "JungleCanopySupportTrunks" ||
      object.name === "JungleCanopySupportBranches" ||
      object.name === "PaintedCanopyTopHighlights" ||
      object.name === "AlphaTestJungleLeafCards" ||
      object.name === "GameplayBrushPatch" ||
      object.name === "VolumetricGameplayBrushMass" ||
      object.name === "PaintedCliffRimGrass" ||
      object.name === "ReadableLanePaintedCracks" ||
      object.name === "BrokenLaneEdgeSlabs" ||
      object.name === "BrokenLaneStoneChips" ||
      object.name === "PaintedCliffCreaseShadows" ||
      object.name === "HandPaintedLaneWearBands" ||
      object.name === "PaintedLaneStoneInlays" ||
      object.name === "HeroJungleTreeClump" ||
      object.name === "StudioBakedPaintShadow" ||
      object.name === "StudioBakedPaintHighlight" ||
      object.name === "ContinuousSculptedGameplayCliffShelf" ||
      object.name === "ContinuousPerimeterPaintedCliffShelf" ||
      object.name === "LargePainterlyCliffCapstones" ||
      object.name === "HeroSculptedGameplayCliffLandmark" ||
      object.name === "ReadableTowerGameplayPlinth" ||
      object.name === "CentralObjectiveGuardianCrown" ||
      object.name === "FocusedChunkNaturalEdgeMatte" ||
      object.name === "FocusedChunkEdgeRootSilhouette" ||
      object.name === "FocusedChunkTerrainDepthPaint" ||
      object.name === "FocusedChunkTerrainPaintHighlight" ||
      object.name === "ProductionStyleTargetPaintShadow" ||
      object.name === "ProductionStyleTargetPaintHighlight" ||
      object.name === "ProductionStyleTargetPaintStroke" ||
      object.name === "ProductionStyleTargetBakedOcclusion" ||
      object.name === "ProductionStyleTargetTerrainPaintAccent" ||
      object.name === "ProductionStyleTargetLaneEmbeddedSlabs" ||
      object.name === "ProductionStyleTargetLaneSlabShadows" ||
      object.name === "ProductionStyleTargetLaneShoulderBreakup" ||
      object.name === "ProductionStyleTargetWaterLilyPads" ||
      object.name === "ProductionStyleTargetWaterDetailRipples" ||
      object.name === "ProductionStyleTargetCanopyMassShadow" ||
      object.name === "ProductionStyleTargetSculptedCanopyPlates" ||
      object.name === "ProductionStyleTargetSculptedCanopyPlateShadows" ||
      object.name === "ProductionStyleTargetSculptedCanopyTrunks" ||
      object.name === "ProductionStyleTargetSculptedCanopyBranches" ||
      object.name === "ProductionStyleTargetOrganicEdgeMatte" ||
      object.name === "ProductionStyleTargetCliffFacePaint" ||
      object.name === "ProductionStyleTargetCapstones" ||
      object.name === "ProductionStyleTargetLaneDetail" ||
      object.name === "ProductionStyleTargetBrushMass" ||
      object.name === "ProductionStyleTargetBrushCards" ||
      object.name === "ProductionStyleTargetCanopyMass" ||
      object.name === "ProductionStyleTargetCanopyHighlights" ||
      object.name === "ProductionStyleTargetCanopyBrushCards" ||
      object.name === "ProductionStyleTargetCanopyTrunks" ||
      object.name === "ProductionStyleTargetCanopyBranches" ||
      object.name === "ProductionStyleTargetRootForms" ||
      object.name === "ProductionStyleTargetCliffRimGrass" ||
      object.name === "ProductionStyleTargetRuinedLaneGate"
    ) {
      object.visible = state.detail > 0.35;
    }
    if (object.name === "JungleGameplayWallRocks" || object.name === "HandPaintedLaneEdgeStrokes") {
      object.visible = state.detail > 0.2;
    }
  });
}

function frameMap() {
  controls.target.set(1.4, 0.62, -0.8);
  camera.position.set(28, 30, 34);
  camera.zoom = 1.32;
  camera.updateProjectionMatrix();
  controls.update();
}

function wireUi() {
  const recenter = document.querySelector("#randomize");
  const toggleObjective = document.querySelector("#toggleLeaves");
  const flow = document.querySelector("#wind");
  const detail = document.querySelector("#density");

  recenter.innerHTML = "<i data-lucide='refresh-cw'></i>";
  toggleObjective.innerHTML = "<i data-lucide='eye'></i>";
  createIcons({ icons: { RefreshCw, Eye, Map } });
  detail.value = String(state.detail);

  recenter.addEventListener("click", frameMap);
  toggleObjective.addEventListener("click", () => {
    state.showObjectiveFX = !state.showObjectiveFX;
    toggleObjective.classList.toggle("active", state.showObjectiveFX);
    state.objectiveShaders.forEach((material) => {
      material.uniforms.uVisible.value = state.showObjectiveFX ? 1 : 0.22;
    });
  });
  flow.addEventListener("input", (event) => {
    state.flow = Number(event.target.value);
    state.waterShaders.forEach((material) => {
      material.uniforms.uFlow.value = state.flow;
    });
  });
  detail.addEventListener("input", (event) => {
    state.detail = Number(event.target.value);
    applyDetailVisibility();
  });
  document.querySelectorAll(".season").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".season").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      state.theme = button.dataset.season;
      applyTheme();
    });
  });
}

function resize() {
  const { innerWidth, innerHeight } = window;
  const aspect = innerWidth / Math.max(1, innerHeight);
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  ssaoPass.setSize(innerWidth, innerHeight);
  bloomPass.setSize(innerWidth, innerHeight);
  fxaaPass.material.uniforms.resolution.value.set(1 / (innerWidth * renderPixelRatio), 1 / (innerHeight * renderPixelRatio));
  camera.left = (-ORTHO_VIEW_SIZE * aspect) / 2;
  camera.right = (ORTHO_VIEW_SIZE * aspect) / 2;
  camera.top = ORTHO_VIEW_SIZE / 2;
  camera.bottom = -ORTHO_VIEW_SIZE / 2;
  camera.updateProjectionMatrix();
}

function animate(timeMs) {
  const time = timeMs * 0.001;
  state.waterShaders.forEach((material) => {
    material.uniforms.uTime.value = time;
  });
  state.foliageShaders.forEach((shader) => {
    shader.uniforms.uTime.value = time;
  });
  state.objectiveShaders.forEach((material) => {
    material.uniforms.uTime.value = time;
  });
  controls.update();
  composer.render();
  requestAnimationFrame(animate);
}

addLighting();
buildMap();
applyDetailVisibility();
wireUi();
applyTheme();
frameMap();
resize();
window.addEventListener("resize", resize);
requestAnimationFrame(animate);
