import { useEffect, useState } from 'react';

export const DataStream = () => {
  const [streams, setStreams] = useState<Array<{ id: number; left: number; delay: number; duration: number }>>([]);

  useEffect(() => {
    const newStreams = [...Array(12)].map((_, i) => ({
      id: i,
      left: 10 + i * 8,
      delay: Math.random() * 3,
      duration: 2 + Math.random() * 2
    }));
    setStreams(newStreams);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Vertical Data Streams with Binary */}
      {streams.map((stream) => (
        <div
          key={stream.id}
          className="absolute top-[-20%] w-[2px]"
          style={{
            left: `${stream.left}%`,
            animationDelay: `${stream.delay}s`,
          }}
        >
          {/* Glowing Line */}
          <div 
            className="absolute w-full h-[200px] bg-gradient-to-b from-emerald-400/80 via-emerald-500/60 to-transparent animate-data-stream shadow-[0_0_10px_rgba(16,185,129,0.8)]"
            style={{
              animationDuration: `${stream.duration}s`
            }}
          />
          
          {/* Binary Digits */}
          <div 
            className="absolute w-full font-mono text-[8px] text-emerald-400/90 leading-tight animate-data-stream"
            style={{
              animationDuration: `${stream.duration}s`
            }}
          >
            {[...Array(20)].map((_, i) => (
              <div key={i} className="text-center">
                {Math.random() > 0.5 ? '1' : '0'}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Horizontal Scan Lines */}
      {[...Array(3)].map((_, i) => (
        <div
          key={`scan-${i}`}
          className="absolute left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent animate-scan-line"
          style={{
            top: `${20 + i * 30}%`,
            animationDelay: `${i * 2}s`,
          }}
        />
      ))}
    </div>
  );
};
