import { describe, test, expect } from 'bun:test';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  test('getData returns Hello API', () => {
    const controller = new AppController(new AppService());
    expect(controller.getData()).toEqual({ message: 'Hello API' });
  });
});
