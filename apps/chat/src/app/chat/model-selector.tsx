interface ModelSelectorProps {
  currentModel: string;
  options: string[];
  onSelect: (model: string) => void;
  onInputChange: (value: string) => void;
  visible: boolean;
}

export function ModelSelector({
  currentModel,
  options,
  onSelect,
  onInputChange,
  visible,
}: ModelSelectorProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={currentModel}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Model (default)"
        className="w-32 px-2 py-1 rounded-md bg-card border border-border text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(currentModel === opt ? '' : opt)}
            className={`px-2 py-1 rounded-md text-sm transition-colors ${
              currentModel === opt
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-border'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
