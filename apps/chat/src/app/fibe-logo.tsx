/**
 * fibe wordmark — the future of development.
 *
 * The dot on the "i" is not a dot. It's a pulse — the glow of an AI mind
 * working alongside you. When you "fibe" something, human creativity and
 * machine intelligence become one act.
 *
 * Design notes:
 * - Uses the dotless "ı" (U+0131) with a CSS-positioned glowing orb above it
 * - The orb uses a radial gradient (lavender → violet → purple) + blur glow
 * - Positioned with left:50% + translateX(-50%) so it's always centered
 * - Scales with font-size via em units
 */

interface FibeLogoProps {
  /** Overall wrapper class (sizing, positioning, text color) */
  className?: string;
  /** 'wordmark' renders the full "fibe" text. 'icon' renders just the glowing dot. */
  variant?: 'wordmark' | 'icon';
}

export function FibeLogo({ className = '', variant = 'wordmark' }: FibeLogoProps) {
  if (variant === 'icon') {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label="fibe"
      >
        <defs>
          <radialGradient id="fibe-pulse-icon" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="40%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#7c3aed" />
          </radialGradient>
          <filter id="icon-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="16" cy="16" r="8" fill="url(#fibe-pulse-icon)" filter="url(#icon-glow)" />
      </svg>
    );
  }

  return (
    <span
      className={className}
      role="img"
      aria-label="fibe"
      style={{
        display: 'inline-flex',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 600,
        letterSpacing: '0.08em',
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      f
      <span style={{ position: 'relative', display: 'inline-block' }}>
        {/* Dotless i — the stem */}
        ı
        {/* The Pulse — replaces the dot */}
        <span
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '0.22em',
            height: '0.22em',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #c4b5fd 0%, #a78bfa 40%, #7c3aed 100%)',
            boxShadow: '0 0 0.3em 0.08em rgba(124, 58, 237, 0.5)',
          }}
        />
      </span>
      be
    </span>
  );
}
