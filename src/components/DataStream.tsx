import { TechnicalGrid } from './TechnicalGrid';

export const DataStream = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Vertical Data Streams */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute top-[-100%] w-[1px] h-[50%] bg-gradient-to-b from-transparent via-emerald-500/30 to-transparent animate-data-stream"
          style={{
            left: `${15 + i * 14}%`,
            animationDelay: `${i * 1.5}s`,
            animationDuration: `${3 + Math.random() * 2}s`
          }}
        />
      ))}
    </div>
  );
};
