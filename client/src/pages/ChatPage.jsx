import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  Legend,
} from 'recharts';
import api from '../api';

const chartColors = ['#4e73df', '#1cc88a', '#f6c23e', '#e74a3b', '#36b9cc', '#6f42c1'];

function ChatPage({ setActiveDatasetId }) {
  const { datasetId } = useParams();
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [charts, setCharts] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (datasetId) setActiveDatasetId(datasetId);
  }, [datasetId, setActiveDatasetId]);

  useEffect(() => {
    const bootstrap = async () => {
      if (!datasetId) return;
      setError('');

      try {
        const [{ data: session }, { data: kpiData }] = await Promise.all([
          api.post('/api/sessions', { dataset_id: datasetId, title: 'NykaaSight Session' }),
          api.get(`/api/chat/kpis/${datasetId}`),
        ]);

        setSessionId(session.session_id);
        setKpis(kpiData);
      } catch (bootstrapError) {
        setError(bootstrapError.response?.data?.error || 'Failed to initialize chat workspace.');
      }
    };

    bootstrap();
  }, [datasetId]);

  const sendMessage = async (customMessage = null) => {
    if (!sessionId || !datasetId) return;

    const payloadMessage = customMessage || message.trim();
    if (!payloadMessage) return;

    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/api/chat', {
        sessionId,
        datasetId,
        message: payloadMessage,
        history,
        currentCharts: charts,
      });

      setHistory((prev) => [
        ...prev,
        { role: 'user', content: payloadMessage },
        { role: 'assistant', content: data.reply },
      ]);
      setCharts(data.charts || []);
      setMessage('');
    } catch (sendError) {
      setError(sendError.response?.data?.error || 'Unable to complete AI request.');
    } finally {
      setLoading(false);
    }
  };

  const generateExecutiveDashboard = async () => {
    if (!sessionId || !datasetId) return;

    setLoading(true);
    setError('');

    try {
      const { data } = await api.post('/api/chat/executive-dashboard', { sessionId, datasetId });
      setHistory((prev) => [
        ...prev,
        { role: 'user', content: 'Generate executive dashboard' },
        { role: 'assistant', content: data.reply },
      ]);
      setCharts(data.charts || []);
    } catch (execError) {
      setError(execError.response?.data?.error || 'Executive dashboard generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const kpiCards = useMemo(() => {
    if (!kpis) return [];
    return [
      { label: 'Total Revenue', value: Number(kpis.totalRevenue || 0).toLocaleString() },
      { label: 'Avg ROI', value: Number(kpis.avgROI || 0).toFixed(2) },
      { label: 'Conversions', value: Number(kpis.totalConversions || 0).toLocaleString() },
      { label: 'Impressions', value: Number(kpis.totalImpressions || 0).toLocaleString() },
      { label: 'Best Channel', value: kpis.bestChannel || 'N/A' },
      { label: 'Campaigns', value: Number(kpis.totalCampaigns || 0).toLocaleString() },
    ];
  }, [kpis]);

  return (
    <div className="chat-page">
      {kpiCards.length > 0 && (
        <section className="kpi-grid-wide">
          {kpiCards.map((item) => (
            <article key={item.label} className="card kpi-card">
              <p>{item.label}</p>
              <h3>{item.value}</h3>
            </article>
          ))}
        </section>
      )}

      <section className="card chat-control-card">
        <div className="chat-actions-row">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask NykaaSight: Which channel drives highest ROI in high-conversion campaigns?"
          />
          <div className="chat-buttons">
            <button type="button" className="btn btn-primary" disabled={loading} onClick={() => sendMessage()}>
              {loading ? 'Thinking...' : 'Ask AI'}
            </button>
            <button type="button" className="btn btn-outline" disabled={loading} onClick={generateExecutiveDashboard}>
              Executive Dashboard
            </button>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="chart-grid">
        {charts.map((chart, index) => (
          <article className="card chart-card" key={chart.id || `${chart.title}-${index}`}>
            <h3>{chart.title || `Chart ${index + 1}`}</h3>
            <p className="chart-description">{chart.description || 'AI generated insight visualization.'}</p>
            <div className="chart-wrap">
              <ChartRenderer chart={chart} index={index} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ChartRenderer({ chart, index }) {
  const processed = chart.processedData || { data: [], xKey: 'x', yKey: 'y' };
  const data = Array.isArray(processed.data) ? processed.data : [];
  const xKey = processed.xKey;
  const yKey = processed.yKey;
  const type = chart.type || processed.chartType || 'bar';
  const color = chart.color || chartColors[index % chartColors.length];

  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={95}>
            {data.map((entry, itemIndex) => (
              <Cell key={`${entry.name}-${itemIndex}`} fill={chartColors[itemIndex % chartColors.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
          <XAxis dataKey={xKey} stroke="#8892a4" />
          <YAxis stroke="#8892a4" />
          <Tooltip />
          <Area type="monotone" dataKey={yKey} stroke={color} fill={color} fillOpacity={0.3} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'area') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
          <XAxis dataKey={xKey} stroke="#8892a4" />
          <YAxis stroke="#8892a4" />
          <Tooltip />
          <Area type="monotone" dataKey={yKey} stroke={color} fill={color} fillOpacity={0.4} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
          <XAxis dataKey={xKey} stroke="#8892a4" />
          <YAxis dataKey={yKey} stroke="#8892a4" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={color} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'composed') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
          <XAxis dataKey={xKey} stroke="#8892a4" />
          <YAxis stroke="#8892a4" />
          <Tooltip />
          <Bar dataKey={yKey} fill={color} />
          <Line dataKey="count" stroke="#36b9cc" />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout={chart.layout === 'horizontal' ? 'vertical' : 'horizontal'}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2d3348" />
        <XAxis dataKey={chart.layout === 'horizontal' ? yKey : xKey} type={chart.layout === 'horizontal' ? 'number' : 'category'} stroke="#8892a4" />
        <YAxis dataKey={chart.layout === 'horizontal' ? xKey : yKey} type={chart.layout === 'horizontal' ? 'category' : 'number'} stroke="#8892a4" />
        <Tooltip />
        <Bar dataKey={yKey} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ChatPage;
