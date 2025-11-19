import React, { useEffect, useRef, useMemo, useState } from 'react';
import { useChartDimensions } from './useChartDimensions';

export interface ChartDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  [key: string]: any; // Allow extra properties for overlays
}

export interface Overlay {
  id: string;
  type: 'line' | 'histogram' | 'area' | 'pulse';
  dataKey: string;
  color: string;
  width?: number;
  opacity?: number;
  threshold?: number; // For histogram coloring
}

interface QuantChartProps {
  data: ChartDataPoint[];
  overlays?: Overlay[];
  height?: number;
  className?: string;
  showGrid?: boolean;
  padding?: { top: number; bottom: number; right: number };
}

export const QuantChart: React.FC<QuantChartProps> = ({
  data,
  overlays = [],
  height = 400,
  className = '',
  showGrid = true,
  padding = { top: 20, bottom: 30, right: 60 },
}) => {
  const { containerRef, dimensions } = useChartDimensions();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Interaction State
  const [hoverData, setHoverData] = useState<ChartDataPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [offset, setOffset] = useState(0); // Bars from right edge
  const [zoom, setZoom] = useState(1); // Scale factor
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; offset: number } | null>(null);

  // Configuration
  const baseCandleWidth = 5;
  const gapRatio = 0.4;
  const candleWidth = Math.max(1, baseCandleWidth * zoom);
  const gap = Math.max(0, candleWidth * gapRatio);
  const totalBarWidth = candleWidth + gap;

  // Calculate visible range and scales
  const { visibleData, minPrice, maxPrice, priceRange, scaleY, startIndex, hasBottomPanel, mainChartHeight, indicatorHeight } = useMemo(() => {
    if (!dimensions.width || data.length === 0) {
      return { visibleData: [], minPrice: 0, maxPrice: 0, priceRange: 0, scaleY: 0, startIndex: 0, hasBottomPanel: false, mainChartHeight: 0, indicatorHeight: 0 };
    }

    const hasBottomPanel = overlays.some(o => o.type === 'pulse');
    const mainChartHeight = hasBottomPanel ? dimensions.height * 0.75 : dimensions.height;
    const indicatorHeight = hasBottomPanel ? dimensions.height * 0.25 : 0;

    const maxVisibleBars = Math.floor((dimensions.width - padding.right) / totalBarWidth);
    // offset 0 means we see the last maxVisibleBars
    // offset > 0 means we shift back
    const end = data.length - Math.floor(offset);
    const start = end - maxVisibleBars;
    
    // Slice data safely
    const sliceStart = Math.max(0, start);
    const sliceEnd = Math.max(0, end);
    const visibleData = data.slice(sliceStart, sliceEnd);

    let min = Infinity;
    let max = -Infinity;

    visibleData.forEach((d) => {
      min = Math.min(min, d.low);
      max = Math.max(max, d.high);
    });

    if (min === Infinity) { min = 0; max = 100; }

    const range = max - min;
    // Add padding to price range (5% top/bottom)
    const paddedMin = min - range * 0.05;
    const paddedMax = max + range * 0.05;

    return {
      visibleData,
      minPrice: paddedMin,
      maxPrice: paddedMax,
      priceRange: paddedMax - paddedMin,
      scaleY: (mainChartHeight - padding.top - padding.bottom) / (paddedMax - paddedMin || 1),
      startIndex: start,
      hasBottomPanel,
      mainChartHeight,
      indicatorHeight
    };
  }, [data, dimensions.width, dimensions.height, overlays, padding, offset, totalBarWidth]);

  // Helper to convert price to Y coordinate
  const getY = (price: number) => {
    // Price is always in main chart
    return mainChartHeight - padding.bottom - (price - minPrice) * scaleY;
  };

  // Helper to convert index to X coordinate
  const getX = (index: number) => {
    return index * totalBarWidth + totalBarWidth / 2;
  };

  // Event Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, offset });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setMousePos({ x, y });

    // Dragging Logic
    if (isDragging && dragStart) {
      const dx = e.clientX - dragStart.x;
      const barsMoved = dx / totalBarWidth;
      // Dragging right (dx > 0) -> Move into history -> Increase offset
      // Allow negative offset (scrolling into future)
      const maxVisibleBars = Math.floor((dimensions.width - padding.right) / totalBarWidth);
      const minOffset = -maxVisibleBars / 2;
      const newOffset = Math.max(minOffset, dragStart.offset + barsMoved);
      setOffset(newOffset);
      return; // Skip hover update while dragging for performance?
    }

    // Hover Logic
    const index = Math.floor((x) / totalBarWidth);
    if (index >= 0 && index < visibleData.length) {
      setHoverData(visibleData[index]);
    } else {
      setHoverData(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Prevent default page scroll if inside chart
    // Note: React synthetic events might need passive: false in native listener for preventDefault to work reliably for wheel
    // But here we just update state.
    
    if (Math.abs(e.deltaY) > 0) {
        const zoomSpeed = 0.001;
        const scrollSpeed = 0.5;

        // Zoom on Wheel (Standard behavior for modern charts)
        // Calculate zoom center (mouse position)
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        
        // Current state
        const currentZoom = zoom;
        const currentOffset = offset;
        
        // Calculate new zoom
        // deltaY > 0 (scroll down) -> Zoom Out
        // deltaY < 0 (scroll up) -> Zoom In
        const zoomFactor = Math.exp(-e.deltaY * zoomSpeed);
        const newZoom = Math.max(0.1, Math.min(20, currentZoom * zoomFactor));
        
        // Calculate new offset to keep mouseX pointing to same time
        // X = (Index - StartIndex) * TotalWidth + TotalWidth/2
        // We want Index at MouseX to remain constant
        
        // Current dimensions
        const currentCandleWidth = Math.max(1, baseCandleWidth * currentZoom);
        const currentGap = Math.max(0, currentCandleWidth * gapRatio);
        const currentTotalWidth = currentCandleWidth + currentGap;
        
        const maxVisibleBars = Math.floor((dimensions.width - padding.right) / currentTotalWidth);
        const currentEnd = data.length - Math.floor(currentOffset);
        const currentStart = Math.max(0, currentEnd - maxVisibleBars);
        
        // Index under mouse
        const barsFromLeft = (mouseX) / currentTotalWidth;
        const indexAtMouse = currentStart + barsFromLeft;
        
        // New dimensions
        const newCandleWidth = Math.max(1, baseCandleWidth * newZoom);
        const newGap = Math.max(0, newCandleWidth * gapRatio);
        const newTotalWidth = newCandleWidth + newGap;
        
        const newMaxVisibleBars = Math.floor((dimensions.width - padding.right) / newTotalWidth);
        
        // We want: newStart + (mouseX / newTotalWidth) = indexAtMouse
        // newStart = indexAtMouse - (mouseX / newTotalWidth)
        // newEnd = newStart + newMaxVisibleBars
        // newOffset = data.length - newEnd
        
        const newStart = indexAtMouse - (mouseX / newTotalWidth);
        const newEnd = newStart + newMaxVisibleBars;
        const minOffset = -newMaxVisibleBars / 2;
        const newOffset = Math.max(minOffset, data.length - newEnd);
        
        setZoom(newZoom);
        setOffset(newOffset);
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoverData(null);
    setIsDragging(false);
    setDragStart(null);
  };

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions.width || !dimensions.height) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Calculate X-axis shift for negative scrolling (future/empty space)
    // startIndex can be negative. visibleData starts at Math.max(0, startIndex).
    // If startIndex is -10, visibleData[0] is data[0], which should be at index 10.
    // shift = Math.max(0, startIndex) - startIndex
    const xShift = Math.max(0, startIndex) - startIndex;

    // Draw Grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)'; // Darker grid for light theme
      ctx.lineWidth = 1;
      
      // Horizontal lines (Main Chart)
      const gridSteps = 5;
      for (let i = 0; i <= gridSteps; i++) {
        const y = padding.top + (i * (mainChartHeight - padding.top - padding.bottom)) / gridSteps;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width - padding.right, y);
        ctx.stroke();
        
        // Price Labels on Y-Axis
        const price = maxPrice - (i * (maxPrice - minPrice)) / gridSteps;
        ctx.fillStyle = '#64748b'; // Slate-500
        ctx.font = '11px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(price.toFixed(2), dimensions.width - padding.right + 5, y + 4);
      }
      
      // Vertical Axis Line
      ctx.beginPath();
      ctx.moveTo(dimensions.width - padding.right, 0);
      ctx.lineTo(dimensions.width - padding.right, dimensions.height);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.stroke();

      // Separator Line if split panel
      if (hasBottomPanel) {
          ctx.beginPath();
          ctx.moveTo(0, mainChartHeight);
          ctx.lineTo(dimensions.width, mainChartHeight);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.lineWidth = 2;
          ctx.stroke();
      }
    }

    // Draw Overlays (Lines)
    overlays.filter(o => o.type === 'line').forEach(overlay => {
      ctx.beginPath();
      ctx.strokeStyle = overlay.color;
      ctx.lineWidth = overlay.width || 2;
      
      let started = false;
      visibleData.forEach((d, i) => {
        const val = d[overlay.dataKey];
        if (typeof val !== 'number') return;
        
        const x = getX(i + xShift);
        const y = getY(val);
        
        // Clip to chart area if RVWAP is way off scale
        if (y < padding.top || y > mainChartHeight - padding.bottom) {
            // We could break the line or clamp it. 
            // For now, let canvas handle clipping naturally via path, but maybe we should clip rect?
        }
        
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });

    // Draw Candles
    visibleData.forEach((d, i) => {
      const x = getX(i + xShift);
      const openY = getY(d.open);
      const closeY = getY(d.close);
      const highY = getY(d.high);
      const lowY = getY(d.low);

      const isUp = d.close >= d.open;
      
      // Bloomberg 2025 Colors
      // Up: Body #b1b2b7, Border #212223, Wick #212223
      // Down: Body #68696d, Border #212223, Wick #212223
      
      const bodyColor = isUp ? '#b1b2b7' : '#68696d';
      const borderColor = '#212223';
      const wickColor = '#212223';

      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = borderColor; // Border color
      ctx.lineWidth = 1;

      // Wick
      ctx.beginPath();
      ctx.strokeStyle = wickColor;
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      const bodyY = Math.min(openY, closeY);
      
      ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
      ctx.strokeRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
    });

    // Draw Market Pulse (Pulse Type)
    overlays.filter(o => o.type === 'pulse').forEach(overlay => {
      // Pulse Panel Dimensions
      const panelTop = mainChartHeight;
      const panelHeight = indicatorHeight;
      const panelBottom = dimensions.height - padding.bottom; // Leave space for X-axis labels?
      // Actually padding.bottom is global.
      // Let's say panelBottom is dimensions.height - padding.bottom
      // And panelTop is mainChartHeight + padding.top (small gap)
      
      // We need a local scale for Pulse (0-100)
      const minVal = 0;
      const maxVal = 100;
      const pulseScaleY = (panelHeight - padding.bottom) / (maxVal - minVal);
      
      const getPulseY = (val: number) => {
          return dimensions.height - padding.bottom - (val - minVal) * pulseScaleY;
      };

      // Draw Pulse Grid/Axis
      if (showGrid) {
          // 50 line
          const y50 = getPulseY(50);
          ctx.beginPath();
          ctx.setLineDash([2, 2]);
          ctx.moveTo(0, y50);
          ctx.lineTo(dimensions.width - padding.right, y50);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Labels (0, 50, 100)
          ctx.fillStyle = '#64748b';
          ctx.textAlign = 'left';
          ctx.fillText('100', dimensions.width - padding.right + 5, getPulseY(100) + 4);
          ctx.fillText('50', dimensions.width - padding.right + 5, y50 + 4);
          ctx.fillText('0', dimensions.width - padding.right + 5, getPulseY(0) + 4);
      }

      // Create Gradient
      const gradient = ctx.createLinearGradient(0, panelTop, 0, dimensions.height - padding.bottom);
      gradient.addColorStop(0, `${overlay.color}40`); // 25% opacity
      gradient.addColorStop(1, `${overlay.color}05`); // ~0% opacity

      // Helper to draw the area path
      const drawAreaPath = () => {
        ctx.beginPath();
        let started = false;
        visibleData.forEach((d, i) => {
          const val = d[overlay.dataKey];
          if (typeof val !== 'number') return;
          const x = getX(i + xShift);
          const y = getPulseY(val);
          if (!started) {
            ctx.moveTo(x, dimensions.height - padding.bottom);
            ctx.lineTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        });
        if (visibleData.length > 0) {
            const lastX = getX(visibleData.length - 1 + xShift);
            ctx.lineTo(lastX, dimensions.height - padding.bottom);
            ctx.closePath();
        }
      };

      // Draw Main Area
      drawAreaPath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw Highlight Area (Red Gradient for > Threshold)
      if (overlay.threshold) {
          const threshY = getPulseY(overlay.threshold);
          
          ctx.save();
          ctx.beginPath();
          // Clip region: Top of panel down to threshold line
          // Note: threshY is the Y coordinate of the threshold line.
          // Values > threshold have Y < threshY.
          // So we clip everything above threshY.
          ctx.rect(0, panelTop, dimensions.width, Math.max(0, threshY - panelTop));
          ctx.clip();
          
          drawAreaPath();
          
          // Red gradient
          const redGradient = ctx.createLinearGradient(0, panelTop, 0, dimensions.height - padding.bottom);
          redGradient.addColorStop(0, '#ef444460'); // Red 
          redGradient.addColorStop(1, '#ef444400'); // Transparent
          ctx.fillStyle = redGradient;
          ctx.fill();
          
          ctx.restore();
      }

      // Draw Line on top
      ctx.beginPath();
      let started = false;
      visibleData.forEach((d, i) => {
        const val = d[overlay.dataKey];
        if (typeof val !== 'number') return;
        const x = getX(i + xShift);
        const y = getPulseY(val);
        
        if (started) {
             const prevX = getX(i-1 + xShift);
             const prevVal = visibleData[i-1][overlay.dataKey];
             const prevY = getPulseY(prevVal);
             
             ctx.beginPath();
             ctx.moveTo(prevX, prevY);
             ctx.lineTo(x, y);
             
             // Color logic
             let strokeColor = overlay.color;
             if (overlay.threshold && val > overlay.threshold) {
                 strokeColor = '#ef4444'; // Red for high tension
             } else if (val < 20) {
                 strokeColor = '#10b981'; // Green for low tension
             }
             
             ctx.strokeStyle = strokeColor;
             ctx.lineWidth = 2;
             ctx.stroke();
        }
        started = true;
      });

      // Draw Pulsating Dot at the end
      if (visibleData.length > 0) {
          const lastIdx = visibleData.length - 1;
          const lastVal = visibleData[lastIdx][overlay.dataKey];
          if (typeof lastVal === 'number') {
              const x = getX(lastIdx + xShift);
              const y = getPulseY(lastVal);
              
              ctx.beginPath();
              ctx.arc(x, y, 4, 0, Math.PI * 2);
              ctx.fillStyle = overlay.color;
              if (overlay.threshold && lastVal > overlay.threshold) ctx.fillStyle = '#ef4444';
              ctx.fill();
              
              ctx.beginPath();
              ctx.arc(x, y, 8, 0, Math.PI * 2);
              ctx.fillStyle = `${ctx.fillStyle}40`; // Transparent
              ctx.fill();
          }
      }
    });

    // Draw Histograms (Legacy support)
    overlays.filter(o => o.type === 'histogram').forEach(overlay => {
      const histHeight = dimensions.height * 0.2;
      const histBottom = dimensions.height - padding.bottom;
      
      // Find max value for scaling
      let maxVal = 0;
      visibleData.forEach(d => {
        const val = d[overlay.dataKey];
        if (typeof val === 'number') maxVal = Math.max(maxVal, val);
      });
      
      if (maxVal === 0) maxVal = 1;

      visibleData.forEach((d, i) => {
        const val = d[overlay.dataKey];
        if (typeof val !== 'number') return;

        const x = getX(i + xShift);
        const barHeight = (val / maxVal) * histHeight;
        const y = histBottom - barHeight;
        
        // Color logic based on threshold
        let color = overlay.color;
        if (overlay.threshold && val > overlay.threshold) {
            color = '#22D3EE'; // Cyan for high tension
        }

        ctx.fillStyle = color;
        ctx.globalAlpha = overlay.opacity || 0.5;
        ctx.fillRect(x - candleWidth / 2, y, candleWidth, barHeight);
        ctx.globalAlpha = 1.0;
      });
    });

  }, [dimensions, visibleData, minPrice, maxPrice, overlays, showGrid]);

  // Interaction Layer
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !dimensions.width || !dimensions.height) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    if (mousePos && hoverData) {
      const x = mousePos.x;
      const y = mousePos.y;

      // Crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;

      // Vertical
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.stroke();

      // Horizontal
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dimensions.width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price Label (Right)
      const price = minPrice + ((dimensions.height - padding.bottom - y) / scaleY);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(dimensions.width - 60, y - 10, 60, 20);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(price.toFixed(2), dimensions.width - 55, y + 4);

      // Time Label (Bottom)
      const date = new Date(hoverData.timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - 25, dimensions.height - 20, 50, 20);
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText(timeStr, x, dimensions.height - 6);
      
      // Highlight current candle
      // Find index
      const index = visibleData.indexOf(hoverData);
      if (index >= 0) {
          const xShift = Math.max(0, startIndex) - startIndex;
          const candleX = getX(index + xShift);
          // Glow effect
          ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
          ctx.shadowBlur = 10;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.fillRect(candleX - candleWidth/2 - 1, padding.top, candleWidth + 2, dimensions.height - padding.bottom - padding.top);
          ctx.shadowBlur = 0;
      }
    }
  }, [mousePos, hoverData, dimensions, minPrice, scaleY, visibleData, startIndex]);

  return (
    <div 
      ref={containerRef} 
      className={`relative ${className}`} 
      style={{ height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Main Chart Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Interaction Layer */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 z-20 cursor-crosshair"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Floating Tooltip */}
      {hoverData && (
        <div className="absolute top-2 left-2 z-30 bg-background/80 backdrop-blur-sm border border-border p-2 rounded text-xs font-mono shadow-lg pointer-events-none">
          <div className="flex gap-4">
            <span className="text-muted-foreground">O: <span className="text-foreground">{hoverData.open.toFixed(2)}</span></span>
            <span className="text-muted-foreground">H: <span className="text-foreground">{hoverData.high.toFixed(2)}</span></span>
            <span className="text-muted-foreground">L: <span className="text-foreground">{hoverData.low.toFixed(2)}</span></span>
            <span className="text-muted-foreground">C: <span className={`font-bold ${hoverData.close >= hoverData.open ? 'text-emerald-500' : 'text-red-500'}`}>{hoverData.close.toFixed(2)}</span></span>
          </div>
          {overlays.map(o => {
             const val = hoverData[o.dataKey];
             if (typeof val !== 'number') return null;
             return (
               <div key={o.id} className="mt-1 flex gap-2">
                 <span style={{ color: o.color }}>{o.id}:</span>
                 <span>{val.toFixed(2)}</span>
               </div>
             );
          })}
        </div>
      )}
    </div>
  );
};
