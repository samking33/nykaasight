import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retrieveRelevantContext, storeChartMemory, storeInsight } from './vectorService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const client = process.env.NVIDIA_NIM_API_KEY
  ? new OpenAI({
      baseURL: process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_NIM_API_KEY,
    })
  : null;

const modelPriority = [
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.3-70b-instruct',
  'mistralai/mistral-large-3-675b-instruct-2512',
  'mistralai/mixtral-8x22b-instruct-v0.1',
  'nvidia/llama-3.1-nemotron-70b-instruct',
];

let selectedModel = process.env.NVIDIA_NIM_MODEL || null;
let modelInitPromise = null;
let availableModelIds = [];

const chooseBestModel = (availableModels) => {
  for (const preferred of modelPriority) {
    if (availableModels.includes(preferred)) return preferred;
  }
  return availableModels[0] || null;
};

const initializeModelSelection = async () => {
  if (!client) return null;
  if (selectedModel) {
    console.log(`NykaaSight model selected: ${selectedModel}`);
    return selectedModel;
  }

  try {
    const modelsResponse = await client.models.list();
    availableModelIds = (modelsResponse?.data || []).map((model) => model.id).filter(Boolean);
    selectedModel = chooseBestModel(availableModelIds);
    console.log(`NykaaSight model selected: ${selectedModel || 'none found'}`);
    return selectedModel;
  } catch (error) {
    console.error('Failed to fetch Nvidia NIM models:', error.message);
    return null;
  }
};

modelInitPromise = initializeModelSelection();

export const buildSystemPrompt = (schema, sampleRows, vectorContext) => `You are NykaaSight BI, an elite data analyst AI for Nykaa's marketing team.

DATASET SCHEMA:
${JSON.stringify(schema, null, 2)}

SAMPLE DATA (first 5 rows):
${JSON.stringify(sampleRows, null, 2)}

${vectorContext ? `RETRIEVED MEMORY & CONTEXT:\n${vectorContext}` : ''}

INSTRUCTIONS:
You MUST respond ONLY with a valid JSON object. No markdown, no explanation outside JSON.
Response format:
{
  'reply': 'Concise insight in 2-3 sentences. Mention specific numbers from the data.',
  'charts': [
    {
      'id': 'unique_snake_case_id',
      'type': 'bar|line|area|pie|scatter|composed',
      'title': 'Descriptive Chart Title',
      'description': 'One sentence on what this reveals',
      'dataKey': 'exact_column_name_for_metric',
      'categoryKey': 'exact_column_name_for_grouping',
      'aggregation': 'sum|avg|count|max|min',
      'filters': {},
      'sortBy': 'value',
      'sortOrder': 'desc',
      'limit': 10,
      'color': '#hexcolor',
      'showLabels': true
    }
  ],
  'suggestedFollowUps': ['follow up question 1', 'follow up question 2']
}

CHART TYPE RULES:
- Time series data → always 'line' or 'area'
- Comparing categories (< 6 items) → 'bar'
- Part of whole (%) → 'pie'
- Two metrics correlated → 'scatter'
- Multiple metrics over time → 'composed'
- Always generate 2-4 charts per response for a rich dashboard
- Use distinct colors from: #4e73df, #1cc88a, #f6c23e, #e74a3b, #36b9cc, #6f42c1

FILTER FORMAT:
filters: { 'ColumnName': 'value' } for equality
filters: { 'ColumnName': { 'gte': 100, 'lte': 500 } } for range
filters: { 'ColumnName': { 'in': ['val1','val2'] } } for multiple values`;

const stripMarkdownFences = (text) => {
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```[a-zA-Z]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
  }
  return trimmed;
};

const normalizeAssistantContent = (content) => {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('\n');
  }

  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }

  return '';
};

const parseAssistantJson = (rawContent) => {
  const normalized = normalizeAssistantContent(rawContent);
  const cleaned = stripMarkdownFences(normalized);
  const attempts = [cleaned];

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  attempts.push(cleaned.replace(/,\s*([}\]])/g, '$1'));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next candidate.
    }
  }

  const preview = cleaned.slice(0, 500).replace(/\s+/g, ' ');
  throw new Error(`Unable to parse assistant JSON response. Preview: ${preview}`);
};

const normalizeHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-6)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content ?? item?.message ?? '').trim(),
    }))
    .filter((item) => item.content.length > 0);
};

const shouldFallbackModel = (error) => {
  if (!error) return false;
  const status = Number(error.status || error.code || 0);
  const message = String(error.message || '').toLowerCase();
  return status === 404 || /model|not found|unsupported/.test(message);
};

const responseFormatNotSupported = (error) => {
  if (!error) return false;
  const status = Number(error.status || error.code || 0);
  const message = String(error.message || '').toLowerCase();
  return status === 400 && /response_format|json_object|unsupported|invalid/.test(message);
};

const fallbackModels = (currentModel) => {
  const ordered = [
    ...modelPriority,
    ...availableModelIds,
  ].filter(Boolean);

  const deduped = [...new Set(ordered)];
  return deduped.filter((model) => model !== currentModel);
};

const createCompletionWithFallback = async (messages) => {
  const attempt = async (model) => {
    const basePayload = {
      model,
      temperature: 0.2,
      max_tokens: 2000,
      messages,
    };

    try {
      return await client.chat.completions.create({
        ...basePayload,
        response_format: { type: 'json_object' },
      });
    } catch (error) {
      if (!responseFormatNotSupported(error)) {
        throw error;
      }

      // Some fallback models may not support response_format; try plain completion.
      return client.chat.completions.create(basePayload);
    }
  };

  let activeModel = selectedModel || modelPriority[1];

  try {
    const completion = await attempt(activeModel);
    return { completion, model: activeModel };
  } catch (error) {
    if (!shouldFallbackModel(error)) {
      throw error;
    }

    let lastError = error;
    for (const candidate of fallbackModels(activeModel)) {
      try {
        const completion = await attempt(candidate);
        selectedModel = candidate;
        console.warn(`Falling back LLM model to ${candidate} after ${activeModel} failed.`);
        return { completion, model: candidate };
      } catch (candidateError) {
        lastError = candidateError;
        if (!shouldFallbackModel(candidateError)) {
          throw candidateError;
        }
      }
    }

    throw lastError;
  }
};

export const chat = async ({
  message,
  history = [],
  schema = [],
  sampleRows = [],
  datasetId,
  sessionId,
  currentCharts = [],
}) => {
  if (!client) {
    throw new Error('NVIDIA_NIM_API_KEY is missing.');
  }
  if (!message) {
    throw new Error('message is required.');
  }

  if (modelInitPromise) await modelInitPromise;
  if (!selectedModel) {
    selectedModel = modelPriority[1];
  }

  const vectorContext = await retrieveRelevantContext(message, datasetId, 6);
  let systemPrompt = buildSystemPrompt(schema, sampleRows.slice(0, 5), vectorContext);

  if (Array.isArray(currentCharts) && currentCharts.length) {
    systemPrompt += `\n\nCURRENT DASHBOARD STATE: ${JSON.stringify(currentCharts)}\nIf user is modifying/filtering, return same IDs with updated configs.\nIf user says remove/delete, omit that chart from response.`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...normalizeHistory(history),
    { role: 'user', content: message },
  ];

  const { completion, model } = await createCompletionWithFallback(messages);
  selectedModel = model;

  const rawContent = completion?.choices?.[0]?.message?.content || '{}';
  const parsed = parseAssistantJson(rawContent);

  const response = {
    reply: parsed.reply || '',
    charts: Array.isArray(parsed.charts) ? parsed.charts : [],
    suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps : [],
    model: selectedModel,
  };

  Promise.resolve().then(async () => {
    try {
      await storeChartMemory(response.charts, sessionId, datasetId, message);
      await storeInsight(response.reply, sessionId, datasetId);
    } catch (error) {
      console.error('Background memory store failed:', error.message);
    }
  });

  return response;
};

// Backward-compatible wrapper for existing route usage.
export const askBiAssistant = async ({ question, datasetContext }) => {
  const result = await chat({
    message: question,
    history: [],
    schema: datasetContext?.schema || [],
    sampleRows: datasetContext?.previewRows || [],
    datasetId: datasetContext?.datasetId,
    sessionId: null,
    currentCharts: [],
  });

  return {
    model: result.model,
    answer: result.reply,
    chartConfig: result.charts[0] || null,
    followUpQuestions: result.suggestedFollowUps,
  };
};

export default {
  buildSystemPrompt,
  chat,
  askBiAssistant,
};
