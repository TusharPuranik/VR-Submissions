// Physics System for Cloth Simulation
import * as THREE from 'three';

// Physics state
export let physicsMode = 'none'; // 'none', 'gravity', 'tension'
export let physicsEnabled = false;
export let vertexVelocities = [];
export let vertexMasses = [];
export let springConnections = [];
export let pinnedVertices = new Set(); // Vertices that are fixed in place

// Physics properties
export const physicsProperties = {
    gravity: -4.0, // Natural gravity for realistic falling
    damping: 0.995, // Light damping to allow natural movement
    mass: 0.02, // Light mass for cloth-like behavior
    springStiffness: 4.0, // Flexible springs for natural cloth behavior
    restLength: 0.075, // Distance between adjacent vertices (3/40)
    timeStep: 0.016, // ~60fps
    maxVelocity: 12.0, // Allow natural movement speed
    structuralStiffness: 4.0, // Same as springStiffness for consistency
    bendingStiffness: 1.0 // Light bending resistance for natural draping
};

// Set Physics Mode
export function setPhysicsMode(mode, clothMesh) {
    physicsMode = mode;
    physicsEnabled = mode !== 'none';

    if (physicsEnabled) {
        // Reset cloth to original position when enabling physics
        resetClothPosition(clothMesh);
        initializePhysics(clothMesh);

        // Pin edges for gravity mode
        if (mode === 'gravity') {
            pinClothEdges(clothMesh);
        }
    } else {
        // Clear pinned vertices and reset cloth when physics is disabled
        pinnedVertices.clear();
        resetClothPosition(clothMesh);
    }

    console.log(`Physics mode set to: ${mode}`);

    // Update button styles to show active mode
    updateButtonStyles(mode);
}

// Reset cloth to original flat position
function resetClothPosition(clothMesh) {
    if (!clothMesh || !clothMesh.geometry) return;

    const positionAttr = clothMesh.geometry.attributes.position;
    const positions = positionAttr.array;

    // Reset to original flat plane position
    const originalGeometry = new THREE.PlaneGeometry(3, 2.5, 40, 30);
    originalGeometry.rotateX(-Math.PI / 2);
    const originalPositions = originalGeometry.attributes.position.array;

    // Copy original positions back
    for (let i = 0; i < positions.length; i++) {
        positions[i] = originalPositions[i];
    }

    positionAttr.needsUpdate = true;

    // Reset velocities if they exist
    if (vertexVelocities.length > 0) {
        for (let i = 0; i < vertexVelocities.length; i++) {
            vertexVelocities[i].set(0, 0, 0);
        }
    }

    console.log('Cloth position reset to original flat state');
}

// Update button styles
function updateButtonStyles(activeMode) {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        const isActive = btn.textContent.toLowerCase().includes(activeMode) ||
            (activeMode === 'none' && btn.textContent === 'No Physics');
        btn.style.backgroundColor = isActive ? '#4CAF50' : '#666';
    });
}

// Pin cloth edges (two adjacent edges)
function pinClothEdges(clothMesh) {
    if (!clothMesh || !clothMesh.geometry) return;

    const positionAttr = clothMesh.geometry.attributes.position;
    const positions = positionAttr.array;
    pinnedVertices.clear();

    // Cloth is 3x2.5 units, 40x30 subdivisions
    // Pin only the top edge for natural hanging like a curtain
    for (let i = 0; i < positionAttr.count; i++) {
        const z = positions[i * 3 + 2];

        // Pin only top edge (z ≈ 1.25 for 2.5 unit height)
        if (Math.abs(z - 1.25) < 0.1) {
            pinnedVertices.add(i);
        }
    }

    console.log(`Pinned ${pinnedVertices.size} vertices for cloth hanging`);
}

// Initialize Physics System
export function initializePhysics(clothMesh) {
    if (!clothMesh || !clothMesh.geometry) {
        console.warn('Cannot initialize physics: cloth mesh not ready');
        return;
    }

    const positionAttr = clothMesh.geometry.attributes.position;
    const vertexCount = positionAttr.count;

    // Initialize velocities and masses for each vertex
    vertexVelocities = [];
    vertexMasses = [];

    for (let i = 0; i < vertexCount; i++) {
        vertexVelocities.push(new THREE.Vector3(0, 0, 0));
        vertexMasses.push(physicsProperties.mass);
    }

    // Create spring connections between adjacent vertices
    createSpringConnections(clothMesh);

    console.log(`Physics initialized with ${vertexCount} vertices`);
}

// Create Spring Connections
function createSpringConnections(clothMesh) {
    springConnections = [];

    if (!clothMesh || !clothMesh.geometry || !clothMesh.geometry.index) {
        console.warn('Cannot create spring connections: geometry not ready');
        return;
    }

    const positionAttr = clothMesh.geometry.attributes.position;
    const indexAttr = clothMesh.geometry.index;

    // Create structural springs (triangle edges)
    for (let i = 0; i < indexAttr.count; i += 3) {
        const a = indexAttr.getX(i);
        const b = indexAttr.getX(i + 1);
        const c = indexAttr.getX(i + 2);

        // Add structural springs for each edge of the triangle
        addSpring(a, b, 'structural');
        addSpring(b, c, 'structural');
        addSpring(c, a, 'structural');
    }

    // Only use triangle-based springs for natural cloth behavior
    // The triangle edges provide sufficient structure for realistic cloth physics

    console.log(`Created ${springConnections.length} spring connections`);
}

// Add Spring Connection
function addSpring(vertexA, vertexB, type = 'structural') {
    // Check if this spring already exists
    const exists = springConnections.some(spring =>
        (spring.a === vertexA && spring.b === vertexB) ||
        (spring.a === vertexB && spring.b === vertexA)
    );

    if (!exists) {
        springConnections.push({
            a: vertexA,
            b: vertexB,
            restLength: physicsProperties.restLength,
            stiffness: physicsProperties.springStiffness
        });
    }
}

// Physics Update Loop
export function updatePhysics(clothMesh) {
    if (!physicsEnabled || !clothMesh || !clothMesh.geometry) return;

    const positionAttr = clothMesh.geometry.attributes.position;
    if (!positionAttr) return;

    const positions = positionAttr.array;

    if (physicsMode === 'gravity') {
        updateGravityPhysics(positions);
    } else if (physicsMode === 'tension') {
        updateTensionPhysics(positions);
    }

    positionAttr.needsUpdate = true;
}

// Gravity Physics Update
function updateGravityPhysics(positions) {
    const deltaTime = physicsProperties.timeStep;

    // First apply gravity and update positions
    for (let i = 0; i < vertexVelocities.length; i++) {
        // Skip pinned vertices
        if (pinnedVertices.has(i)) continue;

        const velocity = vertexVelocities[i];

        // Apply gravity uniformly to all non-pinned vertices
        velocity.y += physicsProperties.gravity * deltaTime;

        // Apply damping (air resistance)
        velocity.multiplyScalar(physicsProperties.damping);

        // Update position
        positions[i * 3] += velocity.x * deltaTime;
        positions[i * 3 + 1] += velocity.y * deltaTime;
        positions[i * 3 + 2] += velocity.z * deltaTime;

        // Simple ground collision (prevent falling through y = -5)
        if (positions[i * 3 + 1] < -5) {
            positions[i * 3 + 1] = -5;
            velocity.y = Math.max(0, velocity.y * -0.3); // Bounce with energy loss
        }
    }

    // Then apply spring forces to maintain cloth structure
    applySpringForces(positions);
}

// Apply Spring Forces
function applySpringForces(positions) {
    const forces = new Array(vertexVelocities.length).fill(null).map(() => new THREE.Vector3(0, 0, 0));

    // Calculate spring forces
    for (const spring of springConnections) {
        const posA = new THREE.Vector3(
            positions[spring.a * 3],
            positions[spring.a * 3 + 1],
            positions[spring.a * 3 + 2]
        );

        const posB = new THREE.Vector3(
            positions[spring.b * 3],
            positions[spring.b * 3 + 1],
            positions[spring.b * 3 + 2]
        );

        const direction = new THREE.Vector3().subVectors(posB, posA);
        const currentLength = direction.length();

        if (currentLength > 0) {
            direction.normalize();

            // Spring force = stiffness * (current_length - rest_length)
            const force = direction.multiplyScalar(
                spring.stiffness * (currentLength - spring.restLength)
            );

            // Apply equal and opposite forces (but not to pinned vertices)
            if (!pinnedVertices.has(spring.a)) {
                forces[spring.a].add(force);
            }
            if (!pinnedVertices.has(spring.b)) {
                forces[spring.b].sub(force);
            }
        }
    }

    // Apply forces to velocities
    const deltaTime = physicsProperties.timeStep;
    for (let i = 0; i < forces.length; i++) {
        if (pinnedVertices.has(i)) continue; // Skip pinned vertices

        const acceleration = forces[i].divideScalar(vertexMasses[i]);
        vertexVelocities[i].add(acceleration.multiplyScalar(deltaTime));
    }
}

// Tension Physics Update (placeholder for future implementation)
function updateTensionPhysics(positions) {
    // This will be implemented when we add the tension system
    console.log('Tension physics not yet implemented');
}