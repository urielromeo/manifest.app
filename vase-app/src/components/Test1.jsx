import React, { useEffect, useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import VaseModel from "./VaseModel.jsx";
import Coin from './Coin.jsx';



export default function Test1Page() {
  const [coins, setCoins] = useState([]);

  const spawnCoin = useCallback(() => {
    setCoins(prev => [
      ...prev,
      { 
        id: Date.now() + Math.random(), 
        position: [0, 20, 0],
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI] 
      }
    ]);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        spawnCoin();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [spawnCoin]);

  return (
    <div style={{ width: "100vw", height: "100svh", overflow: "hidden" }}>
      <Canvas camera={{ position: [0, 14, 20], fov: 45 }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
        <Environment preset="studio" background={false} resolution={256} blur={0.3}  />
        {/* <color attach="background" args={['#111115']} /> */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[6, 10, 6]} intensity={1} />
        <OrbitControls makeDefault enableDamping />
        <Physics gravity={[0, -9.81, 0]} timeStep={1/90}>
          <RigidBody type="fixed" colliders="trimesh">
            <VaseModel scale={1} position={[0, 0, 0]} />
            {/* Invisible inner colliders approximating the vase walls/base */}
            <CuboidCollider args={[0.05, 1.2, 0.8]} position={[0.85, 1.2, 0]} />
            <CuboidCollider args={[0.05, 1.2, 0.8]} position={[-0.85, 1.2, 0]} />
            <CuboidCollider args={[0.8, 1.2, 0.05]} position={[0, 1.2, 0.85]} />
            <CuboidCollider args={[0.8, 1.2, 0.05]} position={[0, 1.2, -0.85]} />
            <CuboidCollider args={[0.8, 0.05, 0.8]} position={[0, 0.15, 0]} />
          </RigidBody>
          {coins.map(c => (
            <Coin key={c.id} r={1.5} h={0.24} pos={c.position} rot={c.rotation} />
          ))}
          {/* Static ground with a collider */}
          <RigidBody type="fixed">
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
              <planeGeometry args={[50, 50]} />
              <meshStandardMaterial />
            </mesh>
            <CuboidCollider args={[25, 0.1, 25]} position={[0, 0, 0]} />
          </RigidBody>
        </Physics>
      </Canvas>
    </div>
  );
}