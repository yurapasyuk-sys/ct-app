import React, { useEffect, useRef, useMemo, useState } from "react";
import { useChartDimensions } from "./useChartDimensions";

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
  label?: string; // Display name for legend
  type:
    | "line"
    | "histogram"
    | "area"
    | "pulse"
    | "oscillator"
    | "z-score"
    | "band";
  dataKey: string;
  upperDataKey?: string; // For band
  lowerDataKey?: string; // For band
  color: string;
  width?: number;
  opacity?: number;
  threshold?: number; // For histogram coloring
  domain?: [number, number]; // Custom domain for oscillator/panel
  yAxisId?: string; // 'left' | 'right' or custom id
  panelId?: number; // Which panel this overlay belongs to (0 = main, 1+ = bottom panels)
}

interface QuantChartProps {
  data: ChartDataPoint[];
  overlays?: Overlay[];
  height?: number | string;
  className?: string;
  showGrid?: boolean;
  padding?: { top: number; bottom: number; right: number; left?: number };
  chartType?: "candle" | "line" | "area";
  panelRatio?: number;
  onPanelRatioChange?: (ratio: number) => void;
  mainSeriesName?: string;
  showLegend?: boolean;
}

const Legend = ({
  items,
}: {
  items: { color: string; label: string; type?: string }[];
}) => {
  if (items.length === 0) return null;
  return (
    <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm p-2 rounded border border-border/50 text-xs z-10 pointer-events-none shadow-sm">
      <div className="flex flex-col gap-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`w-3 h-3 ${item.type === "candle" ? "" : "rounded-full"}`}
              style={{
                backgroundColor: item.color,
                border:
                  item.type === "candle" ? "1px solid " + item.color : "none",
              }}
            />
            <span className="text-muted-foreground font-medium">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const QuantChart: React.FC<QuantChartProps> = ({
  data,
  overlays = [],
  height = 400,
  className = "",
  showGrid = true,
  padding = { top: 20, bottom: 30, right: 60, left: 0 },
  chartType = "candle",
  panelRatio = 0.3,
  onPanelRatioChange,
  mainSeriesName,
  showLegend = true,
}) => {
  const { containerRef, dimensions } = useChartDimensions();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Interaction State
  const [hoverData, setHoverData] = useState<ChartDataPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [offset, setOffset] = useState(0); // Bars from right edge
  const [zoom, setZoom] = useState(1); // Scale factor
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{
    x: number;
    offset: number;
  } | null>(null);

  // Resize states for panel separator
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeStartRatio, setResizeStartRatio] = useState(0);

  // Configuration
  const baseCandleWidth = 5;
  const gapRatio = 0.4;
  const candleWidth = Math.max(1, baseCandleWidth * zoom);
  const gap = Math.max(0, candleWidth * gapRatio);
  const totalBarWidth = candleWidth + gap;

  // Calculate visible range and scales
  const {
    visibleData,
    minPrice,
    maxPrice,
    priceRange,
    scaleY,
    startIndex,
    panels,
    mainChartHeight,
    extraScales,
  } = useMemo(() => {
    if (!dimensions.width || data.length === 0) {
      return {
        visibleData: [],
        minPrice: 0,
        maxPrice: 0,
        priceRange: 0,
        scaleY: 0,
        startIndex: 0,
        panels: [],
        mainChartHeight: 0,
        extraScales: {},
      };
    }

    // Count unique panels (panelId > 0)
    const panelOverlays = overlays.filter(
      (o) =>
        o.type === "pulse" || o.type === "oscillator" || o.type === "z-score",
    );
    const panelIds = Array.from(
      new Set(panelOverlays.map((o) => o.panelId || 1)),
    );
    const numPanels = panelIds.length;

    const ratio = panelRatio;
    const totalIndicatorHeight = numPanels > 0 ? dimensions.height * ratio : 0;
    const mainChartHeight =
      numPanels > 0 ? dimensions.height * (1 - ratio) : dimensions.height;
    const panelHeight = numPanels > 0 ? totalIndicatorHeight / numPanels : 0;

    // Create panel info array
    const panels = panelIds
      .sort((a, b) => a - b)
      .map((id, index) => ({
        id,
        top: mainChartHeight + index * panelHeight,
        height: panelHeight,
      }));

    const maxVisibleBars = Math.floor(
      (dimensions.width - (padding.right + (padding.left || 0))) /
        totalBarWidth,
    );
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

    if (min === Infinity) {
      min = 0;
      max = 100;
    }

    const range = max - min;
    // Add padding to price range (5% top/bottom)
    const paddedMin = min - range * 0.05;
    const paddedMax = max + range * 0.05;

    // Calculate extra scales for overlays with yAxisId
    const extraScales: Record<
      string,
      { min: number; max: number; scale: number }
    > = {};
    const axisIds = Array.from(
      new Set(overlays.map((o) => o.yAxisId).filter(Boolean)),
    );

    axisIds.forEach((axisId) => {
      let axisMin = Infinity;
      let axisMax = -Infinity;

      // Find all overlays using this axis
      const axisOverlays = overlays.filter((o) => o.yAxisId === axisId);

      visibleData.forEach((d) => {
        axisOverlays.forEach((o) => {
          const val = d[o.dataKey];
          if (typeof val === "number") {
            axisMin = Math.min(axisMin, val);
            axisMax = Math.max(axisMax, val);
          }
        });
      });

      if (axisMin === Infinity) {
        axisMin = 0;
        axisMax = 100;
      }

      const axisRange = axisMax - axisMin;
      const pMin = axisMin - axisRange * 0.05;
      const pMax = axisMax + axisRange * 0.05;
      const pRange = pMax - pMin;

      extraScales[axisId!] = {
        min: pMin,
        max: pMax,
        scale: (mainChartHeight - padding.top - padding.bottom) / (pRange || 1),
      };
    });

    return {
      visibleData,
      minPrice: paddedMin,
      maxPrice: paddedMax,
      priceRange: paddedMax - paddedMin,
      scaleY:
        (mainChartHeight - padding.top - padding.bottom) /
        (paddedMax - paddedMin || 1),
      startIndex: start,
      panels,
      mainChartHeight,
      extraScales,
    };
  }, [dimensions, data, offset, zoom, overlays, panelRatio, padding]);

  const legendItems = useMemo(() => {
    if (!showLegend) return [];
    const items = [];

    // Main Series
    // Only show main series if it's not just a container for overlays
    // If chartType is 'candle', we use green.
    const mainName =
      mainSeriesName || (chartType === "candle" ? "Price" : "Value");
    const mainColor = "#00FF9D"; // Hardcoded in render logic

    // We assume there is always a main series unless explicitly disabled (which isn't an option yet)
    // But for CrossPairAnalyzer, the main series IS the ratio.
    items.push({ color: mainColor, label: mainName, type: chartType });

    // Overlays
    overlays.forEach((o) => {
      items.push({ color: o.color, label: o.label || o.id, type: o.type });
    });

    return items;
  }, [showLegend, mainSeriesName, chartType, overlays]);

  // Helper to convert price to Y coordinate
  const getY = (price: number, axisId?: string) => {
    if (axisId && extraScales[axisId]) {
      const { min, scale } = extraScales[axisId];
      return mainChartHeight - padding.bottom - (price - min) * scale;
    }
    // Price is always in main chart
    return mainChartHeight - padding.bottom - (price - minPrice) * scaleY;
  };

  // Helper to convert index to X coordinate
  const getX = (index: number) => {
    return (padding.left || 0) + index * totalBarWidth + totalBarWidth / 2;
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
      const maxVisibleBars = Math.floor(
        (dimensions.width - padding.right) / totalBarWidth,
      );
      const minOffset = -maxVisibleBars / 2;
      const newOffset = Math.max(minOffset, dragStart.offset + barsMoved);
      setOffset(newOffset);
      return; // Skip hover update while dragging for performance?
    }

    // Hover Logic
    const index = Math.floor(x / totalBarWidth);
    if (index >= 0 && index < visibleData.length) {
      setHoverData(visibleData[index]);
    } else {
      setHoverData(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Prevent default page scroll when zooming chart
    e.preventDefault();
    e.stopPropagation();

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

      const maxVisibleBars = Math.floor(
        (dimensions.width - padding.right) / currentTotalWidth,
      );
      const currentEnd = data.length - Math.floor(currentOffset);
      const currentStart = Math.max(0, currentEnd - maxVisibleBars);

      // Index under mouse
      const barsFromLeft = mouseX / currentTotalWidth;
      const indexAtMouse = currentStart + barsFromLeft;

      // New dimensions
      const newCandleWidth = Math.max(1, baseCandleWidth * newZoom);
      const newGap = Math.max(0, newCandleWidth * gapRatio);
      const newTotalWidth = newCandleWidth + newGap;

      const newMaxVisibleBars = Math.floor(
        (dimensions.width - padding.right) / newTotalWidth,
      );

      // We want: newStart + (mouseX / newTotalWidth) = indexAtMouse
      // newStart = indexAtMouse - (mouseX / newTotalWidth)
      // newEnd = newStart + newMaxVisibleBars
      // newOffset = data.length - newEnd

      const newStart = indexAtMouse - mouseX / newTotalWidth;
      const newEnd = newStart + newMaxVisibleBars;
      const minOffset = -newMaxVisibleBars / 2;
      const newOffset = Math.max(minOffset, data.length - newEnd);

      setZoom(newZoom);
      setOffset(newOffset);
    }
  };

  // Setup native wheel listener with passive: false to enable preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
    };

    container.addEventListener("wheel", wheelHandler, { passive: false });

    return () => {
      container.removeEventListener("wheel", wheelHandler);


  // Handle panel resizing
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStartY(e.clientY);
    setResizeStartRatio(panelRatio);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || !dimensions.height) return;
      
      const deltaY = e.clientY - resizeStartY;
      const deltaRatio = deltaY / dimensions.height;
      let newRatio = resizeStartRatio + deltaRatio;
      
      // Clamp between 0.1 and 0.7
      newRatio = Math.max(0.1, Math.min(0.7, newRatio));
      
      if (onPanelRatioChange) {
        onPanelRatioChange(newRatio);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStartY, resizeStartRatio, onPanelRatioChange, dimensions.height]);
    };
  }, []);

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoverData(null);
    setIsDragging(false);
    setDragStart(null);
  };

  // Touch Handlers for Mobile Scrolling
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, offset });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && dragStart && e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragStart.x;
      const barsMoved = dx / totalBarWidth;

      // Dragging right (dx > 0) -> Move into history -> Increase offset
      const maxVisibleBars = Math.floor(
        (dimensions.width - padding.right) / totalBarWidth,
      );
      const minOffset = -maxVisibleBars / 2;
      const newOffset = Math.max(minOffset, dragStart.offset + barsMoved);

      setOffset(newOffset);

      // Update hover data for touch (optional, maybe too noisy)
      // const rect = containerRef.current?.getBoundingClientRect();
      // if (rect) {
      //    const x = e.touches[0].clientX - rect.left;
      //    const y = e.touches[0].clientY - rect.top;
      //    setMousePos({ x, y });
      // }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragStart(null);
    setMousePos(null);
    setHoverData(null);
  };

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions.width || !dimensions.height) return;

    const ctx = canvas.getContext("2d");
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
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"; // Light grid for dark mode visibility
      ctx.lineWidth = 1;

      // Horizontal lines (Main Chart)
      const gridSteps = 5;
      for (let i = 0; i <= gridSteps; i++) {
        const y =
          padding.top +
          (i * (mainChartHeight - padding.top - padding.bottom)) / gridSteps;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(dimensions.width - padding.right, y);
        ctx.stroke();

        // Price Labels on Y-Axis
        const price = maxPrice - (i * (maxPrice - minPrice)) / gridSteps;
        ctx.fillStyle = "#94a3b8"; // Slate-400
        ctx.font = '11px "Inter", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText(
          price.toFixed(2),
          dimensions.width - padding.right + 5,
          y + 4,
        );
      }

      // Vertical Axis Line
      ctx.beginPath();
      ctx.moveTo(dimensions.width - padding.right, 0);
      ctx.lineTo(dimensions.width - padding.right, dimensions.height);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.stroke();

      // Draw Extra Scales on Left
      const extraAxisIds = Object.keys(extraScales);
      extraAxisIds.forEach((axisId, idx) => {
        const { min, max } = extraScales[axisId];
        const axisX = (padding.left || 60) - idx * 50; // Stagger axes if multiple

        // Draw Axis Line
        ctx.beginPath();
        ctx.moveTo(axisX, padding.top);
        ctx.lineTo(axisX, mainChartHeight - padding.bottom);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.stroke();

        // Draw Labels
        const steps = 5;
        for (let i = 0; i <= steps; i++) {
          const y =
            padding.top +
            (i * (mainChartHeight - padding.top - padding.bottom)) / steps;
          const price = max - (i * (max - min)) / steps;

          // Find color of overlay using this axis
          const overlay = overlays.find((o) => o.yAxisId === axisId);
          ctx.fillStyle = overlay?.color || "#94a3b8";

          ctx.font = '10px "Inter", sans-serif';
          ctx.textAlign = "right";
          ctx.fillText(price.toFixed(2), axisX - 5, y + 4);
        }
      });

      // Separator Lines for panels
      panels.forEach((panel) => {
        ctx.beginPath();
        ctx.moveTo(0, panel.top);
        ctx.lineTo(dimensions.width, panel.top);
        ctx.strokeStyle = "rgba(100,100,100,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // Draw Bands (Fill between two lines)
    overlays
      .filter((o) => o.type === "band")
      .forEach((overlay) => {
        if (!overlay.upperDataKey || !overlay.lowerDataKey) return;

        ctx.beginPath();
        let started = false;

        // Top line (forward)
        visibleData.forEach((d, i) => {
          const val = d[overlay.upperDataKey!];
          if (typeof val !== "number") return;
          const x = getX(i + xShift);
          const y = getY(val, overlay.yAxisId);

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        });

        // Bottom line (backward)
        for (let i = visibleData.length - 1; i >= 0; i--) {
          const d = visibleData[i];
          const val = d[overlay.lowerDataKey!];
          if (typeof val !== "number") continue;
          const x = getX(i + xShift);
          const y = getY(val, overlay.yAxisId);
          ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fillStyle = overlay.color;
        ctx.globalAlpha = overlay.opacity || 0.2;
        ctx.fill();
        ctx.globalAlpha = 1.0;
      });

    // Draw Overlays (Lines)
    overlays
      .filter((o) => o.type === "line")
      .forEach((overlay) => {
        ctx.beginPath();
        ctx.strokeStyle = overlay.color;
        ctx.lineWidth = overlay.width || 2;

        let started = false;
        visibleData.forEach((d, i) => {
          const val = d[overlay.dataKey];
          if (typeof val !== "number") return;

          const x = getX(i + xShift);
          const y = getY(val, overlay.yAxisId);

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

    // Draw Main Chart (Candles or Line/Area)
    if (chartType === "candle") {
      visibleData.forEach((d, i) => {
        const x = getX(i + xShift);
        const openY = getY(d.open);
        const closeY = getY(d.close);
        const highY = getY(d.high);
        const lowY = getY(d.low);

        const isUp = d.close >= d.open;

        // Singularity v6 Palette
        // Up: Bullish (#10b981), Down: Bearish (#ef4444)

        const bodyColor = isUp ? "#10b981" : "#ef4444";
        const borderColor = isUp ? "#10b981" : "#ef4444";
        const wickColor = isUp ? "#10b981" : "#ef4444";

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

        // Fill for both (Solid candles)
        ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight);
        // ctx.strokeRect(x - candleWidth / 2, bodyY, candleWidth, bodyHeight); // Optional border
      });
    } else {
      // Draw Line / Area
      const lineColor = "#10b981"; // Bullish Green

      // 1. Draw Area (Fill) first so line is on top
      if (chartType === "area" && visibleData.length > 0) {
        ctx.beginPath();
        let started = false;
        visibleData.forEach((d, i) => {
          const x = getX(i + xShift);
          const y = getY(d.close);
          if (!started) {
            ctx.moveTo(x, mainChartHeight - padding.bottom); // Start at bottom
            ctx.lineTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        });
        // Close path to bottom right
        const lastX = getX(visibleData.length - 1 + xShift);
        ctx.lineTo(lastX, mainChartHeight - padding.bottom);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(
          0,
          padding.top,
          0,
          mainChartHeight - padding.bottom,
        );
        gradient.addColorStop(0, "rgba(16, 185, 129, 0.2)"); // Bullish Green 20%
        gradient.addColorStop(1, "rgba(16, 185, 129, 0.0)");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // 2. Draw Line
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;

      let started = false;
      visibleData.forEach((d, i) => {
        const x = getX(i + xShift);
        const y = getY(d.close);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }

    // Draw Market Pulse (Pulse Type)
    overlays
      .filter((o) => o.type === "pulse")
      .forEach((overlay) => {
        // Find the panel for this overlay
        const panelId = overlay.panelId || 1;
        const panel = panels.find((p) => p.id === panelId);

        if (!panel) return; // Skip if panel not found

        // Pulse Panel Dimensions
        const panelTop = panel.top;
        const panelHeight = panel.height;
        const pulsePaddingTop = 15; // Micro offset to prevent hitting the ceiling

        // We need a local scale for Pulse (0-100)
        const minVal = 0;
        const maxVal = 100;
        const pulseScaleY =
          (panelHeight - padding.bottom - pulsePaddingTop) / (maxVal - minVal);

        const getPulseY = (val: number) => {
          return (
            dimensions.height - padding.bottom - (val - minVal) * pulseScaleY
          );
        };

        // Draw High Tension Zones (Vertical Highlights)
        if (overlay.threshold) {
          // Create gradient for the zone (fading up)
          const zoneGradient = ctx.createLinearGradient(
            0,
            dimensions.height - padding.bottom,
            0,
            padding.top,
          );
          zoneGradient.addColorStop(0, "rgba(244, 63, 94, 0.25)"); // Bottom (Pulse area) - visible
          zoneGradient.addColorStop(0.7, "rgba(244, 63, 94, 0.05)"); // Mid-upper - faint
          zoneGradient.addColorStop(1, "rgba(244, 63, 94, 0.0)"); // Top - transparent

          ctx.fillStyle = zoneGradient;
          visibleData.forEach((d, i) => {
            const val = d[overlay.dataKey];
            if (typeof val === "number" && val > overlay.threshold!) {
              const x = getX(i + xShift);
              const y = getPulseY(val);
              // Draw strip from Top of chart down to the Pulse Line (y)
              // This ensures the ray starts at the line and goes up, not passing through the area below
              ctx.fillRect(
                x - totalBarWidth / 2,
                padding.top,
                totalBarWidth + 0.5,
                Math.max(0, y - padding.top),
              );
            }
          });
        }

        // Draw Pulse Grid/Axis
        if (showGrid) {
          // 50 line
          const y50 = getPulseY(50);
          ctx.beginPath();
          ctx.setLineDash([2, 2]);
          ctx.moveTo(0, y50);
          ctx.lineTo(dimensions.width - padding.right, y50);
          ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
          ctx.stroke();
          ctx.setLineDash([]);

          // Labels (0, 50, 100)
          ctx.fillStyle = "#64748b";
          ctx.textAlign = "left";
          ctx.fillText(
            "100",
            dimensions.width - padding.right + 5,
            getPulseY(100) + 4,
          );
          ctx.fillText("50", dimensions.width - padding.right + 5, y50 + 4);
          ctx.fillText(
            "0",
            dimensions.width - padding.right + 5,
            getPulseY(0) + 4,
          );
        }

        // Create Gradient
        const gradient = ctx.createLinearGradient(
          0,
          panelTop,
          0,
          dimensions.height - padding.bottom,
        );
        gradient.addColorStop(0, `${overlay.color}40`); // 25% opacity
        gradient.addColorStop(1, `${overlay.color}05`); // ~0% opacity

        // Helper to draw the area path
        const drawAreaPath = () => {
          ctx.beginPath();
          let started = false;
          visibleData.forEach((d, i) => {
            const val = d[overlay.dataKey];
            if (typeof val !== "number") return;
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
          ctx.rect(
            0,
            panelTop,
            dimensions.width,
            Math.max(0, threshY - panelTop),
          );
          ctx.clip();

          drawAreaPath();

          // Red gradient
          const redGradient = ctx.createLinearGradient(
            0,
            panelTop,
            0,
            dimensions.height - padding.bottom,
          );
          redGradient.addColorStop(0, "#e11d4860"); // Rose-600
          redGradient.addColorStop(1, "#e11d4800"); // Transparent
          ctx.fillStyle = redGradient;
          ctx.fill();

          ctx.restore();
        }

        // Draw Line on top
        ctx.beginPath();
        let started = false;
        visibleData.forEach((d, i) => {
          const val = d[overlay.dataKey];
          if (typeof val !== "number") return;
          const x = getX(i + xShift);
          const y = getPulseY(val);

          if (started) {
            const prevX = getX(i - 1 + xShift);
            const prevVal = visibleData[i - 1][overlay.dataKey];
            const prevY = getPulseY(prevVal);

            ctx.beginPath();
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(x, y);

            // Color logic
            let strokeColor = overlay.color;
            if (overlay.threshold && val > overlay.threshold) {
              strokeColor = "#e11d48"; // Rose-600 for high tension
            } else if (val < 20) {
              strokeColor = "#0891b2"; // Cyan-600 for low tension
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
          if (typeof lastVal === "number") {
            const x = getX(lastIdx + xShift);
            const y = getPulseY(lastVal);

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = overlay.color;
            if (overlay.threshold && lastVal > overlay.threshold)
              ctx.fillStyle = "#e11d48";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fillStyle = `${ctx.fillStyle}40`; // Transparent
            ctx.fill();
          }
        }
      });

    // Draw Histograms (Legacy support)
    overlays
      .filter((o) => o.type === "histogram")
      .forEach((overlay) => {
        const histHeight = dimensions.height * 0.2;
        const histBottom = dimensions.height - padding.bottom;

        // Find max value for scaling
        let maxVal = 0;
        visibleData.forEach((d) => {
          const val = d[overlay.dataKey];
          if (typeof val === "number") maxVal = Math.max(maxVal, val);
        });

        if (maxVal === 0) maxVal = 1;

        visibleData.forEach((d, i) => {
          const val = d[overlay.dataKey];
          if (typeof val !== "number") return;

          const x = getX(i + xShift);
          const barHeight = (val / maxVal) * histHeight;
          const y = histBottom - barHeight;

          // Color logic based on threshold
          let color = overlay.color;
          if (overlay.threshold && val > overlay.threshold) {
            color = "#22D3EE"; // Cyan for high tension
          }

          ctx.fillStyle = color;
          ctx.globalAlpha = overlay.opacity || 0.5;
          ctx.fillRect(x - candleWidth / 2, y, candleWidth, barHeight);
          ctx.globalAlpha = 1.0;
        });
      });

    // Draw Oscillator (Z-Score etc)
    overlays
      .filter((o) => o.type === "oscillator" || o.type === "z-score")
      .forEach((overlay) => {
        // Find the panel for this overlay
        const panelId = overlay.panelId || 1;
        const panel = panels.find((p) => p.id === panelId);

        if (!panel) return; // Skip if panel not found

        const panelTop = panel.top;
        const panelHeight = panel.height;
        const panelBottom = panelTop + panelHeight;

        const domain = overlay.domain || [-3, 3];
        const minVal = domain[0];
        const maxVal = domain[1];
        const range = maxVal - minVal;
        const scale = (panelHeight - padding.bottom) / range;

        const getOscY = (val: number) => {
          // Clamp value?
          // val = Math.max(minVal, Math.min(maxVal, val));
          return panelBottom - padding.bottom - (val - minVal) * scale;
        };

        // Draw Zero Line and Grid
        if (showGrid) {
          const gridValues = [3, 2, 1, 0, -1, -2, -3];

          gridValues.forEach((val) => {
            if (val >= minVal && val <= maxVal) {
              const y = getOscY(val);

              // Draw Line
              ctx.beginPath();
              if (val === 0) {
                ctx.setLineDash([2, 2]);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
              } else {
                ctx.setLineDash([1, 1]);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
              }

              ctx.moveTo(0, y);
              ctx.lineTo(dimensions.width - padding.right, y);
              ctx.stroke();
              ctx.setLineDash([]);

              // Draw Label
              ctx.fillStyle = "#94a3b8"; // Slate-400
              ctx.font = '10px "Inter", sans-serif';
              ctx.textAlign = "left";
              ctx.fillText(
                val.toString(),
                dimensions.width - padding.right + 5,
                y + 3,
              );
            }
          });
        }

        // Draw Line
        ctx.lineWidth = overlay.width || 2;

        if (overlay.type === "z-score") {
          // Multi-colored segments for Z-Score
          for (let i = 0; i < visibleData.length - 1; i++) {
            const d1 = visibleData[i];
            const d2 = visibleData[i + 1];
            const val1 = d1[overlay.dataKey];
            const val2 = d2[overlay.dataKey];

            if (typeof val1 !== "number" || typeof val2 !== "number") continue;

            const x1 = getX(i + xShift);
            const y1 = getOscY(val1);
            const x2 = getX(i + 1 + xShift);
            const y2 = getOscY(val2);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);

            // Singularity v6 Logic
            let color = "#a1a1aa"; // Zinc-400 (Neutral)
            if (val1 < -2)
              color = "#10b981"; // Emerald-500 (Cheap/Buy)
            else if (val1 > 2)
              color = "#ef4444"; // Red-500 (Expensive/Sell)
            else if (val1 < -0.5)
              color = "#2dd4bf"; // Teal-400 (Mild Cheap)
            else if (val1 > 0.5) color = "#f43f5e"; // Rose-500 (Mild Expensive)

            ctx.strokeStyle = color;
            ctx.stroke();
          }
        } else {
          // Standard Oscillator
          ctx.beginPath();
          ctx.strokeStyle = overlay.color;
          let started = false;
          visibleData.forEach((d, i) => {
            const val = d[overlay.dataKey];
            if (typeof val !== "number") return;

            const x = getX(i + xShift);
            const y = getOscY(val);

            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
        }
      });
  }, [dimensions, visibleData, minPrice, maxPrice, overlays, showGrid]);

  // Interaction Layer
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || !dimensions.width || !dimensions.height) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    if (mousePos && hoverData) {
      const x = mousePos.x;
      const y = mousePos.y;

      // Snap to candle center
      let snapX = x;
      const index = visibleData.indexOf(hoverData);
      if (index >= 0) {
        const xShift = Math.max(0, startIndex) - startIndex;
        snapX = getX(index + xShift);
      }

      // Crosshair
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;

      // Vertical (Snapped)
      ctx.beginPath();
      ctx.moveTo(snapX, 0);
      ctx.lineTo(snapX, dimensions.height);
      ctx.stroke();

      // Horizontal (Mouse Y)
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dimensions.width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price Label (Right - Main Axis)
      if (y > padding.top && y < mainChartHeight - padding.bottom) {
        const price =
          minPrice + (mainChartHeight - padding.bottom - y) / scaleY;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(dimensions.width - 60, y - 10, 60, 20);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "10px monospace";
        ctx.textAlign = "left";
        ctx.fillText(price.toFixed(2), dimensions.width - 55, y + 4);
      }

      // Extra Scales Labels (Left)
      if (extraScales) {
        Object.keys(extraScales).forEach((axisId, idx) => {
          const { min, scale } = extraScales[axisId];
          if (y > padding.top && y < mainChartHeight - padding.bottom) {
            const val = min + (mainChartHeight - padding.bottom - y) / scale;
            const axisX = (padding.left || 60) - idx * 50;

            ctx.fillStyle = "#1e293b";
            ctx.fillRect(axisX - 50, y - 10, 50, 20);

            // Find color
            const overlay = overlays.find((o) => o.yAxisId === axisId);
            ctx.fillStyle = overlay?.color || "#94a3b8";
            ctx.textAlign = "right";
            ctx.fillText(val.toFixed(2), axisX - 5, y + 4);
          }
        });
      }

      // Time Label (Bottom)
      const date = new Date(hoverData.timestamp);
      const timeStr = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(snapX - 25, dimensions.height - 20, 50, 20);
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "center";
      ctx.fillText(timeStr, snapX, dimensions.height - 6);

      // Highlight current candle
      if (index >= 0) {
        // Glow effect
        ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
        ctx.shadowBlur = 10;
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.fillRect(
          snapX - candleWidth / 2 - 1,
          padding.top,
          candleWidth + 2,
          mainChartHeight - padding.bottom - padding.top,
        );
        ctx.shadowBlur = 0;
      }
    }
  }, [
    mousePos,
    hoverData,
    dimensions,
    minPrice,
    scaleY,
    visibleData,
    startIndex,
    extraScales,
    overlays,
    mainChartHeight,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ height, touchAction: "pan-y" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Draggable Panel Separator */}
      {panels.length > 0 && (
        <div
          className="absolute left-0 right-0 h-1 hover:h-2 cursor-ns-resize z-50 transition-all group"
          style={{ 
            top: `${mainChartHeight}px`,
            background: isResizing 
              ? 'rgba(59, 130, 246, 0.6)' 
              : 'rgba(100, 116, 139, 0.3)'
          }}
          onMouseDown={handleResizeStart}
        >
          <div className="absolute inset-x-0 -top-2 -bottom-2" />
          <div className="hidden group-hover:block absolute left-1/2 -translate-x-1/2 -top-6 bg-background/90 border border-border px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none">
            Drag to resize panels
          </div>
        </div>
      )}

      {/* Main Chart Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{ width: "100%", height: "100%" }}
      />

      {/* Interaction Layer */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute top-0 left-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      />

      <Legend items={legendItems} />

      {/* Tooltip */}
      {hoverData && mousePos && (
        <div className="absolute top-2 left-2 z-30 bg-background/80 backdrop-blur-sm border border-border p-2 rounded text-xs font-mono shadow-lg pointer-events-none">
          <div className="flex gap-4">
            <span className="text-muted-foreground">
              O:{" "}
              <span className="text-foreground">
                {hoverData.open.toFixed(2)}
              </span>
            </span>
            <span className="text-muted-foreground">
              H:{" "}
              <span className="text-foreground">
                {hoverData.high.toFixed(2)}
              </span>
            </span>
            <span className="text-muted-foreground">
              L:{" "}
              <span className="text-foreground">
                {hoverData.low.toFixed(2)}
              </span>
            </span>
            <span className="text-muted-foreground">
              C:{" "}
              <span
                className={`font-bold ${hoverData.close >= hoverData.open ? "text-emerald-500" : "text-red-500"}`}
              >
                {hoverData.close.toFixed(2)}
              </span>
            </span>
          </div>
          {overlays.map((o) => {
            const val = hoverData[o.dataKey];
            if (typeof val !== "number") return null;
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
