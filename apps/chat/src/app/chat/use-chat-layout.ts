import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getInitialSidebarOpen,
  getInitialSidebarCollapsed,
  getInitialConversationSidebarCollapsed,
  getInitialRightSidebarCollapsed,
  persistSidebarOpen,
  persistSidebarCollapsed,
  persistConversationSidebarCollapsed,
  persistRightSidebarCollapsed,
} from '../layout-constants';

const MOBILE_BREAKPOINT_PX = 1024;

function getInitialIsMobile(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX;
}

export function useChatLayout(hasPlaygroundFiles: boolean, playgroundLoading: boolean) {
  const [isMobile, setIsMobile] = useState(getInitialIsMobile);
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [conversationSidebarCollapsed, setConversationSidebarCollapsed] = useState(
    getInitialConversationSidebarCollapsed
  );
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(
    getInitialRightSidebarCollapsed
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const prevHasPlaygroundFilesRef = useRef(hasPlaygroundFiles);

  useEffect(() => persistSidebarOpen(sidebarOpen), [sidebarOpen]);
  useEffect(() => persistSidebarCollapsed(sidebarCollapsed), [sidebarCollapsed]);
  useEffect(
    () => persistConversationSidebarCollapsed(conversationSidebarCollapsed),
    [conversationSidebarCollapsed]
  );
  useEffect(
    () => persistRightSidebarCollapsed(rightSidebarCollapsed),
    [rightSidebarCollapsed]
  );

  useEffect(() => {
    const hadFiles = prevHasPlaygroundFilesRef.current;
    prevHasPlaygroundFilesRef.current = hasPlaygroundFiles;
    if (!hadFiles && hasPlaygroundFiles && !playgroundLoading) {
      setSidebarCollapsed(false);
    }
  }, [hasPlaygroundFiles, playgroundLoading]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
      setRightSidebarOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        if (e.shiftKey) {
          setRightSidebarCollapsed((v) => !v);
        } else {
          setSidebarCollapsed((v) => !v);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile]);

  const closeMobileSidebar = useCallback(() => setSidebarOpen(false), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return {
    isMobile,
    sidebarOpen,
    setSidebarOpen,
    rightSidebarOpen,
    setRightSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    conversationSidebarCollapsed,
    setConversationSidebarCollapsed,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
    settingsOpen,
    setSettingsOpen,
    searchQuery,
    setSearchQuery,
    closeMobileSidebar,
    closeSettings,
  };
}
