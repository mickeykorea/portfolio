THREE.ColorManagement.enabled = true;
const fontLoader = new FontLoader();
const turn_gui = false;
let y_offset = 0.6;

const canvas = document.querySelector("canvas");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x171616);

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
};

const FOV_SETTINGS = {
    mobile: 85,
    desktop: 65,
    transitionDuration: 0.2, // seconds
};

let targetFov = 65; // Initial FOV
let isTransitioning = false;
let transitionStartTime = 0;
let startFov = 65;

const camera = new THREE.PerspectiveCamera(
    65,
    sizes.width / sizes.height,
    0.1,
    1000,
);
camera.zoom = 1.1;
camera.updateProjectionMatrix();

camera.position.set(0, 4, -5.5);
scene.add(camera);

// RectLight
const darkmode = 0xffffff;
const lightmode = 0xfeffb5;

const intensity = 1.7;
const width = 6;
const height = 2.85;
const rectAreaLight = new THREE.RectAreaLight(
    darkmode,
    1.7, // intensity starts from 0
    width,
    height,
);
rectAreaLight.height = 0;

// Default position
rectAreaLight.position.y = -0.65 + y_offset;
rectAreaLight.position.z = 2;
rectAreaLight.rotation.x = -0.8;

const rectAreaLightHelper = new RectAreaLightHelper(rectAreaLight);
scene.add(rectAreaLight, rectAreaLightHelper);

// Rounded corner glow effect
function createRoundedRectTexture(texWidth, texHeight, radius) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const scale = 4;
    canvas.width = texWidth * scale;
    canvas.height = texHeight * scale;

    ctx.scale(scale, scale);
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.roundRect(0, 0, texWidth, texHeight, radius);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

const cornerRadius = 80; // Higher value = more arc-like (max ~64 for full arc)
const roundedTexture = createRoundedRectTexture(256, 128, cornerRadius);

const glowGeometry = new THREE.PlaneGeometry(width, height * 1.05);
const glowMaterial = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    map: roundedTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});

const glowPlane = new THREE.Mesh(glowGeometry, glowMaterial);
glowPlane.position.copy(rectAreaLight.position);
glowPlane.rotation.copy(rectAreaLight.rotation);
glowPlane.position.z += 0.01; // Slightly behind the light
glowPlane.position.y -= 0.05; // Close the gap with the ground
glowPlane.scale.y = 0; // Start with 0 height to match light animation

// Hide the default rectangular helper since we have rounded corners now
rectAreaLightHelper.visible = false;

scene.add(glowPlane);

// const ambientLight = new THREE.AmbientLight(0x404040, 0);
// scene.add(ambientLight);

const renderer = new THREE.WebGLRenderer({ canvas });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
canvas.style.touchAction = 'pan-y';
// Block user control
// controls.enabled = false;

// Block zoom, scroll up and down and horizontal rotation
controls.enableZoom = false;
controls.minAzimuthAngle = Math.PI - Math.PI / 4;
controls.maxAzimuthAngle = Math.PI + Math.PI / 4;
controls.minPolarAngle = Math.PI / 3; // 60 degrees
controls.maxPolarAngle = Math.PI / 2.5;

controls.enableDamping = true; // for smoother controls
controls.dampingFactor = 0.02;
controls.enableDamping = true;

// Inertia force - Reset the camera position after a while
let lastInteractionTime = Date.now();
let isResetting = false;
const resetDelay = 1000; // 1 second
const resetDuration = 1000; // 1 second for smooth reset
let resetStartTime;
let resetStartPosition = new THREE.Vector3();
let resetStartTarget = new THREE.Vector3();
let initialAnimationComplete = false;
// Initial camera position and target
const initialCameraPosition = new THREE.Vector3(0, 4, -5.5);
const initialTarget = new THREE.Vector3(0, 0, 0);

controls.addEventListener('start', () => {
    lastInteractionTime = Date.now();
    isResetting = false;
});

controls.addEventListener('end', () => {
    lastInteractionTime = Date.now();
});

const material = new THREE.MeshStandardMaterial({
    roughness: 0.5,
    metalness: 0,
});

// Floor
const plane = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), material);
plane.rotation.x = -Math.PI * 0.5;
plane.position.y = -0.65 + y_offset;
plane.color = new THREE.Color(0x171616);

scene.add(plane);

// Random objects
const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), material);
sphere.position.x = -2;

const cube = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), material);

const torus = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.2, 32, 64),
    material,
);
torus.position.x = 2;

// const shapes = [sphere, cube, torus];

// shapes.forEach((shape) => {
//     scene.add(shape);
// });

const textMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b4b4b,
    roughness: 0.5,
    metalness: 0,
});

let nameMesh, subtitleMesh;

// My Name
fontLoader.load(
    // './fonts/sfpro-bold.json',
    'https://mickeykorea.github.io/portfolio/fonts/sfpro-bold.json',
    (font) => {
        const nameGeometry = new TextGeometry('Mickey Oh', {
            font: font,
            size: 0.6,
            depth: 0.02,
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.001,
            bevelSize: 0.001,
            bevelOffset: 0,
            bevelSegments: 1,
            letterSpacing: -10
        });

        nameMesh = new THREE.Mesh(nameGeometry, textMaterial);

        // Center the text
        nameGeometry.computeBoundingBox();
        const nameWidth = nameGeometry.boundingBox.max.x - nameGeometry.boundingBox.min.x;
        const nameHeight = nameGeometry.boundingBox.max.y - nameGeometry.boundingBox.min.y;

        nameMesh.rotation.y = Math.PI;
        nameMesh.rotation.x = Math.PI / 2.7;

        nameMesh.position.x = -nameWidth / 2 + nameWidth;
        nameMesh.position.y = -nameHeight / 2 + y_offset;

        scene.add(nameMesh);
        updateYPositions();
    }
);

// Subtitle
fontLoader.load(
    // './fonts/sfpro-regular.json',
    'https://mickeykorea.github.io/portfolio/fonts/sfpro-regular.json',
    (subtitleFont) => {
        const subtitleGeometry = new TextGeometry('Creative Technologist', {
            font: subtitleFont,
            size: 0.25,
            depth: 0.01,
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.001,
            bevelSize: 0.001,
            bevelOffset: 0,
            bevelSegments: 1,
            letterSpacing: -0.02
        });

        subtitleMesh = new THREE.Mesh(subtitleGeometry, textMaterial);

        // Center the subtitle
        subtitleGeometry.computeBoundingBox();
        const subtitleWidth = subtitleGeometry.boundingBox.max.x - subtitleGeometry.boundingBox.min.x;
        const subtitleHeight = subtitleGeometry.boundingBox.max.y - subtitleGeometry.boundingBox.min.y;

        subtitleMesh.rotation.y = Math.PI;
        subtitleMesh.rotation.x = Math.PI / 2.7;

        subtitleMesh.position.x = -subtitleWidth / 2 + subtitleWidth;
        subtitleMesh.position.y = -subtitleHeight / 2 + y_offset;
        subtitleMesh.position.z = 1;

        scene.add(subtitleMesh);
        updateYPositions();
    }
);

// text on the RectAreaLight
// fontLoader.load(
//     './fonts/trends.json',
//     (font) => {
//         const textGeometry = new TextGeometry('mickey oh', {
//             font: font,
//             size: 0.5,
//             depth: 0.1,
//             curveSegments: 12,
//             bevelEnabled: false
//         });

//         const textMaterial = new THREE.MeshStandardMaterial({
//             color: 0xffffff,
//             // metalness: 0.1,
//             // roughness: 1,
//         });

//         const textMesh = new THREE.Mesh(textGeometry, textMaterial);

//         // Center the text
//         textGeometry.computeBoundingBox();
//         const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
//         textMesh.position.copy(rectAreaLight.position);
//         textMesh.position.x += textWidth / 2;
//         textMesh.rotation.copy(rectAreaLight.rotation);

//         textMesh.rotation.y = Math.PI;
//         scene.add(textMesh);
//     }
// );

const clock = new THREE.Clock();

// Light intensity animation
let isLightAnimationComplete = false;
const lightAnimationDuration = 2;

let initialAnimationEndTime = 0;
const initialResetDelay = 1000;

// Camera position animation
// let initialAnimationComplete = false;

const update = () => {
    const elapsedTime = clock.getElapsedTime();

    //Camera position animation
    if (elapsedTime <= 1.3) {
        const progress = Math.min(elapsedTime / 1.3, 1);
        camera.position.z = -7 + (1.3 * progress);
    } else if (!initialAnimationComplete) {
        initialAnimationComplete = true;
        initialCameraPosition.copy(camera.position);
        //console.log('initialAnimationComplete');
    }

    // Inertia force - Reset the camera position after a while
    if (initialAnimationComplete) {
        if (!isResetting && Date.now() - lastInteractionTime > resetDelay) {
            isResetting = true;
            resetStartTime = Date.now();
            resetStartPosition.copy(camera.position);
            resetStartTarget.copy(controls.target);
        }
        if (isResetting) {
            const resetProgress = Math.min((Date.now() - resetStartTime) / resetDuration, 1);
            const easeProgress = easeOutCubic(resetProgress);

            camera.position.lerpVectors(
                resetStartPosition,
                initialCameraPosition,
                easeProgress
            );

            controls.target.lerpVectors(
                resetStartTarget,
                initialTarget,
                easeProgress
            );

            controls.update();

            if (resetProgress === 1) {
                isResetting = false;
            }
        }
    }

    // const FLICKER_SETTINGS = {
    //     baseIntensity: 2,
    //     flickerRange: 0.2,
    //     flickerChance: 0.05 // 5% chance of flicker per frame
    // };

    // Animate light intensity
    // if (!isLightAnimationComplete) {
    //     const progress = Math.min(elapsedTime / lightAnimationDuration, 1);
    //     const startIntensity = 1.3;
    //     rectAreaLight.intensity = startIntensity + (intensity - startIntensity) * progress;

    //     if (progress === 1) {
    //         isLightAnimationComplete = true;
    //     }
    // }

    // Animate light height
    if (!isLightAnimationComplete) {
        const progress = Math.min(elapsedTime / lightAnimationDuration, 1);
        const startHeight = 0;
        rectAreaLight.height = startHeight + (height - startHeight) * progress;
        glowPlane.scale.y = progress; // Sync glow plane with light animation

        if (progress === 1) {
            isLightAnimationComplete = true;
        }
    }

    // } else {
    //     if (Math.random() < FLICKER_SETTINGS.flickerChance) {
    //         // When flicker occurs, reduce intensity by a random amount
    //         const flickerAmount = Math.random() * FLICKER_SETTINGS.flickerRange;
    //         rectAreaLight.intensity = FLICKER_SETTINGS.baseIntensity - flickerAmount;
    //     } else {
    //         // Most of the time, maintain base intensity
    //         rectAreaLight.intensity = FLICKER_SETTINGS.baseIntensity;
    //     }
    // }

    // Handle FOV transition
    if (isTransitioning) {
        const progress = Math.min((elapsedTime - transitionStartTime) / FOV_SETTINGS.transitionDuration, 1);
        camera.fov = startFov + (targetFov - startFov) * progress;
        camera.updateProjectionMatrix();

        if (progress === 1) {
            isTransitioning = false;
        }
    }

    // Update controls
    controls.update();

    // for (const shape of shapes) {
    //     shape.rotation.x = elapsedTime * 0.1;
    //     shape.rotation.y = elapsedTime * 0.1;
    //     shape.rotation.z = elapsedTime * 0.1;
    // }

    // Render
    renderer.render(scene, camera);
    window.requestAnimationFrame(update);
};

update();

function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

function updateYPositions() {
    plane.position.y = -0.65 + y_offset;
    rectAreaLight.position.y = -0.65 + y_offset;

    if (nameMesh) {
        const nameHeight = nameMesh.geometry.boundingBox.max.y - nameMesh.geometry.boundingBox.min.y;
        nameMesh.position.y = -nameHeight / 2 + y_offset;
    }

    if (subtitleMesh) {
        const subtitleHeight = subtitleMesh.geometry.boundingBox.max.y - subtitleMesh.geometry.boundingBox.min.y;
        subtitleMesh.position.y = -subtitleHeight / 2 + y_offset;
    }
}

function responsiveCamera() {
    const isMobile = window.innerWidth <= 768;
    // controls.enabled = !isMobile;
    if (isMobile) {
        controls.enabled = false;
        canvas.style.touchAction = 'pan-y';
        canvas.style.userSelect = 'auto';
    } else {
        controls.enabled = true;
        canvas.style.touchAction = 'none';
        canvas.style.userSelect = 'none';
    }

    // Adjust y_offset based on device
    y_offset = isMobile ? 1.2 : 0.6;
    updateYPositions();

    // Set target FOV based on device
    const newTargetFov = isMobile ? FOV_SETTINGS.mobile : FOV_SETTINGS.desktop;

    // Only start transition if target FOV is different
    if (targetFov !== newTargetFov) {
        targetFov = newTargetFov;
        startFov = camera.fov;
        isTransitioning = true;
        transitionStartTime = clock.getElapsedTime();
    }

    // Update camera
    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();
}

window.addEventListener("resize", () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    responsiveCamera();

    // Update renderer
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

canvas.addEventListener('touchmove', (e) => {
    e.stopPropagation();
}, { passive: false });

responsiveCamera()

if (turn_gui) {
    const gui = new GUI();
    // gui.close()

    // Camera GUI
    const cameraFolder = gui.addFolder("Camera");
    cameraFolder.add(camera.position, 'x').min(-10).max(10).step(0.1);
    cameraFolder.add(camera.position, 'y').min(-10).max(10).step(0.1);
    cameraFolder.add(camera.position, 'z').min(-10).max(10).step(0.1);

    // Material GUI
    const materialFolder = gui.addFolder("Material");
    materialFolder.add(material, "roughness", 0, 1, 0.001);
    materialFolder.add(material, "metalness", 0, 1, 0.001);

    // Light GUI
    const rectAreaLightFolder = gui.addFolder("Light");
    rectAreaLightFolder.add(rectAreaLight, "visible");
    rectAreaLightFolder.add(rectAreaLight, "intensity", 0, 5, 0.001);
    rectAreaLightFolder.addColor(rectAreaLight, "color").onChange((value) => {
        rectAreaLight.color.set(value);
    });
    rectAreaLightFolder.add(rectAreaLight, "width", 0, 20, 0.001);
    rectAreaLightFolder.add(rectAreaLight, "height", 0, 20, 0.001);
    rectAreaLightFolder.add(rectAreaLight.position, "x", -10, 10, 0.001);
    rectAreaLightFolder.add(rectAreaLight.position, "y", -10, 10, 0.001);
    rectAreaLightFolder.add(rectAreaLight.position, "z", -10, 10, 0.001);
    rectAreaLightFolder.add(rectAreaLight.rotation, "x", -Math.PI, Math.PI, 0.01).name('rotation x');

    // const ambientFolder = gui.addFolder("Ambient Light");
    // ambientFolder.add(ambientLight, "visible");
    // ambientFolder.add(ambientLight, "intensity", 0, 1, 0.001);
    // ambientFolder.addColor(ambientLight, "color").onChange((value) => {
    //     ambientLight.color.set(value);
    // });
}