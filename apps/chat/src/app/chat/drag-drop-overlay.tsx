export function DragDropOverlay({ label = 'Drop files here' }: { label?: string } = {}) {
  return (
    <div
      className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center bg-violet-500/10 border-2 border-dashed border-violet-500 rounded-none"
      aria-hidden
    >
      <span className="text-violet-600 dark:text-violet-400 font-medium text-lg">
        {label}
      </span>
    </div>
  );
}
