import { useEffect, useRef } from 'react';
import type { IChartApi } from 'lightweight-charts';
import type { TensionDataPoint } from '@/lib/tension';

interface TensionGlowProps {
  chartApi: IChartApi | null;
  tensionData: TensionDataPoint[];
  threshold: number;
  width: number;
  height: number;
}

export const TensionGlow: React.FC<TensionGlowProps> = ({
  chartApi,
  tensionData,
  threshold,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const lastDrawTimeRef = useRef<number>(0);
  const isChartReadyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!canvasRef.current || !chartApi || tensionData.length === 0) {
      console.log('[TensionGlow] Not ready:', {
        hasCanvas: !!canvasRef.current,
        hasChartApi: !!chartApi,
        tensionDataLength: tensionData.length,
      });
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[TensionGlow] Failed to get canvas context');
      return;
    }

    // Set canvas dimensions for retina displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    console.log('[TensionGlow] Canvas initialized:', {
      width,
      height,
      dpr,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });

    const timeScale = chartApi.timeScale();
    const priceScale = chartApi.priceScale('right');

    // Filter high-tension zones
    const highTensionZones = tensionData.filter((d) => d.tensionIndex > threshold);
    console.log('[TensionGlow] High tension zones:', {
      total: tensionData.length,
      highTension: highTensionZones.length,
      threshold,
      samples: highTensionZones.slice(0, 3).map(z => ({
        timestamp: z.timestamp,
        tension: z.tensionIndex,
      })),
    });

    // Wait for chart to be ready by checking if we can get valid coordinates
    const checkChartReady = () => {
      const logicalRange = timeScale.getVisibleLogicalRange();
      if (logicalRange && highTensionZones.length > 0) {
        const testTime = Math.floor(highTensionZones[0].timestamp / 1000);
        const testCoord = timeScale.timeToCoordinate(testTime as any);
        if (testCoord !== null) {
          isChartReadyRef.current = true;
          console.log('[TensionGlow] Chart ready, test coordinate:', testCoord);
          return true;
        }
      }
      return false;
    };

    // Subscribe to time range changes to detect when chart is ready
    const handleTimeRangeChange = () => {
      if (!isChartReadyRef.current && checkChartReady()) {
        console.log('[TensionGlow] Chart initialized, starting render loop');
      }
    };

    timeScale.subscribeVisibleLogicalRangeChange(handleTimeRangeChange);

    // Check immediately if already ready
    checkChartReady();

    // Throttled render at ~30fps
    const targetFPS = 30;
    const frameInterval = 1000 / targetFPS;
    let renderCount = 0;

    const render = (timestamp: number) => {
      if (!ctx || !timeScale || !priceScale) return;

      const elapsed = timestamp - lastDrawTimeRef.current;
      if (elapsed < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      lastDrawTimeRef.current = timestamp;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Check if chart is ready
      if (!isChartReadyRef.current) {
        // Draw test gradient to verify canvas works
        const testGradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, 100);
        testGradient.addColorStop(0, 'rgba(255, 0, 0, 0.1)');
        testGradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = testGradient;
        ctx.fillRect(width / 2 - 100, height / 2 - 100, 200, 200);
        
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      // Breathing animation
      const breathingAlpha = 0.05 + 0.03 * Math.sin(timestamp / 1200);

      // Get visible range
      const logicalRange = timeScale.getVisibleLogicalRange();
      if (!logicalRange) {
        animationFrameRef.current = requestAnimationFrame(render);
        return;
      }

      let drawnCount = 0;

      // Render glow for each high-tension zone
      highTensionZones.forEach((point, index) => {
        const timeSeconds = Math.floor(point.timestamp / 1000);
        
        // Get X coordinate from time
        const x = timeScale.timeToCoordinate(timeSeconds as any);
        
        if (x === null || x === undefined) {
          if (renderCount % 30 === 0 && index < 3) {
            console.log('[TensionGlow] Invalid X coordinate:', { timeSeconds, x });
          }
          return;
        }
        
        if (x < 0 || x > width) {
          return; // Outside visible range
        }

        // Get Y coordinate (bottom of chart area, just above x-axis)
        const y = height - 30; // 30px from bottom to stay above x-axis labels

        // Draw radial gradient
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 60);
        
        // Adjust alpha based on tension intensity
        const intensityFactor = Math.min((point.tensionIndex - threshold) / threshold, 1);
        const alpha = breathingAlpha * intensityFactor;

        gradient.addColorStop(0, `rgba(0, 180, 255, ${alpha * 0.8})`);
        gradient.addColorStop(0.5, `rgba(0, 150, 255, ${alpha * 0.4})`);
        gradient.addColorStop(1, `rgba(0, 150, 255, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(x - 60, y - 60, 120, 120);
        
        drawnCount++;

        // Debug log for first few glows every 30 frames (~1 second)
        if (renderCount % 30 === 0 && index < 3) {
          console.log('[TensionGlow] Drawing glow:', {
            index,
            timestamp: new Date(point.timestamp).toISOString(),
            x,
            y,
            alpha: (alpha * 0.8).toFixed(4),
            intensity: intensityFactor.toFixed(2),
          });
        }
      });

      if (renderCount % 30 === 0) {
        console.log('[TensionGlow] Render stats:', {
          drawnCount,
          totalHighTension: highTensionZones.length,
          breathingAlpha: breathingAlpha.toFixed(4),
        });
      }

      renderCount++;
      animationFrameRef.current = requestAnimationFrame(render);
    };

    // Start animation loop
    console.log('[TensionGlow] Starting render loop');
    animationFrameRef.current = requestAnimationFrame(render);

    // Cleanup
    return () => {
      console.log('[TensionGlow] Cleaning up');
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      timeScale.unsubscribeVisibleLogicalRangeChange(handleTimeRangeChange);
    };
  }, [chartApi, tensionData, threshold, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${width}px`,
        height: `${height}px`,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
};
