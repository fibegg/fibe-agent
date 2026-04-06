/* eslint-disable no-restricted-globals */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Hook up the WebLLM Worker Handler to the global self scope
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
