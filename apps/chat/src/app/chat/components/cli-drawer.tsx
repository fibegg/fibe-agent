import { Play, TerminalSquare, Users } from 'lucide-react';
import { useT } from '../../i18n';

const CLI_COMMANDS = [
  {
    categoryKey: 'cli.playgrounds',
    icon: <Play className="size-4" />,
    items: [
      { nameKey: 'cli.listPlaygrounds', command: 'fibe playgrounds list', descriptionKey: 'cli.listPlaygroundsDescription' },
      { nameKey: 'cli.startPlayground', command: 'fibe playgrounds start ', descriptionKey: 'cli.startPlaygroundDescription' },
    ]
  },
  {
    categoryKey: 'cli.agents',
    icon: <Users className="size-4" />,
    items: [
      { nameKey: 'cli.listAgents', command: 'fibe agents list', descriptionKey: 'cli.listAgentsDescription' },
      { nameKey: 'cli.stopAgent', command: 'fibe agents stop ', descriptionKey: 'cli.stopAgentDescription' },
    ]
  },
  {
    categoryKey: 'cli.general',
    icon: <TerminalSquare className="size-4" />,
    items: [
      { nameKey: 'cli.systemStatus', command: 'fibe status', descriptionKey: 'cli.systemStatusDescription' },
      { nameKey: 'cli.mcpServers', command: 'fibe mcp list', descriptionKey: 'cli.mcpServersDescription' }
    ]
  }
] as const;

export interface CliDrawerContentProps {
  onSelectCommand: (command: string) => void;
}

export function CliDrawerContent({ onSelectCommand }: CliDrawerContentProps) {
  const t = useT();
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 overflow-y-auto">
      <div className="text-sm text-muted-foreground mb-2">
        {t('cli.description')}
      </div>
      
      {CLI_COMMANDS.map((cat) => (
        <div key={cat.categoryKey} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <span className="text-violet-400">{cat.icon}</span>
            {t(cat.categoryKey)}
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
                  {t(item.nameKey)}
                </div>
                <div className="font-mono text-xs text-muted-foreground/80 bg-background/50 px-1.5 py-0.5 rounded">
                  {item.command}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                  {t(item.descriptionKey)}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
