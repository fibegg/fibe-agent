import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import type { NextFunction, Request, Response } from 'express';

// Store html cache locally
let cachedHtml: string | null = null;

export function serveIndexLogic(req: Request, res: Response, next: NextFunction, publicDir = join(__dirname, '..', 'chat')) {
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/ws') ||
    req.path.startsWith('/assets/') ||
    req.path.includes('.')
  ) {
    return next();
  }

  try {
    const indexPath = join(publicDir, 'index.html');

    if (!cachedHtml) {
      if (!existsSync(indexPath)) {
        return res.status(404).send('Not Found');
      }
      cachedHtml = readFileSync(indexPath, 'utf-8');
    }

    let html = cachedHtml;

    const rawPrefix = process.env.AGENT_BASE_PATH || req.header('x-forwarded-prefix') || '';
    const prefix = rawPrefix.replace(/[^a-zA-Z0-9/_-]/g, '');

    if (prefix) {
      const baseHref = prefix.endsWith('/') ? prefix : `${prefix}/`;
      const basename = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      html = html.replace('<head>', `<head>\n    <base href="${baseHref}" />\n    <script>window.__BASENAME__ = "${basename}";</script>`);
    } else {
      html = html.replace('<head>', `<head>\n    <base href="/" />\n    <script>window.__BASENAME__ = "";</script>`);
    }

    res.type('text/html').send(html);
  } catch (error) {
    console.error('Error serving index.html', error);
    res.status(500).send('Internal Server Error');
  }
}

export function clearCacheForTests() {
  cachedHtml = null;
}
