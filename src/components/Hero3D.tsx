import { useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import * as THREE from 'three';

const Core = () => {
  const meshRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mouse.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: -(event.clientY / window.innerHeight) * 2 + 1,
      };
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useFrame((state) => {
    if (!meshRef.current || !innerRef.current || !outerRef.current) return;

    // Smooth rotation based on mouse
    const targetX = mouse.current.y * 0.5;
    const targetY = mouse.current.x * 0.5;

    meshRef.current.rotation.x += (targetX - meshRef.current.rotation.x) * 0.05;
    meshRef.current.rotation.y += (targetY - meshRef.current.rotation.y) * 0.05;

    // Constant idle rotation
    innerRef.current.rotation.y += 0.002;
    innerRef.current.rotation.z += 0.001;
    
    outerRef.current.rotation.y -= 0.001;
    outerRef.current.rotation.x -= 0.0005;
  });

  return (
    <group ref={meshRef}>
      {/* Inner Core - Dense Wireframe */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh ref={innerRef}>
          <icosahedronGeometry args={[1.8, 2]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.1} />
        </mesh>
      </Float>

      {/* Outer Shell - Sparse Wireframe */}
      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
        <mesh ref={outerRef}>
          <icosahedronGeometry args={[2.8, 1]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.03} />
        </mesh>
      </Float>

      {/* Glowing Points */}
      <points>
        <sphereGeometry args={[3.5, 48, 48]} />
        <pointsMaterial color="#ffffff" size={0.015} transparent opacity={0.15} sizeAttenuation />
      </points>
    </group>
  );
};

const Scene = () => {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      
      <Core />
      
      {/* Background Particles */}
      <Stars radius={50} depth={50} count={2000} factor={3} saturation={0} fade speed={1} />
    </>
  );
};

export const Hero3D = () => {
  return (
    <div className="w-full h-full min-h-[600px] relative z-10 fade-in">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]} // Optimize for high DPI screens
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#000000'), 0);
        }}
      >
        <Scene />
      </Canvas>
      
      {/* Overlay Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <div className="text-center space-y-4 mix-blend-difference">
          <div className="text-[10px] font-mono text-white/60 tracking-[0.5em] uppercase animate-pulse">
            System Active
          </div>
          <div className="w-1 h-1 bg-white rounded-full mx-auto animate-ping" />
        </div>
      </div>
    </div>
  );
};
