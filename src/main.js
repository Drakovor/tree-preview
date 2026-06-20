import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const container = document.querySelector("#app");
const loading = document.querySelector("#loading");
const hudLabel = document.querySelector("#hud-label");
const assetButton = document.querySelector("#asset-mode");
const viewButton = document.querySelector("#view-mode");
const resetButton = document.querySelector("#reset");
const wireButton = document.querySelector("#wire");

const params = new URLSearchParams(window.location.search);
const captureMode = params.get("capture") === "1";
let localViewMode = params.get("view") !== "wide";
if (captureMode) document.body.classList.add("capture");

const assetVersion = params.get("v") || "local-view";
const publicUrl = (path) => {
  const url = new URL(path, window.location.href);
  url.searchParams.set("v", assetVersion);
  return url.href;
};
const assets = {
  environment: {
    label: "Extérieur sculpté",
    nextLabel: "Kit extérieur",
    url: publicUrl("outputs/stylized_exterior_environment_scene.glb"),
    distance: 1.32,
  },
  "environment-kit": {
    label: "Kit extérieur",
    nextLabel: "Village complet",
    url: publicUrl("outputs/stylized_exterior_environment_kit.glb"),
    distance: 1.42,
  },
  village: {
    label: "Village complet",
    nextLabel: "Asset cottage",
    url: publicUrl("outputs/stylized_village_exterior_unity.glb"),
    distance: 1.52,
  },
  cottage: {
    label: "Asset cottage",
    nextLabel: "Kit modulaire",
    url: publicUrl("outputs/stylized_cottage_asset.glb"),
    distance: 1.24,
  },
  kit: {
    label: "Kit modulaire",
    nextLabel: "Extérieur sculpté",
    url: publicUrl("outputs/stylized_village_modular_kit.glb"),
    distance: 1.38,
  },
};
const order = ["environment", "environment-kit", "village", "cottage", "kit"];
let currentAsset = assets[params.get("asset")] ? params.get("asset") : "environment";
let model;
let wireframe = false;

window.__viewerState = { status: "booting", asset: currentAsset };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb0bdc3);
scene.fog = new THREE.Fog(0xb0bdc3, 18, 46);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.05, 240);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.9));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.8;
controls.maxDistance = 80;
controls.enablePan = true;

const hemi = new THREE.HemisphereLight(0xd9e7ea, 0x728066, 2.18);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffe6bd, 3.55);
sun.position.set(-5.5, 8.2, -5.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 70;
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x9fb9d8, 0.78);
fill.position.set(6, 4, 6);
scene.add(fill);

function applyAssetUi() {
  const asset = assets[currentAsset];
  hudLabel.textContent = asset.label;
  assetButton.textContent = asset.nextLabel;
  viewButton.textContent = localViewMode ? "Vue large" : "Vue locale";
  viewButton.disabled = currentAsset !== "environment";
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const target = center.clone();
  target.y += size.y * 0.04;
  const fitDistance = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const mobile = window.matchMedia("(max-width: 720px), (pointer: coarse)").matches;
  if (currentAsset === "environment" && localViewMode) {
    target.set(mobile ? -1.08 : -0.65, mobile ? 0.58 : 0.72, mobile ? 0.82 : 0.92);
    camera.position.set(mobile ? -4.45 : -6.55, mobile ? 1.95 : 3.32, mobile ? 4.18 : 6.65);
  } else {
    const direction = mobile
      ? new THREE.Vector3(0.72, 0.52, 0.92).normalize()
      : new THREE.Vector3(0.7, 0.46, 0.78).normalize();
    const distance = fitDistance * assets[currentAsset].distance * (mobile ? 1.16 : 1.0);
    camera.position.copy(target).add(direction.multiplyScalar(distance));
  }
  camera.near = Math.max(0.01, fitDistance / 120);
  camera.far = Math.max(90, fitDistance * 90);
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.minDistance = Math.max(0.35, maxDim * 0.08);
  controls.maxDistance = Math.max(24, maxDim * 3.2);
  controls.update();
}

function tuneEnvironmentMaterial(child) {
  if (currentAsset !== "environment" || !child.isMesh || !child.material) return;
  const materials = Array.isArray(child.material) ? child.material : [child.material];
  const key = `${child.name} ${materials.map((material) => material.name || "").join(" ")}`.toLowerCase();
  let color = null;
  if (/organic_blended_edge_ribbon/.test(key)) {
    child.visible = false;
    return;
  }
  if (/dark_wood|wood_dark|root_dark|charred/.test(key)) color = 0x342416;
  else if (/wood|trunk|branch|rail|fence|post|root|timber|log|plank|beam|sign|door/.test(key)) color = 0x72492d;
  else if (/roof|slate/.test(key)) color = 0x242b2d;
  else if (/dry_grass|worn_meadow/.test(key)) color = 0x77734a;
  else if (/cool_grass|shadow_low|shadow_moss|terrain_material.*shadow/.test(key)) color = 0x34513b;
  else if (/sculpted_terraced_ground|grass_high|grass_low|meadow/.test(key)) color = 0x526d4b;
  else if (/trampled_soil|dead_leaf|path_shoulder/.test(key)) color = 0x6a5135;
  else if (/layered_s_curved_dirt_path|path_dirt|path_dry/.test(key)) color = 0x755f4d;
  else if (/cut_earth_path_embankment|earth_bank/.test(key)) color = 0x604b3b;
  else if (/stone|cobble|slab|rock/.test(key)) color = 0x73766e;
  else if (/leaf|moss|bush|canopy/.test(key)) color = 0x3c5c37;
  if (!color) return;
  for (const material of materials) {
    if (material.color) material.color.setHex(color);
    material.roughness = Math.min(1, material.roughness ?? 0.9);
    material.needsUpdate = true;
  }
}

function loadAsset() {
  applyAssetUi();
  window.__viewerState = { status: "loading-model", asset: currentAsset };
  loading.style.display = "grid";
  loading.textContent = "Chargement 3D...";
  if (model) {
    scene.remove(model);
    model.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) material.dispose();
      }
    });
    model = null;
  }

  new GLTFLoader().load(
    assets[currentAsset].url,
    (gltf) => {
      model = gltf.scene;
      model.traverse((child) => {
        if (/sky|backdrop|scene_note/i.test(child.name)) {
          child.visible = false;
          return;
        }
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        tuneEnvironmentMaterial(child);
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            material.wireframe = wireframe;
            material.roughness = Math.min(1, material.roughness ?? 0.86);
            material.needsUpdate = true;
          }
        }
      });
      scene.add(model);
      frameObject(model);
      loading.style.display = "none";
      window.__viewerState = { status: "ready", asset: currentAsset };
    },
    (event) => {
      if (!event.total) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      loading.textContent = `Chargement 3D... ${pct}%`;
      window.__viewerState.progress = pct;
    },
    (error) => {
      window.__viewerState = { status: "error", asset: currentAsset, error: String(error?.message || error) };
      loading.textContent = "Erreur de chargement.";
      console.error(error);
    },
  );
}

resetButton.addEventListener("click", () => {
  if (model) frameObject(model);
});

assetButton.addEventListener("click", () => {
  const index = order.indexOf(currentAsset);
  currentAsset = order[(index + 1) % order.length];
  const next = new URL(window.location.href);
  if (currentAsset === "environment") next.searchParams.delete("asset");
  else next.searchParams.set("asset", currentAsset);
  next.searchParams.set("v", String(Date.now()));
  window.history.replaceState(null, "", next);
  loadAsset();
});

viewButton.addEventListener("click", () => {
  if (currentAsset !== "environment") return;
  localViewMode = !localViewMode;
  const next = new URL(window.location.href);
  if (localViewMode) next.searchParams.delete("view");
  else next.searchParams.set("view", "wide");
  next.searchParams.set("v", String(Date.now()));
  window.history.replaceState(null, "", next);
  applyAssetUi();
  if (model) frameObject(model);
});

wireButton.addEventListener("click", () => {
  wireframe = !wireframe;
  if (!model) return;
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.wireframe = wireframe;
  });
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (model) frameObject(model);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

loadAsset();
animate();
