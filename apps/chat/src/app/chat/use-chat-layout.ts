import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getInitialSidebarCollapsed,
  getInitialRightSidebarCollapsed,
  persistSidebarCollapsed,
  persistRightSidebarCollapsed,
} from '../layout-constants';

const MOBILE_BREAKPOINT_PX = 1024;

export function useChatLayout(hasPlaygroundFiles: boolean, playgroundLoading: boolean) {
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getInitialSidebarCollapsed);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(
    getInitialRightSidebarCollapsed
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const prevHasPlaygroundFilesRef = useRef(hasPlaygroundFiles);

  useEffect(() => persistSidebarCollapsed(sidebarCollapsed), [sidebarCollapsed]);
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
