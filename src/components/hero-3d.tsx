"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, Sparkles } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

const MODULE_COLORS = ["#f97316", "#2dd4bf", "#ffa04d", "#38bdf8", "#f97316", "#2dd4bf"];

function CoreSphere() {
  const outer = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (outer.current) {
      outer.current.rotation.y += delta * 0.25;
      outer.current.rotation.x += delta * 0.08;
    }
    if (inner.current) {
      inner.current.rotation.y -= delta * 0.4;
      const s = 1 + Math.sin(state.clock.elapsedTime * 1.6) * 0.05;
      inner.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      <mesh ref={outer}>
        <icosahedronGeometry args={[1.55, 1]} />
        <meshBasicMaterial color="#2dd4bf" wireframe transparent opacity={0.35} />
      </mesh>
      <mesh ref={inner}>
        <icosahedronGeometry args={[0.95, 0]} />
        <meshStandardMaterial
          color="#f97316"
          emissive="#ea580c"
          emissiveIntensity={0.55}
          metalness={0.65}
          roughness={0.25}
          flatShading
        />
      </mesh>
    </group>
  );
}

function OrbitingModules() {
  const group = useRef<THREE.Group>(null);
  const positions = useMemo(
    () =>
      MODULE_COLORS.map((_, i) => {
        const angle = (i / MODULE_COLORS.length) * Math.PI * 2;
        return [Math.cos(angle) * 2.7, Math.sin(angle * 2) * 0.55, Math.sin(angle) * 2.7] as const;
      }),
    []
  );

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.22;
  });

  return (
    <group ref={group}>
      {positions.map((pos, i) => (
        <Float key={i} speed={2.2} rotationIntensity={0.9} floatIntensity={1.1}>
          <mesh position={[pos[0], pos[1], pos[2]]}>
            <boxGeometry args={[0.52, 0.52, 0.52]} />
            <meshStandardMaterial
              color={MODULE_COLORS[i]}
              emissive={MODULE_COLORS[i]}
              emissiveIntensity={0.3}
              metalness={0.5}
              roughness={0.3}
            />
          </mesh>
        </Float>
      ))}
    </group>
  );
}

function RingSystem() {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ring1.current) ring1.current.rotation.z += delta * 0.12;
    if (ring2.current) ring2.current.rotation.z -= delta * 0.09;
  });
  return (
    <group>
      <mesh ref={ring1} rotation={[Math.PI / 2.15, 0, 0]}>
        <torusGeometry args={[2.7, 0.016, 12, 120]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.6} />
      </mesh>
      <mesh ref={ring2} rotation={[Math.PI / 1.75, 0.4, 0]}>
        <torusGeometry args={[3.3, 0.01, 12, 120]} />
        <meshBasicMaterial color="#2dd4bf" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

export default function Hero3D() {
  return (
    <Canvas
      dpr={[1, 1.8]}
      camera={{ position: [0, 1.2, 6.4], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      className="!touch-none"
    >
      <ambientLight intensity={0.55} />
      <pointLight position={[6, 6, 6]} intensity={60} color="#ffa04d" />
      <pointLight position={[-6, -4, -4]} intensity={40} color="#2dd4bf" />
      <Suspense fallback={null}>
        <CoreSphere />
        <OrbitingModules />
        <RingSystem />
        <Sparkles count={90} scale={9} size={2.2} speed={0.35} color="#7dd3fc" opacity={0.5} />
      </Suspense>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.8}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 1.7}
      />
    </Canvas>
  );
}