import { expect, mock, test } from 'bun:test';
import { AgentFilesController } from './agent-files/agent-files.controller';
import { PlaygroundsController } from './playgrounds/playgrounds.controller';

for (const kind of ['agent', 'playground']) {
  test(`${kind} raw response sends the admitted bytes without reopening metadata paths`, async () => {
    const bytes = Buffer.from([0, 255, 1, 128]);
    const files = {
      getFileBuffer: mock(async () => bytes),
      getFilePath: () => {
        throw new Error('Metadata paths must not be reopened');
      },
    };
    const headers = new Map<string, string>();
    const reply = {
      header: (name: string, value: string) => headers.set(name, value),
      send: mock((value: unknown) => value),
    };
    const result =
      kind === 'agent'
        ? await new AgentFilesController(files as never).getRawFile(
            'image.png',
            'conversation',
            reply as never,
          )
        : await new PlaygroundsController(
            files as never,
            {} as never,
          ).getRawFile('image.png', reply as never);
    expect(result).toBe(bytes);
    expect(reply.send).toHaveBeenCalledWith(bytes);
    expect(headers.get('Content-Type')).toBe('image/png');
    expect(files.getFileBuffer).toHaveBeenCalledTimes(1);
  });
}
