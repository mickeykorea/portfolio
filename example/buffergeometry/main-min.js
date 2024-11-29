let controls, group, container, stats; const particlesData = []; let camera, scene, renderer, positions, colors, particles, pointCloud, particlePositions, linesMesh; const maxParticleCount = 1e3; let particleCount = 500; const r = 800, rHalf = 400, effectController = { showDots: !0, showLines: !0, minDistance: 150, limitConnections: !1, maxConnections: 20, particleCount: 500 }; function initGUI() { const e = new GUI; e.add(effectController, "showDots").onChange((function (e) { pointCloud.visible = e })), e.add(effectController, "showLines").onChange((function (e) { linesMesh.visible = e })), e.add(effectController, "minDistance", 10, 300), e.add(effectController, "limitConnections"), e.add(effectController, "maxConnections", 0, 30, 1), e.add(effectController, "particleCount", 0, 1e3, 1).onChange((function (e) { particleCount = e, particles.setDrawRange(0, particleCount) })) } function init() { container = document.getElementById("container"), camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 4e3), camera.position.z = 1800; const e = new OrbitControls(camera, container); e.minDistance = 1e3, e.maxDistance = 3e3, e.enableDamping = !0, e.dampingFactor = .02, container.style.touchAction = "pan-y", responsiveControls(), scene = new THREE.Scene, group = new THREE.Group, scene.add(group); const t = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(r, r, r))); t.material.color.setHex(4671303), t.material.blending = THREE.AdditiveBlending, t.material.transparent = !0, group.add(t); positions = new Float32Array(3e6), colors = new Float32Array(3e6); const n = new THREE.PointsMaterial({ color: 16777215, size: 2, blending: THREE.AdditiveBlending, transparent: !0, sizeAttenuation: !1 }); particles = new THREE.BufferGeometry, particlePositions = new Float32Array(3e3); for (let e = 0; e < 1e3; e++) { const t = Math.random() * r - 400, n = Math.random() * r - 400, o = Math.random() * r - 400; particlePositions[3 * e] = t, particlePositions[3 * e + 1] = n, particlePositions[3 * e + 2] = o, particlesData.push({ velocity: new THREE.Vector3(2 * Math.random() - 1, 2 * Math.random() - 1, 2 * Math.random() - 1), numConnections: 0 }) } particles.setDrawRange(0, particleCount), particles.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3).setUsage(THREE.DynamicDrawUsage)), pointCloud = new THREE.Points(particles, n), group.add(pointCloud); const o = new THREE.BufferGeometry; o.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)), o.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage)), o.computeBoundingSphere(), o.setDrawRange(0, 0); const i = new THREE.LineBasicMaterial({ vertexColors: !0, blending: THREE.AdditiveBlending, transparent: !0 }); linesMesh = new THREE.LineSegments(o, i), group.add(linesMesh), renderer = new THREE.WebGLRenderer({ antialias: !0 }), renderer.setPixelRatio(window.devicePixelRatio), renderer.setSize(window.innerWidth, window.innerHeight), renderer.setAnimationLoop(animate), container.appendChild(renderer.domElement), window.addEventListener("resize", onWindowResize) } function responsiveControls() { window.innerWidth <= 768 ? (controls.enabled = !1, container.style.touchAction = "pan-y", container.style.userSelect = "auto") : (controls.enabled = !0, container.style.touchAction = "none", container.style.userSelect = "none") } function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight, camera.updateProjectionMatrix(), renderer.setSize(window.innerWidth, window.innerHeight), responsiveControls() } function animate() { let e = 0, t = 0, n = 0; for (let e = 0; e < particleCount; e++)particlesData[e].numConnections = 0; for (let o = 0; o < particleCount; o++) { const i = particlesData[o]; if (particlePositions[3 * o] += i.velocity.x, particlePositions[3 * o + 1] += i.velocity.y, particlePositions[3 * o + 2] += i.velocity.z, (particlePositions[3 * o + 1] < -rHalf || particlePositions[3 * o + 1] > rHalf) && (i.velocity.y = -i.velocity.y), (particlePositions[3 * o] < -rHalf || particlePositions[3 * o] > rHalf) && (i.velocity.x = -i.velocity.x), (particlePositions[3 * o + 2] < -rHalf || particlePositions[3 * o + 2] > rHalf) && (i.velocity.z = -i.velocity.z), !(effectController.limitConnections && i.numConnections >= effectController.maxConnections)) for (let r = o + 1; r < particleCount; r++) { const s = particlesData[r]; if (effectController.limitConnections && s.numConnections >= effectController.maxConnections) continue; const a = particlePositions[3 * o] - particlePositions[3 * r], c = particlePositions[3 * o + 1] - particlePositions[3 * r + 1], l = particlePositions[3 * o + 2] - particlePositions[3 * r + 2], p = Math.sqrt(a * a + c * c + l * l); if (p < effectController.minDistance) { i.numConnections++, s.numConnections++; const a = 1 - p / effectController.minDistance; positions[e++] = particlePositions[3 * o], positions[e++] = particlePositions[3 * o + 1], positions[e++] = particlePositions[3 * o + 2], positions[e++] = particlePositions[3 * r], positions[e++] = particlePositions[3 * r + 1], positions[e++] = particlePositions[3 * r + 2], colors[t++] = a, colors[t++] = a, colors[t++] = a, colors[t++] = a, colors[t++] = a, colors[t++] = a, n++ } } } linesMesh.geometry.setDrawRange(0, 2 * n), linesMesh.geometry.attributes.position.needsUpdate = !0, linesMesh.geometry.attributes.color.needsUpdate = !0, pointCloud.geometry.attributes.position.needsUpdate = !0, controls.enabled && controls.update(), render() } function render() { const e = .001 * Date.now(); group.rotation.y = .1 * e, renderer.render(scene, camera) } init(), container.addEventListener("touchmove", (e => { e.stopPropagation() }), { passive: !1 });