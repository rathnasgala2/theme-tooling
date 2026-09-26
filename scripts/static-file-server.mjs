/**
 * THD-M10: a minimal loopback-only static file server for `visual-check.mjs`.
 *
 * `visual-check.mjs` used to load the rendered fixture via a `file://` URL.
 * The template emits root-absolute asset references (`<link
 * href="/assets/theme/...">`, a bootstrap `<script src="/...">`) because a
 * real deployment serves the publication from an HTTP origin. Under
 * `file://` those root-absolute paths resolve against the filesystem root
 * (`file:///assets/...`), which never exists, so every stylesheet and the
 * bootstrap script silently 404 — the page renders with User-Agent styles
 * only and the axe/overflow/screenshot results this harness produces are
 * meaningless. Serving the render output directory over a real HTTP origin
 * (loopback only, random port) makes root-absolute references resolve the
 * way they would for a real visitor, without touching the template's own
 * CSP baseline (that meta tag is emitted by the renderer, byte-for-byte, and
 * this server does not add, remove, or relax any directive).
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

/** @type {Readonly<Record<string, string>>} extension -> Content-Type. */
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
});

/** @type {string} the default served when an extension is unrecognized. */
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/**
 * Start a loopback-only static file server rooted at `rootDirectory`.
 *
 * @param {string} rootDirectory the absolute directory to serve
 * @returns {Promise<{origin: string, close: () => Promise<void>}>}
 *   `origin` is `http://127.0.0.1:<port>` (no trailing slash); `close`
 *   shuts the server down.
 */
export async function startStaticFileServer(rootDirectory) {
  const root = path.resolve(rootDirectory);

  const server = http.createServer((request, response) => {
    void handleRequest(root, request, response);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(undefined);
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('static file server did not bind a TCP port');
  }
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve(undefined)));
      }),
  };
}

/**
 * @param {string} root the served root directory (already resolved)
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 */
async function handleRequest(root, request, response) {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://internal.invalid');
    const decodedPathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPathname.replace(/^\/+/, '');
    const resolvedPath = path.resolve(root, relativePath);

    // Path-traversal guard: the resolved path must stay under `root`.
    const rootWithSeparator = root.endsWith(path.sep) ? root : root + path.sep;
    if (resolvedPath !== root && !resolvedPath.startsWith(rootWithSeparator)) {
      response.writeHead(403).end('forbidden');
      return;
    }

    const fileInfo = await stat(resolvedPath).catch(() => null);
    if (!fileInfo || !fileInfo.isFile()) {
      response.writeHead(404).end('not found');
      return;
    }

    const contentType =
      CONTENT_TYPES[path.extname(resolvedPath).toLowerCase()] ??
      DEFAULT_CONTENT_TYPE;
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(fileInfo.size),
    });
    createReadStream(resolvedPath).pipe(response);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
}
