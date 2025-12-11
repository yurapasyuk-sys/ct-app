import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Sphere, Torus, Box, Octahedron, Icosahedron } from '@react-three/drei';
import * as THREE from 'three';

const IconScene = ({ type, isHovered }: { type: string; isHovered: boolean }) => {
  const meshRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    if (isHovered) {
      // Interactive Mode: Follow mouse
      // state.mouse gives normalized coordinates (-1 to 1)
      const targetX = state.mouse.y * 1.5; // Tilt up/down
      const targetY = state.mouse.x * 1.5; // Turn left/right

      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetX, delta * 4);
      meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetY, delta * 4);
      
      // Add a little scale bump
      meshRef.current.scale.lerp(new THREE.Vector3(1.2, 1.2, 1.2), delta * 4);
    } else {
      // Idle Mode: Slow continuous rotation
      meshRef.current.rotation.x = (state.clock.getElapsedTime() * 0.5);
      meshRef.current.rotation.y = (state.clock.getElapsedTime() * 0.3);
      
      // Reset scale
      meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 2);
    }
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

  const renderIcon = () => {
    switch (type) {
      case 'database': // Metric Explosion
        return (
          <group ref={meshRef}>
            <Octahedron args={[1, 0]}>
              {wireframeMaterial}
            </Octahedron>
            <Octahedron args={[0.6, 0]}>
              {solidMaterial}
            </Octahedron>
          </group>
        );
      case 'heart': // Amex Heart Core
        return (
          <group ref={meshRef}>
            <Sphere args={[0.9, 32, 32]}>
               <MeshDistortMaterial
                color="#ffffff"
                roughness={0.2}
                metalness={1}
                distort={0.4}
                speed={3}
                emissive="#444444"
              />
            </Sphere>
          </group>
        );
      case 'terminal': // Terminal V2
        return (
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
        );
      case 'api': // Data Fusion API
        return (
          <group ref={meshRef}>
            <Torus args={[0.7, 0.25, 16, 32]}>
              <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={1} />
            </Torus>
          </group>
        );
      case 'ecosystem': // Ecosystem Expansion
        return (
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
        );
      default:
        return null;
    }
  };

  return (
    <Float speed={isHovered ? 0 : 2} rotationIntensity={isHovered ? 0 : 1} floatIntensity={isHovered ? 0 : 1}>
      {renderIcon()}
    </Float>
  );
};

export const Roadmap3DIcon = ({ type, isHovered = false }: { type: string; isHovered?: boolean }) => {
  return (
    <div className="w-32 h-32 relative">
      <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1} />
        <pointLight position={[10, 10, 10]} intensity={2} />
        <pointLight position={[-10, -10, -10]} intensity={1} />
        <IconScene type={type} isHovered={isHovered} />
      </Canvas>
    </div>
  );
};
