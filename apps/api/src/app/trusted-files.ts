import { spawn } from 'node:child_process';
import {
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ENVELOPE_BYTES = 48 * 1024 * 1024;

// Python is already a runtime dependency. dir_fd + O_NOFOLLOW keep every open
// relative to admitted directory descriptors, including missing write parents.
// The configured roots are administrative authority; hard links and moving an
// admitted directory inode remain that authority's responsibility.
export const TRUSTED_FILES_PROGRAM = String.raw`
import os, sys, json, stat, base64
LIMIT = 32 * 1024 * 1024
def inside(root, path):
    return os.path.commonpath([root, path]) == root
def directory(path):
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.strip('/').split('/'):
            if not part: continue
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except:
        os.close(fd)
        raise
def run(p):
    root = os.path.abspath(p['root'])
    rel = p['path']
    if not isinstance(rel, str) or os.path.isabs(rel) or '\x00' in rel: raise ValueError()
    lexical = os.path.abspath(os.path.join(root, rel))
    ignored = set(p['ignoredNames'])
    if not inside(root, lexical): raise ValueError()
    if any(x in ignored for x in os.path.relpath(lexical, root).split(os.sep)): raise ValueError()
    if os.path.lexists(lexical) and not os.path.exists(lexical): raise ValueError()
    canonical = os.path.realpath(lexical)
    roots = [os.path.realpath(x) for x in [root] + p['trustedRoots']]
    allowed = [x for x in roots if inside(x, canonical)]
    if not allowed: raise ValueError()
    authority = max(allowed, key=len)
    parts = os.path.relpath(canonical, authority).split(os.sep)
    if any(x in ignored for x in parts): raise ValueError()
    if parts == ['.']:
        if p['action'] not in ['list', 'stat']: raise ValueError()
        parts = []
    fd = directory(authority)
    try:
        if not parts and p['action'] == 'stat':
            st = os.fstat(fd)
            return {'type': 'directory', 'mtime': st.st_mtime * 1000}
        parents = parts if p['action'] == 'list' else parts[:-1]
        for part in parents:
            if p['action'] == 'write':
                try: os.mkdir(part, dir_fd=fd)
                except FileExistsError: pass
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        if p['action'] == 'list':
            entries = []
            with os.scandir(fd) as scan:
                for index, entry in enumerate(scan):
                    if index >= 10000: raise OverflowError()
                    name = entry.name
                    if name in ignored: continue
                    st = os.stat(name, dir_fd=fd, follow_symlinks=False)
                    kind = 'directory' if stat.S_ISDIR(st.st_mode) else 'file' if stat.S_ISREG(st.st_mode) else 'other'
                    mtime = st.st_mtime * 1000
                    if stat.S_ISLNK(st.st_mode):
                        try:
                            target = run({**p, 'action': 'stat', 'path': os.path.join(rel, name)})
                            kind, mtime = target['type'], target['mtime']
                        except Exception: continue
                    entries.append({'name': name, 'type': kind, 'mtime': mtime})
            return {'entries': entries}
        flags = (os.O_WRONLY if p['action'] == 'write' else os.O_RDONLY) | os.O_NOFOLLOW | os.O_NONBLOCK
        try: file_fd = os.open(parts[-1], flags, dir_fd=fd)
        except FileNotFoundError:
            if p['action'] != 'write': raise
            file_fd = os.open(parts[-1], flags | os.O_CREAT | os.O_EXCL, 0o666, dir_fd=fd)
        try:
            st = os.fstat(file_fd)
            if p['action'] == 'stat':
                return {'type': 'directory' if stat.S_ISDIR(st.st_mode) else 'file' if stat.S_ISREG(st.st_mode) else 'other', 'mtime': st.st_mtime * 1000}
            if not stat.S_ISREG(st.st_mode): raise ValueError()
            if p['action'] == 'write':
                data = base64.b64decode(p['content'], validate=True)
                if len(data) > LIMIT: raise OverflowError()
                os.ftruncate(file_fd, 0)
                with os.fdopen(file_fd, 'wb', closefd=False) as out: out.write(data)
            elif p['action'] == 'read':
                with os.fdopen(file_fd, 'rb', closefd=False) as src: data = src.read(LIMIT + 1)
                if len(data) > LIMIT: raise OverflowError()
                return {'content': base64.b64encode(data).decode('ascii')}
            return {'path': canonical}
        finally: os.close(file_fd)
    finally: os.close(fd)
try:
    raw = sys.stdin.buffer.read(48 * 1024 * 1024 + 1)
    if len(raw) > 48 * 1024 * 1024: raise OverflowError()
    print(json.dumps(run(json.loads(raw))))
except OverflowError:
    print(json.dumps({'error': 'too_large'}))
except Exception:
    print(json.dumps({'error': 'unavailable'}))
`;

export interface TrustedFileScope {
  root: string;
  trustedRoots: string[];
  ignoredNames: string[];
}
export interface TrustedDirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  mtime: number;
}

async function operate(
  scope: TrustedFileScope,
  action: string,
  path: string,
  content?: Buffer,
): Promise<Record<string, unknown>> {
  if (content && content.length > MAX_FILE_BYTES)
    throw new PayloadTooLargeException('File exceeds 32 MiB');
  const payload = JSON.stringify({
    ...scope,
    action,
    path,
    ...(content ? { content: content.toString('base64') } : {}),
  });
  if (Buffer.byteLength(payload) > MAX_ENVELOPE_BYTES)
    throw new PayloadTooLargeException('File request too large');
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-I', '-c', TRUSTED_FILES_PROGRAM], {
      stdio: ['pipe', 'pipe', 'ignore'],
      shell: false,
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failed = false;
    const fail = () => {
      if (failed) return;
      failed = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(new ServiceUnavailableException('Safe file operation failed'));
    };
    const timer = setTimeout(fail, 10_000);
    child.once('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_ENVELOPE_BYTES) fail();
      else chunks.push(chunk);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0) {
        fail();
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (result.error === 'too_large')
          reject(
            new PayloadTooLargeException(
              'File operation exceeds the size limit',
            ),
          );
        else if (result.error)
          reject(
            new NotFoundException('File not found or outside trusted roots'),
          );
        else resolve(result);
      } catch {
        fail();
      }
    });
    child.stdin.end(payload);
  });
}

export async function readTrustedFile(
  scope: TrustedFileScope,
  path: string,
): Promise<Buffer> {
  const result = await operate(scope, 'read', path);
  return Buffer.from(result.content as string, 'base64');
}
export async function writeTrustedFile(
  scope: TrustedFileScope,
  path: string,
  content: Buffer,
): Promise<void> {
  await operate(scope, 'write', path, content);
}
/** Metadata only: callers must not reopen this path for content I/O. */
export async function inspectTrustedFile(
  scope: TrustedFileScope,
  path: string,
): Promise<string> {
  return (await operate(scope, 'inspect', path)).path as string;
}
export async function listTrustedDirectory(
  scope: TrustedFileScope,
  path: string,
): Promise<TrustedDirectoryEntry[]> {
  return (await operate(scope, 'list', path))
    .entries as TrustedDirectoryEntry[];
}
