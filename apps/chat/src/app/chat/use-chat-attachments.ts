import { useCallback, useEffect, useRef, useState } from 'react';
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
  conversationId?: string;
}

export function useChatAttachments({ isAuthenticated, conversationId = 'default' }: UseChatAttachmentsParams) {
  const [pendingImages, setPendingImages] = useState<{ url: string; filename: string }[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<{ filename: string; name: string }[]>([]);
  const [pendingVoice, setPendingVoice] = useState<string | null>(null);
  const [pendingVoiceFilename, setPendingVoiceFilename] = useState<string | null>(null);
  const [voiceUploadError, setVoiceUploadError] = useState<string | null>(null);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const imagesRef = useRef(pendingImages);
  const attachmentsRef = useRef(pendingAttachments);
  const reservedRef = useRef({ images: 0, attachments: 0 });
  const ownedUrlsRef = useRef(new Set<string>());
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const releaseUrl = useCallback((url: string) => {
    if (ownedUrlsRef.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  const addImage = useCallback((url: string, filename: string) => {
    if (imagesRef.current.length >= MAX_PENDING_IMAGES) {
      releaseUrl(url);
      return;
    }
    imagesRef.current = [...imagesRef.current, { url, filename }];
    setPendingImages(imagesRef.current);
  }, [releaseUrl]);

  const removePendingImage = useCallback((index: number) => {
    const removed = imagesRef.current[index];
    if (removed) releaseUrl(removed.url);
    imagesRef.current = imagesRef.current.filter((_, i) => i !== index);
    setPendingImages(imagesRef.current);
  }, [releaseUrl]);

  const removePendingVoice = useCallback(() => {
    setPendingVoice(null);
    setPendingVoiceFilename(null);
    setVoiceUploadError(null);
  }, []);

  const uploadAttachment = useCallback(async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const url = `${API_PATHS.UPLOADS}?conversationId=${encodeURIComponent(conversationId)}`;
    const res = await apiRequest(url, { method: 'POST', body: formData });
    if (!res.ok) return null;
    const data = (await res.json()) as { filename: string };
    return data.filename ?? null;
  }, [conversationId]);

  const addAttachment = useCallback((filename: string, name: string) => {
    if (attachmentsRef.current.length >= MAX_PENDING_ATTACHMENTS) return;
    attachmentsRef.current = [...attachmentsRef.current, { filename, name }];
    setPendingAttachments(attachmentsRef.current);
  }, []);

  const removePendingAttachment = useCallback((index: number) => {
    attachmentsRef.current = attachmentsRef.current.filter((_, i) => i !== index);
    setPendingAttachments(attachmentsRef.current);
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      setAttachmentUploadError(null);
      const generation = generationRef.current;
      for (const file of arr) {
        if (!mountedRef.current || generation !== generationRef.current) break;
        const reserved = reservedRef.current;
        const total = imagesRef.current.length + attachmentsRef.current.length + reserved.images + reserved.attachments;
        if (total >= MAX_PENDING_TOTAL) break;
        const image = file.type.startsWith('image/') && imagesRef.current.length + reserved.images < MAX_PENDING_IMAGES;
        const kind = image ? 'images' : 'attachments';
        if (!image && attachmentsRef.current.length + reserved.attachments >= MAX_PENDING_ATTACHMENTS) break;
        reserved[kind] += 1;
        try {
          const filename = await uploadAttachment(file);
          if (!mountedRef.current || generation !== generationRef.current) continue;
          if (filename) {
            if (image) {
              const url = URL.createObjectURL(file);
              ownedUrlsRef.current.add(url);
              addImage(url, filename);
            } else {
              addAttachment(filename, file.name);
            }
          } else {
            setAttachmentUploadError(`Could not upload ${file.name}`);
          }
        } catch {
          if (mountedRef.current && generation === generationRef.current) setAttachmentUploadError(`Could not upload ${file.name}`);
        } finally {
          if (generation === generationRef.current) reserved[kind] -= 1;
        }
      }
    },
    [addImage, addAttachment, uploadAttachment]
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
    generationRef.current += 1;
    reservedRef.current = { images: 0, attachments: 0 };
    for (const url of ownedUrlsRef.current) releaseUrl(url);
    imagesRef.current = [];
    attachmentsRef.current = [];
    setPendingImages([]);
    setPendingAttachments([]);
    setPendingVoice(null);
    setPendingVoiceFilename(null);
  }, [releaseUrl]);

  useEffect(() => {
    mountedRef.current = true;
    clearPending();
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      for (const url of ownedUrlsRef.current) releaseUrl(url);
    };
  }, [conversationId, clearPending, releaseUrl]);

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
      
      void addFiles([file]);
    },
    [addFiles, pendingImages.length]
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
