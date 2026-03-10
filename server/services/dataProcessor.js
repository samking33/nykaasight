import { parse } from 'csv-parse/sync';

const decodeHtmlEntities = (text) => String(text)
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, '\'')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const looksDateLike = (raw) => (
  /^\d{4}-\d{1,2}-\d{1,2}(?:[T\s].*)?$/.test(raw)
  || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(raw)
  || /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$/.test(raw)
  || /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$/.test(raw)
);

const parseFlexibleDate = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  if (looksDateLike(raw)) {
    const nativeParsed = Date.parse(raw);
    if (!Number.isNaN(nativeParsed)) return nativeParsed;
  }

  const dmyMatch = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const iso = `${yyyy}-${mm}-${dd}T00:00:00Z`;
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
};

const toDate = (value) => {
  const parsed = parseFlexibleDate(value);
  return parsed === null ? null : parsed;
};

const isNumeric = (value) => {
  if (value === null || value === undefined || value === '') return false;
  const parsed = Number(value);
  return Number.isFinite(parsed);
};

const inferColumnType = (values) => {
  const filtered = values
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .filter((value) => value.length > 0);

  if (filtered.length === 0) return 'text';

  const allNumeric = filtered.every(isNumeric);
  if (allNumeric) return 'number';

  const allDate = filtered.every((value) => toDate(value) !== null);
  if (allDate) return 'date';

  const uniqueCount = new Set(filtered).size;
  if (uniqueCount < 15) return 'categorical';

  return 'text';
};

export const parseCsvBuffer = (buffer) => {
  const parseCsvText = (csvText) => parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const extractFromPreBlock = (text) => {
    const preStart = text.indexOf('<pre');
    if (preStart === -1) return null;

    const preTagEnd = text.indexOf('>', preStart);
    if (preTagEnd === -1) return null;

    const preEnd = text.indexOf('</pre>', preTagEnd + 1);
    if (preEnd === -1) return null;

    const preContent = text.slice(preTagEnd + 1, preEnd).replace(/<[^>]+>/g, '');
    const decoded = decodeHtmlEntities(preContent).replace(/\0/g, '').trim();
    return decoded || null;
  };

  const utf8Text = buffer.toString('utf8').replace(/\0/g, '');

  try {
    return parseCsvText(utf8Text);
  } catch (firstError) {
    const extractedUtf8 = extractFromPreBlock(utf8Text);
    if (extractedUtf8) {
      try {
        return parseCsvText(extractedUtf8);
      } catch {
        // Fall through to latin1 extraction attempt.
      }
    }

    const latin1Text = buffer.toString('latin1').replace(/\0/g, '');
    const extractedLatin1 = extractFromPreBlock(latin1Text);
    if (extractedLatin1) {
      return parseCsvText(extractedLatin1);
    }

    throw firstError;
  }
};

export const inferColumns = (rows) => {
  if (!rows.length) return [];

  const headers = Object.keys(rows[0]);

  return headers.map((name) => {
    const values = rows.map((row) => row[name]);
    return {
      name,
      type: inferColumnType(values),
    };
  });
};

export const previewRows = (rows, limit = 20) => rows.slice(0, limit);

const parseNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const equalsCI = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

const matchesFilter = (rowValue, rule) => {
  if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
    if (Array.isArray(rule.in)) {
      return rule.in.some((candidate) => equalsCI(rowValue, candidate));
    }

    const numeric = parseNumber(rowValue);
    if (numeric === null) return false;
    if (rule.gte !== undefined && numeric < Number(rule.gte)) return false;
    if (rule.lte !== undefined && numeric > Number(rule.lte)) return false;
    return true;
  }

  return equalsCI(rowValue, rule);
};

const aggregateValues = (values, aggregation) => {
  if (aggregation === 'count') return values.length;

  const numeric = values.map(parseNumber).filter((value) => value !== null);
  if (!numeric.length) return 0;

  if (aggregation === 'sum') return numeric.reduce((sum, value) => sum + value, 0);
  if (aggregation === 'avg') return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
  if (aggregation === 'max') return Math.max(...numeric);
  if (aggregation === 'min') return Math.min(...numeric);
  return numeric.reduce((sum, value) => sum + value, 0);
};

const normalizeChartType = (type) => {
  const raw = String(type || 'bar').trim().toLowerCase();
  if (raw.includes('pie') || raw === 'donut' || raw === 'doughnut') return 'pie';
  if (raw.includes('scatter')) return 'scatter';
  if (raw.includes('composed') || raw.includes('combo')) return 'composed';
  if (raw.includes('area')) return 'area';
  if (raw.includes('line')) return 'line';
  if (raw.includes('bar') || raw.includes('column')) return 'bar';
  return 'bar';
};

const pickDefaultCategoryKey = (rows) => Object.keys(rows?.[0] || {})[0] || 'category';

const pickDefaultMetricKey = (rows) => {
  const sample = rows?.[0] || {};
  const numericCandidate = Object.keys(sample).find((key) => rows.some((row) => parseNumber(row[key]) !== null));
  return numericCandidate || Object.keys(sample)[1] || Object.keys(sample)[0] || 'value';
};

export const processChartData = (chartConfig, allRows) => {
  const {
    type = 'bar',
    filters = {},
    categoryKey,
    dataKey,
    aggregation = 'sum',
    sortBy = 'value',
    sortOrder = 'desc',
    limit = 10,
  } = chartConfig || {};

  const normalizedType = normalizeChartType(type);
  const normalizedAggregation = String(aggregation || 'sum').toLowerCase();
  const normalizedSortBy = String(sortBy || 'value').toLowerCase();
  const normalizedSortOrder = String(sortOrder || 'desc').toLowerCase();
  const safeCategoryKey = categoryKey || pickDefaultCategoryKey(allRows);
  const safeDataKey = dataKey || pickDefaultMetricKey(allRows);

  if (!Array.isArray(allRows)) {
    return {
      data: [],
      xKey: safeCategoryKey || 'category',
      yKey: safeDataKey || 'value',
      chartType: normalizedType,
    };
  }

  const filtered = allRows.filter((row) => Object.entries(filters).every(([key, rule]) => matchesFilter(row[key], rule)));
  const groupMap = new Map();

  for (const row of filtered) {
    const label = String(row[safeCategoryKey] ?? 'Unknown');
    if (!groupMap.has(label)) groupMap.set(label, []);
    groupMap.get(label).push(row);
  }

  const grouped = [...groupMap.entries()].map(([label, rows]) => {
    const values = rows.map((row) => row[safeDataKey]);
    let value = aggregateValues(values, normalizedAggregation);

    // Pie charts should stay informative even when the chosen data key is non-numeric.
    if (normalizedType === 'pie' && (value === 0 || Number.isNaN(value))) {
      value = rows.length;
    }

    return {
      label,
      value,
      count: rows.length,
    };
  });

  grouped.sort((a, b) => {
    const direction = normalizedSortOrder === 'asc' ? 1 : -1;
    if (normalizedSortBy === 'label') return direction * a.label.localeCompare(b.label);
    return direction * (a.value - b.value);
  });

  const limited = grouped.slice(0, Number(limit) || 10);

  if (normalizedType === 'pie') {
    return {
      data: limited.map((item) => ({ name: item.label, value: item.value })),
      xKey: 'name',
      yKey: 'value',
      chartType: normalizedType,
    };
  }

  if (normalizedType === 'scatter') {
    return {
      data: limited.map((item, index) => {
        const maybeX = parseNumber(item.label);
        return { x: maybeX ?? index + 1, y: item.value, name: item.label };
      }),
      xKey: 'x',
      yKey: 'y',
      chartType: normalizedType,
    };
  }

  return {
    data: limited.map((item) => ({
      [safeCategoryKey]: item.label,
      [safeDataKey]: item.value,
      count: item.count,
    })),
    xKey: safeCategoryKey,
    yKey: safeDataKey,
    chartType: normalizedType,
  };
};

const readMetric = (row, metricName) => {
  const normalizeMetricKey = (value) => String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const target = normalizeMetricKey(metricName);
  const key = Object.keys(row).find((k) => normalizeMetricKey(k) === target);
  return key ? row[key] : null;
};

const sumMetric = (rows, metricName) => rows
  .map((row) => parseNumber(readMetric(row, metricName)))
  .filter((value) => value !== null)
  .reduce((sum, value) => sum + value, 0);

const avgMetric = (rows, metricName) => {
  const values = rows
    .map((row) => parseNumber(readMetric(row, metricName)))
    .filter((value) => value !== null);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const computeKPIs = (rows, _schema = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const channelRevenue = new Map();

  for (const row of safeRows) {
    const channel = String(readMetric(row, 'Channel_Used') ?? 'Unknown');
    const revenue = parseNumber(readMetric(row, 'Revenue')) || 0;
    channelRevenue.set(channel, (channelRevenue.get(channel) || 0) + revenue);
  }

  const bestChannel = [...channelRevenue.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    totalRevenue: sumMetric(safeRows, 'Revenue'),
    avgROI: avgMetric(safeRows, 'ROI'),
    totalConversions: sumMetric(safeRows, 'Conversions'),
    totalImpressions: sumMetric(safeRows, 'Impressions'),
    bestChannel,
    totalCampaigns: safeRows.length,
    avgAcquisitionCost: avgMetric(safeRows, 'Acquisition_Cost'),
  };
};

export default {
  parseCsvBuffer,
  inferColumns,
  previewRows,
  processChartData,
  computeKPIs,
};
