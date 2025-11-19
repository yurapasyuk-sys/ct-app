import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useChartDimensions } from './useChartDimensions';

interface ZScoreDataPoint {
  timestamp: number;
  value: number;
}

interface ZScoreChartProps {
  data: ZScoreDataPoint[];
  title: string;
  height?: number;
  className?: string;
}

export const ZScoreChart: React.FC<ZScoreChartProps> = ({
  data,
  title,
  height = 160,
  className = '',
}) => {
  const { containerRef, dimensions } = useChartDimensions();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverData, setHoverData] = useState<ZScoreDataPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Calculate scales
  const { minVal, maxVal, scaleY, scaleX } = useMemo(() => {
    if (!dimensions.width || !dimensions.height || data.length === 0) {
      return { minVal: -4, maxVal: 4, scaleY: 1, scaleX: 1 };
    }

    let min = -3; // Ensure at least -3 to 3 range
    let max = 3;

    data.forEach(d => {
      min = Math.min(min, d.value);
      max = Math.max(max, d.value);
    });

    // Add padding
    const range = max - min;
    min -= range * 0.1;
    max += range * 0.1;

    return {
      minVal: min,
      maxVal: max,
      scaleY: (dimensions.height - 20) / (max - min),
      scaleX: dimensions.width / (data.length - 1 || 1),
    };
  }, [data, dimensions]);

  const getY = (val: number) => {
    return dimensions.height - 10 - (val - minVal) * scaleY;
  };

  const getX = (index: number) => {
    return index * scaleX;
  };

  const getSegmentColor = (val: number) => {
    if (val < -2) return '#22c55e'; // Green (Risk On)
    if (val > 2) return '#ef4444'; // Red (Risk Off)
    if (val >= -0.5 && val <= 0.5) return '#94a3b8'; // Slate (Neutral)
    if (val < -0.5) return '#3b82f6'; // Blue (Bullish)
    return '#f97316'; // Orange (Bearish)
  };

  // Draw Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions.width || !dimensions.height) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // 1. Draw Background Zones
    const y2 = getY(2);
    const yMinus2 = getY(-2);
    const y0 = getY(0);

    // Red Zone (> 2)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
    ctx.fillRect(0, 0, dimensions.width, y2);

    // Green Zone (< -2)
    ctx.fillStyle = 'rgba(34, 197, 94, 0.05)';
    ctx.fillRect(0, yMinus2, dimensions.width, dimensions.height - yMinus2);

    // 2. Draw Grid Lines
    ctx.lineWidth = 1;
    
    // Zero Line
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(dimensions.width, y0);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'; // Slate 400
    ctx.stroke();

    // Threshold Lines
    ctx.setLineDash([4, 4]);
    
    // +2
    ctx.beginPath();
    ctx.moveTo(0, y2);
    ctx.lineTo(dimensions.width, y2);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.stroke();

    // -2
    ctx.beginPath();
    ctx.moveTo(0, yMinus2);
    ctx.lineTo(dimensions.width, yMinus2);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.stroke();
    
    ctx.setLineDash([]);

    // 3. Draw Z-Score Line (Multi-colored segments)
    ctx.lineWidth = 2;
    
    for (let i = 0; i < data.length - 1; i++) {
      const p1 = data[i];
      const p2 = data[i + 1];
      
      const x1 = getX(i);
      const y1 = getY(p1.value);
      const x2 = getX(i + 1);
      const y2 = getY(p2.value);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      
      // Use color of the starting point for the segment
      ctx.strokeStyle = getSegmentColor(p1.value);
      ctx.stroke();
    }

    // 4. Draw Hover Effects
    if (mousePos && hoverData) {
      const x = mousePos.x;
      const y = getY(hoverData.value);

      // Vertical Line
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Dot
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = getSegmentColor(hoverData.value);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

  }, [dimensions, data, minVal, maxVal, mousePos, hoverData]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || data.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Find closest data point
    const index = Math.min(Math.max(0, Math.round(x / scaleX)), data.length - 1);
    setHoverData(data[index]);
    setMousePos({ x: index * scaleX, y });
  };

  const handleMouseLeave = () => {
    setHoverData(null);
    setMousePos(null);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex justify-between items-center px-2 mb-1 shrink-0">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {hoverData && (
          <div className="flex gap-2 text-xs font-mono">
            <span className="text-muted-foreground">
              {new Date(hoverData.timestamp).toLocaleDateString()}
            </span>
            <span style={{ color: getSegmentColor(hoverData.value) }} className="font-bold">
              {hoverData.value.toFixed(2)}
            </span>
          </div>
        )}
      </div>
      <div 
        ref={containerRef} 
        className="w-full relative cursor-crosshair flex-1 min-h-0"
        style={height ? { height } : undefined}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>
    </div>
  );
};
