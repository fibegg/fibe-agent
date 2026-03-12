import {
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  Image,
  Database,
  Settings,
} from 'lucide-react';
import { getFileIconInfo, type FileIconId } from './file-extension-icons';

const ICON_MAP: Record<FileIconId, typeof File> = {
  folder: Folder,
  image: Image,
  'file-code': FileCode,
  'file-json': FileJson,
  'file-text': FileText,
  'file-config': Settings,
  'file-data': Database,
  file: File,
};

export interface FileIconProps {
  pathOrName: string;
  isDirectory?: boolean;
  className?: string;
  size?: number;
}

export function FileIcon({ pathOrName, isDirectory, className = '', size }: FileIconProps) {
  const { iconId, colorClass } = getFileIconInfo(pathOrName, isDirectory);
  const Icon = ICON_MAP[iconId];
  const sizeStyle = size !== undefined ? { width: size, height: size } : undefined;
  const sizeClass = size === undefined ? 'size-3.5' : '';
  return (
    <Icon
      className={['shrink-0', colorClass, sizeClass, className].filter(Boolean).join(' ')}
      style={sizeStyle}
      aria-hidden
    />
  );
}
