import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars, Points, PointMaterial } from '@react-three/drei';
import * as THREE from 'three';

const GlobalNetwork = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const mouse = useRef({ x: 0, y: 0 });

  // Generate a vast field of points
  const particleCount = 4000;
  const positions = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      // Create a sphere distribution
      const r = 15 + Math.random() * 10; // Radius between 15 and 25
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    return positions;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;

    // Constant slow rotation
    pointsRef.current.rotation.y += 0.0005;
    pointsRef.current.rotation.x += 0.0002;

    // Mouse interaction
    const time = state.clock.getElapsedTime();
    
    // Gentle wave effect
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    for(let i = 0; i < particleCount; i++) {
       // Subtle breathing
       // This is expensive in JS, but for 4000 points it might be okay. 
       // Better to do in shader, but standard material is easier for now.
    }
  });

  return (
    <group rotation={[0, 0, Math.PI / 4]}>
      <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color="#ffffff"
          size={0.05}
          sizeAttenuation={true}
          depthWrite={false}
          opacity={0.4}
        />
      </Points>
    </group>
  );
};

const DataLines = () => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Create some "data streams" - lines that orbit
  const lines = useMemo(() => {
    return new Array(20).fill(0).map((_, i) => ({
      radius: 12 + Math.random() * 8,
      speed: 0.001 + Math.random() * 0.002,
      offset: Math.random() * Math.PI * 2,
      tilt: (Math.random() - 0.5) * 1
    }));
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y -= 0.001;
  });

  return (
    <group ref={groupRef}>
      {lines.map((line, i) => (
        <mesh key={i} rotation={[line.tilt, 0, line.tilt]}>
          <torusGeometry args={[line.radius, 0.02, 16, 100]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
        </mesh>
      ))}
    </group>
  );
};

const Scene = () => {
  return (
    <>
      <GlobalNetwork />
      <DataLines />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
    </>
  );
};

export const Hero3D = () => {
  return (
    <div className="w-full h-full absolute inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 20], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <Scene />
      </Canvas>
    </div>
  );
};
