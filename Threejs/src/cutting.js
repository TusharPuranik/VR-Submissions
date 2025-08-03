// Cloth Cutting System
import * as THREE from 'three';

// 2D triangle intersection test
export function segmentIntersectsTriangle(p1, p2, a, b, c) {
    const edges = [
        [a, b],
        [b, c],
        [c, a]
    ];

    for (const [v1, v2] of edges) {
        if (segmentsIntersect2D(p1, p2, v1, v2)) return true;
    }

    return pointInTriangle2D(p1, a, b, c);
}

// 2D segment-segment intersection (XZ plane)
function segmentsIntersect2D(p1, p2, q1, q2) {
    function cross(u, v) {
        return u.x * v.z - u.z * v.x;
    }

    const r = new THREE.Vector3().subVectors(p2, p1);
    const s = new THREE.Vector3().subVectors(q2, q1);
    const pq = new THREE.Vector3().subVectors(q1, p1);
    const denom = cross(r, s);

    if (denom === 0) return false;

    const t = cross(pq, s) / denom;
    const u = cross(pq, r) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// 2D point in triangle test (XZ plane)
function pointInTriangle2D(p, a, b, c) {
    const v0 = new THREE.Vector2(c.x - a.x, c.z - a.z);
    const v1 = new THREE.Vector2(b.x - a.x, b.z - a.z);
    const v2 = new THREE.Vector2(p.x - a.x, p.z - a.z);

    const dot00 = v0.dot(v0);
    const dot01 = v0.dot(v1);
    const dot02 = v0.dot(v2);
    const dot11 = v1.dot(v1);
    const dot12 = v1.dot(v2);

    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    return u >= 0 && v >= 0 && u + v <= 1;
}

// Create a clean tear by identifying triangles that cross the cut line
export function createCleanTear(cutPoints, clothGeometry) {
    const positionAttr = clothGeometry.attributes.position;
    const indexAttr = clothGeometry.index;
    const colorAttr = clothGeometry.attributes.color;

    const intersectedTriangles = new Set();
    const adjacentTriangles = new Set();
    const verticesNearCut = new Set();

    // Find all triangles that intersect with the cut line
    for (let i = 0; i < indexAttr.count; i += 3) {
        const a = indexAttr.getX(i);
        const b = indexAttr.getX(i + 1);
        const c = indexAttr.getX(i + 2);

        const va = new THREE.Vector3().fromBufferAttribute(positionAttr, a);
        const vb = new THREE.Vector3().fromBufferAttribute(positionAttr, b);
        const vc = new THREE.Vector3().fromBufferAttribute(positionAttr, c);

        // The geometry is already rotated, so we need to work in the current coordinate system
        // Convert the triangle vertices to the same coordinate system as our cut points (XZ plane, y=0)
        const vaFlat = new THREE.Vector3(va.x, 0, va.z);
        const vbFlat = new THREE.Vector3(vb.x, 0, vb.z);
        const vcFlat = new THREE.Vector3(vc.x, 0, vc.z);

        // Check if any segment of the cut line intersects this triangle
        let triangleIntersected = false;
        for (let j = 1; j < cutPoints.length; j++) {
            if (segmentIntersectsTriangle(cutPoints[j - 1], cutPoints[j], vaFlat, vbFlat, vcFlat)) {
                triangleIntersected = true;
                break;
            }
        }

        if (triangleIntersected) {
            intersectedTriangles.add(Math.floor(i / 3));
            verticesNearCut.add(a);
            verticesNearCut.add(b);
            verticesNearCut.add(c);

            // Color intersected triangles red for visualization
            colorAttr.setXYZ(a, 1, 0, 0);
            colorAttr.setXYZ(b, 1, 0, 0);
            colorAttr.setXYZ(c, 1, 0, 0);
        }
    }

    // Find adjacent triangles (triangles that share vertices with intersected triangles)
    for (let i = 0; i < indexAttr.count; i += 3) {
        const triangleIndex = Math.floor(i / 3);

        // Skip if already intersected
        if (intersectedTriangles.has(triangleIndex)) continue;

        const a = indexAttr.getX(i);
        const b = indexAttr.getX(i + 1);
        const c = indexAttr.getX(i + 2);

        // Check if this triangle shares any vertices with the cut
        if (verticesNearCut.has(a) || verticesNearCut.has(b) || verticesNearCut.has(c)) {
            adjacentTriangles.add(triangleIndex);

            // Color adjacent triangles orange for visualization
            colorAttr.setXYZ(a, 1, 0.5, 0);
            colorAttr.setXYZ(b, 1, 0.5, 0);
            colorAttr.setXYZ(c, 1, 0.5, 0);
        }
    }

    colorAttr.needsUpdate = true;
    console.log(`Found ${intersectedTriangles.size} intersected triangles and ${adjacentTriangles.size} adjacent triangles`);

    return {
        intersectedTriangles,
        adjacentTriangles,
        verticesNearCut,
        cutPoints
    };
}

// Rebuild geometry with realistic cloth tear - no triangles removed, just restructured
export function rebuildGeometryWithCleanTear(tearData, clothGeometry, scene, clothMesh, clothMaterial) {
    const { intersectedTriangles, adjacentTriangles, verticesNearCut, cutPoints } = tearData;

    const oldPositions = clothGeometry.attributes.position.array;
    const oldColors = clothGeometry.attributes.color.array;
    const oldIndices = clothGeometry.index.array;

    // Create new arrays for positions and colors
    const newPositions = Array.from(oldPositions);
    const newColors = Array.from(oldColors);
    const newIndices = Array.from(oldIndices); // Start with all original triangles

    const tearGap = 0.05; // Gap width for the tear (balanced for visibility and realism)
    const vertexDuplicateMap = new Map(); // original vertex index -> [leftDuplicate, rightDuplicate]

    // Step 1: For each vertex that's part of intersected triangles, create two duplicates
    for (const vertexIndex of verticesNearCut) {
        const originalPos = new THREE.Vector3(
            oldPositions[vertexIndex * 3],
            oldPositions[vertexIndex * 3 + 1],
            oldPositions[vertexIndex * 3 + 2]
        );

        // Find the nearest segment on the cut line to determine offset direction
        let nearestSegment = null;
        let minDist = Infinity;

        for (let i = 1; i < cutPoints.length; i++) {
            const segStart = cutPoints[i - 1];
            const segEnd = cutPoints[i];
            const dist = pointToSegmentDistanceXZ(originalPos, segStart, segEnd);

            if (dist < minDist) {
                minDist = dist;
                nearestSegment = { start: segStart, end: segEnd };
            }
        }

        if (nearestSegment) {
            // Calculate perpendicular direction to the cut line
            const segDir = new THREE.Vector3()
                .subVectors(nearestSegment.end, nearestSegment.start)
                .normalize();
            const perpDir = new THREE.Vector3(-segDir.z, 0, segDir.x).normalize();

            // Create two offset positions - one for each side of the tear
            const leftPos = originalPos.clone().add(perpDir.clone().multiplyScalar(tearGap / 2));
            const rightPos = originalPos.clone().add(perpDir.clone().multiplyScalar(-tearGap / 2));

            // Add left duplicate vertex
            const leftIndex = newPositions.length / 3;
            newPositions.push(leftPos.x, leftPos.y, leftPos.z);
            newColors.push(
                oldColors[vertexIndex * 3],
                oldColors[vertexIndex * 3 + 1],
                oldColors[vertexIndex * 3 + 2]
            );

            // Add right duplicate vertex
            const rightIndex = newPositions.length / 3;
            newPositions.push(rightPos.x, rightPos.y, rightPos.z);
            newColors.push(
                oldColors[vertexIndex * 3],
                oldColors[vertexIndex * 3 + 1],
                oldColors[vertexIndex * 3 + 2]
            );

            vertexDuplicateMap.set(vertexIndex, { left: leftIndex, right: rightIndex });
        }
    }

    // Step 2: Update triangle indices to use the appropriate duplicate vertices
    for (let i = 0; i < oldIndices.length; i += 3) {
        const triangleIndex = Math.floor(i / 3);
        const a = oldIndices[i];
        const b = oldIndices[i + 1];
        const c = oldIndices[i + 2];

        // If this triangle intersects the cut line OR is adjacent to it, we need to restructure it
        if (intersectedTriangles.has(triangleIndex) || adjacentTriangles.has(triangleIndex)) {
            // Calculate triangle center to determine which side of the cut it's on
            const triangleCenter = new THREE.Vector3();
            triangleCenter.add(new THREE.Vector3(oldPositions[a * 3], oldPositions[a * 3 + 1], oldPositions[a * 3 + 2]));
            triangleCenter.add(new THREE.Vector3(oldPositions[b * 3], oldPositions[b * 3 + 1], oldPositions[b * 3 + 2]));
            triangleCenter.add(new THREE.Vector3(oldPositions[c * 3], oldPositions[c * 3 + 1], oldPositions[c * 3 + 2]));
            triangleCenter.divideScalar(3);

            // Convert triangle center to the same coordinate system as cut points (flatten to XZ plane)
            const triangleCenterFlat = new THREE.Vector3(triangleCenter.x, 0, triangleCenter.z);

            // Find the nearest cut segment
            let nearestSegment = null;
            let minDist = Infinity;

            for (let j = 1; j < cutPoints.length; j++) {
                const segStart = cutPoints[j - 1];
                const segEnd = cutPoints[j];
                const dist = pointToSegmentDistanceXZ(triangleCenterFlat, segStart, segEnd);

                if (dist < minDist) {
                    minDist = dist;
                    nearestSegment = { start: segStart, end: segEnd };
                }
            }

            if (nearestSegment) {
                // Calculate perpendicular direction to the cut line
                const segDir = new THREE.Vector3()
                    .subVectors(nearestSegment.end, nearestSegment.start)
                    .normalize();
                const perpDir = new THREE.Vector3(-segDir.z, 0, segDir.x).normalize();

                // Use triangle center to determine the overall side, but with better accuracy
                // This prevents vertices of the same triangle from going to different sides
                const toTriangle = new THREE.Vector3().subVectors(triangleCenterFlat, nearestSegment.start);
                const triangleSide = toTriangle.dot(perpDir);

                // Use the triangle's side determination for all its vertices to maintain consistency
                const useLeftSide = triangleSide > 0;

                // Use appropriate duplicate vertices based on the triangle's side
                const newA = vertexDuplicateMap.has(a) ?
                    (useLeftSide ? vertexDuplicateMap.get(a).left : vertexDuplicateMap.get(a).right) : a;
                const newB = vertexDuplicateMap.has(b) ?
                    (useLeftSide ? vertexDuplicateMap.get(b).left : vertexDuplicateMap.get(b).right) : b;
                const newC = vertexDuplicateMap.has(c) ?
                    (useLeftSide ? vertexDuplicateMap.get(c).left : vertexDuplicateMap.get(c).right) : c;

                // Update the triangle indices
                newIndices[i] = newA;
                newIndices[i + 1] = newB;
                newIndices[i + 2] = newC;
            }
        }
        // Non-intersected and non-adjacent triangles keep their original indices (already copied)
    }

    // Create new geometry
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPositions), 3));
    newGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(newColors), 3));
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();
    // Don't apply rotation - the positions are already in the rotated coordinate system

    // Replace the mesh
    scene.remove(clothMesh);
    clothMesh.geometry.dispose();
    clothMesh.material.dispose();

    const newClothMesh = new THREE.Mesh(newGeometry, clothMaterial);
    scene.add(newClothMesh);

    console.log(`Created realistic tear: restructured ${intersectedTriangles.size} triangles, duplicated ${vertexDuplicateMap.size} vertices`);
    console.log(`Total vertices: ${newPositions.length / 3}, Original vertices: ${oldPositions.length / 3}`);

    return newClothMesh;
}

// Utility function for point to segment distance calculation
export function pointToSegmentDistanceXZ(p, a, b) {
    const ap = new THREE.Vector2(p.x - a.x, p.z - a.z);
    const ab = new THREE.Vector2(b.x - a.x, b.z - a.z);
    const abLen = ab.lengthSq();
    const t = Math.max(0, Math.min(1, ap.dot(ab) / abLen));
    const proj = new THREE.Vector2(a.x, a.z).add(ab.multiplyScalar(t));
    return new THREE.Vector2(p.x, p.z).distanceTo(proj);
}