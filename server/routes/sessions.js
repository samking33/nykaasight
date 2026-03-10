import express from 'express';
import supabase from '../lib/supabaseClient.js';

const router = express.Router();

router.post('/api/sessions', async (req, res) => {
  const dataset_id = req.body.dataset_id || req.body.datasetId;
  const title = req.body.title;

  if (!dataset_id) {
    return res.status(400).json({ error: 'dataset_id is required.' });
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      dataset_id,
      title: title || 'New Session',
    })
    .select('id, dataset_id, title, created_at')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({ session_id: data.id, session: data });
});

router.get('/api/sessions', async (_, res) => {
  const { data: sessions, error: sessionsError } = await supabase
    .from('chat_sessions')
    .select('id, dataset_id, title, created_at')
    .order('created_at', { ascending: false });

  if (sessionsError) {
    return res.status(500).json({ error: sessionsError.message });
  }

  const sessionIds = (sessions || []).map((item) => item.id);
  const datasetIds = [...new Set((sessions || []).map((item) => item.dataset_id))];

  const [{ data: datasets, error: datasetsError }, { data: messages, error: messagesError }] = await Promise.all([
    datasetIds.length
      ? supabase.from('datasets').select('id, name').in('id', datasetIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? supabase.from('chat_messages').select('session_id, role, content, created_at').in('session_id', sessionIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (datasetsError) {
    return res.status(500).json({ error: datasetsError.message });
  }

  if (messagesError) {
    return res.status(500).json({ error: messagesError.message });
  }

  const datasetNameMap = new Map((datasets || []).map((item) => [item.id, item.name]));
  const messagesBySession = new Map();

  for (const message of messages || []) {
    if (!messagesBySession.has(message.session_id)) {
      messagesBySession.set(message.session_id, []);
    }
    messagesBySession.get(message.session_id).push(message);
  }

  const response = (sessions || []).map((session) => {
    const sessionMessages = messagesBySession.get(session.id) || [];
    const firstUserMessage = sessionMessages.find((item) => item.role === 'user')?.content || '';

    return {
      session_id: session.id,
      dataset_id: session.dataset_id,
      dataset_name: datasetNameMap.get(session.dataset_id) || 'Unknown Dataset',
      title: session.title,
      created_at: session.created_at,
      message_count: sessionMessages.length,
      first_user_message: firstUserMessage,
    };
  });

  return res.json(response);
});

router.get('/api/sessions/:sessionId/messages', async (req, res) => {
  const { sessionId } = req.params;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data || []);
});

router.get('/api/sessions/:datasetId', async (req, res) => {
  const { datasetId } = req.params;

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data || []);
});

router.post('/api/snapshots', async (req, res) => {
  const session_id = req.body.session_id || req.body.sessionId;
  const dataset_id = req.body.dataset_id || req.body.datasetId;
  const title = req.body.title;
  const chart_configs = req.body.chart_configs || req.body.chartConfigs;

  if (!session_id || !dataset_id || !title || !chart_configs) {
    return res.status(400).json({
      error: 'session_id, dataset_id, title and chart_configs are required.',
    });
  }

  const { data, error } = await supabase
    .from('dashboard_snapshots')
    .insert({
      session_id,
      dataset_id,
      title,
      chart_configs,
    })
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});

router.get('/api/snapshots', async (req, res) => {
  const { datasetId, sessionId } = req.query;

  let query = supabase
    .from('dashboard_snapshots')
    .select('*')
    .order('created_at', { ascending: false });

  if (datasetId) {
    query = query.eq('dataset_id', datasetId);
  }

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data || []);
});

router.get('/api/snapshots/item/:snapshotId', async (req, res) => {
  const { snapshotId } = req.params;

  const { data, error } = await supabase
    .from('dashboard_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data);
});

router.get('/api/snapshots/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  const { data, error } = await supabase
    .from('dashboard_snapshots')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json(data || []);
});

export default router;
