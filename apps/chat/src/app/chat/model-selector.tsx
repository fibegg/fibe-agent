import { INPUT_SM, MODEL_OPTION_SELECTED, MODEL_OPTION_UNSELECTED } from '../ui-classes';

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

  if (modelLocked) {
    return (
      <div className="hidden md:flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <input
          type="text"
          value={currentModel}
          readOnly
          disabled
          placeholder="Model (default)"
          className={`${INPUT_SM} cursor-default opacity-90`}
          aria-label="Model in use"
        />
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-1.5 sm:gap-2 flex-wrap">
      <input
        type="text"
        value={currentModel}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Model (default)"
        className={INPUT_SM}
      />
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(currentModel === opt ? '' : opt)}
            className={`px-2 py-1 rounded-md text-[10px] sm:text-xs transition-colors truncate max-w-[120px] ${currentModel === opt ? MODEL_OPTION_SELECTED : MODEL_OPTION_UNSELECTED}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
