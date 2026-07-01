import express from 'express';
import type { Db } from '../../../infra/db';

export function makeBackupController(db: Db): express.Router {
  const router = express.Router();
  router.get('/', (_req, res) => {
    const buf = db.serialize();
    const stamp = new Date().toISOString().slice(0, 10);
    res.attachment(`gastando-backup-${stamp}.db`).type('application/octet-stream').send(buf);
  });
  return router;
}
