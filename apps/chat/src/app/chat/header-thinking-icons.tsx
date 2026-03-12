import {
  CYAN_GLOW,
  MAGENTA_GLOW,
  NEON_CYAN,
  NEON_MAGENTA,
  NEON_VIOLET,
  VIOLET_GLOW,
} from '../animation-colors';

const DUST_PARTICLES = [
  { left: '50%', top: '50%', delay: 0.88, x: 0 },
  { left: '54%', top: '48%', delay: 0.92, x: 4 },
  { left: '47%', top: '52%', delay: 0.96, x: -3 },
  { left: '51%', top: '50%', delay: 0.84, x: 2 },
  { left: '46%', top: '50%', delay: 1, x: -4 },
  { left: '50%', top: '54%', delay: 0.9, x: 0 },
  { left: '52%', top: '46%', delay: 0.94, x: 3 },
  { left: '44%', top: '51%', delay: 0.98, x: -5 },
  { left: '49%', top: '49%', delay: 0.86, x: -2 },
  { left: '53%', top: '51%', delay: 0.93, x: 3 },
];

export function HeaderThinkingIcons() {
  return (
    <div className="relative inline-flex items-center justify-center h-5 w-9 overflow-visible shrink-0" aria-hidden>
      <span
        className="absolute left-1/2 top-1/2 w-2.5 h-3 rounded-[40%] animate-header-flame-out"
        style={{
          background: `radial-gradient(ellipse 85% 100% at 50% 100%, ${NEON_CYAN} 0%, ${NEON_VIOLET} 40%, ${NEON_MAGENTA} 75%, transparent 100%)`,
          boxShadow: `0 0 20px ${CYAN_GLOW}, 0 0 10px ${MAGENTA_GLOW}, 0 0 4px ${VIOLET_GLOW}`,
        }}
      />
      {DUST_PARTICLES.map(({ left, top, delay, x }, i) => (
        <span
          key={i}
          className="absolute w-0.5 h-0.5 rounded-full animate-header-dust"
          style={{
            left,
            top,
            animationDelay: `${delay}s`,
            ['--dust-x' as string]: `${x}px`,
            background: `radial-gradient(circle, ${NEON_CYAN} 0%, ${NEON_MAGENTA} 100%)`,
            boxShadow: `0 0 6px ${CYAN_GLOW}, 0 0 2px ${MAGENTA_GLOW}`,
          }}
        />
      ))}
    </div>
  );
}
