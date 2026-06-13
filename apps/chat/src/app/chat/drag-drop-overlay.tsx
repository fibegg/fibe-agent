export function DragDropOverlay({ label = 'Drop files here' }: { label?: string } = {}) {
  return (
    <div
      className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-none"
      aria-hidden
    >
      <span className="text-primary dark:text-primary font-medium text-lg">
        {label}
      </span>
    </div>
  );
}
