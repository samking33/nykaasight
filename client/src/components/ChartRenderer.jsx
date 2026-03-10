import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const CHART_COLORS = ['#4e73df', '#1cc88a', '#f6c23e', '#e74a3b', '#36b9cc', '#6f42c1', '#fd7e14', '#20c9a6'];

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

const formatYAxis = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (Math.abs(numeric) >= 10000000) return `${(numeric / 10000000).toFixed(1)}Cr`;
  if (Math.abs(numeric) >= 100000) return `${(numeric / 100000).toFixed(1)}L`;
  if (Math.abs(numeric) >= 1000) return `${(numeric / 1000).toFixed(1)}K`;
  return numeric.toString();
};

const formatIndian = (value, keyName = '') => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  if (String(keyName || '').toLowerCase().includes('revenue')) {
    return `₹${numeric.toLocaleString('en-IN')}`;
  }
  return numeric.toLocaleString('en-IN');
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="chart-tooltip">
      <p className="label">{String(label ?? payload[0]?.payload?.name ?? '')}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color || '#e2e8f0' }}>
          {item.name}: {formatIndian(item.value, item.name)}
        </p>
      ))}
    </div>
  );
}

function ChartRenderer({ config, data, xKey, yKey }) {
  const safeData = Array.isArray(data) ? data : [];
  const type = normalizeChartType(config?.type || 'bar');
  const labels = safeData.map((row) => String(row?.[xKey] ?? row?.name ?? ''));
  const shouldTilt = labels.some((item) => item.length > 6);

  const commonXAxis = {
    stroke: '#8892a4',
    tick: { fill: '#8892a4', fontSize: 11 },
    angle: shouldTilt ? -30 : 0,
    textAnchor: shouldTilt ? 'end' : 'middle',
    interval: 0,
    height: shouldTilt ? 60 : 34,
  };

  const commonYAxis = {
    stroke: '#8892a4',
    tick: { fill: '#8892a4', fontSize: 11 },
    width: 60,
    tickFormatter: formatYAxis,
  };

  if (type === 'pie') {
    const pieData = safeData.map((row, index) => {
      const rawValue = Number(row?.value ?? row?.[yKey]);
      const value = Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 0;
      return {
        name: String(row?.name ?? row?.[xKey] ?? `Slice ${index + 1}`),
        value,
      };
    });

    const hasValues = pieData.some((row) => row.value > 0);
    const normalizedPieData = hasValues
      ? pieData
      : pieData.map((row) => ({ ...row, value: 1 }));

    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Pie data={normalizedPieData} dataKey="value" nameKey="name" outerRadius={110} label>
            {normalizedPieData.map((entry, index) => (
              <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={safeData}>
          <CartesianGrid stroke="#2d3348" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} {...commonXAxis} />
          <YAxis {...commonYAxis} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line type="monotone" dataKey={yKey} stroke="#4e73df" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={safeData}>
          <CartesianGrid stroke="#2d3348" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} {...commonXAxis} />
          <YAxis {...commonYAxis} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area type="monotone" dataKey={yKey} stroke="#1cc88a" fill="#1cc88a" fillOpacity={0.15} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart>
          <CartesianGrid stroke="#2d3348" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} {...commonXAxis} />
          <YAxis dataKey={yKey} {...commonYAxis} />
          <Tooltip content={<CustomTooltip />} />
          <Scatter data={safeData} fill="#f6c23e" />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'composed') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={safeData}>
          <CartesianGrid stroke="#2d3348" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} {...commonXAxis} />
          <YAxis {...commonYAxis} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey={yKey} fill="#36b9cc" />
          <Line type="monotone" dataKey="count" stroke="#e74a3b" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={safeData}>
        <CartesianGrid stroke="#2d3348" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} {...commonXAxis} />
        <YAxis {...commonYAxis} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey={yKey} fill="#4e73df" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ChartRenderer;
