import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

// Store html cache locally
let cachedHtml: string | null = null;

export function serveIndexLogic(req: FastifyRequest, res: FastifyReply, next: HookHandlerDoneFunction, publicDir = join(__dirname, '..', 'chat')) {
  const path = req.url.split('?')[0];
  if (
    path.startsWith('/api/') ||
    path.startsWith('/ws') ||
    path.startsWith('/assets/') ||
    path.includes('.')
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
    
    const prefix = process.env.AGENT_BASE_PATH || (req.headers['x-forwarded-prefix'] as string) || '';
    
    if (prefix) {
      const baseHref = prefix.endsWith('/') ? prefix : `${prefix}/`;
      const basename = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      // Inject base tag right after head
      html = html.replace('<head>', `<head>\n    <base href="${baseHref}" />\n    <script>window.__BASENAME__ = "${basename}";</script>`);
    } else {
      html = html.replace('<head>', `<head>\n    <base href="/" />\n    <script>window.__BASENAME__ = "";</script>`);
    }

    res.type('text/html').send(html);  // FastifyReply.send returns the reply itself
  } catch (error) {
    console.error('Error serving index.html', error);
    res.code(500).send('Internal Server Error');
  }
}

export function clearCacheForTests() {
  cachedHtml = null;
}
