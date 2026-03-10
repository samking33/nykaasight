import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import supabase from '../lib/supabaseClient.js';
import dataCache from '../lib/dataCache.js';
import { fetchDataPreviewFromChunks, storeDataChunks } from '../services/vectorService.js';
import { inferColumns, parseCsvBuffer, previewRows } from '../services/dataProcessor.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DATASET_NAME = 'Nykaa Demo';

router.get('/api/datasets', async (_, res) => {
  const { data, error } = await supabase
    .from('datasets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data || []);
});

router.get('/api/datasets/nykaa/load', async (_, res) => {
  try {
    const csvPathCandidates = [
      path.resolve(__dirname, '../../Nykaa Digital Marketing.csv'),
      path.resolve(__dirname, '../data/Nykaa_Digital_Marketing.csv'),
    ];

    let fileBuffer = null;
    for (const candidate of csvPathCandidates) {
      try {
        fileBuffer = await fs.readFile(candidate);
        break;
      } catch {
        // Try next candidate path.
      }
    }

    if (!fileBuffer) {
      return res.status(404).json({ error: 'Nykaa default dataset file not found.' });
    }

    const rows = parseCsvBuffer(fileBuffer);

    if (!rows.length) {
      return res.status(400).json({ error: 'Nykaa default dataset is empty.' });
    }

    const columns = inferColumns(rows);
    const rowCount = rows.length;

    const { data: existing, error: existingError } = await supabase
      .from('datasets')
      .select('id')
      .eq('name', DEFAULT_DATASET_NAME)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ error: existingError.message });
    }

    let datasetId = existing?.id;

    if (datasetId) {
      const { error: updateError } = await supabase
        .from('datasets')
        .update({
          columns,
          row_count: rowCount,
        })
        .eq('id', datasetId);

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('datasets')
        .insert({
          name: DEFAULT_DATASET_NAME,
          columns,
          row_count: rowCount,
          user_session: 'demo',
        })
        .select('id')
        .single();

      if (insertError) {
        return res.status(500).json({ error: insertError.message });
      }

      datasetId = inserted.id;
    }

    dataCache.set('nykaa-default', rows);
    dataCache.set(datasetId, rows);

    setImmediate(() => {
      storeDataChunks(datasetId, rows, columns).catch((error) => {
        console.error('Nykaa default vector indexing failed:', error.message);
      });
    });

    return res.json({
      datasetId,
      name: DEFAULT_DATASET_NAME,
      columns,
      rowCount,
      preview: previewRows(rows, 20),
      isDemo: true,
      cacheId: 'nykaa-default',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/api/datasets/:id/preview', async (req, res) => {
  const datasetId = req.params.id;

  const cached = dataCache.get(datasetId);
  if (cached) {
    return res.json({
      datasetId,
      source: 'cache',
      preview: cached.slice(0, 20),
    });
  }

  try {
    const preview = await fetchDataPreviewFromChunks(datasetId, 20);
    return res.json({
      datasetId,
      source: 'database',
      preview,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
