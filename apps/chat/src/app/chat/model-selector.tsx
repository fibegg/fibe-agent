interface ModelSelectorProps {
  currentModel: string;
  options: string[];
  onSelect: (model: string) => void;
  onInputChange: (value: string) => void;
  visible: boolean;
  modelLocked?: boolean;
}

export function ModelSelector({
  currentModel,
  options,
  onSelect,
  onInputChange,
  visible,
  modelLocked = false,
}: ModelSelectorProps) {
  if (!visible) return null;

  const inputClass =
    'w-28 sm:w-32 h-7 sm:h-8 px-2.5 rounded-md text-[10px] sm:text-xs bg-input-bg backdrop-blur-sm border border-border-subtle text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-500/50 dark:focus:border-primary focus:ring-2 focus:ring-violet-500/20 dark:focus:ring-primary/30';

  if (modelLocked) {
    return (
      <div className="hidden md:flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <input
          type="text"
          value={currentModel}
          readOnly
          disabled
          placeholder="Model (default)"
          className={`${inputClass} cursor-default opacity-90`}
          aria-label="Model in use"
        />
      </div>
    );
  }

  const selectedClass =
    'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow shadow-violet-500/20';
  const unselectedClass =
    'bg-input-bg border border-border-subtle text-muted-foreground hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/30';

  return (
    <div className="hidden md:flex items-center gap-1.5 sm:gap-2 flex-wrap">
      <input
        type="text"
        value={currentModel}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Model (default)"
        className={inputClass}
      />
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(currentModel === opt ? '' : opt)}
            className={`px-2 py-1 rounded-md text-[10px] sm:text-xs transition-colors truncate max-w-[120px] ${currentModel === opt ? selectedClass : unselectedClass}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
