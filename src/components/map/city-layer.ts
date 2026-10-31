import * as THREE from "three";
import type maplibregl from "maplibre-gl";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import type { Polygon } from "geojson";
import { originMercator, toLocal } from "./frame";
import type { BuiltCity } from "./buildings";

/**
 * One coherent Three.js layer rendered inside MapLibre's WebGL context (official custom-layer API):
 * OSM buildings with a facade shader and real-time sun shadows, a water surface, the verified
 * hazard volume, population columns (aggregated, privacy-preserving), delivery ripples and, in the
 * fire drill, the burning tower floor by floor with its smoke plume.
 * Geometry lives in a local east/north/up frame (metres) around Al Majaz.
 */

export type Quality = "cinematic" | "balanced" | "lite";

export interface ClusterDatum {
  id: string;
  e: number;
  n: number;
  count: number;
  color: THREE.ColorRepresentation;
  emphasis: number; // 0..1 (assistance clusters glow)
}

/** A building on fire, drawn floor by floor over its OSM footprint (fire drill only). */
export interface FireTowerSpec {
  /** Rebuilds the geometry when this changes (building, floors, height). */
  key: string;
  /** Footprint ring in lng/lat (closed). */
  ring: [number, number][];
  floors: number;
  heightM: number;
  fireFloor: number;
  /** One colour per floor, index = floor - 1. */
  colors: string[];
  windFromDeg: number;
  burning: boolean;
}

/** Direction towards the sun (east, north, up): late-afternoon sun from the south-west. */
const SUN_DIR = new THREE.Vector3(-0.58, -0.42, 0.7).normalize();

const BUILDING_VERT_PRE = /* glsl */ `
attribute vec2 aWall;
attribute vec4 aInfo;
uniform float uReveal;
uniform float uTime;
varying vec2 vWall;
varying vec4 vInfo;
varying vec3 vLocal;
`;

const BUILDING_FRAG_PRE = /* glsl */ `
uniform float uZoneTint;
uniform vec3 uCamPos;
uniform vec3 uHaze;
uniform float uWindows;
varying vec2 vWall;
varying vec4 vInfo;
varying vec3 vLocal;
`;

function buildingMaterial(quality: Quality) {
  const uniforms = {
    uReveal: { value: 0 },
    uTime: { value: 0 },
    uZoneTint: { value: 0 },
    uCamPos: { value: new THREE.Vector3(0, -2000, 1500) },
    uHaze: { value: new THREE.Color("#dfe8e6") },
    uWindows: { value: quality === "lite" ? 0 : 1 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = BUILDING_VERT_PRE + shader.vertexShader.replace(
      "#include <begin_vertex>",
      /* glsl */ `
      vec3 transformed = vec3(position);
      float dist = length(position.xy);
      float rise = clamp(uReveal * 1.35 - dist / 5200.0, 0.0, 1.0);
      rise = rise * rise * (3.0 - 2.0 * rise);
      transformed.z *= rise;
      vWall = aWall;
      vInfo = aInfo;
      vLocal = transformed;
      `,
    );
    shader.fragmentShader = BUILDING_FRAG_PRE + shader.fragmentShader.replace(
      "#include <color_fragment>",
      /* glsl */ `
      #include <color_fragment>
      float h = vInfo.x;
      float est = vInfo.y;
      float seed = vInfo.z;
      float isWall = vWall.y;
      float camDist = distance(vLocal, uCamPos);
      // Palette: warm limestone low-rise, pale sand mid-rise, pale glass-white towers
      vec3 low = mix(vec3(0.955, 0.935, 0.895), vec3(0.975, 0.960, 0.930), seed);
      vec3 mid = mix(vec3(0.960, 0.950, 0.930), vec3(0.925, 0.935, 0.930), seed);
      vec3 tower = mix(vec3(0.900, 0.925, 0.935), vec3(0.950, 0.955, 0.950), seed);
      vec3 base = h < 14.0 ? low : (h < 45.0 ? mid : tower);
      vec3 roof = base * 0.95;
      vec3 col = mix(roof, base, isWall);
      // Facade rhythm (floors 3.4 m, bays ~3 m). Anti-aliased, and resolved to an average tone with
      // distance so far towers read as glazed volumes instead of shimmering dots.
      if (isWall > 0.5 && uWindows > 0.5 && h > 6.0) {
        float fz = vLocal.z / 3.4;
        float fu = vWall.x / (h > 45.0 ? 2.8 : 3.6);
        vec2 w = max(fwidth(vec2(fz, fu)), vec2(1e-4));
        float band = smoothstep(0.30 - w.x, 0.30 + w.x, fract(fz)) * (1.0 - smoothstep(0.88 - w.x, 0.88 + w.x, fract(fz)));
        float bay = smoothstep(0.12 - w.y, 0.12 + w.y, fract(fu)) * (1.0 - smoothstep(0.88 - w.y, 0.88 + w.y, fract(fu)));
        float detail = 1.0 - smoothstep(420.0, 1500.0, camDist);
        float pattern = mix(0.44, band * bay, detail);
        vec3 glass = h > 45.0 ? vec3(0.55, 0.67, 0.72) : vec3(0.70, 0.73, 0.73);
        float k = (h > 45.0 ? 0.55 : 0.26) * (est > 0.5 ? 0.55 : 1.0);
        col = mix(col, glass, pattern * k);
        col *= mix(0.88, 1.0, smoothstep(0.0, 4.2, vLocal.z));
      }
      // Contact darkening near the ground (cheap ambient occlusion)
      col *= mix(0.74, 1.0, smoothstep(0.0, 10.0, vLocal.z) * isWall + (1.0 - isWall));
      // Affected-zone emphasis (restrained warm tint on lower floors)
      if (vInfo.w > 0.5) {
        float lowFloors = 1.0 - smoothstep(0.0, 28.0, vLocal.z);
        col = mix(col, vec3(0.98, 0.62, 0.52), uZoneTint * (0.18 + 0.32 * lowFloors * isWall));
      }
      diffuseColor.rgb = col;
      `,
    ).replace(
      "#include <fog_fragment>",
      /* glsl */ `
      float hazeDist = distance(vLocal, uCamPos);
      float haze = smoothstep(1800.0, 9000.0, hazeDist) * 0.75;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, haze);
      `,
    );
  };
  mat.customProgramCacheKey = () => `aman-building-${quality}`;
  return { mat, uniforms };
}

const WATER_VERT = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uSun;
uniform float uAnimate;
varying vec3 vLocal;
float wave(vec2 p, vec2 d, float f, float s) { return sin(dot(p, d) * f + uTime * s); }
void main() {
  vec2 p = vLocal.xy;
  float t = uAnimate;
  vec3 nrm = normalize(vec3(
    (wave(p, vec2(0.8, 0.6), 0.09, 1.3) + 0.6 * wave(p, vec2(-0.4, 0.9), 0.17, 1.9) + 0.3 * wave(p, vec2(0.95, -0.3), 0.41, 2.7)) * 0.06 * t,
    (wave(p, vec2(0.6, -0.8), 0.11, 1.1) + 0.6 * wave(p, vec2(0.7, 0.7), 0.21, 2.3) + 0.3 * wave(p, vec2(-0.9, 0.2), 0.37, 3.1)) * 0.06 * t,
    1.0));
  vec3 view = normalize(uCamPos - vLocal);
  float fres = pow(1.0 - max(dot(view, nrm), 0.0), 3.0);
  vec3 deep = vec3(0.16, 0.50, 0.56);
  vec3 shallow = vec3(0.44, 0.78, 0.78);
  vec3 sky = vec3(0.86, 0.93, 0.94);
  vec3 col = mix(mix(deep, shallow, 0.5), sky, 0.08 + 0.5 * fres);
  vec3 r = reflect(-uSun, nrm);
  float glint = pow(max(dot(r, view), 0.0), 220.0) * 1.4;
  col += vec3(1.0, 0.94, 0.82) * glint;
  float dist = distance(vLocal, uCamPos);
  col = mix(col, vec3(0.86, 0.91, 0.91), smoothstep(2500.0, 11000.0, dist) * 0.7);
  gl_FragColor = vec4(col, 0.94);
}
`;

const HAZARD_VERT = /* glsl */ `
attribute float aV;
varying float vV;
varying vec3 vLocal;
uniform float uRise;
void main() {
  vV = aV;
  vec3 p = position;
  p.z *= uRise;
  vLocal = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const HAZARD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uScan;
uniform float uSmoke;
varying float vV;
varying vec3 vLocal;
void main() {
  float fall = pow(1.0 - vV, 1.7);
  float edge = smoothstep(0.03, 0.0, vV) * 0.6;
  float scanY = fract(uTime * 0.12);
  float scan = smoothstep(0.035, 0.0, abs(vV - scanY)) * 0.35 * uScan;
  float flood = fall * 0.30 + edge + scan;
  // Smoke: a soft haze that thins with height and drifts slowly, with a faint ground edge.
  float drift = 0.76 + 0.24 * sin(vLocal.x * 0.018 + vLocal.y * 0.013 + vLocal.z * 0.05 - uTime * 0.35);
  float smoke = pow(1.0 - vV, 1.2) * 0.34 * drift + edge * 0.3;
  float a = mix(flood, smoke, uSmoke) * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`;

const GLOW_VERT = /* glsl */ `
attribute float aV;
varying float vV;
void main() {
  vV = aV;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uPulse;
varying float vV;
void main() {
  // Heat from the fire floor: strongest at the slab, fading up the floors above. Flickers unless motion is reduced.
  float flicker = 1.0 - uPulse * (0.2 + 0.2 * sin(uTime * 3.3) * sin(uTime * 1.9 + 0.7));
  float a = smoothstep(0.0, 0.1, vV) * pow(1.0 - vV, 1.6);
  gl_FragColor = vec4(uColor, a * uOpacity * flicker);
}
`;

const PUFF_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uAnim;
uniform vec2 uWind;
uniform float uBase;
uniform vec3 uCamPos;
varying float vA;
varying float vFacing;
void main() {
  // Each puff loops from the fire floor out along the wind, rising and spreading as it thins.
  float ph = fract(aSeed + uTime * 0.03 * uAnim);
  vec2 side = vec2(-uWind.y, uWind.x) * sin(aSeed * 91.7) * (4.0 + ph * 80.0);
  vec3 c = vec3(uWind * (6.0 + ph * 560.0) + side, uBase + ph * 120.0 + sin(aSeed * 37.0) * 5.0);
  vec3 p = c + position * mix(6.0, 50.0, ph);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vFacing = abs(dot(normal, normalize(uCamPos - world.xyz)));
  vA = smoothstep(0.0, 0.1, ph) * (1.0 - smoothstep(0.45, 1.0, ph));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const PUFF_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
varying float vFacing;
void main() {
  // Soft silhouettes: fade where the sphere turns away from the camera.
  gl_FragColor = vec4(uColor, vA * uOpacity * smoothstep(0.05, 0.75, vFacing));
}
`;

/** Floor slabs keep their status colour on the shaded side: a little self-light from the instance colour. */
function slabMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.66, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * 0.28;
      `,
    );
  };
  mat.customProgramCacheKey = () => "aman-fire-slab";
  return mat;
}

const ROOF_COLOR = "#e3e9ea";

const COLUMN_VERT = /* glsl */ `
uniform vec3 uCamPos;
varying float vZ;
varying vec3 vColor;
varying float vNear;
void main() {
  vZ = position.z;
  vec4 world = instanceMatrix * vec4(position, 1.0);
  // Columns step back when the camera is close, so streets and buildings stay readable.
  vNear = smoothstep(280.0, 1100.0, distance(world.xyz, uCamPos));
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;
const COLUMN_FRAG = /* glsl */ `
varying float vZ;
varying vec3 vColor;
varying float vNear;
void main() {
  float a = mix(0.22, 0.95, pow(vZ, 1.1)) * mix(0.32, 1.0, vNear);
  float cap = smoothstep(0.955, 1.0, vZ);
  vec3 c = mix(vColor * 0.9, min(vColor * 1.18 + 0.06, vec3(1.0)), vZ);
  c = mix(c, vec3(1.0), cap * 0.5);
  gl_FragColor = vec4(c, a + cap * 0.1);
  #include <colorspace_fragment>
}
`;

export class CityLayer implements CustomLayerInterface {
  id = "aman-city";
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private origin = originMercator();
  private startTime = performance.now();
  private sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
  private buildingUniforms: ReturnType<typeof buildingMaterial>["uniforms"] | null = null;
  private buildings: THREE.Mesh | null = null;
  private ground: THREE.Mesh;
  private water: THREE.Mesh | null = null;
  private waterUniforms = { uTime: { value: 0 }, uCamPos: { value: new THREE.Vector3() }, uSun: { value: SUN_DIR.clone() }, uAnimate: { value: 1 } };
  private hazard: THREE.Mesh | null = null;
  private hazardUniforms = { uColor: { value: new THREE.Color("#f2634a") }, uOpacity: { value: 0 }, uRise: { value: 0 }, uTime: { value: 0 }, uScan: { value: 1 }, uSmoke: { value: 0 } };
  /** Flood zone (red volume, tinted buildings) or fire smoke area (taller grey-brown haze, no tint). */
  private hazardStyle: "flood" | "smoke" = "flood";
  // Custom shaders write raw values, so these colours are given as display RGB (like the hazard's).
  private glowUniforms = { uColor: { value: new THREE.Color().setRGB(1, 0.48, 0.27) }, uOpacity: { value: 0.6 }, uTime: { value: 0 }, uPulse: { value: 1 } };
  private puffUniforms = {
    uColor: { value: new THREE.Color().setRGB(0.47, 0.43, 0.39) },
    uOpacity: { value: 0.3 },
    uTime: { value: 0 },
    uAnim: { value: 1 },
    uWind: { value: new THREE.Vector2(0.71, -0.71) },
    uBase: { value: 40 },
    uCamPos: this.waterUniforms.uCamPos,
  };
  /** Fire drill: the burning tower, one slab per floor coloured from the building board. */
  private fire: {
    key: string;
    group: THREE.Group;
    slabs: THREE.InstancedMesh;
    glow: THREE.Mesh;
    puffs: THREE.Mesh;
    fh: number;
    colors: THREE.Color[];
    targets: THREE.Color[];
    burning: boolean;
    settling: boolean;
  } | null = null;
  private columns: THREE.InstancedMesh | null = null;
  private columnState = new Map<string, { idx: number; h: number; target: number; r: number; color: THREE.Color; targetColor: THREE.Color }>();
  private ripples: { mesh: THREE.Mesh; start: number }[] = [];
  private rippleGeom = new THREE.RingGeometry(0.86, 1, 64);
  private tweens: { obj: { value: number }; to: number; from: number; start: number; dur: number }[] = [];
  private quality: Quality;
  private animateUntil = 0;
  private reduced = false;
  onFrame?: () => void;

  constructor(quality: Quality) {
    this.quality = quality;
    const shadowCatcher = new THREE.ShadowMaterial({ color: 0x15343c, opacity: 0.2, depthWrite: false });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), shadowCatcher);
    this.ground.position.z = 0.25;
    this.ground.receiveShadow = true;
    this.ground.renderOrder = 1;
  }

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.applyQualityToRenderer();

    const hemi = new THREE.HemisphereLight(0xe8f3f4, 0xd2c4aa, 2.1);
    hemi.up.set(0, 0, 1);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    this.sun.castShadow = true;
    this.sun.shadow.camera.up.set(0, 0, 1);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(this.ground);
  }

  private applyQualityToRenderer() {
    if (!this.renderer) return;
    const shadows = this.quality === "cinematic";
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.shadow.radius = 3;
    this.sun.castShadow = shadows;
    this.ground.visible = shadows;
    const size = this.quality === "cinematic" ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as never;
    }
    if (this.buildingUniforms) this.buildingUniforms.uWindows.value = this.quality === "lite" ? 0 : 1;
    this.waterUniforms.uAnimate.value = this.quality === "cinematic" && !this.reduced ? 1 : 0;
    // Burning tower: flicker and drifting smoke only with motion on; no smoke plume in lite.
    this.glowUniforms.uPulse.value = this.quality === "lite" || this.reduced ? 0 : 1;
    this.puffUniforms.uAnim.value = this.reduced ? 0 : 1;
    if (this.fire) this.fire.puffs.visible = this.fire.burning && this.quality !== "lite";
  }

  setQuality(q: Quality, reducedMotion: boolean) {
    this.quality = q;
    this.reduced = reducedMotion;
    this.applyQualityToRenderer();
    this.map?.triggerRepaint();
  }

  setCity(city: BuiltCity) {
    if (this.buildings) {
      this.scene.remove(this.buildings);
      this.buildings.geometry.dispose();
    }
    const { mat, uniforms } = buildingMaterial(this.quality);
    this.buildingUniforms = uniforms;
    const mesh = new THREE.Mesh(city.geometry, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    // Shadows use the revealed geometry too
    const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMat.onBeforeCompile = (shader) => {
      shader.uniforms.uReveal = uniforms.uReveal;
      shader.vertexShader = "uniform float uReveal;\n" + shader.vertexShader.replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
         float rise = clamp(uReveal * 1.35 - length(position.xy) / 5200.0, 0.0, 1.0);
         transformed.z *= rise * rise * (3.0 - 2.0 * rise);`,
      );
    };
    mesh.customDepthMaterial = depthMat;
    this.buildings = mesh;
    this.scene.add(mesh);
    this.map?.triggerRepaint();
  }

  setWater(geometry: THREE.BufferGeometry) {
    if (this.water) {
      this.scene.remove(this.water);
      this.water.geometry.dispose();
    }
    const mat = new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: this.waterUniforms, transparent: true, depthWrite: false });
    this.water = new THREE.Mesh(geometry, mat);
    this.water.renderOrder = 0;
    this.water.frustumCulled = false;
    this.scene.add(this.water);
  }

  setHazardZone(zone: Polygon | null) {
    if (this.hazard) {
      this.scene.remove(this.hazard);
      this.hazard.geometry.dispose();
      this.hazard = null;
    }
    if (!zone) return;
    const ring = zone.coordinates[0].map((c) => toLocal(c));
    const H = this.hazardStyle === "smoke" ? 85 : 55;
    const pos: number[] = [];
    const v: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      const b = pos.length / 3;
      pos.push(x1, y1, 0.5, x2, y2, 0.5, x2, y2, H, x1, y1, H);
      v.push(0, 0, 1, 1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aV", new THREE.Float32BufferAttribute(v, 1));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: HAZARD_VERT,
      fragmentShader: HAZARD_FRAG,
      uniforms: this.hazardUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.hazard = new THREE.Mesh(g, mat);
    this.hazard.renderOrder = 5;
    this.hazard.frustumCulled = false;
    this.scene.add(this.hazard);
  }

  /** Flood: red volume, buildings in the zone tinted. Smoke (fire drill): taller grey-brown haze, no tint. Set before setHazardZone. */
  setHazardStyle(style: "flood" | "smoke") {
    if (style === this.hazardStyle) return;
    this.hazardStyle = style;
    if (style === "smoke") this.hazardUniforms.uColor.value.setRGB(0.5, 0.45, 0.4);
    else this.hazardUniforms.uColor.value.set("#f2634a");
    this.hazardUniforms.uSmoke.value = style === "smoke" ? 1 : 0;
  }

  /** 0 = hidden, 1 = verified & active. Animates progressively. */
  setHazardActive(active: boolean, preview = false) {
    const flood = this.hazardStyle === "flood";
    const target = active ? 1 : preview ? 0.35 : 0;
    this.tween(this.hazardUniforms.uOpacity, target, active ? 1400 : 600);
    this.tween(this.hazardUniforms.uRise, active ? 1 : preview ? 0.25 : 0, active ? 2200 : 600);
    this.hazardUniforms.uScan.value = active && flood ? 1 : 0;
    // The building tint marks the flood zone; it would mislabel buildings in a fire drill.
    if (this.buildingUniforms) this.tween(this.buildingUniforms.uZoneTint, active && flood ? 1 : 0, 1800);
  }

  /**
   * Fire drill: the burning tower drawn floor by floor over its OSM footprint (null removes it).
   * Geometry is rebuilt only when the building changes; floor colours ease to their new values.
   */
  setFireTower(spec: FireTowerSpec | null) {
    if (!spec) return this.clearFire();
    if (this.fire?.key !== spec.key) this.buildFire(spec);
    const f = this.fire!;
    f.targets.forEach((t, i) => t.set(spec.colors[i] ?? ROOF_COLOR));
    f.glow.position.z = (spec.fireFloor - 1.2) * f.fh;
    this.puffUniforms.uBase.value = (spec.fireFloor - 0.5) * f.fh;
    const to = ((spec.windFromDeg + 180) * Math.PI) / 180;
    this.puffUniforms.uWind.value.set(Math.sin(to), Math.cos(to));
    f.burning = spec.burning;
    f.glow.visible = spec.burning;
    f.puffs.visible = spec.burning && this.quality !== "lite";
    f.settling = true;
    this.map?.triggerRepaint();
  }

  private buildFire(spec: FireTowerSpec) {
    this.clearFire();
    const pts = spec.ring.map((c) => toLocal(c));
    const [first, last] = [pts[0], pts[pts.length - 1]];
    if (pts.length > 3 && first[0] === last[0] && first[1] === last[1]) pts.pop();
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    // Footprint grown outward by `pad` metres, relative to its centre.
    const grow = (pad: number) =>
      pts.map(([x, y]) => {
        const dx = x - cx;
        const dy = y - cy;
        const k = 1 + pad / (Math.hypot(dx, dy) || 1);
        return new THREE.Vector2(dx * k, dy * k);
      });
    const n = spec.floors;
    const fh = spec.heightM / n;

    // One slab per floor (a thin gap reads as floor lines), a little proud of the OSM tower so it
    // covers it, plus a roof cap just above the real roof.
    const slabGeom = new THREE.ExtrudeGeometry(new THREE.Shape(grow(1.4)), { depth: fh * 0.8, bevelEnabled: false });
    const slabs = new THREE.InstancedMesh(slabGeom, slabMaterial(), n + 1);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) slabs.setMatrixAt(i, m.makeTranslation(0, 0, i * fh + fh * 0.1));
    slabs.setMatrixAt(n, m.makeScale(1, 1, (fh * 0.1 + 1.2) / (fh * 0.8)).setPosition(0, 0, n * fh - fh * 0.1));
    const colors = Array.from({ length: n }, (_, i) => new THREE.Color(spec.colors[i] ?? ROOF_COLOR));
    colors.forEach((c, i) => slabs.setColorAt(i, c));
    slabs.setColorAt(n, new THREE.Color(ROOF_COLOR));
    slabs.instanceMatrix.needsUpdate = true;
    slabs.castShadow = true;
    slabs.receiveShadow = true;
    slabs.frustumCulled = false;

    // Glow shell around the fire floor, fading up over the floors above.
    const ring = grow(2.4);
    const pos: number[] = [];
    const v: number[] = [];
    const idx: number[] = [];
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const base = pos.length / 3;
      pos.push(a.x, a.y, 0, b.x, b.y, 0, b.x, b.y, 1, a.x, a.y, 1);
      v.push(0, 0, 1, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const glowGeom = new THREE.BufferGeometry();
    glowGeom.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    glowGeom.setAttribute("aV", new THREE.Float32BufferAttribute(v, 1));
    glowGeom.setIndex(idx);
    const glow = new THREE.Mesh(
      glowGeom,
      new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: this.glowUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    glow.scale.z = fh * 3;
    glow.renderOrder = 8;
    glow.frustumCulled = false;

    // Smoke plume from the fire floor, carried downwind (all motion on the GPU).
    const PUFFS = 20;
    const ico = new THREE.IcosahedronGeometry(1, 2);
    const puffGeom = new THREE.InstancedBufferGeometry();
    puffGeom.setAttribute("position", ico.getAttribute("position"));
    puffGeom.setAttribute("normal", ico.getAttribute("normal"));
    puffGeom.setAttribute("aSeed", new THREE.InstancedBufferAttribute(Float32Array.from({ length: PUFFS }, (_, i) => (i + 0.4 * ((i * 7) % 3)) / PUFFS), 1));
    puffGeom.instanceCount = PUFFS;
    const puffs = new THREE.Mesh(
      puffGeom,
      new THREE.ShaderMaterial({ vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, uniforms: this.puffUniforms, transparent: true, depthWrite: false }),
    );
    puffs.renderOrder = 9;
    puffs.frustumCulled = false;

    const group = new THREE.Group();
    group.position.set(cx, cy, 0);
    group.add(slabs, glow, puffs);
    this.scene.add(group);
    this.fire = { key: spec.key, group, slabs, glow, puffs, fh, colors, targets: colors.map((c) => c.clone()), burning: spec.burning, settling: false };
  }

  private clearFire() {
    const f = this.fire;
    if (!f) return;
    this.scene.remove(f.group);
    f.slabs.dispose();
    for (const mesh of [f.slabs, f.glow, f.puffs]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.fire = null;
    this.map?.triggerRepaint();
  }

  /**
   * Screen offset (CSS px) from a ground point to the same point `alt` metres up, using the last
   * rendered frame — pins HTML markers to a floor of the tower. Null when the city is not drawn.
   */
  liftOffset(lngLat: [number, number], alt: number): [number, number] | null {
    if (!this.map || this.hidden) return null;
    const [e, n] = toLocal(lngLat);
    const mvp = this.camera.projectionMatrix;
    const a = new THREE.Vector4(e, n, 0, 1).applyMatrix4(mvp);
    const b = new THREE.Vector4(e, n, alt, 1).applyMatrix4(mvp);
    if (a.w <= 0 || b.w <= 0) return null;
    const canvas = this.map.getCanvas();
    return [(b.x / b.w - a.x / a.w) * 0.5 * canvas.clientWidth, -(b.y / b.w - a.y / a.w) * 0.5 * canvas.clientHeight];
  }

  reveal(durationMs: number) {
    if (!this.buildingUniforms) return;
    this.buildingUniforms.uReveal.value = 0;
    this.tween(this.buildingUniforms.uReveal, 1, durationMs);
  }

  revealInstant() {
    if (this.buildingUniforms) this.buildingUniforms.uReveal.value = 1;
    this.map?.triggerRepaint();
  }

  setColumns(data: ClusterDatum[], visible: boolean) {
    const max = Math.max(256, data.length);
    if (!this.columns || this.columns.count < data.length) {
      if (this.columns) {
        this.scene.remove(this.columns);
        this.columns.dispose();
      }
      const geom = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false);
      geom.rotateX(Math.PI / 2);
      geom.translate(0, 0, 0.5);
      const mat = new THREE.ShaderMaterial({ vertexShader: COLUMN_VERT, fragmentShader: COLUMN_FRAG, uniforms: { uCamPos: this.waterUniforms.uCamPos }, transparent: true, depthWrite: false });
      this.columns = new THREE.InstancedMesh(geom, mat, max);
      this.columns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.columns.castShadow = false;
      this.columns.frustumCulled = false;
      this.columns.renderOrder = 6;
      this.columns.count = 0;
      this.scene.add(this.columns);
      this.columnState.clear();
    }
    const seen = new Set<string>();
    data.forEach((d, i) => {
      seen.add(d.id);
      const r = 5 + Math.min(8, Math.sqrt(d.count) * 1.9);
      const target = visible ? 26 + d.count * 13 + d.emphasis * 40 : 0;
      const prev = this.columnState.get(d.id);
      const color = new THREE.Color(d.color);
      if (prev) {
        prev.idx = i;
        prev.target = target;
        prev.r = r;
        prev.targetColor = color;
      } else {
        this.columnState.set(d.id, { idx: i, h: 0, target, r, color: color.clone(), targetColor: color });
      }
      const s = this.columnState.get(d.id)!;
      (s as unknown as { e: number }).e = d.e;
      (s as unknown as { n: number }).n = d.n;
    });
    for (const k of [...this.columnState.keys()]) if (!seen.has(k)) this.columnState.delete(k);
    this.columns!.count = data.length;
    this.animateUntil = performance.now() + 2500;
    this.map?.triggerRepaint();
  }

  ripple(e: number, n: number, color: THREE.ColorRepresentation) {
    if (this.reduced || this.quality === "lite") return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.rippleGeom, mat);
    mesh.position.set(e, n, 1.2);
    mesh.renderOrder = 7;
    this.scene.add(mesh);
    this.ripples.push({ mesh, start: performance.now() });
    this.map?.triggerRepaint();
  }

  private tween(obj: { value: number }, to: number, dur: number) {
    this.tweens = this.tweens.filter((t) => t.obj !== obj);
    if (this.reduced) {
      obj.value = to;
      this.map?.triggerRepaint();
      return;
    }
    this.tweens.push({ obj, to, from: obj.value, start: performance.now(), dur });
    this.map?.triggerRepaint();
  }

  private updateCameraUniforms() {
    // MapLibre v5 exposes the camera position on its transform (removed in v6 — pinned to v5).
    const tr = (this.map as unknown as { transform?: { getCameraLngLat(): { lng: number; lat: number }; getCameraAltitude(): number } }).transform;
    if (!tr?.getCameraLngLat) return;
    const ll = tr.getCameraLngLat();
    const [ce0, cn0] = toLocal([ll.lng, ll.lat]);
    const local = new THREE.Vector3(ce0, cn0, tr.getCameraAltitude());
    this.waterUniforms.uCamPos.value.copy(local);
    if (this.buildingUniforms) this.buildingUniforms.uCamPos.value.copy(local);
    // Keep the sun's shadow frustum centred on what the camera is looking at.
    const c = this.map.getCenter();
    const [ce, cn] = toLocal([c.lng, c.lat]);
    const zoom = this.map.getZoom();
    const extent = Math.min(4200, Math.max(700, 900 * Math.pow(2, 16 - zoom)));
    const snap = (v: number) => Math.round(v / 20) * 20;
    this.sun.target.position.set(snap(ce), snap(cn), 0);
    this.sun.position.set(snap(ce) + SUN_DIR.x * 3000, snap(cn) + SUN_DIR.y * 3000, SUN_DIR.z * 3000);
    const sc = this.sun.shadow.camera;
    if (sc.right !== extent) {
      sc.left = -extent;
      sc.right = extent;
      sc.top = extent;
      sc.bottom = -extent;
      sc.near = 10;
      sc.far = 9000;
      sc.updateProjectionMatrix();
    }
  }

  private step(now: number) {
    let active = false;
    for (const t of this.tweens) {
      const k = Math.min(1, (now - t.start) / t.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      t.obj.value = t.from + (t.to - t.from) * e;
      if (k < 1) active = true;
    }
    this.tweens = this.tweens.filter((t) => now - t.start < t.dur);
    if (this.columns) {
      const m = new THREE.Matrix4();
      let moving = false;
      for (const s of this.columnState.values()) {
        const st = s as typeof s & { e: number; n: number };
        const dh = s.target - s.h;
        s.h = this.reduced ? s.target : s.h + dh * 0.12;
        if (Math.abs(dh) > 0.3) moving = true;
        s.color.lerp(s.targetColor, this.reduced ? 1 : 0.15);
        m.makeScale(s.r, s.r, Math.max(0.01, s.h));
        m.setPosition(st.e, st.n, 0);
        this.columns.setMatrixAt(s.idx, m);
        this.columns.setColorAt(s.idx, s.color);
      }
      this.columns.instanceMatrix.needsUpdate = true;
      if (this.columns.instanceColor) this.columns.instanceColor.needsUpdate = true;
      if (moving) active = true;
    }
    const f = this.fire;
    if (f?.settling) {
      let moving = false;
      f.colors.forEach((c, i) => {
        const t = f.targets[i];
        c.lerp(t, this.reduced ? 1 : 0.14);
        if (Math.abs(c.r - t.r) + Math.abs(c.g - t.g) + Math.abs(c.b - t.b) > 0.004) moving = true;
        else c.copy(t);
        f.slabs.setColorAt(i, c);
      });
      if (f.slabs.instanceColor) f.slabs.instanceColor.needsUpdate = true;
      f.settling = moving;
      if (moving) active = true;
    }
    this.ripples = this.ripples.filter((r) => {
      const k = (now - r.start) / 1600;
      if (k >= 1) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      const s = 12 + k * 110;
      r.mesh.scale.set(s, s, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
      active = true;
      return true;
    });
    return active || now < this.animateUntil;
  }

  /** Set while another scene owns the map (the real-world replay over 3D terrain). */
  hidden = false;

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    // The city model is drawn in the mercator (street-scale) part of the flight only.
    if (this.hidden || this.map.getProjection()?.type === "globe" || this.map.getZoom() < 10.5) return;
    const now = performance.now();
    const t = (now - this.startTime) / 1000;
    this.waterUniforms.uTime.value = t;
    this.hazardUniforms.uTime.value = t;
    this.glowUniforms.uTime.value = t;
    this.puffUniforms.uTime.value = t;
    if (this.buildingUniforms) this.buildingUniforms.uTime.value = t;
    this.updateCameraUniforms();
    const animating = this.step(now);

    const { x, y, z, s } = this.origin;
    const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    const l = new THREE.Matrix4().makeTranslation(x, y, z).scale(new THREE.Vector3(s, -s, s));
    this.camera.projectionMatrix = m.multiply(l);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);

    const burning = !!this.fire?.burning && this.quality !== "lite";
    const continuous = animating || burning || this.hazardUniforms.uOpacity.value > 0.5 || (this.waterUniforms.uAnimate.value > 0 && this.map.getZoom() > 12.5);
    if (continuous && !this.reduced) this.map.triggerRepaint();
    else if (animating) this.map.triggerRepaint();
    this.onFrame?.();
  }

  onRemove() {
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    });
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
  }
}

export type { maplibregl };
