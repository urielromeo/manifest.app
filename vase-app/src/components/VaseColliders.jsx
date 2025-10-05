import React, { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { RigidBody, MeshCollider } from '@react-three/rapier';
import { MODEL_URL } from './VaseModel.jsx';

// No effect-based centering; we'll compute and bake a centering transform during merge

export default function VaseColliders({ sensor = false }) {
  const { scene } = useGLTF(MODEL_URL);
  const colliderRoot = useMemo(() => (scene ? scene.clone(true) : null), [scene]);


  // A single invisible material reused by all collider meshes so renderer never sees undefined material
  const invisibleMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    m.visible = false;
    return m;
  }, []);

  // Cache double-sided geometries so we don't rebuild every render
  const doubleSidedCache = useMemo(() => new WeakMap(), []);
  const getDoubleSidedGeometry = useCallback((srcGeom) => {
    if (!srcGeom) return null;
    const cached = doubleSidedCache.get(srcGeom);
    if (cached) return cached;

    // Clone to avoid mutating source
    const geom = srcGeom.clone();
    const posAttr = geom.getAttribute('position');
    if (!posAttr) {
      doubleSidedCache.set(srcGeom, geom);
      return geom;
    }

    // Build an index if missing (0..N-1)
    let idx = geom.getIndex();
    let srcIndexArray;
    if (!idx) {
      const count = posAttr.count;
      srcIndexArray = new (count > 65535 ? Uint32Array : Uint16Array)(count);
      for (let i = 0; i < count; i++) srcIndexArray[i] = i;
    } else {
      const arr = idx.array;
      // Ensure we have a typed array we can read
      srcIndexArray = arr instanceof Uint32Array || arr instanceof Uint16Array || arr instanceof Uint8Array
        ? arr
        : new Uint32Array(arr);
    }

    // Create doubled index with reversed winding for the second half
    const IndexClass = (srcIndexArray.length * 2 > 65535) ? Uint32Array : Uint16Array;
    const doubled = new IndexClass(srcIndexArray.length * 2);
    // First half: original
    doubled.set(srcIndexArray, 0);
    // Second half: reversed triangle order (a, c, b)
    for (let i = 0, j = srcIndexArray.length; i < srcIndexArray.length; i += 3, j += 3) {
      const a = srcIndexArray[i];
      const b = srcIndexArray[i + 1];
      const c = srcIndexArray[i + 2];
      doubled[j] = a;
      doubled[j + 1] = c;
      doubled[j + 2] = b;
    }
    geom.setIndex(new THREE.BufferAttribute(doubled, 1));
    // Normals are irrelevant for physics, but keep geometry valid
    // geom.computeVertexNormals(); // optional

    doubleSidedCache.set(srcGeom, geom);
    return geom;
  }, [doubleSidedCache]);

  // Merge all child meshes into a single BufferGeometry in local space for a clean trimesh collider
  const mergedGeometry = useMemo(() => {
    if (!colliderRoot) return null;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const indices = [];
    let indexOffset = 0;
    const v = new THREE.Vector3();
    colliderRoot.updateMatrixWorld(true);
    // Build a centering matrix that matches VaseModel: XZ to 0, base Y to 0
    const originalBox = new THREE.Box3().setFromObject(colliderRoot);
    const center = originalBox.getCenter(new THREE.Vector3());
    const centerOffset = new THREE.Matrix4().makeTranslation(-center.x, 0, -center.z);
    // After XZ shift, compute base offset
    const tempRoot = colliderRoot.clone(true);
    tempRoot.applyMatrix4(centerOffset);
    const shiftedBox = new THREE.Box3().setFromObject(tempRoot);
    const baseY = shiftedBox.min.y;
    const baseOffset = new THREE.Matrix4().makeTranslation(0, -baseY, 0);
    const rootMat = new THREE.Matrix4().multiplyMatrices(baseOffset, centerOffset);
    colliderRoot.traverse((o) => {
      if (!(o.isMesh && o.geometry)) return;
      // Make geometry double-sided
      const g = getDoubleSidedGeometry(o.geometry);
      // Clone attributes to avoid mutating source
      const posAttr = g.getAttribute('position');
      if (!posAttr) return;
      const idxAttr = g.getIndex();
      // Transform positions using full hierarchy via matrixWorld, relative to the centered root
      const finalMat = new THREE.Matrix4().multiplyMatrices(rootMat, o.matrixWorld);
      // Push transformed positions
      for (let i = 0; i < posAttr.count; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(finalMat);
        positions.push(v.x, v.y, v.z);
      }
      // Push indices with offset
      if (idxAttr) {
        const arr = idxAttr.array;
        for (let i = 0; i < arr.length; i++) indices.push(arr[i] + indexOffset);
      } else {
        // No index: assume triangles in order
        for (let i = 0; i < posAttr.count; i++) indices.push(i + indexOffset);
      }
      indexOffset += posAttr.count;
    });
    if (positions.length === 0) return null;
    const posArray = new Float32Array(positions);
    const IndexClass = (indices.length > 65535) ? Uint32Array : Uint16Array;
    const idxArray = new IndexClass(indices);
    geom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geom.setIndex(new THREE.BufferAttribute(idxArray, 1));
    // No normals/uvs needed for physics
    return geom;
  }, [colliderRoot, getDoubleSidedGeometry]);

  // Provide children meshes for MeshCollider usage in parent
  if (!colliderRoot || !mergedGeometry) return null;
  return (
    <RigidBody type="fixed">
      <MeshCollider type="trimesh" sensor={sensor}>
        <mesh geometry={mergedGeometry} visible={false} material={invisibleMaterial} name="VaseTrimeshCollider" />
      </MeshCollider>
    </RigidBody>
  );
}
