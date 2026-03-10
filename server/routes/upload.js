import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../lib/supabaseClient.js';
import dataCache from '../lib/dataCache.js';
import { parseCsvBuffer, inferColumns, previewRows } from '../services/dataProcessor.js';
import { storeDataChunks } from '../services/vectorService.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

router.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required.' });
    }

    const rows = parseCsvBuffer(req.file.buffer);
    if (!rows.length) {
      return res.status(400).json({ error: 'CSV has no data rows.' });
    }

    const columns = inferColumns(rows);
    const datasetName = req.body?.name?.trim() || req.file.originalname;

    const insertPayload = {
      name: datasetName,
      columns,
      row_count: rows.length,
      user_session: req.body?.userSession || null,
    };

    const { data, error } = await supabase
      .from('datasets')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const datasetId = data.id || uuidv4();

    dataCache.set(datasetId, rows);

    setImmediate(() => {
      storeDataChunks({ datasetId, rows, schema: columns }).catch((chunkError) => {
        console.error('Background chunking failed:', chunkError.message);
      });
    });

    return res.status(201).json({
      datasetId,
      name: datasetName,
      columns,
      rowCount: rows.length,
      preview: previewRows(rows, 20),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
