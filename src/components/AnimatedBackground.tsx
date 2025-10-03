import { useEffect, useRef, useState } from 'react';

// ASCII Art Animation Frames
const ANIMATIONS = {
  rotatingCube: [
    `
      +------+
     /|     /|
    / |    / |
   +------+  |
   |  |   |  |
   |  +---|--+
   | /    | /
   |/     |/
   +------+
    `,
    `
      +------+
     /      /|
    /      / |
   +------+  |
   |      |  |
   |      |  +
   |      | /
   |      |/
   +------+
    `,
    `
      ________
     /       /|
    /       / |
   +-------+  |
   |       |  |
   |       |  +
   |       | /
   +-------+
    `,
    `
    +--------+
    |       /|
    |      / |
    |     /  |
    |    /   |
    |   /    |
    |  /     |
    | /      |
    |/       |
    +--------+
    `
  ],
  
  runningCharacter: [
    `
     o
    /|\\
    / \\
    `,
    `
     o
    /|\\
     |
    / \\
    `,
    `
     o
    \\|/
     |
    / \\
    `,
    `
     o
    \\|
     |\\
    /  \\
    `,
    `
     o
     |\\
    /|
     / \\
    `
  ],
  
  wave: [
    `
    ~~~~~~~~~~~~~~~~
    `,
    `
    ~~~~~~~~~~~~~~~
    `,
    `
    ~~~~~~~~~~~~~~
    `,
    `
    ~~~~~~~~~~~~~
    `,
    `
    ~~~~~~~~~~~~
    `,
    `
    ~~~~~~~~~~~~~
    `,
    `
    ~~~~~~~~~~~~~~
    `,
    `
    ~~~~~~~~~~~~~~~
    `
  ],
  
  tradingChart: [
    `
    ₿  ↗ $52,340
    ───────────────
    │         ╱╲
    │        ╱  ╲
    │   ╱╲  ╱    ╲╱
    │  ╱  ╲╱
    │ ╱
    └────────────→
    `,
    `
    ₿  ↗ $52,450
    ───────────────
    │          ╱╲
    │         ╱  ╲
    │    ╱╲  ╱    ╲
    │   ╱  ╲╱      ╲
    │  ╱
    └────────────→
    `,
    `
    ₿  ↗ $52,680
    ───────────────
    │           ╱╲
    │          ╱  ╲
    │     ╱╲  ╱    ╲
    │    ╱  ╲╱
    │   ╱
    └────────────→
    `,
    `
    ₿  ↗ $52,820
    ───────────────
    │            ╱
    │           ╱╲
    │      ╱╲  ╱  ╲
    │     ╱  ╲╱
    │    ╱
    └────────────→
    `
  ],
  
  candlestick: [
    `
    │  │  │  │  
    ┃  │  ┃  │  
    ┃  │  ┃  │  
    ┃  ┃  ┃  ┃  
    `,
    `
    │  │  │  │  
    │  ┃  │  ┃  
    │  ┃  │  ┃  
    ┃  ┃  ┃  ┃  
    `,
    `
    │  │  │  │  
    │  │  ┃  │  
    │  ┃  ┃  │  
    ┃  ┃  ┃  ┃  
    `,
    `
    │  │  │  │  
    ┃  │  │  ┃  
    ┃  │  ┃  ┃  
    ┃  ┃  ┃  ┃  
    `
  ]
};

interface ASCIIAnimationProps {
  animation: keyof typeof ANIMATIONS;
  fps?: number;
  scale?: number;
  color?: string;
  position: { x: string; y: string };
}

const ASCIIAnimation = ({ animation, fps = 8, scale = 1, color = '#00ff00', position }: ASCIIAnimationProps) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const frames = ANIMATIONS[animation];
    const frameDuration = 1000 / fps;

    const animate = (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= frameDuration) {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
        lastTimeRef.current = timestamp;
      }
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [animation, fps, isPlaying]);

  const frames = ANIMATIONS[animation];

  return (
    <pre
      ref={preRef}
      className="font-mono whitespace-pre leading-tight transition-opacity duration-300"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        color: color,
        fontSize: `${12 * scale}px`,
        textShadow: `0 0 10px ${color}`,
        opacity: 0.6,
        userSelect: 'none',
        pointerEvents: 'none'
      }}
    >
      {frames[currentFrame]}
    </pre>
  );
};

const FloatingSymbols = () => {
  const symbols = ['$', '₿', '€', '¥', '£', '↑', '↓', '▲', '▼', '%'];
  const [particles, setParticles] = useState<Array<{ char: string; x: number; y: number; speed: number; opacity: number }>>([]);

  useEffect(() => {
    const newParticles = Array.from({ length: 20 }, () => ({
      char: symbols[Math.floor(Math.random() * symbols.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
      speed: 0.5 + Math.random() * 1.5,
      opacity: 0.1 + Math.random() * 0.3
    }));
    setParticles(newParticles);

    const interval = setInterval(() => {
      setParticles(prev => 
        prev.map(p => ({
          ...p,
          y: p.y > 100 ? -5 : p.y + p.speed * 0.1
        }))
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {particles.map((particle, i) => (
        <div
          key={i}
          className="absolute font-mono text-primary pointer-events-none"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            opacity: particle.opacity,
            fontSize: '16px',
            transition: 'top 0.05s linear'
          }}
        >
          {particle.char}
        </div>
      ))}
    </>
  );
};

export const AnimatedBackground = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Entrance animation
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  return (
    <div 
      className={`fixed inset-0 pointer-events-none overflow-hidden transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      style={{ zIndex: 0 }}
    >
      {/* Grid pattern */}
      <div className="absolute inset-0 grid-pattern opacity-5" />

      {/* Floating symbols */}
      <FloatingSymbols />

      {/* ASCII Animations - positioned across the screen */}
      <ASCIIAnimation
        animation="tradingChart"
        fps={4}
        scale={0.8}
        color="#00ff00"
        position={{ x: '5%', y: '15%' }}
      />
      
      <ASCIIAnimation
        animation="rotatingCube"
        fps={6}
        scale={0.7}
        color="#ff8c42"
        position={{ x: '80%', y: '20%' }}
      />
      
      <ASCIIAnimation
        animation="candlestick"
        fps={5}
        scale={1}
        color="#00ccff"
        position={{ x: '10%', y: '70%' }}
      />
      
      <ASCIIAnimation
        animation="wave"
        fps={10}
        scale={0.9}
        color="#00ff00"
        position={{ x: '70%', y: '75%' }}
      />
      
      <ASCIIAnimation
        animation="runningCharacter"
        fps={8}
        scale={0.8}
        color="#ff8c42"
        position={{ x: '45%', y: '60%' }}
      />

      <ASCIIAnimation
        animation="rotatingCube"
        fps={4}
        scale={0.6}
        color="#00ccff"
        position={{ x: '85%', y: '65%' }}
      />
    </div>
  );
};
