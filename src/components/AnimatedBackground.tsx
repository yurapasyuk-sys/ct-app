import { useEffect, useRef, useState } from 'react';

/**
 * Interactive ASCII Pattern Background
 * Features:
 * - White ASCII on black background for high contrast
 * - Forms recognizable geometric patterns (star, spiral, wave)
 * - Reacts to mouse movement and scroll
 * - Fully customizable via config object
 * - Non-intrusive opacity to keep main content readable
 */

// ASCII character set - classic letters and numbers only
const ASCII_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Pattern types available
type PatternType = 'star' | 'spiral' | 'wave' | 'grid' | 'circle';

interface AnimationConfig {
  // Pattern configuration
  pattern: PatternType;
  charSize: number;          // Size of each character
  density: number;           // How many points in the pattern
  
  // Animation settings
  rotationSpeed: number;     // Pattern rotation speed
  pulseSpeed: number;        // Pulsing animation speed
  pulseAmplitude: number;    // How much the pattern expands/contracts
  
  // Interactivity
  mouseInfluence: number;    // How much mouse affects the pattern (0-1)
  scrollInfluence: number;   // How much scroll affects the pattern (0-1)
  
  // Visual settings
  opacity: number;           // Overall opacity (0-1)
  glowIntensity: number;     // Text glow strength
}

// Default configuration - easy to customize
const DEFAULT_CONFIG: AnimationConfig = {
  pattern: 'star',
  charSize: 16,              // Larger characters for better visibility
  density: 300,              // Reduced density - more space between letters
  rotationSpeed: 0,          // No rotation - static star
  pulseSpeed: 0.0008,        // Very slow gentle pulse
  pulseAmplitude: 0.05,      // Minimal breathing effect
  mouseInfluence: 0.1,       // Subtle mouse interaction
  scrollInfluence: 0.05,     // Minimal scroll effect
  opacity: 0.9,              // High opacity for clear visibility
  glowIntensity: 15          // Strong glow for dramatic effect
};

/**
 * Generate pattern coordinates with depth information
 * Returns array of points forming the specified pattern
 * Each point includes a depth value (0-1) for grayscale shading
 */
const generatePattern = (
  type: PatternType,
  density: number,
  centerX: number,
  centerY: number,
  size: number
): Array<{ x: number; y: number; char: string; depth: number }> => {
  const points: Array<{ x: number; y: number; char: string; depth: number }> = [];

  switch (type) {
    case 'star':
      // Elegant four-pointed star with smooth, flowing curves
      // Long graceful vertical arms, shorter horizontal arms
      const verticalRadius = size * 1.8;    // Long, elegant vertical reach
      const horizontalRadius = size * 0.7;  // Shorter horizontal arms
      const innerRadius = size * 0.12;      // Tight center for elegance
      
      // Create smooth curved paths using control points for Bezier-like curves
      // We'll generate points along smooth curves instead of straight lines
      
      const segments = [
        // Top arm - from center up
        { start: { x: centerX, y: centerY }, end: { x: centerX, y: centerY - verticalRadius }, type: 'vertical' },
        // Top to right - smooth curve
        { start: { x: centerX, y: centerY - verticalRadius }, end: { x: centerX + horizontalRadius, y: centerY }, type: 'curve' },
        // Right arm - from center right
        { start: { x: centerX + horizontalRadius, y: centerY }, end: { x: centerX, y: centerY }, type: 'horizontal' },
        // Right to bottom - smooth curve
        { start: { x: centerX + horizontalRadius, y: centerY }, end: { x: centerX, y: centerY + verticalRadius }, type: 'curve' },
        // Bottom arm - from center down
        { start: { x: centerX, y: centerY + verticalRadius }, end: { x: centerX, y: centerY }, type: 'vertical' },
        // Bottom to left - smooth curve
        { start: { x: centerX, y: centerY + verticalRadius }, end: { x: centerX - horizontalRadius, y: centerY }, type: 'curve' },
        // Left arm - from center left
        { start: { x: centerX - horizontalRadius, y: centerY }, end: { x: centerX, y: centerY }, type: 'horizontal' },
        // Left to top - smooth curve
        { start: { x: centerX - horizontalRadius, y: centerY }, end: { x: centerX, y: centerY - verticalRadius }, type: 'curve' }
      ];
      
      const pointsPerSegment = Math.ceil(density / 8);
      
      segments.forEach((segment, segIndex) => {
        for (let j = 0; j < pointsPerSegment; j++) {
          const t = j / pointsPerSegment;
          
          let x, y, depth;
          
          if (segment.type === 'vertical') {
            // Vertical arms - taper smoothly to points
            const easeT = 1 - Math.pow(1 - t, 2); // Ease out for elegant taper
            x = segment.start.x;
            y = segment.start.y + (segment.end.y - segment.start.y) * easeT;
            
            // Depth increases towards the tip for emphasis
            depth = 0.6 + (t * 0.4); // Brighten towards tips
            
            // Add subtle width variation for organic feel
            const width = (1 - t) * innerRadius * 0.5;
            x += (Math.random() - 0.5) * width;
            
          } else if (segment.type === 'horizontal') {
            // Horizontal arms - shorter and elegant
            const easeT = 1 - Math.pow(1 - t, 2);
            x = segment.start.x + (segment.end.x - segment.start.x) * easeT;
            y = segment.start.y;
            
            depth = 0.6 + (t * 0.3);
            
            const width = (1 - t) * innerRadius * 0.5;
            y += (Math.random() - 0.5) * width;
            
          } else {
            // Curves - smooth quadratic bezier-like interpolation
            const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            
            // Control point for smooth curve (pull towards center)
            const controlX = (segment.start.x + segment.end.x) / 2;
            const controlY = (segment.start.y + segment.end.y) / 2;
            const pullToCenter = 0.3; // How much to pull towards center
            const finalControlX = controlX + (centerX - controlX) * pullToCenter;
            const finalControlY = controlY + (centerY - controlY) * pullToCenter;
            
            // Quadratic bezier curve
            const invT = 1 - easeT;
            x = invT * invT * segment.start.x + 
                2 * invT * easeT * finalControlX + 
                easeT * easeT * segment.end.x;
            y = invT * invT * segment.start.y + 
                2 * invT * easeT * finalControlY + 
                easeT * easeT * segment.end.y;
            
            // Depth gradient along curve
            depth = 0.5 + Math.sin(t * Math.PI) * 0.3;
          }
          
          points.push({
            x,
            y,
            char: ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)],
            depth
          });
        }
      });
      break;

    case 'spiral':
      // Fibonacci spiral pattern with depth gradient
      for (let i = 0; i < density; i++) {
        const t = i / density;
        const angle = t * Math.PI * 8; // Multiple rotations
        const radius = t * size;
        
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        // Depth increases from center to edge
        const depth = t;
        
        points.push({
          x,
          y,
          char: ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)],
          depth
        });
      }
      break;

    case 'wave':
      // Sine wave pattern with depth based on wave height
      const waves = 4;
      for (let i = 0; i < density; i++) {
        const t = (i / density) * waves * Math.PI * 2;
        const x = centerX + (i / density - 0.5) * size * 2;
        const waveHeight = Math.sin(t);
        const y = centerY + waveHeight * size * 0.3;
        
        // Depth based on wave amplitude (peaks are brighter)
        const depth = (waveHeight + 1) / 2;
        
        points.push({
          x,
          y,
          char: ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)],
          depth
        });
      }
      break;

    case 'grid':
      // Geometric grid pattern with radial depth gradient
      const gridSize = Math.floor(Math.sqrt(density));
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const x = centerX + (i / gridSize - 0.5) * size * 2;
          const y = centerY + (j / gridSize - 0.5) * size * 2;
          
          // Distance from center determines depth
          const dx = (i / gridSize - 0.5);
          const dy = (j / gridSize - 0.5);
          const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
          const depth = 1 - Math.min(distanceFromCenter, 1);
          
          points.push({
            x,
            y,
            char: ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)],
            depth
          });
        }
      }
      break;

    case 'circle':
      // Perfect circle pattern with smooth gradient
      for (let i = 0; i < density; i++) {
        const angle = (i / density) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * size;
        const y = centerY + Math.sin(angle) * size;
        
        // Depth varies smoothly around circle
        const depth = (Math.sin(angle * 2) + 1) / 2;
        
        points.push({
          x,
          y,
          char: ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)],
          depth
        });
      }
      break;
  }

  return points;
};

export const AnimatedBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [config] = useState<AnimationConfig>(DEFAULT_CONFIG);
  
  // Track mouse position for interactivity
  const mouseRef = useRef({ x: 0, y: 0 });
  // Track scroll position for interactivity
  const scrollRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to fill screen
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse move handler - track position
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight
      };
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Scroll handler - track scroll position
    const handleScroll = () => {
      scrollRef.current = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll);

    // Animation state
    let time = 0;
    let rotation = 0;

    /**
     * Main animation loop
     */
    const animate = () => {
      time += 0.016; // ~60fps
      rotation += config.rotationSpeed;

      // Clear canvas with pure black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate center point
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Calculate base size with pulsing effect
      const baseSize = Math.min(canvas.width, canvas.height) * 0.3;
      const pulse = Math.sin(time * config.pulseSpeed) * config.pulseAmplitude;
      const currentSize = baseSize * (1 + pulse);

      // Generate pattern points
      const points = generatePattern(
        config.pattern,
        config.density,
        centerX,
        centerY,
        currentSize
      );

      // Set up drawing style
      ctx.font = `${config.charSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Draw each point with transformations
      points.forEach((point, index) => {
        // No rotation - star remains static and centered
        let finalX = point.x;
        let finalY = point.y;
        // Minimal mouse influence - subtle interaction
        const mouseX = mouseRef.current.x * canvas.width;
        const mouseY = mouseRef.current.y * canvas.height;
        const dx = finalX - mouseX;
        const dy = finalY - mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 300;
        
        if (distance < maxDistance && distance > 0) {
          const force = (1 - distance / maxDistance) * config.mouseInfluence;
          finalX += (dx / distance) * force * 30;
          finalY += (dy / distance) * force * 30;
        }

        // Apply minimal scroll influence
        const scrollOffset = scrollRef.current * config.scrollInfluence * 0.05;
        finalY += Math.sin(index * 0.05 + scrollOffset) * 3;

        /**
         * ANIMATED GRADIENT SYSTEM
         * Creates a flowing wave of brightness across the star
         * Gradient animates from dark gray → light gray → bright white → light gray → dark gray
         */
        
        // Base depth from pattern (0 to 1)
        const baseDepth = point.depth;
        
        // Create animated gradient wave that flows along the star
        // Using sine wave that moves over time
        const gradientWave = Math.sin(time * 0.5 + index * 0.02);
        
        // Combine base depth with animated wave
        // This creates a "breathing" gradient effect
        const animatedDepth = baseDepth * 0.5 + (gradientWave * 0.5 + 0.5) * 0.5;
        
        // Map depth to grayscale range
        // Minimum: 40 (dark gray) → Maximum: 255 (bright white)
        const minGray = 40;   // Dark gray - never completely black for visibility
        const maxGray = 255;  // Bright white
        const grayValue = minGray + Math.floor(animatedDepth * (maxGray - minGray));
        
        // Add position-based variation for more organic gradient
        // Creates subtle variations in brightness based on position
        const positionVariation = Math.sin(index * 0.1 + time * 0.3) * 20;
        const finalGray = Math.max(minGray, Math.min(maxGray, grayValue + positionVariation));
        
        // Create RGB color (grayscale)
        const color = `rgb(${finalGray}, ${finalGray}, ${finalGray})`;
        
        // Apply color
        ctx.fillStyle = color;
        
        /**
         * GLOW EFFECT
         * Brighter characters get more glow for dramatic depth
         * Creates a luminous, ethereal quality
         */
        if (finalGray > 120) {
          ctx.shadowColor = color;
          // Scale glow intensity based on brightness
          const glowStrength = ((finalGray - 120) / 135) * config.glowIntensity;
          ctx.shadowBlur = glowStrength;
        } else {
          ctx.shadowBlur = 0;
        }

        // Draw character with configured opacity
        ctx.globalAlpha = config.opacity;
        ctx.fillText(point.char, finalX, finalY);
      });

      // Reset global alpha
      ctx.globalAlpha = 1;

      // Continue animation
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [config]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{
        zIndex: 0,
        mixBlendMode: 'normal',
        background: '#000000'  // Pure black background
      }}
    />
  );
};

/**
 * CUSTOMIZATION GUIDE:
 * 
 * STAR PROPORTIONS:
 * - verticalRadius: Controls height of top/bottom arms (line 72)
 * - horizontalRadius: Controls width of left/right arms (line 73)
 * - innerRadius: Controls tightness of center connection (line 74)
 * 
 * DENSITY & SPACING:
 * - density: Lower = more space between letters, higher = denser (line 40)
 * - charSize: Size of each ASCII character (line 39)
 * 
 * ANIMATION:
 * - pulseSpeed: Speed of breathing effect (line 42)
 * - pulseAmplitude: Strength of breathing (line 43)
 * - time * 0.5: Speed of gradient animation wave (line 319)
 * - index * 0.02: Spacing of gradient wave (line 319)
 * 
 * GRADIENT COLORS:
 * - minGray (40): Darkest shade - adjust for darker/lighter minimum (line 327)
 * - maxGray (255): Brightest shade - always white
 * - positionVariation: Organic variation amount (line 333)
 * 
 * GLOW EFFECT:
 * - glowIntensity: Overall glow strength (line 47)
 * - Threshold (120): When glow starts (line 346)
 * 
 * INTERACTIVITY:
 * - mouseInfluence: How much mouse affects pattern (line 44)
 * - scrollInfluence: How much scroll affects pattern (line 45)
 * - maxDistance: Range of mouse interaction (line 297)
 * 
 * VISIBILITY:
 * - opacity: Overall transparency of animation (line 46)
 * - Use lower opacity if text readability is an issue
 */
