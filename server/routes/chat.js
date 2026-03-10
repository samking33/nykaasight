import express from 'express';
import supabase from '../lib/supabaseClient.js';
import dataCache from '../lib/dataCache.js';
import { chat as chatWithLlm } from '../services/llmService.js';
import { computeKPIs, processChartData } from '../services/dataProcessor.js';

const router = express.Router();

const EXECUTIVE_DASHBOARD_PROMPT = `Generate a complete executive marketing dashboard with:
1. Monthly revenue trend over time as an area chart
2. ROI comparison by Channel_Used as a bar chart
3. Top Campaign_Types by total Conversions as a horizontal bar chart
4. Customer segment breakdown by Revenue as a pie chart
5. Language performance showing avg ROI per language as a bar chart`;

const toUserFacingError = (error) => {
  if (!error) return 'Unknown error';
  const message = String(error.message || error);
  if (/Unexpected token|JSON|parse/i.test(message)) {
    return 'AI response was unclear, please rephrase';
  }
  return message;
};

const runChatPipeline = async ({ sessionId, datasetId, message, history = [], currentCharts = [] }) => {
  const rows = dataCache.get(datasetId);
  if (!rows) {
    throw new Error('Dataset not loaded in cache. Please upload or reload dataset first.');
  }

  const { data: dataset, error: datasetError } = await supabase
    .from('datasets')
    .select('id, columns')
    .eq('id', datasetId)
    .single();

  if (datasetError) {
    throw new Error(datasetError.message);
  }

  const schema = Array.isArray(dataset?.columns) ? dataset.columns : [];
  const sampleRows = rows.slice(0, 5);

  const llmResponse = await chatWithLlm({
    message,
    history,
    schema,
    sampleRows,
    datasetId,
    sessionId,
    currentCharts,
  });

  const charts = (llmResponse.charts || []).map((chart) => ({
    ...chart,
    processedData: processChartData(chart, rows),
  }));

  const { error: userInsertError } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'user',
    content: message,
    chart_config: null,
  });

  if (userInsertError) {
    throw new Error(userInsertError.message);
  }

  const { error: assistantInsertError } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role: 'assistant',
    content: llmResponse.reply,
    chart_config: charts,
  });

  if (assistantInsertError) {
    throw new Error(assistantInsertError.message);
  }

  return {
    reply: llmResponse.reply,
    charts,
    suggestedFollowUps: llmResponse.suggestedFollowUps || [],
  };
};

router.post('/api/chat', async (req, res) => {
  try {
    const {
      sessionId,
      datasetId,
      message,
      history = [],
      currentCharts = [],
    } = req.body;

    if (!sessionId || !datasetId || !message) {
      return res.status(400).json({ error: 'sessionId, datasetId, and message are required.' });
    }

    if (!dataCache.get(datasetId)) {
      return res.status(400).json({ error: 'Dataset not loaded in cache.' });
    }

    const result = await runChatPipeline({
      sessionId,
      datasetId,
      message,
      history,
      currentCharts,
    });

    return res.json(result);
  } catch (error) {
    console.error('/api/chat failed:', error);
    return res.status(500).json({ error: toUserFacingError(error) });
  }
});

router.post('/api/chat/executive-dashboard', async (req, res) => {
  try {
    const { datasetId, sessionId } = req.body;

    if (!datasetId || !sessionId) {
      return res.status(400).json({ error: 'datasetId and sessionId are required.' });
    }

    if (!dataCache.get(datasetId)) {
      return res.status(400).json({ error: 'Dataset not loaded in cache.' });
    }

    const result = await runChatPipeline({
      sessionId,
      datasetId,
      message: EXECUTIVE_DASHBOARD_PROMPT,
      history: [],
      currentCharts: [],
    });

    return res.json(result);
  } catch (error) {
    console.error('/api/chat/executive-dashboard failed:', error);
    return res.status(500).json({ error: toUserFacingError(error) });
  }
});

router.post('/api/chat/reprocess', (req, res) => {
  const { datasetId, chartConfigs } = req.body;

  if (!datasetId || !Array.isArray(chartConfigs)) {
    return res.status(400).json({ error: 'datasetId and chartConfigs are required.' });
  }

  const rows = dataCache.get(datasetId);
  if (!rows) {
    return res.status(400).json({ error: 'Dataset not loaded in cache.' });
  }

  const charts = chartConfigs.map((chart) => ({
    ...chart,
    processedData: processChartData(chart, rows),
  }));

  return res.json({ charts });
});

router.get('/api/chat/kpis/:datasetId', (req, res) => {
  const { datasetId } = req.params;
  const rows = dataCache.get(datasetId);

  if (!rows) {
    return res.status(400).json({ error: 'Dataset not loaded in cache.' });
  }

  const kpis = computeKPIs(rows);
  return res.json(kpis);
});

export default router;
