import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPhysicsUI } from './ui.js';
import { setPhysicsMode, updatePhysics } from './physics.js';
import { createCleanTear, rebuildGeometryWithCleanTear } from './cutting.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 3, 5);

// Rendering and attaching to DOM
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

// Cloth mesh (XZ-plane) - smaller size for better hanging
const clothGeometry = new THREE.PlaneGeometry(3, 2.5, 40, 30);
clothGeometry.rotateX(-Math.PI / 2);

// Vertex colors initialization
const positionAttr = clothGeometry.attributes.position;
const initialColors = new Float32Array(positionAttr.count * 3);
for (let i = 0; i < positionAttr.count; i++) {
  initialColors[i * 3 + 0] = 0.4;
  initialColors[i * 3 + 1] = 0.7;
  initialColors[i * 3 + 2] = 0.85;
}
clothGeometry.setAttribute('color', new THREE.BufferAttribute(initialColors, 3));

// Material with vertexColors
const clothMaterial = new THREE.MeshBasicMaterial({
  wireframe: true,
  vertexColors: true,
});
let clothMesh = new THREE.Mesh(clothGeometry, clothMaterial);
scene.add(clothMesh);

// Create UI for physics modes
createPhysicsUI(clothMesh);

// Make setPhysicsMode globally available for UI buttons
window.setPhysicsMode = (mode) => {
  window.physicsMode = mode; // Store mode globally
  setPhysicsMode(mode, clothMesh);
};

// Resize handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Drawing state
let isCtrlPressed = false;
let isDrawing = false;
let drawingPoints = [];
let drawingLine = null;

// Camera state for cutting mode
let savedCameraPosition = new THREE.Vector3();
let savedCameraTarget = new THREE.Vector3();
let isInCuttingMode = false;

const MIN_DISTANCE = 0.01;

// Key controls
window.addEventListener('keydown', (e) => {
  if (e.key === 'Control') {
    isCtrlPressed = true;
    controls.enabled = true;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Control') {
    isCtrlPressed = false;
    controls.enabled = false;
  }
});

// Mouse events
window.addEventListener('mousedown', (e) => {
  if (!isCtrlPressed && e.button === 0) {
    isDrawing = true;
    drawingPoints = [];

    // Only switch to top-down view if physics is disabled
    // In gravity mode, allow cutting in current 3D view
    const physicsEnabled = window.physicsMode && window.physicsMode !== 'none';

    if (!physicsEnabled && !isInCuttingMode) {
      // Save current camera state and switch to top-down view for no-physics mode
      savedCameraPosition.copy(camera.position);
      savedCameraTarget.copy(controls.target);

      // Smoothly transition to top-down view
      isInCuttingMode = true;
      controls.enabled = false;

      // Set camera directly above the cloth center
      camera.position.set(0, 5, 0);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
    }

    if (drawingLine) {
      scene.remove(drawingLine);
      drawingLine.geometry.dispose();
      drawingLine.material.dispose();
      drawingLine = null;
    }
  }
});

window.addEventListener('mouseup', () => {
  if (isDrawing) {
    isDrawing = false;

    // Perform the cut and get the new mesh
    if (drawingPoints.length >= 2) {
      const physicsEnabled = window.physicsMode && window.physicsMode !== 'none';

      // In physics mode, use 3D points; in no-physics mode, flatten to y=0
      const points = physicsEnabled ?
        drawingPoints.slice() : // Keep 3D points for physics mode
        drawingPoints.map(p => new THREE.Vector3(p.x, 0, p.z)); // Flatten for no-physics mode

      const tearData = createCleanTear(points, clothGeometry);
      if (tearData) {
        const newMesh = rebuildGeometryWithCleanTear(tearData, clothGeometry, scene, clothMesh, clothMaterial);
        if (newMesh) {
          clothMesh = newMesh; // Update the cloth mesh reference
          clothGeometry.copy(newMesh.geometry); // Update geometry reference

          // Reinitialize physics for the new geometry if physics is enabled
          if (physicsEnabled) {
            setPhysicsMode(window.physicsMode, clothMesh);
          }
        }
      }
    }

    // Remove the drawing line after cutting
    if (drawingLine) {
      scene.remove(drawingLine);
      drawingLine.geometry.dispose();
      drawingLine.material.dispose();
      drawingLine = null;
    }

    // Restore camera position after cutting
    if (isInCuttingMode) {
      camera.position.copy(savedCameraPosition);
      camera.lookAt(savedCameraTarget);
      controls.target.copy(savedCameraTarget);
      controls.enabled = false; // Keep disabled until Ctrl is pressed
      isInCuttingMode = false;
    }
  }
});

window.addEventListener('mousemove', (event) => {
  if (!isDrawing || isCtrlPressed) return;

  // Use proper mouse coordinate conversion
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);

  const physicsEnabled = window.physicsMode && window.physicsMode !== 'none';

  if (physicsEnabled) {
    // In physics mode, still use the flat plane intersection but project to cloth surface
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
      // Clamp to cloth bounds (3x2.5 cloth centered at origin)
      if (Math.abs(intersectionPoint.x) <= 1.5 && Math.abs(intersectionPoint.z) <= 1.25) {
        const point = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);

        if (
          drawingPoints.length === 0 ||
          point.distanceTo(drawingPoints[drawingPoints.length - 1]) > MIN_DISTANCE
        ) {
          drawingPoints.push(point);
          drawLineFromPoints(drawingPoints);
        }
      }
    }
  } else {
    // In no-physics mode, use the flat plane intersection (original method)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectionPoint = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
      // Clamp to cloth bounds (3x2.5 cloth centered at origin)
      if (Math.abs(intersectionPoint.x) <= 1.5 && Math.abs(intersectionPoint.z) <= 1.25) {
        const point = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);

        if (
          drawingPoints.length === 0 ||
          point.distanceTo(drawingPoints[drawingPoints.length - 1]) > MIN_DISTANCE
        ) {
          drawingPoints.push(point);
          drawLineFromPoints(drawingPoints);
        }
      }
    }
  }
});

// Draw line visually
function drawLineFromPoints(points) {
  if (drawingLine) {
    scene.remove(drawingLine);
    drawingLine.geometry.dispose();
    drawingLine.material.dispose();
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
  drawingLine = new THREE.Line(geometry, material);
  scene.add(drawingLine);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Update physics if enabled
  updatePhysics(clothMesh);

  renderer.render(scene, camera);
}

// Start the animation loop
animate();