/**
 * Tension Map histogram component using Canvas
 */

import { useEffect, useRef } from 'react';
import type { TensionDataPoint } from '@/lib/tension';

export interface TensionHistogramProps {
  data: TensionDataPoint[];
  threshold: number;
  height?: number;
  className?: string;
}

export function TensionHistogram({
  data,
  threshold,
  height = 100,
  className = '',
}: TensionHistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const canvasHeight = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, canvasHeight);

    // Calculate bar width
    const barWidth = width / data.length;
    const padding = Math.max(1, barWidth * 0.1);

    // Find max value for scaling
    const maxValue = 100; // Tension index is normalized to 0-100

    // Draw bars
    data.forEach((point, index) => {
      const x = index * barWidth;
      const barHeight = (point.tensionIndex / maxValue) * canvasHeight;
      const y = canvasHeight - barHeight;

      // Color based on threshold
      const isAnomaly = point.tensionIndex >= threshold;
      ctx.fillStyle = isAnomaly
        ? 'rgba(34, 197, 94, 0.8)' // Green for anomalies
        : 'rgba(148, 163, 184, 0.4)'; // Gray for normal

      // Draw bar
      ctx.fillRect(x + padding, y, barWidth - padding * 2, barHeight);
    });

    // Draw threshold line
    const thresholdY = canvasHeight - (threshold / maxValue) * canvasHeight;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; // Red
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, thresholdY);
    ctx.lineTo(width, thresholdY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw threshold label
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${threshold.toFixed(0)}`, width - 5, thresholdY - 5);
  }, [data, threshold, height]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Trigger re-render by updating a state or directly calling the effect
      const canvas = canvasRef.current;
      if (canvas) {
        // Force redraw
        canvas.style.width = '0px';
        requestAnimationFrame(() => {
          if (containerRef.current) {
            canvas.style.width = `${containerRef.current.clientWidth}px`;
          }
        });
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', width: '100%', height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}
