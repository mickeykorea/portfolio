const CONFIG = {
  bgColor: 0x000000,
  subtitleText: "Creative Technologist",
  nameText: "Mickey Oh",
  // subtitleFontUrl: "fonts/SF-Pro-Regular.otf",
  // nameFontUrl: "fonts/SF-Pro-Bold.otf",
  subtitleFontUrl: "https://mickeykorea.github.io/portfolio/fonts/SF-Pro-Regular.otf",
  nameFontUrl: "https://mickeykorea.github.io/portfolio/fonts/SF-Pro-Bold.otf",
  // Font sizes for opentype sampling (high for smooth shapes)
  nameFontSize: 200,
  subtitleFontSize: 83,
  lineGap: 20,
  extrudeDepth: 10,
  // Target world size
  targetNameHeight: 0.6,
  // Particle text
  particleSize: 2,
  particleColor: 0xffffff,
  particleDensity: 3,
  particleOpacity: 0.85,
  particleJitter: 5,
  particleAlphaThreshold: 0,
  particleSkipChance: 0.18,
  // Pulse (mouse avoidance)
  pulseRadius: 0.3,
  pulseForce: 0.03,
  pulseRestoreSpeed: 0.03,
  // Entrance animation
  entranceSpread: 1.2, // how far particles scatter on load (world units)
  entranceOpacity: 0, // starting opacity (fades up to particleOpacity)
  // Breathing (idle organic float)
  breatheAmount: 0.008,
  breatheSpeed: 0.002,
  // Ray settings (subtle accent)
  maxRays: 100,
  rayCount: 65,
  rayColor: 0xcccccc,
  hitColor: 0xffffff,
  rayOpacity: 0.4,
  originSphereSize: 0.005,
  hitSphereSize: 0.006,
  // Ray origin distribution
  rayOriginZ: 1.5,
  rayOriginZVariation: 0.6,
  rayOriginPadding: 1.2,
  rayDriftSpeed: 0.0005,
  rayDriftAmount: 0.12,
  // Camera
  cameraFov: 65,
  cameraPadding: 3.5,
};

// ---- State ----
let camera, scene, renderer;
let textGroup;
let textMeshes = [];
let particlePoints; // THREE.Points for text
let sphereInstance, lineSegments;
let textWorldWidth = 0;
let textBoundsMin = new THREE.Vector3();
let textBoundsMax = new THREE.Vector3();
let rayBaseX, rayBaseY, rayBaseZ, rayPhase;
let _regularFont, _boldFont; // cached for particle rebuild
// Per-particle physics state
let particleCount = 0;
let particleBasePos = null;
let particleDensityArr = null;
let particlePhaseArr = null;
// Mouse in world space
const mouseWorld = { x: 0, y: 0, active: false };
const _mouseNDC = new THREE.Vector2();
const _mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _mouseIntersect = new THREE.Vector3();
const _mouseRay = new THREE.Raycaster();

// Reusable objects
const _raycaster = new THREE.Raycaster();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _matrix = new THREE.Matrix4();

// ---- Bootstrap ----
initThree();
loadFonts().then(({ regularFont, boldFont }) => {
  createTextMeshes(regularFont, boldFont);
  createParticleText(regularFont, boldFont);
  initRayVisualization();
  initRayOrigins();
  initGUI();
  animate();
});

// ============================================================
// Scene Setup
// ============================================================
function initThree() {
  const canvas = document.querySelector("canvas.canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.bgColor);

  camera = new THREE.PerspectiveCamera(
    CONFIG.cameraFov,
    window.innerWidth / window.innerHeight,
    0.01,
    100,
  );
  scene.add(camera);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  const directional = new THREE.DirectionalLight(0xffffff, 0.5);
  directional.position.set(0, 2, 5);
  scene.add(ambient, directional);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  window.addEventListener("resize", onResize);

  // Mouse tracking → world coordinates on Z=0 plane
  canvas.addEventListener("mousemove", (e) => {
    if (window.innerWidth <= 768) return;
    _mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    _mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    _mouseRay.setFromCamera(_mouseNDC, camera);
    if (_mouseRay.ray.intersectPlane(_mousePlane, _mouseIntersect)) {
      mouseWorld.x = _mouseIntersect.x;
      mouseWorld.y = _mouseIntersect.y;
      mouseWorld.active = true;
    }
  });
  canvas.addEventListener("mouseleave", () => {
    mouseWorld.active = false;
  });
}

// ============================================================
// Font Loading
// ============================================================
function loadFont(url) {
  return new Promise((resolve, reject) => {
    opentype.load(url, (err, font) => {
      if (err) reject(err);
      else resolve(font);
    });
  });
}

function loadFonts() {
  return Promise.all([
    loadFont(CONFIG.subtitleFontUrl),
    loadFont(CONFIG.nameFontUrl),
  ]).then(([regularFont, boldFont]) => ({ regularFont, boldFont }));
}

// ============================================================
// opentype.js path → THREE.Shape conversion
// ============================================================
function opentypeToShapes(opentypePath) {
  const shapePath = new THREE.ShapePath();

  for (const cmd of opentypePath.commands) {
    switch (cmd.type) {
      case "M":
        shapePath.moveTo(cmd.x, -cmd.y);
        break;
      case "L":
        shapePath.lineTo(cmd.x, -cmd.y);
        break;
      case "C":
        shapePath.bezierCurveTo(
          cmd.x1,
          -cmd.y1,
          cmd.x2,
          -cmd.y2,
          cmd.x,
          -cmd.y,
        );
        break;
      case "Q":
        shapePath.quadraticCurveTo(cmd.x1, -cmd.y1, cmd.x, -cmd.y);
        break;
      case "Z":
        break;
    }
  }

  let shapes = shapePath.toShapes(true);
  if (shapes.length === 0) {
    shapes = shapePath.toShapes(false);
  }
  return shapes;
}

// ============================================================
// Text Mesh Creation (invisible — for BVH raycasting only)
// ============================================================
function createTextMeshes(regularFont, boldFont) {
  const namePath = boldFont.getPath(CONFIG.nameText, 0, 0, CONFIG.nameFontSize);
  const nameShapes = opentypeToShapes(namePath);
  const nameGeom = new THREE.ExtrudeGeometry(nameShapes, {
    depth: CONFIG.extrudeDepth,
    bevelEnabled: true,
    bevelThickness: 2,
    bevelSize: 1,
    bevelSegments: 2,
    curveSegments: 12,
  });

  const subtitlePath = regularFont.getPath(
    CONFIG.subtitleText,
    0,
    0,
    CONFIG.subtitleFontSize,
  );
  const subtitleShapes = opentypeToShapes(subtitlePath);
  const subtitleGeom = new THREE.ExtrudeGeometry(subtitleShapes, {
    depth: CONFIG.extrudeDepth * 0.5,
    bevelEnabled: true,
    bevelThickness: 1,
    bevelSize: 0.5,
    bevelSegments: 1,
    curveSegments: 12,
  });

  nameGeom.computeBoundingBox();
  subtitleGeom.computeBoundingBox();
  const nameBox = nameGeom.boundingBox;
  const subtitleBox = subtitleGeom.boundingBox;

  const nameW = nameBox.max.x - nameBox.min.x;
  const nameH = nameBox.max.y - nameBox.min.y;
  const subtitleW = subtitleBox.max.x - subtitleBox.min.x;
  const subtitleH = subtitleBox.max.y - subtitleBox.min.y;

  nameGeom.translate(
    -nameBox.min.x - nameW / 2,
    -nameBox.min.y - nameH / 2,
    -CONFIG.extrudeDepth / 2,
  );

  subtitleGeom.translate(
    -subtitleBox.min.x - subtitleW / 2,
    -subtitleBox.min.y + nameH / 2 + CONFIG.lineGap,
    -CONFIG.extrudeDepth * 0.25,
  );

  // BVH for raycasting
  nameGeom.computeBoundsTree();
  subtitleGeom.computeBoundsTree();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.5,
    metalness: 0,
  });

  const nameMesh = new THREE.Mesh(nameGeom, mat);
  const subtitleMesh = new THREE.Mesh(subtitleGeom, mat);
  // Hide meshes — they exist only for raycasting
  nameMesh.visible = false;
  subtitleMesh.visible = false;
  textMeshes = [nameMesh, subtitleMesh];

  const scale = CONFIG.targetNameHeight / nameH;
  textGroup = new THREE.Group();
  textGroup.add(nameMesh, subtitleMesh);
  textGroup.scale.setScalar(scale);
  scene.add(textGroup);

  textWorldWidth = Math.max(nameW, subtitleW) * scale;
  const totalH = (nameH + CONFIG.lineGap + subtitleH) * scale;
  const halfW = textWorldWidth / 2;
  const halfH = totalH / 2;
  textBoundsMin.set(-halfW, -halfH, -CONFIG.extrudeDepth * scale * 0.5);
  textBoundsMax.set(
    halfW,
    halfH + subtitleH * scale * 0.5,
    CONFIG.extrudeDepth * scale * 0.5,
  );
  fitCamera();
  applyResponsive();
}

// ============================================================
// Particle Text (2D canvas pixel-sampling → THREE.Points)
// ============================================================
function rebuildParticleText() {
  if (!_regularFont || !_boldFont) return;
  if (particlePoints) {
    particlePoints.geometry.dispose();
    particlePoints.material.dispose();
    scene.remove(particlePoints);
  }
  createParticleText(_regularFont, _boldFont);
}

function createParticleText(regularFont, boldFont) {
  _regularFont = regularFont;
  _boldFont = boldFont;
  const namePath = boldFont.getPath(CONFIG.nameText, 0, 0, CONFIG.nameFontSize);
  const subtitlePath = regularFont.getPath(
    CONFIG.subtitleText,
    0,
    0,
    CONFIG.subtitleFontSize,
  );

  const nameBox = namePath.getBoundingBox();
  const subtitleBox = subtitlePath.getBoundingBox();

  const nameW = nameBox.x2 - nameBox.x1;
  const nameH = nameBox.y2 - nameBox.y1;
  const subtitleW = subtitleBox.x2 - subtitleBox.x1;
  const subtitleH = subtitleBox.y2 - subtitleBox.y1;

  // Canvas size: enough to fit both lines
  const totalW = Math.max(nameW, subtitleW);
  // lineGap is in font units, same coordinate space as nameH
  const totalH = nameH + CONFIG.lineGap + subtitleH;

  // Add padding
  const pad = 20;
  const canvasW = Math.ceil(totalW + pad * 2);
  const canvasH = Math.ceil(totalH + pad * 2);

  const offscreen = document.createElement("canvas");
  offscreen.width = canvasW;
  offscreen.height = canvasH;
  const ctx = offscreen.getContext("2d");

  // Subtitle: centered, top area
  const subtitleX = (canvasW - subtitleW) / 2 - subtitleBox.x1;
  const subtitleY = pad - subtitleBox.y1; // top of canvas + pad
  const subtitlePathDraw = regularFont.getPath(
    CONFIG.subtitleText,
    subtitleX,
    subtitleY,
    CONFIG.subtitleFontSize,
  );
  subtitlePathDraw.fill = "white";
  subtitlePathDraw.draw(ctx);

  // Name: centered, below subtitle
  const nameX = (canvasW - nameW) / 2 - nameBox.x1;
  const nameY = pad + subtitleH + CONFIG.lineGap - nameBox.y1;
  const namePathDraw = boldFont.getPath(
    CONFIG.nameText,
    nameX,
    nameY,
    CONFIG.nameFontSize,
  );
  namePathDraw.fill = "white";
  namePathDraw.draw(ctx);

  // Sample pixels with jitter and random skip for organic look
  const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
  const density = CONFIG.particleDensity;
  const jitter = CONFIG.particleJitter;
  const threshold = CONFIG.particleAlphaThreshold;
  const skipChance = CONFIG.particleSkipChance;
  const positions = [];
  const alphas = [];

  for (let py = 0; py < canvasH; py += density) {
    for (let px = 0; px < canvasW; px += density) {
      const off = (py * canvasW + px) * 4 + 3; // alpha channel
      if (imageData.data[off] > threshold) {
        if (Math.random() < skipChance) continue; // random organic gaps
        const jx = (Math.random() - 0.5) * jitter;
        const jy = (Math.random() - 0.5) * jitter;
        positions.push(px + jx, py + jy);
        alphas.push(imageData.data[off] / 255);
      }
    }
  }

  // Map canvas pixel coords → 3D world coords
  const worldScale = CONFIG.targetNameHeight / nameH;
  const canvasCenterX = canvasW / 2;

  const subtitleCenterY_font = nameH / 2 + CONFIG.lineGap + subtitleH / 2;
  const combinedCenterY_font = subtitleCenterY_font / 2;

  const subtitleCenterY_canvas = pad + subtitleH / 2;
  const nameCenterY_canvas = pad + subtitleH + CONFIG.lineGap + nameH / 2;
  const combinedCenterY_canvas =
    (subtitleCenterY_canvas + nameCenterY_canvas) / 2;

  const count = positions.length / 2;
  const worldPositions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < positions.length; i += 2) {
    const px = positions[i];
    const py = positions[i + 1];
    const pi = i / 2;

    const fontX = px - canvasCenterX;
    const fontY = -(py - combinedCenterY_canvas);

    const wx = fontX * worldScale;
    const wy = fontY * worldScale + combinedCenterY_font * worldScale;
    const wz = (Math.random() - 0.5) * 0.04;

    const idx = pi * 3;
    worldPositions[idx] = wx;
    worldPositions[idx + 1] = wy;
    worldPositions[idx + 2] = wz;

    // Per-particle brightness based on sampled alpha (softer edges = dimmer)
    const brightness = 0.3 + alphas[pi] * 0.7;
    colors[idx] = brightness;
    colors[idx + 1] = brightness;
    colors[idx + 2] = brightness;
  }

  // Store per-particle physics state for pulse interaction
  particleCount = count;
  particleBasePos = new Float32Array(worldPositions);
  particleDensityArr = new Float32Array(count);
  particleFrictionArr = new Float32Array(count);
  particlePhaseArr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    particleDensityArr[i] = Math.random() * 30 + 1;
    particleFrictionArr[i] = 0.05 + Math.random() * 0.15;
    particlePhaseArr[i] = Math.random() * Math.PI * 2;
  }

  // Scatter initial positions for entrance animation
  const scatteredPositions = new Float32Array(worldPositions.length);
  const spread = CONFIG.entranceSpread;
  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    scatteredPositions[idx] =
      worldPositions[idx] + (Math.random() - 0.5) * spread;
    scatteredPositions[idx + 1] =
      worldPositions[idx + 1] + (Math.random() - 0.5) * spread;
    scatteredPositions[idx + 2] = worldPositions[idx + 2];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(scatteredPositions, 3),
  );
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: CONFIG.particleSize,
    sizeAttenuation: false,
    transparent: true,
    opacity: CONFIG.entranceOpacity,
    depthWrite: false,
    vertexColors: true,
  });

  particlePoints = new THREE.Points(geom, mat);
  scene.add(particlePoints);

  console.log(
    `[Particle Text] Created ${positions.length / 2} particles from ${canvasW}×${canvasH} canvas`,
  );
}

// ============================================================
// Ray Visualization Setup
// ============================================================
function initRayVisualization() {
  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(CONFIG.maxRays * 2 * 3), 3),
  );
  lineSegments = new THREE.LineSegments(
    lineGeom,
    new THREE.LineBasicMaterial({
      color: CONFIG.rayColor,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );

  sphereInstance = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 6, 6),
    new THREE.MeshBasicMaterial({
      color: CONFIG.hitColor,
      transparent: true,
      opacity: 0,
    }),
    2 * CONFIG.maxRays,
  );
  sphereInstance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sphereInstance.count = 0;

  scene.add(sphereInstance, lineSegments);
}

// ============================================================
// Initialize Ray Origins
// ============================================================
function initRayOrigins() {
  const n = CONFIG.maxRays;
  rayBaseX = new Float32Array(n);
  rayBaseY = new Float32Array(n);
  rayBaseZ = new Float32Array(n);
  rayPhase = new Float32Array(n);

  const pad = CONFIG.rayOriginPadding;
  const xRange = (textBoundsMax.x - textBoundsMin.x) * pad;
  const yRange = (textBoundsMax.y - textBoundsMin.y) * pad;
  const xCenter = (textBoundsMax.x + textBoundsMin.x) / 2;
  const yCenter = (textBoundsMax.y + textBoundsMin.y) / 2;

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4();

  for (let i = 0; i < n; i++) {
    rayBaseX[i] = xCenter + (Math.random() - 0.5) * xRange;
    rayBaseY[i] = yCenter + (Math.random() - 0.5) * yRange;
    rayBaseZ[i] =
      CONFIG.rayOriginZ + (Math.random() - 0.5) * CONFIG.rayOriginZVariation;
    rayPhase[i] = Math.random() * Math.PI * 2;

    position.set(rayBaseX[i], rayBaseY[i], rayBaseZ[i]);
    matrix.compose(position, quaternion, scale);
    sphereInstance.setMatrixAt(i * 2, matrix);
    sphereInstance.setMatrixAt(i * 2 + 1, matrix);
  }
}

// ============================================================
// Update Rays
// ============================================================
function updateRays() {
  if (!textGroup) return;

  textGroup.updateMatrixWorld();

  _raycaster.firstHitOnly = true;
  const rayCount = CONFIG.rayCount;
  const t = performance.now();
  const drift = CONFIG.rayDriftAmount;
  const speed = CONFIG.rayDriftSpeed;

  const rayDir = new THREE.Vector3(0, 0, -1);

  let lineNum = 0;
  for (let i = 0; i < rayCount; i++) {
    const phase = rayPhase[i];
    const fx = Math.sin(t * speed + phase) * drift;
    const fy = Math.cos(t * speed * 0.7 + phase * 1.3) * drift;
    const fz = Math.sin(t * speed * 0.5 + phase * 0.8) * drift * 0.5;

    _position.set(rayBaseX[i] + fx, rayBaseY[i] + fy, rayBaseZ[i] + fz);

    _scale.setScalar(CONFIG.originSphereSize);
    _matrix.compose(_position, _quaternion, _scale);
    sphereInstance.setMatrixAt(i * 2, _matrix);

    _raycaster.ray.origin.copy(_position);
    _raycaster.ray.direction.copy(rayDir);

    const hits = _raycaster.intersectObjects(textMeshes);
    if (hits.length > 0) {
      const point = hits[0].point;
      _scale.setScalar(CONFIG.hitSphereSize);
      _matrix.compose(point, _quaternion, _scale);
      sphereInstance.setMatrixAt(i * 2 + 1, _matrix);

      lineSegments.geometry.attributes.position.setXYZ(
        lineNum++,
        _position.x,
        _position.y,
        _position.z,
      );
      lineSegments.geometry.attributes.position.setXYZ(
        lineNum++,
        point.x,
        point.y,
        point.z,
      );
    } else {
      _scale.setScalar(0);
      _matrix.compose(_position, _quaternion, _scale);
      sphereInstance.setMatrixAt(i * 2 + 1, _matrix);
    }
  }

  sphereInstance.count = rayCount * 2;
  sphereInstance.instanceMatrix.needsUpdate = true;

  lineSegments.geometry.setDrawRange(0, lineNum);
  lineSegments.geometry.attributes.position.needsUpdate = true;
}

// ============================================================
// Camera Fitting
// ============================================================
function fitCamera() {
  const vFov = (camera.fov * Math.PI) / 180;
  const aspect = camera.aspect;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const desiredWidth = textWorldWidth * CONFIG.cameraPadding;
  const z = desiredWidth / 2 / Math.tan(hFov / 2);
  camera.position.set(0, -0.03, z);
  camera.lookAt(0, 0, 0);
}

// ============================================================
// Responsive
// ============================================================
function applyResponsive() {
  const isMobile = window.innerWidth <= 768;
  const canvas = renderer.domElement;

  const prevDensity = CONFIG.particleDensity;

  if (isMobile) {
    mouseWorld.active = false;
    canvas.style.touchAction = 'pan-y';
    canvas.style.userSelect = 'auto';
    CONFIG.cameraPadding = 1.5;
    CONFIG.particleDensity = 5;
    CONFIG.particleSize = 1.7;
  } else {
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    CONFIG.cameraPadding = 3.5;
    CONFIG.particleDensity = 3;
    CONFIG.particleSize = 2;
  }

  if (particlePoints) {
    particlePoints.material.size = CONFIG.particleSize;
  }
  if (prevDensity !== CONFIG.particleDensity) {
    rebuildParticleText();
  }

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  fitCamera();
}

// ============================================================
// Resize
// ============================================================
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  applyResponsive();
}

// ============================================================
// GUI
// ============================================================
function initGUI() {
  const gui = new GUI();
  gui.hide();

  // Particles
  const particleFolder = gui.addFolder("Particles");
  particleFolder
    .add(CONFIG, "particleSize", 0.5, 10, 0.1)
    .name("Size")
    .onChange((v) => {
      particlePoints.material.size = v;
    });
  particleFolder
    .add(CONFIG, "particleOpacity", 0, 1, 0.01)
    .name("Opacity")
    .onChange((v) => {
      particlePoints.material.opacity = v;
    });
  particleFolder
    .add(CONFIG, "particleDensity", 1, 10, 1)
    .name("Density")
    .onChange(rebuildParticleText);
  particleFolder
    .add(CONFIG, "particleJitter", 0, 30, 1)
    .name("Jitter")
    .onChange(rebuildParticleText);
  particleFolder
    .add(CONFIG, "particleAlphaThreshold", 0, 200, 5)
    .name("Alpha Threshold")
    .onChange(rebuildParticleText);
  particleFolder
    .add(CONFIG, "particleSkipChance", 0, 0.5, 0.01)
    .name("Skip Chance")
    .onChange(rebuildParticleText);
  particleFolder
    .add(CONFIG, "pulseRadius", 0.01, 1.0, 0.01)
    .name("Pulse Radius");
  particleFolder
    .add(CONFIG, "pulseForce", 0.001, 0.1, 0.001)
    .name("Pulse Force");
  particleFolder
    .add(CONFIG, "pulseRestoreSpeed", 0.005, 0.15, 0.005)
    .name("Restore Speed");
  particleFolder
    .add(CONFIG, "breatheAmount", 0, 0.05, 0.001)
    .name("Breathe Amount");
  particleFolder
    .add(CONFIG, "breatheSpeed", 0.0001, 0.002, 0.0001)
    .name("Breathe Speed");

  // Raycasting
  const rayFolder = gui.addFolder("Raycasting");
  rayFolder.add(CONFIG, "rayCount", 1, CONFIG.maxRays, 1).name("Ray Count");
  rayFolder.add(CONFIG, "rayOriginZ", 0.2, 5, 0.1).name("Origin Z Dist");
  rayFolder.add(CONFIG, "rayOriginZVariation", 0, 3, 0.1).name("Z Spread");
  rayFolder
    .add(CONFIG, "rayDriftSpeed", 0.0001, 0.002, 0.0001)
    .name("Drift Speed");
  rayFolder.add(CONFIG, "rayDriftAmount", 0, 1, 0.01).name("Drift Amount");
  rayFolder
    .add(CONFIG, "rayOpacity", 0, 1, 0.01)
    .name("Line Opacity")
    .onChange((v) => {
      lineSegments.material.opacity = v;
    });
  rayFolder
    .add(CONFIG, "originSphereSize", 0.001, 0.05, 0.001)
    .name("Origin Size");
  rayFolder.add(CONFIG, "hitSphereSize", 0.001, 0.05, 0.001).name("Hit Size");

  // Camera
  const cameraFolder = gui.addFolder("Camera");
  cameraFolder
    .add(CONFIG, "cameraPadding", 1, 10, 0.1)
    .name("Zoom (padding)")
    .onChange(() => fitCamera());
  cameraFolder
    .add(camera, "fov", 20, 120, 1)
    .name("FOV")
    .onChange(() => {
      camera.updateProjectionMatrix();
    });
  cameraFolder.add(camera.position, "x", -5, 5, 0.01).name("Position X");
  cameraFolder.add(camera.position, "y", -5, 5, 0.01).name("Position Y");
}

// ============================================================
// Particle Pulse (mouse avoidance + spring back)
// ============================================================
function updateParticles() {
  if (!particlePoints || !particleBasePos) return;
  const positions = particlePoints.geometry.attributes.position.array;
  const radius = CONFIG.pulseRadius;
  const force = CONFIG.pulseForce;
  const t = performance.now();
  const breathe = CONFIG.breatheAmount;
  const bSpeed = CONFIG.breatheSpeed;

  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;
    const phase = particlePhaseArr[i];

    // Breathing: subtle organic float around base position
    const bx = particleBasePos[idx] + Math.sin(t * bSpeed + phase) * breathe;
    const by =
      particleBasePos[idx + 1] +
      Math.cos(t * bSpeed * 0.7 + phase * 1.3) * breathe;

    const entranceComplete = particlePoints.material.opacity >= CONFIG.particleOpacity - 0.05;
    if (mouseWorld.active && entranceComplete) {
      const dx = mouseWorld.x - positions[idx];
      const dy = mouseWorld.y - positions[idx + 1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius && dist > 0.0001) {
        const f = (radius - dist) / radius;
        positions[idx] -= (dx / dist) * f * particleDensityArr[i] * force;
        positions[idx + 1] -= (dy / dist) * f * particleDensityArr[i] * force;
      } else {
        positions[idx] -= (positions[idx] - bx) * CONFIG.pulseRestoreSpeed;
        positions[idx + 1] -=
          (positions[idx + 1] - by) * CONFIG.pulseRestoreSpeed;
      }
    } else {
      positions[idx] -= (positions[idx] - bx) * CONFIG.pulseRestoreSpeed;
      positions[idx + 1] -=
        (positions[idx + 1] - by) * CONFIG.pulseRestoreSpeed;
    }
  }
  particlePoints.geometry.attributes.position.needsUpdate = true;

  // Fade opacity up toward target during entrance
  if (particlePoints.material.opacity < CONFIG.particleOpacity - 0.01) {
    particlePoints.material.opacity +=
      (CONFIG.particleOpacity - particlePoints.material.opacity) * 0.02;
  } else {
    particlePoints.material.opacity = CONFIG.particleOpacity;
  }

  // Start fading in raycasting once particles reach ~0.75 opacity
  if (particlePoints.material.opacity >= 0.75) {
    if (lineSegments.material.opacity < CONFIG.rayOpacity) {
      lineSegments.material.opacity +=
        (CONFIG.rayOpacity - lineSegments.material.opacity) * 0.03;
      sphereInstance.material.opacity +=
        (1 - sphereInstance.material.opacity) * 0.03;
    }
  }
}

// ============================================================
// Animation Loop
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  updateParticles();
  updateRays();
  renderer.render(scene, camera);
}
