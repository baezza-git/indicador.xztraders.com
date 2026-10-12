/* ==========================================================================
   Fondo animado del hero: haces de luz en 3D.
   Versión sin React del componente "Beams" de React Bits (reactbits.dev),
   con los mismos parámetros que usa trenchers.ai.
   ========================================================================== */

// three.js r180 alojado en la propia web (assets/vendor/three), sin CDN externo.
import * as THREE from '../vendor/three/three.module.min.js';

const CONFIG = {
  beamWidth: 3,
  beamHeight: 30,
  beamNumber: 20,
  lightColor: '#ffffff',
  beamColor: '#000000',
  speed: 3,
  noiseIntensity: 1.75,
  scale: 0.2,
  rotation: 30,
};

const NOISE_GLSL = /* glsl */ `
float random (in vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
float noise (in vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float cnoise(vec3 P) {
  vec3 Pi0 = floor(P);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;
  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);
  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;
  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);
  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
  return 2.2 * n_xyz;
}
`;

// Material físico de three.js con código propio inyectado en sus shaders.
function extendMaterial(BaseMaterial, cfg) {
  const physical = THREE.ShaderLib.physical;
  const uniforms = THREE.UniformsUtils.clone(physical.uniforms);
  const defaults = new BaseMaterial(cfg.material || {});

  if (defaults.color) uniforms.diffuse.value = defaults.color;
  if ('roughness' in defaults) uniforms.roughness.value = defaults.roughness;
  if ('metalness' in defaults) uniforms.metalness.value = defaults.metalness;
  if ('envMap' in defaults) uniforms.envMap.value = defaults.envMap;
  if ('envMapIntensity' in defaults) uniforms.envMapIntensity.value = defaults.envMapIntensity;

  Object.entries(cfg.uniforms ?? {}).forEach(([key, u]) => {
    uniforms[key] = u !== null && typeof u === 'object' && 'value' in u ? u : { value: u };
  });

  let vertexShader = `${cfg.header}\n${cfg.vertexHeader ?? ''}\n${physical.vertexShader}`;
  let fragmentShader = `${cfg.header}\n${cfg.fragmentHeader ?? ''}\n${physical.fragmentShader}`;
  for (const [inc, code] of Object.entries(cfg.vertex ?? {})) vertexShader = vertexShader.replace(inc, `${inc}\n${code}`);
  for (const [inc, code] of Object.entries(cfg.fragment ?? {})) fragmentShader = fragmentShader.replace(inc, `${inc}\n${code}`);

  return new THREE.ShaderMaterial({
    defines: { ...(physical.defines ?? {}) },
    uniforms,
    vertexShader,
    fragmentShader,
    lights: true,
    fog: !!cfg.material?.fog,
  });
}

// Tiras verticales pegadas, cada una con un desfase aleatorio de ruido.
function createStackedPlanes(count, width, height, spacing, segments) {
  const geometry = new THREE.BufferGeometry();
  const numVertices = count * (segments + 1) * 2;
  const positions = new Float32Array(numVertices * 3);
  const uvs = new Float32Array(numVertices * 2);
  const indices = new Uint32Array(count * segments * 2 * 3);
  const totalWidth = count * width + (count - 1) * spacing;
  let v = 0;
  let ii = 0;
  let uv = 0;

  for (let i = 0; i < count; i++) {
    const x = -totalWidth / 2 + i * (width + spacing);
    const uvX = Math.random() * 300;
    const uvY = Math.random() * 300;
    for (let j = 0; j <= segments; j++) {
      const y = height * (j / segments - 0.5);
      positions.set([x, y, 0, x + width, y, 0], v * 3);
      const t = j / segments;
      uvs.set([uvX, t + uvY, uvX + 1, t + uvY], uv);
      if (j < segments) {
        indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], ii);
        ii += 6;
      }
      v += 2;
      uv += 4;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function init(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  camera.position.set(0, 0, 20);

  const material = extendMaterial(THREE.MeshStandardMaterial, {
    header: `
  varying vec3 vEye;
  varying float vNoise;
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float time;
  uniform float uSpeed;
  uniform float uNoiseIntensity;
  uniform float uScale;
  ${NOISE_GLSL}`,
    vertexHeader: `
  float getPos(vec3 pos) {
    vec3 noisePos = vec3(pos.x * 0., pos.y - uv.y, pos.z + time * uSpeed * 3.) * uScale;
    return cnoise(noisePos);
  }
  vec3 getCurrentPos(vec3 pos) {
    vec3 newpos = pos;
    newpos.z += getPos(pos);
    return newpos;
  }
  vec3 getNormal(vec3 pos) {
    vec3 curpos = getCurrentPos(pos);
    vec3 nextposX = getCurrentPos(pos + vec3(0.01, 0.0, 0.0));
    vec3 nextposZ = getCurrentPos(pos + vec3(0.0, -0.01, 0.0));
    vec3 tangentX = normalize(nextposX - curpos);
    vec3 tangentZ = normalize(nextposZ - curpos);
    return normalize(cross(tangentZ, tangentX));
  }`,
    vertex: {
      '#include <begin_vertex>': 'transformed.z += getPos(transformed.xyz);',
      '#include <beginnormal_vertex>': 'objectNormal = getNormal(position.xyz);',
    },
    fragment: {
      '#include <dithering_fragment>': `
    float randomNoise = noise(gl_FragCoord.xy);
    gl_FragColor.rgb -= randomNoise / 15. * uNoiseIntensity;`,
    },
    material: { fog: true },
    uniforms: {
      diffuse: new THREE.Color(CONFIG.beamColor),
      time: { value: 0 },
      roughness: 0.3,
      metalness: 0.3,
      uSpeed: { value: CONFIG.speed },
      envMapIntensity: 10,
      uNoiseIntensity: CONFIG.noiseIntensity,
      uScale: CONFIG.scale,
    },
  });

  const group = new THREE.Group();
  group.rotation.z = THREE.MathUtils.degToRad(CONFIG.rotation);
  scene.add(group);

  const geometry = createStackedPlanes(CONFIG.beamNumber, CONFIG.beamWidth, CONFIG.beamHeight, 0, 100);
  group.add(new THREE.Mesh(geometry, material));

  const light = new THREE.DirectionalLight(CONFIG.lightColor, 1);
  light.position.set(0, 3, 10);
  group.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(canvas.parentElement);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  let visible = true;
  let running = false;

  const frame = () => {
    if (!visible) {
      running = false;
      return;
    }
    material.uniforms.time.value += 0.1 * Math.min(clock.getDelta(), 0.1);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };

  const start = () => {
    if (running || reduceMotion) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  };

  // Primer fotograma y aviso para ocultar el fondo CSS de respaldo.
  renderer.render(scene, camera);
  document.documentElement.classList.add('has-beams');

  // Solo animar mientras el hero está en pantalla.
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(canvas.parentElement);
  start();
}

const canvas = document.getElementById('beams');
if (canvas) {
  try {
    init(canvas);
  } catch (err) {
    // Sin WebGL: se queda el fondo CSS.
    console.warn('Beams: WebGL no disponible', err);
  }
}
