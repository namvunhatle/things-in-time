export function trustedRequestBase(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return null;

  if (origin === 'null') {
    if (!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) return null;
    return `${new URL(request.url).protocol}//${host}`;
  }

  try {
    if (new URL(origin).host !== host) return null;
    return origin;
  } catch {
    return null;
  }
}
