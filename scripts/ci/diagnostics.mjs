const sensitiveName = /token|password|secret|private.?key|api.?key|webhook|credential/i;

export function redactSecrets(text, environment = process.env) {
  const secrets = new Set();
  function collect(key, value) {
    if (typeof value === 'string') {
      if (sensitiveName.test(key) && value && value !== '""' && value !== "''") secrets.add(value);
      if (value.startsWith('{') || value.startsWith('[')) {
        try { collect('', JSON.parse(value)); } catch { /* Ordinary non-JSON environment value. */ }
      }
    } else if (value && typeof value === 'object') {
      for (const [name, entry] of Object.entries(value)) collect(name, entry);
    }
  }
  for (const [key, value] of Object.entries(environment)) collect(key, value);
  const variants = new Set();
  for (const secret of secrets) {
    variants.add(secret);
    variants.add(JSON.stringify(secret).slice(1, -1));
    if (secret.length >= 8) variants.add(Buffer.from(secret).toString('base64'));
  }
  let redacted = String(text);
  for (const secret of [...variants].sort((left, right) => right.length - left.length)) {
    redacted = redacted.replaceAll(secret, '[REDACTED]');
  }
  redacted = redacted.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.:-]+/gi, '$1 [REDACTED]');
  redacted = redacted.replace(/(\b(?:Authorization|Proxy-Authorization)["']?\s*[:=]\s*["']?)(?:(?:Bearer|Basic)\s+)?[^\s"',;\\}]+/gi, '$1[REDACTED]');
  return redacted;
}

export function failurePayload(text, environment = process.env, maxBytes = 256 * 1024) {
  const safe = redactSecrets(text, environment);
  const bytes = Buffer.from(safe);
  if (bytes.length <= maxBytes) return safe;
  const marker = `\n[Middle CI diagnostics omitted; report limited to ${maxBytes} bytes.]\n`;
  const room = maxBytes - Buffer.byteLength(marker);
  let headEnd = Math.min(4096, Math.floor(room / 3));
  while ((bytes[headEnd] & 0xc0) === 0x80) headEnd -= 1;
  let offset = bytes.length - (room - headEnd);
  while ((bytes[offset] & 0xc0) === 0x80) offset += 1;
  return bytes.subarray(0, headEnd).toString('utf8') + marker + bytes.subarray(offset).toString('utf8');
}
