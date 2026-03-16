const PHOENIX_LOGO_SRC = '/phoenix.png';

export function PhoenixLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src={PHOENIX_LOGO_SRC}
      alt="Phoenix Logo"
      className={className}
    />
  );
}
