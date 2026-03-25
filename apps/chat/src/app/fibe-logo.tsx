const FIBE_LOGO_SRC = '/fibe.png';

export function FibeLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src={FIBE_LOGO_SRC}
      alt="Fibe Logo"
      className={className}
    />
  );
}
