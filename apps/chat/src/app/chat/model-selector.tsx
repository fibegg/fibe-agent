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
        className="w-32 px-2 py-1 rounded bg-slate-700 border border-slate-600 text-slate-200 text-sm placeholder-slate-500"
      />
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(currentModel === opt ? '' : opt)}
            className={`px-2 py-1 rounded text-sm ${
              currentModel === opt
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
