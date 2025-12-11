import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere, Torus, Box, Octahedron, Icosahedron } from '@react-three/drei';
import * as THREE from 'three';

const IconScene = ({ type }: { type: string }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.5;
    meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
  });

  // Brighter, more visible material
  const solidMaterial = (
    <meshStandardMaterial
      color="#ffffff"
      roughness={0.3}
      metalness={0.8}
      emissive="#ffffff"
      emissiveIntensity={0.2}
    />
  );

  const wireframeMaterial = (
    <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.4} />
  );

  switch (type) {
    case 'database': // Metric Explosion
      return (
        <Float speed={4} rotationIntensity={1} floatIntensity={2}>
          <group scale={1.2}>
            <Octahedron args={[1, 0]} ref={meshRef}>
              {wireframeMaterial}
            </Octahedron>
            <Octahedron args={[0.6, 0]}>
              {solidMaterial}
            </Octahedron>
          </group>
        </Float>
      );
    case 'heart': // Amex Heart Core
      return (
        <Float speed={5} rotationIntensity={0.5} floatIntensity={0.5}>
          <Sphere args={[0.9, 32, 32]} ref={meshRef}>
             <MeshDistortMaterial
              color="#ffffff"
              roughness={0.2}
              metalness={1}
              distort={0.4}
              speed={3}
              emissive="#444444"
            />
          </Sphere>
        </Float>
      );
    case 'terminal': // Terminal V2
      return (
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
          <group ref={meshRef}>
            <Box args={[1.4, 0.9, 0.1]}>
              <meshPhysicalMaterial 
                color="#eeeeee" 
                roughness={0.2} 
                metalness={0.1} 
                transmission={0.6} 
                thickness={2}
                clearcoat={1}
              />
            </Box>
            <Box args={[1.2, 0.7, 0.12]} position={[0, 0, 0]}>
               <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.2} />
            </Box>
          </group>
        </Float>
      );
    case 'api': // Data Fusion API
      return (
        <Float speed={6} rotationIntensity={2} floatIntensity={1}>
          <Torus args={[0.7, 0.25, 16, 32]} ref={meshRef}>
            <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={1} />
          </Torus>
        </Float>
      );
    case 'ecosystem': // Ecosystem Expansion
      return (
        <Float speed={1} rotationIntensity={0.5} floatIntensity={0.5}>
          <group ref={meshRef}>
            <Icosahedron args={[1.1, 0]}>
              {wireframeMaterial}
            </Icosahedron>
            <Sphere args={[0.7, 32, 32]}>
               <meshPhysicalMaterial 
                color="#ffffff" 
                roughness={0} 
                metalness={0.2} 
                transmission={0.9} 
                thickness={1.5}
                ior={1.5}
              />
            </Sphere>
          </group>
        </Float>
      );
    default:
      return null;
  }
};

export const Roadmap3DIcon = ({ type }: { type: string }) => {
  return (
    <div className="w-32 h-32 relative">
      <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1} />
        <pointLight position={[10, 10, 10]} intensity={2} />
        <pointLight position={[-10, -10, -10]} intensity={1} />
        <IconScene type={type} />
      </Canvas>
    </div>
  );
};
