import { useCallback, useRef, useState } from 'react';
import { apiRequest } from '../api-url';

export interface UseWorkspaceDropOptions {
  /** API endpoint to POST files to, e.g. '/api/playgrounds/upload' */
  uploadUrl: string;
  /** Optional subdirectory (relative to workspace root) to drop files into */
  targetDir?: string;
  /** Called after all files in a drop have been uploaded successfully */
  onUploaded?: () => void;
  /** When true the drop zone is inactive */
  disabled?: boolean;
}

export interface UseWorkspaceDropResult {
  isDragOver: boolean;
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

/**
 * Manages drag-and-drop state and multipart uploads for a workspace panel
 * (Playground or AI workspace). Stops propagation so the global ChatLayout
 * drop handler does not also fire.
 */
export function useWorkspaceDrop({
  uploadUrl,
  targetDir = '',
  onUploaded,
  disabled = false,
}: UseWorkspaceDropOptions): UseWorkspaceDropResult {
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const url = targetDir
        ? `${uploadUrl}?dir=${encodeURIComponent(targetDir)}`
        : uploadUrl;

      const results = await Promise.allSettled(
        files.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file, file.name);
          const res = await apiRequest(url, { method: 'POST', body: formData });
          if (!res.ok) {
            console.error(`Workspace upload failed for ${file.name}: ${res.status}`);
          }
        })
      );

      const anySuccess = results.some((r) => r.status === 'fulfilled');
      if (anySuccess) {
        onUploaded?.();
      }
    },
    [uploadUrl, targetDir, onUploaded]
  );

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      dragCounterRef.current += 1;
      if (e.dataTransfer.types.includes('Files')) {
        setIsDragOver(true);
      }
    },
    [disabled]
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      void uploadFiles(files);
    },
    [disabled, uploadFiles]
  );

  return {
    isDragOver,
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}
