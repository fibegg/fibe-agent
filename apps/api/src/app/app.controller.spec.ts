import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { Request, Response, NextFunction } from 'express';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import * as fs from 'fs';

vi.mock('fs');

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
    vi.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return ok', () => {
      expect(appController.getHealth()).toEqual({ status: 'ok' });
    });
  });

  describe('serveIndex', () => {
    let mockReq: { path: string; header: Mock };
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        path: '/',
        header: vi.fn().mockReturnValue(''),
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
        type: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('should call next() for /api/ routes', () => {
      mockReq.path = '/api/something';
      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for /ws routes', () => {
      mockReq.path = '/ws/agent';
      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for /assets/ routes', () => {
      mockReq.path = '/assets/main.js';
      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for static files with extensions', () => {
      mockReq.path = '/favicon.ico';
      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 404 if index.html does not exist', () => {
      (fs.existsSync as Mock).mockReturnValue(false);
      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.send).toHaveBeenCalledWith('Not Found');
    });

    it('should serve index.html with ROOT base and empty basename if no prefix', () => {
      const htmlContent = '<html><head></head><body>hello</body></html>';
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(htmlContent);

      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);

      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(mockRes.type).toHaveBeenCalledWith('text/html');
      expect(mockRes.send).toHaveBeenCalledWith(
        '<html><head>\n    <base href="/" />\n    <script>window.__BASENAME__ = "";</script></head><body>hello</body></html>'
      );
    });

    it('should serve index.html with dynamic base and basename if X-Forwarded-Prefix is set', () => {
      const htmlContent = '<html><head></head><body>hello</body></html>';
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(htmlContent);
      mockReq.header.mockReturnValue('/tab1');

      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);

      expect(mockRes.send).toHaveBeenCalledWith(
        '<html><head>\n    <base href="/tab1/" />\n    <script>window.__BASENAME__ = "/tab1";</script></head><body>hello</body></html>'
      );
    });

    it('should serve index.html with dynamic base and basename if AGENT_BASE_PATH is set', () => {
      const htmlContent = '<html><head></head><body>hello</body></html>';
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(htmlContent);
      process.env.AGENT_BASE_PATH = '/tab2';

      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);

      expect(mockRes.send).toHaveBeenCalledWith(
        '<html><head>\n    <base href="/tab2/" />\n    <script>window.__BASENAME__ = "/tab2";</script></head><body>hello</body></html>'
      );
      
      delete process.env.AGENT_BASE_PATH; // cleanup
    });

    it('should verify that html is cached in memory', () => {
      const htmlContent = '<html><head></head><body>cached</body></html>';
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(htmlContent);
      
      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      
      // Serve again
      appController.serveIndex(mockReq as unknown as Request, mockRes as Response, mockNext);
      // readFileSync should NOT be called again
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      
      expect(mockRes.send).toHaveBeenCalledWith(
        '<html><head>\n    <base href="/" />\n    <script>window.__BASENAME__ = "";</script></head><body>cached</body></html>'
      );
    });
  });
});
