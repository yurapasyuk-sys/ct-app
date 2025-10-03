import { useEffect, useRef, useState } from 'react';

/**
 * Classic ASCII Art Animations
 * Uses only standard ASCII characters: A-Z, a-z, 0-9, and basic punctuation
 * No Unicode symbols or rasterization - pure text-based art like old terminals
 */

const ASCII_ANIMATIONS = {
  // Rotating 3D Cube - using letters and slashes for structure
  rotatingCube: [
    `
       -------
      /      /|
     /      / |
    -------   |
    |      |  |
    |      | /
    |      |/
    -------
    `,
    `
       -------
      /|     /|
     / |    / |
    -------   |
    |  |   |  |
    |  ----+--+
    | /    | /
    |/     |/
    -------
    `,
    `
      .-------.
     /       /|
    /       / |
   '-------'  |
   |       |  |
   |       |  '
   |       | /
   '-------'
    `,
    `
      .------.
     /|     /|
    / |    / |
   '------'  |
   |  |   |  |
   |  '---|--'
   | /    | /
   |/     |/
   '------'
    `
  ],

  // Walking trader character
  walkingTrader: [
    `
      O
     /|\\
     / \\
    `,
    `
      O
     /|\\
      |
     / \\
    `,
    `
      O
     \\|/
      |
     / \\
    `,
    `
      O
      |\\
     /|
      / \\
    `,
    `
      O
     /|
      |\\
     / \\
    `
  ],

  // Trading chart going up
  tradingChart: [
    `
    PRICE CHART
    
         /
        /
       /
      /
     .
    `,
    `
    PRICE CHART
    
          /
         /
        /
       .
      /
    `,
    `
    PRICE CHART
    
           /
          /
         .
        /
       /
    `,
    `
    PRICE CHART
    
            .
           /
          /
         /
        /
    `
  ],

  // Rocket launching (trading to the moon)
  rocket: [
    `
       /\\
      /  \\
     |BULL|
     |    |
      \\  /
       \\/
    `,
    `
       /\\
      /  \\
     |BULL|
     |    |
      \\  /
       MM
    `,
    `
       /\\
      /  \\
     |BULL|
      \\  /
       MM
       MM
    `,
    `
       /\\
      /  \\
      \\  /
       MM
       MM
       ..
    `
  ],

  // Dollar sign pulsing
  dollar: [
    `
      SSS
     S   S
      S
       S
     S   S
      SSS
    `,
    `
      ###
     #   #
      #
       #
     #   #
      ###
    `,
    `
      ***
     *   *
      *
       *
     *   *
      ***
    `,
    `
      ===
     =   =
      =
       =
     =   =
      ===
    `
  ],

  // Candlestick chart animation
  candlesticks: [
    `
      |    |    |    |
      |    #    |    #
      #    #    #    #
      #    |    #    |
      |    |    |    |
    `,
    `
      |    |    |    |
      #    |    #    |
      #    #    #    #
      |    #    |    #
      |    |    |    |
    `,
    `
      |    |    |    |
      |    #    |    #
      #    #    #    #
      #    #    #    |
      |    |    |    |
    `,
    `
      |    |    |    |
      #    |    #    |
      #    #    #    #
      #    #    |    #
      |    |    |    |
    `
  ],

  // Percentage increasing
  percentage: [
    `
     +2.5%
    `,
    `
     +5.0%
    `,
    `
     +7.5%
    `,
    `
    +10.0%
    `
  ],

  // Bull running
  bull: [
    `
    (__)
    (oo)
     \\/
    `,
    `
     __)
    (oo)
     \\/
    `,
    `
    __)
    oo)
     \\/
    `,
    `
    ___)
    (oo)
     \\/
    `
  ],

  // Loading bar for trading
  loadingBar: [
    `
    [          ]
    `,
    `
    [=         ]
    `,
    `
    [==        ]
    `,
    `
    [===       ]
    `,
    `
    [====      ]
    `,
    `
    [=====     ]
    `,
    `
    [======    ]
    `,
    `
    [=======   ]
    `,
    `
    [========  ]
    `,
    `
    [========= ]
    `,
    `
    [==========]
    `
  ],

  // Arrow pointing up (bullish)
  arrowUp: [
    `
        ^
       / \\
      /   \\
     /     \\
    /       \\
    `,
    `
        A
       / \\
      /   \\
     /     \\
    /       \\
    `,
    `
        ^
       /^\\
      / ^ \\
     /  ^  \\
    /   ^   \\
    `,
    `
        ^
       ^^^
      ^^^^^
     ^^^^^^^
    ^^^^^^^^^
    `
  ]
};

interface ASCIIAnimationProps {
  animation: keyof typeof ASCII_ANIMATIONS;
  fps?: number;
  scale?: number;
  color?: string;
  position: { x: string; y: string };
}

/**
 * Single ASCII Animation Component
 * Cycles through frames using requestAnimationFrame for smooth performance
 */
const ASCIIAnimation = ({ 
  animation, 
  fps = 8, 
  scale = 1, 
  color = '#00ff00', 
  position 
}: ASCIIAnimationProps) => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    const frames = ASCII_ANIMATIONS[animation];
    const frameDuration = 1000 / fps;

    const animate = (timestamp: number) => {
      // Only update frame when enough time has passed
      if (timestamp - lastTimeRef.current >= frameDuration) {
        setCurrentFrame((prev) => (prev + 1) % frames.length);
        lastTimeRef.current = timestamp;
      }
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    // Cleanup on unmount
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [animation, fps]);

  const frames = ASCII_ANIMATIONS[animation];

  return (
    <pre
      className="font-mono whitespace-pre leading-tight select-none"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        color: color,
        fontSize: `${10 * scale}px`,
        textShadow: `0 0 8px ${color}`,
        opacity: 0.5,
        pointerEvents: 'none',
        letterSpacing: '0.05em'
      }}
    >
      {frames[currentFrame]}
    </pre>
  );
};

/**
 * Floating ASCII characters
 * Simple letters and numbers floating across screen
 */
const FloatingASCIIChars = () => {
  const chars = ['A', 'B', 'X', 'Y', '0', '1', '+', '-', '*', '/', '=', '%'];
  const [particles, setParticles] = useState<Array<{
    char: string;
    x: number;
    y: number;
    speed: number;
    opacity: number;
  }>>([]);

  useEffect(() => {
    // Initialize particles
    const newParticles = Array.from({ length: 15 }, () => ({
      char: chars[Math.floor(Math.random() * chars.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
      speed: 0.3 + Math.random() * 0.8,
      opacity: 0.1 + Math.random() * 0.2
    }));
    setParticles(newParticles);

    // Animate particles falling
    const interval = setInterval(() => {
      setParticles(prev =>
        prev.map(p => ({
          ...p,
          y: p.y > 105 ? -5 : p.y + p.speed * 0.15
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
          className="absolute font-mono text-primary pointer-events-none select-none"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            opacity: particle.opacity,
            fontSize: '14px',
            transition: 'top 0.05s linear'
          }}
        >
          {particle.char}
        </div>
      ))}
    </>
  );
};

/**
 * Main Animated Background Component
 * Displays multiple ASCII art animations positioned across the screen
 */
export const AnimatedBackground = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade in effect on mount
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden transition-opacity duration-1000 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ zIndex: 0 }}
    >
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 grid-pattern opacity-5" />

      {/* Floating ASCII characters */}
      <FloatingASCIIChars />

      {/* ASCII Art Animations distributed across screen */}
      
      {/* Top left - Rotating cube */}
      <ASCIIAnimation
        animation="rotatingCube"
        fps={4}
        scale={0.9}
        color="#00ff00"
        position={{ x: '8%', y: '12%' }}
      />

      {/* Top right - Rocket */}
      <ASCIIAnimation
        animation="rocket"
        fps={6}
        scale={1}
        color="#ff8c42"
        position={{ x: '82%', y: '15%' }}
      />

      {/* Middle left - Trading chart */}
      <ASCIIAnimation
        animation="tradingChart"
        fps={5}
        scale={1.1}
        color="#00ccff"
        position={{ x: '5%', y: '45%' }}
      />

      {/* Middle right - Candlesticks */}
      <ASCIIAnimation
        animation="candlesticks"
        fps={6}
        scale={0.9}
        color="#00ff00"
        position={{ x: '75%', y: '48%' }}
      />

      {/* Bottom left - Bull */}
      <ASCIIAnimation
        animation="bull"
        fps={8}
        scale={1.2}
        color="#ff8c42"
        position={{ x: '12%', y: '75%' }}
      />

      {/* Bottom right - Arrow up */}
      <ASCIIAnimation
        animation="arrowUp"
        fps={5}
        scale={0.8}
        color="#00ccff"
        position={{ x: '80%', y: '72%' }}
      />

      {/* Center - Walking trader */}
      <ASCIIAnimation
        animation="walkingTrader"
        fps={8}
        scale={1}
        color="#00ff00"
        position={{ x: '45%', y: '58%' }}
      />

      {/* Extra animations for richness */}
      <ASCIIAnimation
        animation="dollar"
        fps={4}
        scale={0.7}
        color="#ff8c42"
        position={{ x: '35%', y: '25%' }}
      />

      <ASCIIAnimation
        animation="percentage"
        fps={3}
        scale={1}
        color="#00ccff"
        position={{ x: '60%', y: '35%' }}
      />

      <ASCIIAnimation
        animation="loadingBar"
        fps={10}
        scale={0.8}
        color="#00ff00"
        position={{ x: '40%', y: '82%' }}
      />
    </div>
  );
};
