import { useState } from 'react';

const PHOENIX_LOGO_SRC = '/phoenix.png';

const SPARKLE_POSITIONS: [number, number][] = [
  [12, 8], [88, 15], [25, 82], [70, 90], [5, 45], [95, 55], [50, 5], [45, 92],
];
const SPARKLE_DURATIONS = [2, 2.5, 3, 3.5, 2.2, 2.8, 3.2, 3.8];

export function AnimatedPhoenixLogo({ className = '' }: { className?: string }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute inset-0 -m-2 rounded-full animate-spin-slow">
        <div className="w-full h-full rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 opacity-40 blur-md animate-pulse" />
      </div>

      <div className="absolute -inset-4">
        {SPARKLE_POSITIONS.map(([left, top], i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-yellow-300 rounded-full animate-sparkle shadow-[0_0_10px_2px_rgba(253,224,71,0.8)]"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${SPARKLE_DURATIONS[i]}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute inset-0 -m-1">
        <div className="w-full h-full rounded-full border-2 border-violet-400/30 animate-ping-slow" />
      </div>
      <div className="absolute inset-0 -m-1">
        <div className="w-full h-full rounded-full border-2 border-pink-400/30 animate-ping-slower" />
      </div>

      <div className="relative z-10">
        <img
          src={PHOENIX_LOGO_SRC}
          alt="Phoenix Logo"
          className={`w-full h-full object-contain transition-all duration-500 ease-out drop-shadow-[0_0_15px_rgba(168,85,247,0.8)] hover:drop-shadow-[0_0_25px_rgba(236,72,153,1)] ${isHovered ? 'scale-125 rotate-12' : 'scale-100'}`}
          style={{ filter: 'brightness(1.1) saturate(1.2)' }}
        />
        <div className="absolute inset-0 flex items-center justify-center -z-10 pointer-events-none">
          <div
            className="w-3/4 h-3/4 rounded-full animate-pulse-glow blur-xl"
            style={{
              background: 'radial-gradient(circle, rgb(139 92 246 / 0.5) 0%, rgb(236 72 153 / 0.3) 40%, transparent 70%)',
            }}
          />
        </div>
      </div>

      {isHovered && (
        <>
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-white rounded-full animate-explode shadow-[0_0_15px_5px_rgba(255,255,255,0.8)]"
              style={{
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) rotate(${i * 30}deg) translateY(-${20 + (i % 5) * 5}px)`,
                animationDelay: `${i * 0.05}s`,
              }}
            />
          ))}
        </>
      )}

      <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
        <div className="absolute w-1 h-12 bg-gradient-to-b from-cyan-400 to-transparent animate-energy-flow-1 blur-sm" />
        <div className="absolute w-1 h-12 bg-gradient-to-b from-pink-400 to-transparent animate-energy-flow-2 blur-sm" />
        <div className="absolute w-1 h-12 bg-gradient-to-b from-yellow-400 to-transparent animate-energy-flow-3 blur-sm" />
      </div>

      <div className="absolute inset-0 animate-spin-slow pointer-events-none">
        <div className="absolute top-0 left-1/2 w-1.5 h-1.5 -ml-0.75 bg-cyan-400 rounded-full shadow-[0_0_10px_2px_rgba(34,211,238,0.8)] animate-pulse" />
      </div>
      <div className="absolute inset-0 animate-spin-reverse pointer-events-none">
        <div className="absolute bottom-0 left-1/2 w-1.5 h-1.5 -ml-0.75 bg-pink-400 rounded-full shadow-[0_0_10px_2px_rgba(236,72,153,0.8)] animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>
    </div>
  );
}
