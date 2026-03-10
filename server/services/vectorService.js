import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import supabase from '../lib/supabaseClient.js';
import dataCache from '../lib/dataCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nimClient = process.env.NVIDIA_NIM_API_KEY
  ? new OpenAI({
      apiKey: process.env.NVIDIA_NIM_API_KEY,
      baseURL: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
    })
  : null;

const CHUNK_SIZE = 50;
const INSERT_BATCH_SIZE = 10;

const truncateText = (text, max = 8000) => {
  const normalized = String(text ?? '');
  return normalized.length > max ? normalized.slice(0, max) : normalized;
};

const chunkArray = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const numericValues = (rows, columnName) => rows
  .map((row) => Number(row[columnName]))
  .filter((value) => Number.isFinite(value));

const topValues = (rows, columnName, limit = 3) => {
  const counts = new Map();
  for (const row of rows) {
    const raw = row[columnName];
    const key = raw === null || raw === undefined || raw === '' ? 'N/A' : String(raw);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => `${value} (${count})`)
    .join(', ');
};

const dateRange = (rows, columnName) => {
  const timestamps = rows
    .map((row) => Date.parse(String(row[columnName] ?? '')))
    .filter((value) => !Number.isNaN(value));

  if (!timestamps.length) return null;

  const min = new Date(Math.min(...timestamps)).toISOString();
  const max = new Date(Math.max(...timestamps)).toISOString();
  return { min, max };
};

const buildChunkSummary = (chunkRows, schema, index) => {
  const numericColumns = schema.filter((col) => col.type === 'number');
  const categoricalColumns = schema.filter((col) => col.type === 'categorical');
  const dateColumns = schema.filter((col) => col.type === 'date');

  let summary = `Dataset chunk [${index + 1}]: ${chunkRows.length} rows. `;

  for (const column of numericColumns) {
    const values = numericValues(chunkRows, column.name);
    if (!values.length) continue;

    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    summary += `Avg ${column.name}=${avg.toFixed(2)}, Max ${column.name}=${Math.max(...values)}, Min ${column.name}=${Math.min(...values)}. `;
  }

  for (const column of categoricalColumns) {
    const top = topValues(chunkRows, column.name, 3);
    summary += `Top values for ${column.name}: ${top}. `;
  }

  for (const column of dateColumns) {
    const range = dateRange(chunkRows, column.name);
    if (!range) continue;
    summary += `Date range for ${column.name}: ${range.min} to ${range.max}. `;
  }

  return truncateText(summary);
};

const buildOverview = (rows, schema) => {
  const numericColumns = schema.filter((col) => col.type === 'number');
  const dateColumns = schema.filter((col) => col.type === 'date');

  let summary = `Overview: ${rows.length} total rows. Schema: ${JSON.stringify(schema)}. `;

  for (const column of numericColumns) {
    const values = numericValues(rows, column.name);
    if (!values.length) continue;

    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    summary += `Overall ${column.name}: avg=${avg.toFixed(2)}, max=${Math.max(...values)}, min=${Math.min(...values)}. `;
  }

  for (const column of dateColumns) {
    const range = dateRange(rows, column.name);
    if (!range) continue;
    summary += `Overall ${column.name} range: ${range.min} to ${range.max}. `;
  }

  return truncateText(summary);
};

export const embedText = async (text) => {
  try {
    if (!nimClient) return null;

    const makeEmbedding = async (maxChars) => nimClient.embeddings.create({
      model: 'nvidia/nv-embedqa-e5-v5',
      input: truncateText(text, maxChars),
      input_type: 'query',
    });

    let response;
    try {
      // Keep inputs conservative for this embedding model's token limit.
      response = await makeEmbedding(1800);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!/maximum allowed token size|input length|token/i.test(message)) {
        throw error;
      }
      response = await makeEmbedding(900);
    }

    return response?.data?.[0]?.embedding || null;
  } catch (error) {
    console.error('embedText failed:', error.message);
    return null;
  }
};

const insertEmbeddingsInBatches = async (records) => {
  for (const batch of chunkArray(records, INSERT_BATCH_SIZE)) {
    const { error } = await supabase.from('embeddings').insert(batch);
    if (error) {
      console.error('Embedding insert batch failed:', error.message);
    }
  }
};

export const storeDataChunks = async (...args) => {
  try {
    let datasetId;
    let rows;
    let schema;

    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      datasetId = args[0].datasetId;
      rows = args[0].rows;
      schema = args[0].schema;
    } else {
      [datasetId, rows, schema] = args;
    }

    const effectiveRows = Array.isArray(rows) && rows.length ? rows : dataCache.get(datasetId);
    if (!datasetId || !Array.isArray(effectiveRows) || effectiveRows.length === 0) return;

    const inferredSchema = Array.isArray(schema) && schema.length
      ? schema
      : Object.keys(effectiveRows[0] || {}).map((name) => ({ name, type: 'text' }));

    const chunks = chunkArray(effectiveRows, CHUNK_SIZE);
    const records = [];

    for (let i = 0; i < chunks.length; i += 1) {
      const content = buildChunkSummary(chunks[i], inferredSchema, i);
      const embedding = await embedText(content);
      if (!embedding) continue;

      records.push({
        dataset_id: datasetId,
        session_id: null,
        content_type: 'data_chunk',
        content,
        metadata: {
          chunkIndex: i,
          rowCount: chunks[i].length,
        },
        embedding,
      });
    }

    const overviewText = buildOverview(effectiveRows, inferredSchema);
    const overviewEmbedding = await embedText(overviewText);
    if (overviewEmbedding) {
      records.push({
        dataset_id: datasetId,
        session_id: null,
        content_type: 'data_chunk',
        content: overviewText,
        metadata: {
          kind: 'overview',
          schema: inferredSchema,
          rowCount: effectiveRows.length,
        },
        embedding: overviewEmbedding,
      });
    }

    if (records.length) {
      await insertEmbeddingsInBatches(records);
    }
  } catch (error) {
    console.error('storeDataChunks failed:', error.message);
  }
};

export const storeChartMemory = async (chartConfigs, sessionId, datasetId, userQuery) => {
  try {
    const content = truncateText(`User asked: ${userQuery}. Charts generated: ${JSON.stringify(chartConfigs)}`);
    const embedding = await embedText(content);
    if (!embedding) return;

    const { error } = await supabase.from('embeddings').insert({
      session_id: sessionId,
      dataset_id: datasetId,
      content_type: 'chart_config',
      content,
      metadata: { chartConfigs, userQuery },
      embedding,
    });

    if (error) {
      console.error('storeChartMemory failed:', error.message);
    }
  } catch (error) {
    console.error('storeChartMemory failed:', error.message);
  }
};

export const storeInsight = async (insightText, sessionId, datasetId) => {
  try {
    const content = truncateText(insightText);
    const embedding = await embedText(content);
    if (!embedding) return;

    const { error } = await supabase.from('embeddings').insert({
      session_id: sessionId,
      dataset_id: datasetId,
      content_type: 'insight',
      content,
      metadata: null,
      embedding,
    });

    if (error) {
      console.error('storeInsight failed:', error.message);
    }
  } catch (error) {
    console.error('storeInsight failed:', error.message);
  }
};

export const retrieveRelevantContext = async (userQuery, datasetId, topK = 6) => {
  try {
    if (!userQuery || !datasetId) return '';

    const queryEmbedding = await embedText(userQuery);
    if (!queryEmbedding) return '';

    const { data, error } = await supabase.rpc('match_embeddings', {
      query_embedding: queryEmbedding,
      match_dataset_id: datasetId,
      match_count: topK,
    });

    if (error || !Array.isArray(data) || !data.length) {
      if (error) console.error('retrieveRelevantContext failed:', error.message);
      return '';
    }

    let context = '=== RETRIEVED MEMORY (sorted by relevance) ===\n';
    for (const item of data) {
      const score = Number(item.similarity ?? 0).toFixed(4);
      context += `[${item.content_type}] (similarity: ${score})\n${item.content}\n---\n`;
    }

    return context;
  } catch (error) {
    console.error('retrieveRelevantContext failed:', error.message);
    return '';
  }
};

export const fetchDataPreviewFromChunks = async (datasetId, limit = 20) => {
  const { data, error } = await supabase
    .from('embeddings')
    .select('content, created_at')
    .eq('dataset_id', datasetId)
    .eq('content_type', 'data_chunk')
    .order('created_at', { ascending: true })
    .limit(6);

  if (error) {
    throw new Error(error.message);
  }

  const previewRows = [];
  for (const item of data || []) {
    try {
      const parsed = JSON.parse(item.content);
      if (Array.isArray(parsed)) {
        previewRows.push(...parsed);
      }
    } catch {
      // Non-JSON chunk summaries are expected for some entries.
    }
    if (previewRows.length >= limit) break;
  }

  return previewRows.slice(0, limit);
};

export default {
  embedText,
  storeDataChunks,
  storeChartMemory,
  storeInsight,
  retrieveRelevantContext,
  fetchDataPreviewFromChunks,
};
