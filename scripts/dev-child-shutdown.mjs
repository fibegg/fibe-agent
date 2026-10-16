const stopping = new WeakMap();

/** Stop only the child supplied by its owner; signal delivery is not exit. */
export function stopChild(child, graceMs = 3000, killGraceMs = 1000) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  if (stopping.has(child)) return stopping.get(child);
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('exit', exited);
      child.removeListener('close', exited);
      if (error) reject(error);
      else resolve();
    };
    const exited = () => finish();
    child.once('exit', exited);
    child.once('close', exited);
    const signal = (name) => {
      try {
        child.kill(name);
      } catch {
        /* The exit deadline still applies. */
      }
    };
    timer = setTimeout(() => {
      timer = setTimeout(
        () =>
          finish(
            new Error('Owned development child did not exit after SIGKILL'),
          ),
        killGraceMs,
      );
      signal('SIGKILL');
    }, graceMs);
    signal('SIGTERM');
  });
  stopping.set(child, promise);
  return promise;
}
