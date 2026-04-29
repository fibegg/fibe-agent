import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { AbstractCLIStrategy } from './abstract-cli.strategy';
import type { AuthConnection } from './strategy.types';

class MockCLIStrategy extends AbstractCLIStrategy {
  public killed = false;

  constructor() {
    super('MockCLIStrategy', false);
  }

  getWorkingDir(): string {
    return '/tmp/mock-dir';
  }
  executeAuth(connection: AuthConnection): void {}
  cancelAuth(): void {}
  checkAuthStatus(): Promise<boolean> { return Promise.resolve(true); }
  
  override interruptAgent(): void {
    this.killed = true;
  }
  
  // Expose protected methods for testing
  public exposeConsumePendingMessages() {
    return this.consumePendingMessages();
  }
}

describe('AbstractCLIStrategy', () => {
  let strategy: MockCLIStrategy;

  beforeEach(() => {
    strategy = new MockCLIStrategy();
  });

  test('steerAgent adds to pending messages and interrupts', () => {
    strategy.steerAgent('Turn left!');
    expect(strategy.killed).toBe(true);
    const msgs = strategy.exposeConsumePendingMessages();
    expect(msgs).toBe('Turn left!');
  });

  test('consumePendingMessages clears the queue', () => {
    strategy.steerAgent('Turn left!');
    strategy.steerAgent('Wait, go right!');
    
    const msgs1 = strategy.exposeConsumePendingMessages();
    expect(msgs1).toBe('Turn left!\n\nWait, go right!');
    
    const msgs2 = strategy.exposeConsumePendingMessages();
    expect(msgs2).toBeUndefined();
  });
});
