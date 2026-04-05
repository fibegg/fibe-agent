import { Controller, Get, Req, Res, Next } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

@Controller()
export class AppController {
  private indexPath = join(__dirname, '..', 'chat', 'index.html');
  private cachedHtml: string | null = null;

  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }

  @Get('*')
  serveIndex(@Req() req: Request, @Res() res: Response, @Next() next: NextFunction) {
    if (
      req.path.startsWith('/api/') ||
      req.path.startsWith('/ws') ||
      req.path.startsWith('/assets/') ||
      req.path.includes('.')
    ) {
      return next();
    }

    try {
      if (!this.cachedHtml) {
        if (!existsSync(this.indexPath)) {
          return res.status(404).send('Not Found');
        }
        this.cachedHtml = readFileSync(this.indexPath, 'utf-8');
      }

      let html = this.cachedHtml;
      
      const prefix = process.env.AGENT_BASE_PATH || req.header('x-forwarded-prefix') || '';
      
      if (prefix) {
        const baseHref = prefix.endsWith('/') ? prefix : `${prefix}/`;
        const basename = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
        // Inject base tag right after head
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
}
