import liveServer from 'live-server';
import fs from 'fs';
import path from 'path';

const ANN_DIR = path.join('BookReaderDemo', 'annotations');

liveServer.start({
  root: '.',
  port: 8000,
  watch: ['index.html', 'BookReader', 'BookReaderDemo'],
  cors: true,
  middleware: [function (req, res, next) {
    console.log(`${req.method} ${req.url}`);

    // Delete an annotation run (its .json + matching .meta.json) from the
    // landing folder. POST /__delete-annotation?file=<id>.<ts>.json
    if (req.method === 'POST' && req.url.startsWith('/__delete-annotation')) {
      const file = new URL(req.url, 'http://localhost').searchParams.get('file') || '';
      const safe = path.basename(file);
      // only a bare "<name>.json" filename (no path components / traversal)
      if (safe === file && /^[A-Za-z0-9._-]+\.json$/.test(safe)) {
        const deleted = [];
        const targets = [
          path.join(ANN_DIR, safe),
          path.join(ANN_DIR, safe.replace(/\.json$/, '.meta.json')),
        ];
        for (const p of targets) {
          try { fs.unlinkSync(p); deleted.push(path.basename(p)); } catch (e) { /* missing -> ignore */ }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, deleted }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid file' }));
      }
      return;
    }

    // Handle /details/<identifier> requests
    const detailsMatch = req.url.match(/^\/details\/([^/?]+)/);
    if (detailsMatch) {
      const newUrl = `/BookReaderDemo/demo-internetarchive.html`;
      console.log(`Rewriting ${req.url} to ${newUrl}`);
      req.url = newUrl;
    }

    next();
  }],
});
