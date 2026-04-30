import { Play, TerminalSquare, Users } from 'lucide-react';

const CLI_COMMANDS = [
  {
    category: 'Playgrounds',
    icon: <Play className="size-4" />,
    items: [
      { name: 'List Playgrounds', command: 'fibe playgrounds list', description: 'Show all available playgrounds' },
      { name: 'Start Playground', command: 'fibe playgrounds start ', description: 'Start a playground by ID' },
    ]
  },
  {
    category: 'Agents',
    icon: <Users className="size-4" />,
    items: [
      { name: 'List Agents', command: 'fibe agents list', description: 'Show all running agents' },
      { name: 'Stop Agent', command: 'fibe agents stop ', description: 'Stop a running agent' },
    ]
  },
  {
    category: 'General',
    icon: <TerminalSquare className="size-4" />,
    items: [
      { name: 'System Status', command: 'fibe status', description: 'Show Fibe system status' },
      { name: 'MCP Servers', command: 'fibe mcp list', description: 'List connected MCP servers' }
    ]
  }
];

export interface CliDrawerContentProps {
  onSelectCommand: (command: string) => void;
}

export function CliDrawerContent({ onSelectCommand }: CliDrawerContentProps) {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 overflow-y-auto">
      <div className="text-sm text-muted-foreground mb-2">
        Select a command to add it to your chat input. You can then ask the agent to run it.
      </div>
      
      {CLI_COMMANDS.map((cat) => (
        <div key={cat.category} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <span className="text-violet-400">{cat.icon}</span>
            {cat.category}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cat.items.map((item) => (
              <button
                key={item.command}
                type="button"
                onClick={() => onSelectCommand(item.command)}
                className="flex flex-col items-start gap-1 p-3 rounded-xl border border-border/50 bg-card hover:bg-violet-500/10 hover:border-violet-500/30 transition-all text-left group"
              >
                <div className="text-sm font-semibold text-foreground group-hover:text-violet-300 transition-colors">
                  {item.name}
                </div>
                <div className="font-mono text-xs text-muted-foreground/80 bg-background/50 px-1.5 py-0.5 rounded">
                  {item.command}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  {item.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
