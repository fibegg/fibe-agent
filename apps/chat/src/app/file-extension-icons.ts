export type FileIconId =
  | 'folder'
  | 'image'
  | 'file-code'
  | 'file-json'
  | 'file-text'
  | 'file-config'
  | 'file-data'
  | 'file';

export interface FileIconInfo {
  iconId: FileIconId;
  colorClass: string;
}

const FOLDER_COLOR = 'text-violet-600 dark:text-violet-400';
const IMAGE_COLOR = 'text-pink-400';
const CODE_COLOR = 'text-green-400';
const JSON_COLOR = 'text-amber-500';
const DOC_COLOR = 'text-blue-400';
const CONFIG_COLOR = 'text-cyan-500';
const DATA_COLOR = 'text-emerald-500';
const FILE_COLOR = 'text-muted-foreground';

const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif', '.tiff', '.tif',
]);

const JSON_EXT = new Set(['.json', '.json5', '.jsonc']);

const DOC_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.tex', '.latex', '.adoc', '.asciidoc']);

const CONFIG_EXT = new Set([
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.editorconfig', '.properties',
  '.nix', '.hcl', '.tf', '.tfvars',
]);

const DATA_EXT = new Set([
  '.csv', '.tsv', '.xml', '.sql', '.db', '.sqlite', '.parquet', '.arrow', '.feather',
]);

const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.sass', '.less', '.styl',
  '.html', '.htm', '.vue', '.svelte', '.astro', '.php', '.py', '.pyw', '.rb', '.go', '.mod',
  '.rs', '.java', '.kt', '.kts', '.swift', '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp',
  '.cs', '.zig', '.lua', '.dart', '.hs', '.lhs', '.scala', '.sc', '.nim', '.ex', '.exs',
  '.erl', '.hrl', '.clj', '.cljs', '.cljc', '.edn', '.groovy', '.gy', '.gvy', '.pl', '.pm',
  '.ps1', '.psm1', '.pssc', '.fs', '.fsi', '.fsx', '.ml', '.mli', '.sol', '.graphql', '.gql',
  '.pug', '.jade', '.coffee', '.jl', '.m', '.mm', '.gd', '.glsl', '.vert', '.frag',
  '.v', '.sv', '.vhd', '.vhdl', '.wat', '.d', '.cr', '.f', '.f90', '.f95', '.proto',
  '.sh', '.bash', '.zsh', '.fish', '.bat', '.cmd', '.makefile', '.mk', '.cmake',
  '.gradle', '.diff', '.patch', '.rest',
]);

function getBasename(pathOrName: string): string {
  return pathOrName.includes('/') ? pathOrName.slice(pathOrName.lastIndexOf('/') + 1) : pathOrName;
}

function getExtension(pathOrName: string): string {
  const name = getBasename(pathOrName);
  if (!name.includes('.')) return '';
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

export function getFileIconInfo(pathOrName: string, isDirectory?: boolean): FileIconInfo {
  if (isDirectory === true) return { iconId: 'folder', colorClass: FOLDER_COLOR };
  const ext = getExtension(pathOrName);
  if (!ext) {
    const lower = getBasename(pathOrName).toLowerCase();
    if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return { iconId: 'file-code', colorClass: CODE_COLOR };
    if (lower === 'makefile') return { iconId: 'file-code', colorClass: CODE_COLOR };
    return { iconId: 'folder', colorClass: FOLDER_COLOR };
  }
  if (IMAGE_EXT.has(ext)) return { iconId: 'image', colorClass: IMAGE_COLOR };
  if (JSON_EXT.has(ext)) return { iconId: 'file-json', colorClass: JSON_COLOR };
  if (DOC_EXT.has(ext)) return { iconId: 'file-text', colorClass: DOC_COLOR };
  if (CONFIG_EXT.has(ext)) return { iconId: 'file-config', colorClass: CONFIG_COLOR };
  if (DATA_EXT.has(ext)) return { iconId: 'file-data', colorClass: DATA_COLOR };
  if (CODE_EXT.has(ext)) return { iconId: 'file-code', colorClass: CODE_COLOR };
  return { iconId: 'file', colorClass: FILE_COLOR };
}
