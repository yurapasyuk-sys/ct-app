import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import * as THREE from 'three';

const NetworkSignals = () => {
  const radius = 3.2;
  const detail = 1;

  const { nodes, edges } = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    const positions = geometry.attributes.position;
    const nodes: THREE.Vector3[] = [];
    const nodesMap = new Map<string, number>();

    // Extract unique vertices
    for (let i = 0; i < positions.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(positions, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!nodesMap.has(key)) {
        nodesMap.set(key, nodes.length);
        nodes.push(v);
      }
    }

    const edges: [number, number][] = [];
    // Connect nearest neighbors
    let minD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = nodes[i].distanceTo(nodes[j]);
        if (d < minD) minD = d;
      }
    }
    const threshold = minD * 1.1;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].distanceTo(nodes[j]) < threshold) {
          edges.push([i, j]);
        }
      }
    }

    return { nodes, edges };
  }, []);

  const signalCount = 60;
  const signals = useMemo(() => {
    return new Array(signalCount).fill(0).map(() => ({
      edgeIndex: Math.floor(Math.random() * edges.length),
      progress: Math.random(),
      speed: 0.03 + Math.random() * 0.04,
      direction: Math.random() > 0.5 ? 1 : -1
    }));
  }, [edges]);

  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current) return;

    signals.forEach((signal, i) => {
      signal.progress += signal.speed * signal.direction;
      
      if (signal.progress > 1 || signal.progress < 0) {
        signal.edgeIndex = Math.floor(Math.random() * edges.length);
        signal.progress = signal.direction > 0 ? 0 : 1;
      }

      const [startIndex, endIndex] = edges[signal.edgeIndex];
      const start = nodes[startIndex];
      const end = nodes[endIndex];
      
      dummy.position.lerpVectors(start, end, signal.progress);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, signalCount]}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.8} />
    </instancedMesh>
  );
};

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
    const targetX = mouse.current.y * 1.2;
    const targetY = mouse.current.x * 1.2;

    meshRef.current.rotation.x += (targetX - meshRef.current.rotation.x) * 0.05;
    meshRef.current.rotation.y += (targetY - meshRef.current.rotation.y) * 0.05;

    // Parallax effect
    const parallaxX = mouse.current.x * 0.5;
    const parallaxY = mouse.current.y * 0.5;
    meshRef.current.position.x += (parallaxX - meshRef.current.position.x) * 0.05;
    meshRef.current.position.y += (parallaxY - meshRef.current.position.y) * 0.05;

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
          <icosahedronGeometry args={[2.2, 2]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.1} />
        </mesh>
      </Float>

      {/* Outer Shell - Sparse Wireframe */}
      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
        <mesh ref={outerRef}>
          <icosahedronGeometry args={[3.2, 1]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.03} />
          <NetworkSignals />
        </mesh>
      </Float>

      {/* Glowing Points */}
      <points>
        <sphereGeometry args={[4.0, 48, 48]} />
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
        camera={{ position: [0, 0, 12], fov: 45 }} // Increased Z distance to fix clipping
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
