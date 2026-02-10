import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBRARIES_DIR = path.join(__dirname, '..', '..', 'libraries');

const router = Router();

// GET /v1/libraries — list available library definitions
router.get('/', async (_req: Request, res: Response) => {
  const files = await fs.promises.readdir(LIBRARIES_DIR);
  const libraries = files
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));

  res.json({
    data: libraries,
    meta: { count: libraries.length },
  });
});

// GET /v1/libraries/:name — return markdown content of a library definition
router.get('/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  const filePath = path.join(LIBRARIES_DIR, `${name}.md`);

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(LIBRARIES_DIR))) {
    res.status(400).json({ error: { code: 'INVALID_NAME', message: 'Invalid library name.' } });
    return;
  }

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    res.json({
      data: { name, content },
    });
  } catch {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: `Library "${name}" not found.` },
    });
  }
});

export default router;
