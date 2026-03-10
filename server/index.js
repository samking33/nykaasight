import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import uploadRoutes from './routes/upload.js';
import chatRoutes from './routes/chat.js';
import sessionRoutes from './routes/sessions.js';
import datasetRoutes from './routes/datasets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_, res) => {
  res.json({ ok: true, service: 'NykaaSight API' });
});

app.use(uploadRoutes);
app.use(chatRoutes);
app.use(sessionRoutes);
app.use(datasetRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`NykaaSight API running on http://localhost:${port}`);
  });
}

export default app;
