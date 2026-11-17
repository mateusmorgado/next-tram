/**
 * The small 3D neighbourhood in the intro ("Your walk, your pace" and "In a hurry?").
 * Loaded only when the intro opens, together with three.js, so the normal app stays light.
 *
 * City coordinates: x grows east, z grows south. The tram runs north-south on the avenue.
 * Home sits in a courtyard. The map app's route (red line) leaves by the front door and goes
 * around the block; your own way (blue dots) takes the back exit straight to the avenue.
 */
import * as THREE from './vendor/three.module.min.js';

const HOME = [-1, 5];
const STOP_Z = -15;
const RAIL_X = 10;
const WALK_X = 7.4; // the pavement along the avenue
const STREET = [HOME, [-1, 9.7], [-1, 12.75], [WALK_X, 12.75], [WALK_X, STOP_Z]];
const SHORT = [HOME, [2.6, 0.95], [WALK_X, 0.75], [WALK_X, STOP_Z]];
export const WALK_MIN = { street: 5, short: 3 };

const PALETTES = {
  light: {
    ground: 0xe2ded5, plate: 0xefece6, roof: 0xfdfcf9, wall: 0xd6d0c5, edge: 0x9f988a, edgeAlpha: 0.35,
    park: 0xcfe2cb, tree: 0x79b088, trunk: 0x9c8f7c, platform: 0xbdb7ab, rail: 0x12805c, railGlow: 0.14,
    walk: 0x2563eb, maps: 0xd93a3a, home: 0x2563eb, tram: 0xd7262f, tramRoof: 0xf4f2ee, glass: 0x23262d,
    win: 'rgba(120, 124, 135, 0.34)', winLit: 'rgba(255, 255, 255, 0.55)', facade: '#d6d0c5',
    ambient: 1.5, hemi: 1.0, sun: 2.3, exposure: 1.0,
  },
  dark: {
    ground: 0x14161b, plate: 0x1b1e25, roof: 0x2f3442, wall: 0x232733, edge: 0x76829a, edgeAlpha: 0.28,
    park: 0x1a3029, tree: 0x2f6b55, trunk: 0x3a3f4b, platform: 0x3a3f4b, rail: 0x3ecf8e, railGlow: 0.2,
    walk: 0x7aa7ff, maps: 0xff6b5f, home: 0x7aa7ff, tram: 0xe2434b, tramRoof: 0xd9dbe2, glass: 0x0c0d10,
    win: 'rgba(10, 14, 23, 0.55)', winLit: 'rgba(255, 221, 150, 0.6)', facade: '#232733',
    ambient: 1.3, hemi: 0.9, sun: 2.0, exposure: 1.1,
  },
};

function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A polyline you can walk along: point and heading at 0…1 of its length. */
function makePath(points) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [x0, z0] = points[i - 1];
    const [x1, z1] = points[i];
    const len = Math.hypot(x1 - x0, z1 - z0);
    segs.push({ x0, z0, x1, z1, len, start: total });
    total += len;
  }
  const at = (u) => {
    const d = Math.min(Math.max(u, 0), 1) * total;
    const s = segs.find((g) => d <= g.start + g.len) || segs[segs.length - 1];
    const k = s.len ? (d - s.start) / s.len : 0;
    return { x: s.x0 + (s.x1 - s.x0) * k, z: s.z0 + (s.z1 - s.z0) * k };
  };
  return { total, at };
}

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const span = (t, from, to) => Math.min(Math.max((t - from) / (to - from), 0), 1);

export function isDark() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(bg);
  if (!m) return matchMedia('(prefers-color-scheme: dark)').matches;
  return (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128;
}

/**
 * @param {HTMLElement} host  the stage; the canvas and the floating labels go inside it
 * @param {{ reduced?: boolean, onUpdate?: (s: object) => void }} opts
 */
export function createScene(host, opts = {}) {
  const P = PALETTES[isDark() ? 'dark' : 'light'];
  const reduced = Boolean(opts.reduced);
  const disposables = [];
  const keep = (o) => { disposables.push(o); return o; };

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P.exposure;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'in-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(P.ground, 70, 135);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 400);

  scene.add(new THREE.AmbientLight(0xffffff, P.ambient));
  const hemi = new THREE.HemisphereLight(0xdfe8ff, P.ground, P.hemi);
  hemi.position.set(0, 80, 0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, P.sun);
  sun.position.set(-34, 60, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 160;
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);

  const city = new THREE.Group();
  city.rotation.y = 0.32;
  scene.add(city);

  // ── Ground, block plates, park ──
  const mat = (color, extra = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...extra }));
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(320, 320)), mat(P.ground, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const plateMat = mat(P.plate, { roughness: 1 });
  function plate(x0, z0, x1, z1, material = plateMat, y = 0.03) {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(x1 - x0, y * 2, z1 - z0)), material);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    city.add(m);
    return m;
  }

  // ── Buildings: Berlin/Leipzig style perimeter blocks with a courtyard ──
  function facadeTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = P.facade;
    ctx.fillRect(0, 0, 256, 64);
    const rnd = mulberry(7);
    for (let y = 10; y < 56; y += 17) {
      for (let x = 8; x < 250; x += 16) {
        ctx.fillStyle = rnd() > 0.72 ? P.winLit : P.win;
        ctx.fillRect(x, y, 7, 10);
      }
    }
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const wallMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, map: facadeTexture(), roughness: 0.8, metalness: 0.05 }));
  const roofMat = mat(P.roof, { roughness: 0.7 });
  const edgeMat = keep(new THREE.LineBasicMaterial({ color: P.edge, transparent: true, opacity: P.edgeAlpha }));
  const wingMats = [wallMat, wallMat, roofMat, wallMat, wallMat, wallMat];

  function wing(x0, z0, x1, z1, h) {
    if (x1 - x0 < 0.3 || z1 - z0 < 0.3) return;
    const geo = keep(new THREE.BoxGeometry(x1 - x0, h, z1 - z0));
    const mesh = new THREE.Mesh(geo, wingMats);
    mesh.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(keep(new THREE.EdgesGeometry(geo)), edgeMat));
    city.add(mesh);
  }

  const T = 2.6; // how deep a wing is
  const rnd = mulberry(11);
  function block(x0, z0, x1, z1, h) {
    plate(x0 - 0.7, z0 - 0.7, x1 + 0.7, z1 + 0.7);
    const v = () => h * (0.9 + rnd() * 0.22);
    const gap = Math.floor(rnd() * 5); // one wing may have an opening
    const midX = (x0 + x1) / 2;
    const midZ = (z0 + z1) / 2;
    if (gap === 0) { wing(x0, z0, midX - 1.2, z0 + T, v()); wing(midX + 1.2, z0, x1, z0 + T, v()); } else wing(x0, z0, x1, z0 + T, v());
    if (gap === 1) { wing(x0, z1 - T, midX - 1.2, z1, v()); wing(midX + 1.2, z1 - T, x1, z1, v()); } else wing(x0, z1 - T, x1, z1, v());
    if (gap === 2) { wing(x0, z0 + T, x0 + T, midZ - 1.2, v()); wing(x0, midZ + 1.2, x0 + T, z1 - T, v()); } else wing(x0, z0 + T, x0 + T, z1 - T, v());
    if (gap === 3) { wing(x1 - T, z0 + T, x1, midZ - 1.2, v()); wing(x1 - T, midZ + 1.2, x1, z1 - T, v()); } else wing(x1 - T, z0 + T, x1, z1 - T, v());
    if (rnd() > 0.5 && z1 - z0 > 12) wing(x0 + T, midZ - 1, midX - 0.5, midZ + 1, h * 0.75); // a rear building
  }

  // Columns: A (west), B (middle), the avenue with the tram, C (east). Three rows, plus a ring for depth.
  const COLS = [[-37, -25.5], [-22.5, -11.5], [-8, 6], [14, 26], [29, 41]];
  const ROWS = [[-38, -24.5], [-21.5, -8.5], [-3, 11], [14.5, 26.5], [29.5, 42]];
  COLS.forEach(([x0, x1], ci) => {
    ROWS.forEach(([z0, z1], ri) => {
      if (ci === 2 && ri === 2) return; // home block, built by hand below
      if (ci === 3 && ri === 2) return; // the park
      block(x0, z0, x1, z1, 4.1 + rnd() * 0.9);
    });
  });

  // Home block: front gate in the south wing, side passage in the east wing next to the north wing.
  plate(-8.7, -3.7, 6.7, 11.7);
  wing(-8, -3, 6, -0.4, 4.6); // north
  wing(-8, 8.4, -2.3, 11, 4.4); // south, west of the gate
  wing(0.3, 8.4, 6, 11, 4.5); // south, east of the gate
  wing(-8, -0.4, -5.4, 8.4, 4.7); // west
  wing(3.4, 2.0, 6, 8.4, 4.3); // east, leaving the passage open

  // Park east of the avenue.
  plate(14, -3, 26, 11, mat(P.park, { roughness: 1 }), 0.05);
  const crownGeo = keep(new THREE.IcosahedronGeometry(1.15, 0));
  const trunkGeo = keep(new THREE.CylinderGeometry(0.14, 0.18, 1.2, 6));
  const crownMat = mat(P.tree, { flatShading: true });
  const trunkMat = mat(P.trunk);
  function tree(x, z, s = 1) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 0.6, z);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(x, 1.2 + s, z);
    crown.scale.setScalar(s);
    crown.rotation.y = x * 1.7 + z;
    crown.castShadow = trunk.castShadow = true;
    city.add(trunk, crown);
  }
  [[16.5, -0.5, 1.1], [20, 1.5, 0.9], [23.5, -1, 1], [17.5, 4.5, 0.95], [22, 6, 1.15], [19.5, 8.8, 0.85], [24, 9.2, 1], [16, 8.5, 1]].forEach((t) => tree(...t));
  [[-2.6, 2.2, 0.8], [0.9, 6.9, 0.7]].forEach((t) => tree(...t)); // two in the home courtyard

  // ── Tram line on the avenue ──
  const railMat = keep(new THREE.MeshStandardMaterial({ color: P.rail, emissive: P.rail, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.3 }));
  const railGeo = keep(new THREE.BoxGeometry(0.2, 0.14, 170));
  [-0.42, 0.42].forEach((dx) => {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(RAIL_X + dx, 0.09, 0);
    city.add(rail);
  });
  const glow = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(2.4, 170)),
    keep(new THREE.MeshBasicMaterial({ color: P.rail, transparent: true, opacity: P.railGlow, depthWrite: false })),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(RAIL_X, 0.03, 0);
  city.add(glow);

  // The stop: platform, a node on the line and the green-on-yellow "H" sign.
  const platform = new THREE.Mesh(keep(new THREE.BoxGeometry(1.5, 0.22, 6)), mat(P.platform));
  platform.position.set(WALK_X + 0.55, 0.11, STOP_Z);
  platform.receiveShadow = true;
  city.add(platform);
  const node = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 24)), keep(new THREE.MeshBasicMaterial({ color: 0x0f172a })));
  node.position.set(RAIL_X, 0.2, STOP_Z);
  node.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 24)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff }))));
  city.add(node);
  const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.07, 0.07, 3, 8)), mat(P.trunk));
  pole.position.set(WALK_X + 0.2, 1.5, STOP_Z - 2.2);
  city.add(pole);
  function signTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffd500';
    ctx.beginPath(); ctx.arc(48, 48, 44, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a7a3c'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(48, 48, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#0a7a3c';
    ctx.font = '800 56px system-ui, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('H', 48, 51);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const sign = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: signTexture(), toneMapped: false })));
  sign.scale.set(1.9, 1.9, 1);
  sign.position.set(WALK_X + 0.2, 3.4, STOP_Z - 2.2);
  city.add(sign);

  // ── Tram ──
  const tram = new THREE.Group();
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(1.7, 1.5, 7)), mat(P.tram, { roughness: 0.5 }));
  body.position.y = 1.05;
  body.castShadow = true;
  const windows = new THREE.Mesh(keep(new THREE.BoxGeometry(1.74, 0.5, 6.2)), mat(P.glass, { roughness: 0.2, metalness: 0.4 }));
  windows.position.y = 1.35;
  const top = new THREE.Mesh(keep(new THREE.BoxGeometry(1.5, 0.14, 6.6)), mat(P.tramRoof));
  top.position.y = 1.87;
  const lamp = new THREE.Mesh(keep(new THREE.BoxGeometry(1.1, 0.16, 0.06)), keep(new THREE.MeshBasicMaterial({ color: 0xfff3c4 })));
  lamp.position.set(0, 0.62, -3.52);
  tram.add(body, windows, top, lamp);
  tram.position.set(RAIL_X, 0, 60);
  city.add(tram);

  // ── Home marker (glass disc, breathing sphere) ──
  const home = new THREE.Group();
  home.position.set(HOME[0], 0.06, HOME[1]);
  const disc = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(1.5, 1.5, 0.1, 40)),
    keep(new THREE.MeshStandardMaterial({ color: P.home, transparent: true, opacity: 0.22, roughness: 0.2 })),
  );
  const rimGeo = keep(new THREE.RingGeometry(1.42, 1.52, 40));
  rimGeo.rotateX(-Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, keep(new THREE.MeshBasicMaterial({ color: P.home, transparent: true, opacity: 0.6, side: THREE.DoubleSide })));
  rim.position.y = 0.07;
  const core = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.55, 28, 28)),
    keep(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, emissive: P.home, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.7 })),
  );
  core.position.y = 0.75;
  core.castShadow = true;
  home.add(disc, rim, core);
  city.add(home);

  // ── Walker: a dot with a halo, and the dotted routes it leaves behind ──
  const walker = new THREE.Group();
  const dot = new THREE.Mesh(keep(new THREE.SphereGeometry(0.5, 24, 24)), keep(new THREE.MeshStandardMaterial({ color: P.walk, emissive: P.walk, emissiveIntensity: 0.35, roughness: 0.35 })));
  dot.position.y = 0.62;
  dot.castShadow = true;
  const haloGeo = keep(new THREE.CircleGeometry(1.05, 32));
  haloGeo.rotateX(-Math.PI / 2);
  const halo = new THREE.Mesh(haloGeo, keep(new THREE.MeshBasicMaterial({ color: P.walk, transparent: true, opacity: 0.22, depthWrite: false })));
  halo.position.y = 0.1;
  walker.add(dot, halo);
  city.add(walker);

  let walkerColor = P.walk;
  function paintWalker(color) {
    if (color === walkerColor) return;
    walkerColor = color;
    dot.material.color.setHex(color);
    dot.material.emissive.setHex(color);
    halo.material.color.setHex(color);
  }

  const dotGeo = keep(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 12));
  const lineGeo = keep(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12));
  function trail(points, color, opacity, gap = 0.95, geo = dotGeo) {
    const path = makePath(points);
    const n = Math.floor(path.total / gap);
    const material = keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
    const mesh = new THREE.InstancedMesh(geo, material, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const p = path.at((i + 0.5) / n);
      m4.makeTranslation(p.x, 0.12, p.z);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = 0;
    mesh.frustumCulled = false;
    city.add(mesh);
    return { path, mesh, n, material, show: (u) => { mesh.count = Math.round(Math.min(Math.max(u, 0), 1) * n); } };
  }
  const street = trail(STREET, P.maps, 0.9, 0.16, lineGeo); // close dots make a solid line
  const short = trail(SHORT, P.walk, 1);

  // ── Floating labels (HTML, pinned to points in the scene) ──
  const layer = document.createElement('div');
  layer.className = 'in-labels';
  layer.setAttribute('aria-hidden', 'true');
  function label(cls, html) {
    const el = document.createElement('span');
    el.className = `in-label ${cls}`;
    el.innerHTML = html;
    layer.appendChild(el);
    return { el, pos: new THREE.Vector3(), on: true, text: html };
  }
  const labels = {
    home: label('home', 'Home'),
    stop: label('stop', 'Stop'),
    walker: label('time', ''),
    front: label('door', 'Front door'),
    back: label('door', 'Back exit'),
    tram: label('line', '3'),
  };
  labels.home.pos.set(HOME[0], 3.1, HOME[1]);
  labels.stop.pos.set(WALK_X + 0.2, 5.3, STOP_Z - 2.2);
  labels.front.pos.set(-1.15, 1.2, 10.4);
  labels.back.pos.set(3.4, 5.4, 0.6);
  const setLabel = (l, html, on = true) => {
    if (l.text !== html) { l.text = html; l.el.innerHTML = html; }
    l.on = on;
  };

  host.append(canvas, layer);

  // ── Camera: steep bird's-eye, a slow sway, a closer look for the run ──
  const VIEWS = {
    shortcut: { target: new THREE.Vector3(2.5, 0, -1.2), radius: 20.5, polar: 0.42, azimuth: 0.1 },
    run: { target: new THREE.Vector3(5, 0, -5.5), radius: 16.5, polar: 0.74, azimuth: -0.28 },
  };
  const view = { target: VIEWS.shortcut.target.clone(), radius: VIEWS.shortcut.radius, polar: VIEWS.shortcut.polar, azimuth: VIEWS.shortcut.azimuth };
  let width = 1;
  let height = 1;
  const worldTarget = new THREE.Vector3();
  function placeCamera(sway) {
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = view.radius / Math.sin(Math.min(vFov, hFov) / 2);
    const az = view.azimuth + sway;
    worldTarget.copy(view.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, city.rotation.y);
    camera.position.set(
      worldTarget.x + dist * Math.sin(view.polar) * Math.sin(az),
      dist * Math.cos(view.polar),
      worldTarget.z + dist * Math.sin(view.polar) * Math.cos(az),
    );
    camera.lookAt(worldTarget);
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    width = w; height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!running) draw(0);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const projected = new THREE.Vector3();
  function placeLabels() {
    for (const l of Object.values(labels)) {
      projected.copy(l.pos);
      city.localToWorld(projected);
      projected.project(camera);
      const visible = l.on && projected.z < 1;
      l.el.style.opacity = visible ? '1' : '0';
      if (!visible) continue;
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  // ── The two little stories ──
  let mode = 'shortcut';
  let t = 0; // seconds into the current loop
  let last = {};
  const emit = (s) => {
    const key = JSON.stringify(s);
    if (key === last.key) return;
    last = { key };
    opts.onUpdate?.(s);
  };

  const WALK_SECS = 4.2; // the map route; the shortcut takes its share of that
  const SHORT_SECS = (WALK_SECS * WALK_MIN.short) / WALK_MIN.street;
  const minutes = (n) => `${n} min`;

  function shortcutStory(time) {
    const LOOP = 13;
    const s = reduced ? 11 : time % LOOP;
    const a = ease(span(s, 0.7, 0.7 + WALK_SECS)); // map route
    const b0 = 0.7 + WALK_SECS + 1.5;
    const b = ease(span(s, b0, b0 + SHORT_SECS)); // shortcut
    const onShort = s >= b0 - 0.4;
    const fade = reduced ? 1 : 1 - span(s, LOOP - 0.6, LOOP);

    street.show(a);
    street.material.opacity = (onShort ? 0.4 : 0.9) * fade;
    short.show(b);
    short.material.opacity = fade;
    const p = onShort ? short.path.at(b) : street.path.at(a);
    walker.position.set(p.x, 0, p.z);
    walker.visible = true;
    dot.position.y = 0.62;
    paintWalker(onShort ? P.walk : P.maps);

    const walked = onShort ? Math.max(1, Math.round(b * WALK_MIN.short)) : Math.max(1, Math.round(a * WALK_MIN.street));
    const moving = onShort ? b > 0.02 : a > 0.15; // the map label waits until it is clear of Home
    labels.walker.pos.set(p.x, 2.3, p.z);
    labels.walker.el.classList.toggle('done', onShort && b >= 1);
    labels.walker.el.classList.toggle('maps', !onShort);
    setLabel(labels.walker, onShort ? minutes(walked) : `Google Maps · ${minutes(walked)}`, moving && fade > 0.5);
    setLabel(labels.front, 'Front door', !onShort && s < 0.7 + WALK_SECS * 0.45 && fade > 0.5);
    setLabel(labels.back, 'Back exit', onShort && b < 0.6 && fade > 0.5);
    setLabel(labels.tram, '3', false);

    // A tram passes by now and then, just for life.
    tram.position.z = 70 - ((time * 9) % 150);
    tram.visible = !reduced;

    // The walk setting ticks down while the shortcut is walked.
    const walkMin = !onShort ? 5 : b < 0.35 ? 5 : b < 0.7 ? 4 : 3;
    emit({ mode, walkMin, leaveMin: 7 - walkMin, phase: !onShort ? 'street' : b >= 1 ? 'saved' : 'shortcut', tap: onShort && b >= 0.35 && b < 1 ? walkMin : 0 });
  }

  function runStory(time) {
    const LOOP = 10.5;
    const s = reduced ? 2.4 : time % LOOP;
    const RUN0 = 0.9;
    const RUN_SECS = SHORT_SECS * 0.72; // running: quicker than the walk
    const u = ease(span(s, RUN0, RUN0 + RUN_SECS));
    const arrive = RUN0 + RUN_SECS + 0.5; // the tram pulls in just after you
    const depart = arrive + 1.9;
    const fade = reduced ? 1 : 1 - span(s, LOOP - 0.6, LOOP);

    street.show(0);
    short.show(u);
    short.material.opacity = fade;
    const p = short.path.at(u);
    const boarded = s > arrive + 0.9;
    walker.position.set(p.x, 0, p.z);
    walker.visible = !boarded;
    const running = u > 0.01 && u < 0.99;
    dot.position.y = 0.62 + (running ? Math.abs(Math.sin(s * 15)) * 0.42 : 0);
    setLabel(labels.walker, '', false);
    setLabel(labels.front, '', false);
    setLabel(labels.back, '', false);
    paintWalker(P.walk);

    // Tram: comes up from the south, waits at the stop, leaves north.
    let z;
    if (s < arrive) z = STOP_Z + 62 * (1 - ease(span(s, 0, arrive))) ** 1.6;
    else if (s < depart) z = STOP_Z;
    else z = STOP_Z - 80 * ease(span(s, depart, depart + 3.4)) ** 1.5;
    tram.position.z = z;
    tram.visible = true;
    labels.tram.pos.set(RAIL_X, 3.6, z);
    setLabel(labels.tram, '3', fade > 0.5 && z > -40 && z < 34);

    const secs = Math.max(0, Math.ceil(((arrive - s) / arrive) * 130));
    emit({ mode, phase: s < arrive + 0.9 ? 'run' : 'caught', depMin: s < arrive ? Math.max(1, Math.ceil(secs / 60)) : 0 });
  }

  const sway = { v: 0 };
  function draw(time) {
    if (mode === 'run') runStory(time);
    else shortcutStory(time);
    core.position.y = 0.75 + (reduced ? 0 : Math.sin(time * 2.2) * 0.08);
    rim.material.opacity = 0.45 + (reduced ? 0 : Math.sin(time * 2.2) * 0.15);
    sway.v = reduced ? 0 : Math.sin(time * 0.35) * 0.09;
    placeCamera(sway.v);
    camera.updateMatrixWorld();
    city.updateMatrixWorld();
    placeLabels();
    renderer.render(scene, camera);
  }

  let running = false;
  let raf = 0;
  let prev = 0;
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - prev) / 1000, 0.1);
    prev = now;
    t += dt;
    // Glide between the two camera views.
    const goal = VIEWS[mode];
    const k = 1 - Math.exp(-dt * 3.2);
    view.target.lerp(goal.target, k);
    view.radius += (goal.radius - view.radius) * k;
    view.polar += (goal.polar - view.polar) * k;
    view.azimuth += (goal.azimuth - view.azimuth) * k;
    draw(t);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduced) {
      const goal = VIEWS[mode];
      view.target.copy(goal.target);
      Object.assign(view, { radius: goal.radius, polar: goal.polar, azimuth: goal.azimuth });
      resize();
      draw(0);
      return;
    }
    if (running) return;
    running = true;
    prev = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  const onVisibility = () => (document.hidden ? stop() : wanted && start());
  let wanted = false;
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); opts.onLost?.(); });

  resize();

  return {
    /** Move the scene into another stage (the two steps share one scene). */
    attach(el) {
      if (el !== host) {
        observer.unobserve(host);
        host = el;
        host.append(canvas, layer);
        observer.observe(host);
      }
      resize();
    },
    play(nextMode, onUpdate) {
      mode = nextMode;
      opts.onUpdate = onUpdate;
      t = 0;
      last = {};
      wanted = true;
      start();
    },
    pause() {
      wanted = false;
      stop();
    },
    destroy() {
      wanted = false;
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
      layer.remove();
    },
  };
}
