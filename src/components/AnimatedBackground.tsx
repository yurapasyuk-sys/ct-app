import { Canvas, useFrame } from '@react-three/fiber';
import { Float, OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

const TradingBox = ({ position, color, speed }: { position: [number, number, number]; color: string; speed: number }) => {
  return (
    <Float speed={speed} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh position={position}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={color} wireframe transparent opacity={0.3} />
      </mesh>
    </Float>
  );
};

const TradingSphere = ({ position, color, speed }: { position: [number, number, number]; color: string; speed: number }) => {
  return (
    <Float speed={speed} rotationIntensity={0.3} floatIntensity={0.4}>
      <mesh position={position}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={color} wireframe transparent opacity={0.25} />
      </mesh>
    </Float>
  );
};

const AlgorithmicTorus = ({ position, color, speed }: { position: [number, number, number]; color: string; speed: number }) => {
  return (
    <Float speed={speed} rotationIntensity={0.4} floatIntensity={0.3}>
      <mesh position={position}>
        <torusGeometry args={[0.4, 0.15, 16, 32]} />
        <meshStandardMaterial color={color} wireframe transparent opacity={0.2} />
      </mesh>
    </Float>
  );
};

const ParticleRain = () => {
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  
  const particleData = useMemo(() => {
    const data = [];
    const colors = ['#00ff00', '#ff8c42', '#00ccff'];
    
    for (let i = 0; i < 150; i++) {
      data.push({
        x: (Math.random() - 0.5) * 20,
        y: Math.random() * 15 + 5,
        z: (Math.random() - 0.5) * 15,
        speed: 0.02 + Math.random() * 0.04,
        color: colors[Math.floor(Math.random() * colors.length)],
        length: 0.3 + Math.random() * 0.7,
      });
    }
    return data;
  }, []);

  useFrame(() => {
    if (!particlesRef.current) return;
    
    const dummy = new THREE.Object3D();
    
    particleData.forEach((particle, i) => {
      particle.y -= particle.speed;
      
      if (particle.y < -10) {
        particle.y = 15;
        particle.x = (Math.random() - 0.5) * 20;
        particle.z = (Math.random() - 0.5) * 15;
      }
      
      dummy.position.set(particle.x, particle.y, particle.z);
      dummy.scale.set(0.03, particle.length, 0.03);
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.updateMatrix();
      
      particlesRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    particlesRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={particlesRef} args={[undefined, undefined, 150]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#00ff00" transparent opacity={0.6} />
    </instancedMesh>
  );
};

const Scene = () => {
  const elements = useMemo(() => {
    const items = [];
    // Create scattered geometric elements
    for (let i = 0; i < 8; i++) {
      const x = (Math.random() - 0.5) * 10;
      const y = (Math.random() - 0.5) * 8;
      const z = (Math.random() - 0.5) * 8;
      const speed = 1 + Math.random() * 2;
      
      const type = Math.floor(Math.random() * 3);
      const colorChoice = Math.random();
      let color = '#00ff00'; // primary green
      if (colorChoice > 0.66) color = '#ff8c42'; // secondary orange
      else if (colorChoice > 0.33) color = '#00ccff'; // accent cyan
      
      items.push({ type, position: [x, y, z] as [number, number, number], color, speed, key: i });
    }
    return items;
  }, []);

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={0.4} color="#00ff00" />
      <pointLight position={[-10, -10, -5]} intensity={0.2} color="#ff8c42" />
      
      <ParticleRain />
      
      {elements.map((item) => {
        if (item.type === 0) return <TradingBox key={item.key} position={item.position} color={item.color} speed={item.speed} />;
        if (item.type === 1) return <TradingSphere key={item.key} position={item.position} color={item.color} speed={item.speed} />;
        return <AlgorithmicTorus key={item.key} position={item.position} color={item.color} speed={item.speed} />;
      })}
      
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.3} />
    </>
  );
};

export const AnimatedBackground = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 grid-pattern opacity-10" />
      
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  );
};
