import { describe, test, expect } from 'bun:test';
import { AppService } from './app.service';

describe('AppService', () => {
  test('getData returns Hello API', () => {
    expect(new AppService().getData()).toEqual({ message: 'Hello API' });
  });
});
