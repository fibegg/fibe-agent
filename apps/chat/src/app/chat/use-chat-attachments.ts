import { useCallback, useRef, useState } from 'react';
import { apiRequest } from '../api-url';
import { API_PATHS } from '@shared/api-paths';

const MAX_PENDING_IMAGES = 5;
const MAX_PENDING_ATTACHMENTS = 5;
export const MAX_PENDING_TOTAL = MAX_PENDING_IMAGES + MAX_PENDING_ATTACHMENTS;

/**
 * Text to insert when pasting into the composer. Uses text/plain first; some apps only expose
 * HTML (still readable via innerText). Returns null for image-only clipboards so image paste can run.
 */
export function getClipboardTextForContentEditablePaste(
  data: DataTransfer | null
): string | null {
  if (!data) return null;
  const plain = data.getData('text/plain');
  if (plain.trim().length > 0) return plain;
  const html = data.getData('text/html');
  if (!html.trim()) return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const raw = doc.body.textContent ?? '';
    const text = raw.replace(/\r\n/g, '\n');
    if (text.trim().length === 0) return null;
    return text;
  } catch {
    return null;
  }
}

export function hasNonEmptyPlainTextOnClipboard(data: DataTransfer | null): boolean {
  return getClipboardTextForContentEditablePaste(data) !== null;
}

export interface UseChatAttachmentsParams {
  isAuthenticated: boolean;
}

export function useChatAttachments({ isAuthenticated }: UseChatAttachmentsParams) {
  const [pendingImages, setPendingImages] = useState<{ url: string; filename: string }[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<{ filename: string; name: string }[]>([]);
  const [pendingVoice, setPendingVoice] = useState<string | null>(null);
  const [pendingVoiceFilename, setPendingVoiceFilename] = useState<string | null>(null);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const addImage = useCallback((url: string, filename: string) => {
    setPendingImages((prev) => (prev.length < MAX_PENDING_IMAGES ? [...prev, { url, filename }] : prev));
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removePendingVoice = useCallback(() => {
    setPendingVoice(null);
    setPendingVoiceFilename(null);
    setVoiceUploadError(null);
  }, []);

  const uploadAttachment = useCallback(async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const res = await apiRequest(API_PATHS.UPLOADS, { method: 'POST', body: formData });
    if (!res.ok) return null;
    const data = (await res.json()) as { filename: string };
    return data.filename ?? null;
  }, []);

  const addAttachment = useCallback((filename: string, name: string) => {
    setPendingAttachments((prev) =>
      prev.length < MAX_PENDING_ATTACHMENTS ? [...prev, { filename, name }] : prev
    );
  }, []);

  const removePendingAttachment = useCallback((index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      setAttachmentUploadError(null);
      for (const file of arr) {
        const total = pendingImages.length + pendingAttachments.length;
        if (total >= MAX_PENDING_TOTAL) break;
        
        if (file.type.startsWith('image/') && pendingImages.length < MAX_PENDING_IMAGES) {
          const filename = await uploadAttachment(file);
          if (filename) {
            const url = URL.createObjectURL(file);
            addImage(url, filename);
          } else {
            setAttachmentUploadError(`Could not upload ${file.name}`);
          }
        } else if (pendingAttachments.length < MAX_PENDING_ATTACHMENTS) {
          const filename = await uploadAttachment(file);
          if (filename) addAttachment(filename, file.name);
          else setAttachmentUploadError(`Could not upload ${file.name}`);
        }
      }
    },
    [addImage, addAttachment, uploadAttachment, pendingImages.length, pendingAttachments.length]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      void addFiles(files);
      e.target.value = '';
    },
    [addFiles]
  );

  const clearPending = useCallback(() => {
    setPendingImages([]);
    setPendingAttachments([]);
    setPendingVoice(null);
    setPendingVoiceFilename(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;
      const atCapacity = pendingImages.length + pendingAttachments.length >= MAX_PENDING_TOTAL;
      if (e.dataTransfer.types.includes('Files') && isAuthenticated && !atCapacity) {
        setIsDragOver(true);
      }
    },
    [isAuthenticated, pendingImages.length, pendingAttachments.length]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      const atCapacity = pendingImages.length + pendingAttachments.length >= MAX_PENDING_TOTAL;
      if (!files?.length || !isAuthenticated || atCapacity) return;
      void addFiles(files);
    },
    [isAuthenticated, pendingImages.length, pendingAttachments.length, addFiles]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (getClipboardTextForContentEditablePaste(e.clipboardData) !== null) return;
      const items = e.clipboardData?.items;
      const item = items ? Array.from(items).find((it) => it.type.startsWith('image/')) : undefined;
      if (!item || pendingImages.length >= MAX_PENDING_IMAGES) return;
      const file = item.getAsFile();
      if (!file) return;
      
      void uploadAttachment(file).then((filename) => {
        if (filename) {
          const url = URL.createObjectURL(file);
          addImage(url, filename);
        } else {
          setAttachmentUploadError('Could not upload pasted image');
        }
      });
    },
    [addImage, uploadAttachment, pendingImages.length]
  );

  return {
    pendingImages,
    pendingAttachments,
    pendingVoice,
    pendingVoiceFilename,
    voiceUploadError,
    attachmentUploadError,
    setVoiceUploadError,
    setPendingVoice,
    setPendingVoiceFilename,
    addImage,
    removePendingImage,
    removePendingVoice,
    addAttachment,
    removePendingAttachment,
    addFiles,
    handleFileChange,
    clearPending,
    uploadAttachment,
    isDragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePaste,
  };
}
