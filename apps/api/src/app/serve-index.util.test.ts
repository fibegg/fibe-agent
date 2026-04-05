import { describe, it, expect, beforeEach, afterEach, mock, Mock, spyOn, MockInstance } from 'bun:test';
import type { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import { serveIndexLogic, clearCacheForTests } from './serve-index.util';

describe('serveIndexLogic', () => {
  let mockReq: { path: string; header: Mock<() => string> };
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let existsSyncSpy: MockInstance;
  let readFileSyncSpy: MockInstance;

  beforeEach(() => {
    existsSyncSpy = spyOn(fs, 'existsSync').mockReturnValue(false);
    readFileSyncSpy = spyOn(fs, 'readFileSync').mockReturnValue('');
    clearCacheForTests();

    mockReq = {
      path: '/',
      header: mock(() => ''),
    };
    mockRes = {
      status: mock().mockReturnThis(),
      send: mock(),
      type: mock().mockReturnThis(),
    };
    mockNext = mock();
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    readFileSyncSpy.mockRestore();
  });

  it('should call next() for /api/ routes', () => {
    mockReq.path = '/api/something';
    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should call next() for /ws routes', () => {
    mockReq.path = '/ws/agent';
    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should call next() for /assets/ routes', () => {
    mockReq.path = '/assets/main.js';
    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should call next() for static files with extensions', () => {
    mockReq.path = '/favicon.ico';
    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should return 404 if index.html does not exist', () => {
    existsSyncSpy.mockReturnValueOnce(false);
    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.send).toHaveBeenCalledWith('Not Found');
  });

  it('should serve index.html with ROOT base and empty basename if no prefix', () => {
    const htmlContent = '<html><head></head><body>hello</body></html>';
    existsSyncSpy.mockReturnValueOnce(true);
    readFileSyncSpy.mockReturnValueOnce(htmlContent);

    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);

    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);
    expect(mockRes.type).toHaveBeenCalledWith('text/html');
    expect(mockRes.send).toHaveBeenCalledWith(
      '<html><head>\n    <base href="/" />\n    <script>window.__BASENAME__ = "";</script></head><body>hello</body></html>'
    );
  });

  it('should serve index.html with dynamic base and basename if X-Forwarded-Prefix is set', () => {
    const htmlContent = '<html><head></head><body>hello</body></html>';
    existsSyncSpy.mockReturnValueOnce(true);
    readFileSyncSpy.mockReturnValueOnce(htmlContent);
    mockReq.header.mockReturnValueOnce('/tab1');

    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);

    expect(mockRes.send).toHaveBeenCalledWith(
      '<html><head>\n    <base href="/tab1/" />\n    <script>window.__BASENAME__ = "/tab1";</script></head><body>hello</body></html>'
    );
  });

  it('should serve index.html with dynamic base and basename if AGENT_BASE_PATH is set', () => {
    const htmlContent = '<html><head></head><body>hello</body></html>';
    existsSyncSpy.mockReturnValueOnce(true);
    readFileSyncSpy.mockReturnValueOnce(htmlContent);
    process.env.AGENT_BASE_PATH = '/tab2';

    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);

    expect(mockRes.send).toHaveBeenCalledWith(
      '<html><head>\n    <base href="/tab2/" />\n    <script>window.__BASENAME__ = "/tab2";</script></head><body>hello</body></html>'
    );
    
    delete process.env.AGENT_BASE_PATH; // cleanup
  });

  it('should verify that html is cached in memory', () => {
    const htmlContent = '<html><head></head><body>cached</body></html>';
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue(htmlContent);
    
    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);
    
    // Serve again
    serveIndexLogic(mockReq as unknown as Request, mockRes as Response, mockNext);
    // readFileSync should NOT be called again
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1);
    
    expect(mockRes.send).toHaveBeenCalledWith(
      '<html><head>\n    <base href="/" />\n    <script>window.__BASENAME__ = "";</script></head><body>cached</body></html>'
    );
  });
});
