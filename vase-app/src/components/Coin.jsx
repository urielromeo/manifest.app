import React, { useEffect, useRef, useState, useContext } from 'react';
import { RigidBody, CylinderCollider } from '@react-three/rapier';
import { VaseShatterContext } from './../App.jsx';

export default function Coin({ r = 0.4, h = 0.24, pos = [0, 2.5, 0], rot = [0, 0, 0] }) {
  const bodyRef = useRef(null);
  const { phase, center, trigger } = useContext(VaseShatterContext);
  const [ignoreCollisions, setIgnoreCollisions] = useState(false);
  const lastImpulseTrigger = useRef(null);

  // When the vase starts exploding, make coins fly away and ignore collisions with the vase
  useEffect(() => {
    if (phase !== 'exploding') return;
    // Prevent double-impulses across StrictMode mounts and repeated triggers
    if (lastImpulseTrigger.current === trigger) return;
    lastImpulseTrigger.current = trigger;

    setIgnoreCollisions(true); // temporarily make our collider a sensor

    const body = bodyRef.current;
    if (!body) return;

    // Compute direction from explosion center to coin and add upward bias
    const [cx, cy, cz] = center;
    const t = body.translation(); // { x, y, z }
    let dir = { x: t.x - cx, y: t.y - cy, z: t.z - cz };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

    const strength = 5 + Math.random() * 2; // tune to taste
    const upBias = 0.6;
    const impulse = {
      x: dir.x * strength,
      y: dir.y * strength + strength * upBias,
      z: dir.z * strength,
    };
    const torque = {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 4,
      z: (Math.random() - 0.5) * 2,
    };

    try {
      body.applyImpulse(impulse, true);
      body.applyTorqueImpulse(torque, true);
      body.setLinearDamping(0.4);
      body.setAngularDamping(0.3);
    } catch {}
  }, [phase, center, trigger]);

  // When shatter completes, allow parent to remove us by not rendering anything
  if (phase === 'done') return null;

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      position={pos}
      rotation={rot}
      restitution={0.05}
      friction={1}
      linearDamping={0.05}
      angularDamping={0.2}
      ccd
      canSleep
    >
      {/* Rapier cylinder is aligned on Y: args = [halfHeight, radius] */}
      <CylinderCollider args={[h / 2, r]} sensor={ignoreCollisions} />
      {/* Visual matches the collider exactly */}
      <mesh>
        <cylinderGeometry args={[r, r, h, 24]} />
        <meshStandardMaterial color="#FFD700" metalness={1} roughness={0.2} />
      </mesh>
    </RigidBody>
  );
}
