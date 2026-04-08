import { ArrowLeft, Maximize2, Minus, X as CloseIcon } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useActivityReviewData } from '../use-activity-review-data';
import { formatRelativeTime } from '../format-relative-time';
import { commandLabel, highlightText, reasoningBodyWithHighlights } from '../activity-review-utils';
import { useEffect, useRef, useState } from 'react';
import { CountUpNumber } from '../count-up-number';
import { getActivityLabel, type StoryEntry } from '../agent-thinking-utils';

function StarkArcReactor() {
  return (
    <div className="arc-spinner">
      <div className="arc-center"></div>
    </div>
  );
}

function StarkWindow({ story, searchQuery, index }: { story: StoryEntry; searchQuery: string; index: number }) {
  const isThinkingBlock = story.type === 'reasoning_start' && (story.details ?? '').trim().length > 0;
  const isSingleRow = ['file_created', 'tool_call', 'step'].includes(story.type);
  const label = getActivityLabel(story.type);

  // Pseudo-random position constraints for the "floating window" effect
  const [isMinimized, setIsMinimized] = useState(false);

  // To simulate popping up in a holographic grid, let's just make it look like a window with title bar
  return (
    <div className={`relative flex flex-col border border-cyan-500/40 bg-cyan-950/40 backdrop-blur-md rounded-sm shadow-[0_0_15px_rgba(6,182,212,0.15)] overflow-hidden transition-all duration-300 ${isMinimized ? 'h-8' : 'h-full max-h-[400px]'}`}>
      <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-cyan-300"></div>
      <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-cyan-300"></div>
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-cyan-300"></div>
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-cyan-300"></div>

      {/* Window Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-cyan-900/40 border-b border-cyan-500/30 cursor-default select-none shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-bold text-cyan-200">WIN_{String(index).padStart(3, '0')}</span>
          <span className="text-[10px] font-mono text-cyan-400 tracking-wider uppercase truncate max-w-[150px]">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 opacity-70">
          <button onClick={() => setIsMinimized(!isMinimized)} className="hover:text-cyan-200 text-cyan-500 transition-colors">
            {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          </button>
          <div className="hover:text-red-400 text-cyan-500 transition-colors cursor-pointer">
            <CloseIcon className="w-3 h-3" />
          </div>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
          <div className="flex justify-between items-center mb-2 pb-1 border-b border-cyan-500/20">
            <span className="text-cyan-600 font-mono text-[9px]">{formatRelativeTime(story.timestamp)}</span>
            {story.type === 'tool_call' && <span className="text-[9px] bg-cyan-500/20 text-cyan-300 px-1 rounded">EXEC</span>}
          </div>

          {isSingleRow ? (
            <p className="text-cyan-300 font-mono text-xs tracking-wide uppercase break-words">
              {highlightText(String(
                story.type === 'file_created' ? story.path ?? story.details ?? story.message :
                story.type === 'tool_call' ? commandLabel(story) : story.message
              ), searchQuery)}
            </p>
          ) : isThinkingBlock ? (
            <p className="text-cyan-200 text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
              {reasoningBodyWithHighlights(story.details as string, searchQuery)}
            </p>
          ) : (
            <div className="text-cyan-100/90 text-xs font-mono break-words leading-relaxed">
              {story.message && <p>{highlightText(story.message, searchQuery)}</p>}
              {story.details && String(story.details).trim() !== '{}' && (
                <p className="text-[10px] text-cyan-500 mt-2 opacity-80">
                  {highlightText(story.details, searchQuery)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StarkReasoningPage({ inline }: { inline?: boolean }) {
  const { activityId, storyId } = useParams();
  const {
    activityStories,
    filteredStories,
    detailSearchQuery,
    setDetailSearchQuery,
    liveResponseText,
    brainState,
    isFollowing,
    loading
  } = useActivityReviewData({
    activityId,
    storyId,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isFollowing && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [liveResponseText, isFollowing, filteredStories.length]);

  return (
    <div className={`relative flex flex-col ${inline ? 'h-full' : 'h-screen'} w-full bg-slate-950 overflow-hidden font-mono selection:bg-cyan-900 selection:text-cyan-100`}>
      <div className="absolute inset-0 stark-grid opacity-30 pointer-events-none"></div>
      <div className="animate-stark-scanline"></div>
      
      <div className="relative z-10 flex flex-col h-full pointer-events-auto">
        <header className="flex items-center justify-between p-4 border-b border-cyan-500/30 bg-cyan-950/40 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            {!inline && (
              <>
                <Link 
                  to="/" 
                  className="group flex items-center gap-2 text-cyan-500 hover:text-cyan-300 transition-colors"
                >
                  <div className="p-1.5 border border-cyan-800 rounded group-hover:border-cyan-400 group-hover:bg-cyan-900/50 transition-all">
                    <ArrowLeft className="w-4 h-4" />
                  </div>
                  <span className="text-xs tracking-widest uppercase font-bold">TERMINATE</span>
                </Link>
                <div className="h-4 w-px bg-cyan-800"></div>
              </>
            )}
            <div className="flex flex-col">
              <span className="text-cyan-300 text-[10px] uppercase tracking-[0.2em] font-semibold">
                TONY STARK MODE
              </span>
              <span className="text-cyan-600 text-[9px] uppercase tracking-widest">
                System Active // {activityId ?? 'GLOBAL_MONITOR'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 bg-cyan-950/50 border border-cyan-800/50 rounded p-1.5 backdrop-blur hidden sm:flex">
              <span className="text-cyan-500 text-[9px] uppercase tracking-widest ml-1 opacity-70">Query:</span>
              <input 
                type="text" 
                value={detailSearchQuery}
                onChange={e => setDetailSearchQuery(e.target.value)}
                placeholder="DEFINE PARAMETERS..."
                className="bg-transparent border-none text-cyan-300 text-[10px] uppercase font-mono w-40 focus:outline-none placeholder:text-cyan-800"
              />
            </div>
            {brainState === 'working' ? (
              <StarkArcReactor />
            ) : (
              <div className="flex flex-col items-end">
                <span className="text-emerald-400 text-[10px] tracking-widest uppercase animate-pulse">
                  Idle // Standby
                </span>
                <span className="text-cyan-700 text-[9px] tracking-[0.2em] mt-0.5">
                  <CountUpNumber value={activityStories.length} /> LOGS
                </span>
              </div>
            )}
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <StarkArcReactor />
            <span className="text-cyan-500 text-xs font-mono uppercase tracking-[0.3em] mt-6 animate-pulse">
              INITIALIZING NEURAL NETWORKS...
            </span>
          </div>
        ) : (
          <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-4 md:p-8 relative"
            style={{ scrollBehavior: 'smooth' }}
          >
            {/* Top decorative corners */}
            <div className="fixed top-20 left-4 w-4 h-4 border-t-2 border-l-2 border-cyan-500/50 pointer-events-none z-20"></div>
            <div className="fixed top-20 right-4 w-4 h-4 border-t-2 border-r-2 border-cyan-500/50 pointer-events-none z-20"></div>
            
            {/* Grid layout for chronological LTR reading order */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-12 w-full auto-rows-max items-start">
              {filteredStories.map((story, i) => (
                <div 
                  key={story.id} 
                  className="w-full opacity-0" 
                  style={{ animation: `thinking-fade 0.4s ease-out ${(i % 10) * 0.05}s forwards` }}
                >
                  <StarkWindow story={story} searchQuery={detailSearchQuery} index={i} />
                </div>
              ))}

              {liveResponseText && (
                <div className="mt-4 animate-pulse-glow col-span-1 md:col-span-2 xl:col-span-3 2xl:col-span-4 w-full">
                  <div className="border border-emerald-500/50 bg-emerald-950/20 p-4 rounded-sm backdrop-blur-md relative overflow-hidden ring-1 ring-inset ring-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                    <div className="flex items-center gap-2 mb-3 border-b border-emerald-500/30 pb-2">
                      <span className="relative flex size-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
                      </span>
                      <p className="text-emerald-400 text-xs font-mono font-bold tracking-[0.2em] uppercase">
                        ACTIVE PROCESSING WINDOW
                      </p>
                    </div>
                    <div className="bg-emerald-950/30 p-3 border-l-2 border-emerald-500 max-h-[60vh] overflow-y-auto custom-scrollbar">
                      <p className="text-emerald-300 text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
                        {reasoningBodyWithHighlights(liveResponseText, detailSearchQuery)}
                        <span className="inline-block w-2 h-3 ml-1 bg-emerald-400 animate-pulse"></span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom decorative corners */}
            <div className="fixed bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-cyan-500/50 pointer-events-none z-20"></div>
            <div className="fixed bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-cyan-500/50 pointer-events-none z-20"></div>
          </div>
        )}
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(6, 182, 212, 0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(6, 182, 212, 0.5);
        }
      `}</style>
    </div>
  );
}

export default StarkReasoningPage;
