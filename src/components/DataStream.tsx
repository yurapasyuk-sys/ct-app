import { useEffect, useState } from 'react';

export const DataStream = () => {
  const [streams, setStreams] = useState<Array<{ id: number; left: number; delay: number; duration: number; opacity: number }>>([]);

  useEffect(() => {
    const newStreams = [...Array(30)].map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 2 + Math.random() * 3,
      opacity: 0.1 + Math.random() * 0.3
    }));
    setStreams(newStreams);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Vertical Data Streams - Pure White/Gray */}
      {streams.map((stream) => (
        <div
          key={stream.id}
          className="absolute top-[-20%] w-[1px]"
          style={{
            left: `${stream.left}%`,
            animation: `data-stream ${stream.duration}s linear infinite`,
            animationDelay: `${stream.delay}s`,
            opacity: stream.opacity
          }}
        >
          {/* Glowing Head - White */}
          <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-white to-transparent" />
          
          {/* Trail - Gray */}
          <div className="absolute bottom-0 w-full h-[500px] bg-gradient-to-t from-white/20 via-white/5 to-transparent" />
          
          {/* Binary/Data Characters - Monospace */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col-reverse gap-1 text-[10px] font-mono text-white/60">
            {[...Array(12)].map((_, i) => (
              <span key={i} className="leading-none opacity-80">
                {Math.random() > 0.5 ? '1' : '0'}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
