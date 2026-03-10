import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Award,
  BarChart3,
  Globe2,
  MessageCircle,
  LineChart,
  MessageSquarePlus,
  PieChart,
  Send,
  Sparkles,
  Wand2,
  Save,
  Printer,
  IndianRupee,
  Percent,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import api from '../api';
import ChartCard from '../components/ChartCard';
import { useToast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/errorUtils';

const PROMPTS = [
  { label: 'Monthly revenue trend', icon: TrendingUp, mode: 'message' },
  { label: 'ROI by channel', icon: BarChart3, mode: 'message' },
  { label: 'Top campaigns', icon: Award, mode: 'message' },
  { label: 'Audience breakdown', icon: Users, mode: 'message' },
  { label: 'Language performance', icon: Globe2, mode: 'message' },
  { label: 'Executive dashboard', icon: Zap, mode: 'executive' },
];

const typeCycle = ['bar', 'line', 'pie', 'area'];
const typeIconMap = {
  bar: BarChart3,
  line: LineChart,
  pie: PieChart,
  area: LineChart,
  scatter: LineChart,
  composed: BarChart3,
};

const isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const normalizeChart = (chart, index = 0) => {
  const config = chart?.config ? chart.config : chart;
  return {
    id: config?.id || chart?.id || `chart_${Date.now()}_${index}`,
    config,
    processedData: chart?.processedData || config?.processedData || { data: [] },
    animationState: chart?.animationState || '',
  };
};

function ChatDashboard({ setActiveDatasetId }) {
  const { datasetId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [charts, setCharts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [fullScreenChartId, setFullScreenChartId] = useState(null);
  const [showSnapshotInput, setShowSnapshotInput] = useState(false);
  const [snapshotTitle, setSnapshotTitle] = useState('');

  useEffect(() => {
    if (datasetId) setActiveDatasetId(datasetId);
  }, [datasetId, setActiveDatasetId]);

  useEffect(() => {
    const init = async () => {
      if (!datasetId) return;

      const requestedSessionId = searchParams.get('sessionId');
      const snapshotId = searchParams.get('snapshotId');

      try {
        const kpiPromise = api.get(`/api/chat/kpis/${datasetId}`);
        const sessionPromise = requestedSessionId
          ? Promise.resolve({ data: { session_id: requestedSessionId } })
          : api.post('/api/sessions', { dataset_id: datasetId, title: 'New Chat' });

        const [{ data: sessionData }, { data: kpiData }] = await Promise.all([sessionPromise, kpiPromise]);

        const activeSessionId = sessionData.session_id;
        setSessionId(activeSessionId);
        setKpis(kpiData);

        if (requestedSessionId) {
          const { data: restored } = await api.get(`/api/sessions/${activeSessionId}/messages`);
          const rebuiltMessages = [];
          let latestCharts = [];

          for (const item of restored || []) {
            rebuiltMessages.push({
              id: `${item.id}`,
              role: item.role,
              text: item.content,
              charts: item.role === 'assistant' ? (item.chart_config || []) : [],
              suggestedFollowUps: [],
            });

            if (item.role === 'assistant' && Array.isArray(item.chart_config)) {
              latestCharts = item.chart_config;
            }
          }

          setMessages(rebuiltMessages);
          setCharts(latestCharts.map((item, index) => normalizeChart(item, index)));
        }

        if (snapshotId) {
          const { data: snapshot } = await api.get(`/api/snapshots/item/${snapshotId}`);
          const rawConfigs = Array.isArray(snapshot?.chart_configs) ? snapshot.chart_configs : [];
          const chartConfigs = rawConfigs.map((item) => (item?.config ? item.config : item));

          if (chartConfigs.length) {
            const { data: processed } = await api.post('/api/chat/reprocess', {
              datasetId,
              chartConfigs,
            });

            setCharts((processed.charts || []).map((item, index) => normalizeChart(item, index)));
            addToast({ type: 'success', message: `Loaded snapshot: ${snapshot.title}` });
          }
        }
      } catch (error) {
        addToast({ type: 'warning', message: getApiErrorMessage(error, 'Dataset not loaded') });
        navigate('/upload', { replace: true });
      }
    };

    init();
  }, [datasetId, searchParams, navigate, addToast]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const historyPayload = useMemo(
    () => messages
      .filter((item) => !item.isLoading)
      .slice(-6)
      .map((item) => ({ role: item.role, content: item.text })),
    [messages]
  );

  const handleInputResize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 24 * 4 + 20;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  const mergeCharts = (incomingCharts, userText) => {
    const next = incomingCharts.map((item, index) => ({
      ...normalizeChart(item, index),
      animationState: 'enter',
    }));

    setCharts((prev) => {
      const prevMap = new Map(prev.map((chart) => [chart.id, chart]));
      const nextMap = new Map(next.map((chart) => [chart.id, chart]));
      const merged = [];

      for (const item of next) {
        const existing = prevMap.get(item.id);
        if (!existing) {
          merged.push(item);
          continue;
        }

        const changed = !isEqual(existing.config, item.config);
        merged.push({
          ...item,
          animationState: changed ? 'update' : '',
        });
      }

      const removeIntent = /\b(remove|delete)\b/i.test(userText);
      if (!removeIntent) {
        for (const oldItem of prev) {
          if (!nextMap.has(oldItem.id)) {
            merged.push({ ...oldItem, animationState: '' });
          }
        }
      }

      if (merged.length > 0) {
        const noData = merged.every((item) => !Array.isArray(item.processedData?.data) || item.processedData.data.length === 0);
        if (noData) {
          addToast({ type: 'warning', message: 'No data matches your current filters' });
        }
      }

      return merged;
    });
  };

  const sendMessage = async (preset) => {
    const messageText = (preset || inputValue).trim();
    if (!messageText || !sessionId || !datasetId || isLoading) return;

    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: messageText,
    };

    setMessages((prev) => [...prev, userMessage, { id: 'loading', role: 'assistant', isLoading: true, text: '' }]);
    setIsLoading(true);
    setInputValue('');

    try {
      const { data } = await api.post('/api/chat', {
        sessionId,
        datasetId,
        message: messageText,
        history: historyPayload,
        currentCharts: charts.map((item) => item.config),
      });

      const aiMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        text: data.reply,
        charts: data.charts || [],
        suggestedFollowUps: data.suggestedFollowUps || [],
      };

      setMessages((prev) => [...prev.filter((item) => item.id !== 'loading'), aiMessage]);
      mergeCharts(data.charts || [], messageText);
    } catch (error) {
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== 'loading'),
        { id: `err_${Date.now()}`, role: 'assistant', text: getApiErrorMessage(error, 'Unable to generate response') },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const runExecutiveDashboard = async () => {
    if (!sessionId || !datasetId || isLoading) return;

    setMessages((prev) => [...prev, { id: 'loading', role: 'assistant', isLoading: true, text: '' }]);
    setIsLoading(true);

    try {
      const { data } = await api.post('/api/chat/executive-dashboard', { datasetId, sessionId });
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== 'loading'),
        {
          id: `ai_${Date.now()}`,
          role: 'assistant',
          text: data.reply,
          charts: data.charts || [],
          suggestedFollowUps: data.suggestedFollowUps || [],
        },
      ]);
      mergeCharts(data.charts || [], 'executive dashboard');
    } catch (error) {
      setMessages((prev) => [
        ...prev.filter((item) => item.id !== 'loading'),
        { id: `err_${Date.now()}`, role: 'assistant', text: getApiErrorMessage(error, 'Failed to generate executive dashboard') },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSnapshot = async () => {
    if (!sessionId || !datasetId || charts.length === 0) return;

    const title = snapshotTitle.trim();
    if (!title) {
      addToast({ type: 'warning', message: 'Please enter a snapshot title' });
      return;
    }

    try {
      await api.post('/api/snapshots', {
        sessionId,
        datasetId,
        title,
        chartConfigs: charts,
      });
      window.dispatchEvent(new Event('snapshot-saved'));
      setShowSnapshotInput(false);
      setSnapshotTitle('');
      addToast({ type: 'success', message: 'Dashboard saved!' });
    } catch (error) {
      addToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to save snapshot') });
    }
  };

  const printDashboard = () => {
    const container = document.querySelector('.charts-grid-wide');
    if (!container) return;

    const printWindow = window.open('', '_blank', 'width=1280,height=900');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>NykaaSight Dashboard Export</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: white; color: black; padding: 20px; }
            .card { border: 1px solid #d3d7e2; border-radius: 10px; padding: 14px; margin-bottom: 16px; }
            .chart-muted, .chart-footer { color: #444; }
            .chart-tools { display: none !important; }
          </style>
        </head>
        <body>${container.innerHTML}</body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const switchChartType = (chartId) => {
    setCharts((prev) => prev.map((item) => {
      if (item.id !== chartId) return item;
      const index = typeCycle.indexOf(item.config.type || 'bar');
      const nextType = typeCycle[(index + 1) % typeCycle.length];
      return { ...item, config: { ...item.config, type: nextType }, animationState: 'update' };
    }));
  };

  const removeChart = (chartId) => {
    setCharts((prev) => prev.filter((item) => item.id !== chartId));
  };

  const startNewChat = async () => {
    if (!datasetId) return;

    try {
      const { data } = await api.post('/api/sessions', { dataset_id: datasetId, title: 'New Chat' });
      setSessionId(data.session_id);
      setMessages([]);
      setCharts([]);
      setShowSnapshotInput(false);
      setSnapshotTitle('');
      addToast({ type: 'info', message: 'Started a new chat session' });
    } catch (error) {
      addToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to create new session') });
    }
  };

  const getKpiValue = (key) => kpis?.[key] ?? 0;

  return (
    <div className="chat-dashboard-layout">
      <section className="chat-panel card">
        <div className="chat-panel-header">
          <h2><MessageCircle size={16} /> Ask Your Data</h2>
          <button type="button" className="icon-btn" onClick={startNewChat}>
            <MessageSquarePlus size={16} />
          </button>
        </div>

        <div className="messages-scroll">
          {messages.length === 0 && !isLoading && (
            <div className="prompt-grid">
              {PROMPTS.map((prompt) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={prompt.label}
                    type="button"
                    className="prompt-chip"
                    onClick={() => (prompt.mode === 'executive' ? runExecutiveDashboard() : sendMessage(prompt.label))}
                  >
                    <Icon size={14} />
                    <span>{prompt.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`msg-row ${message.role}`}>
              <div className={`msg-bubble ${message.role}`}>
                {message.isLoading ? (
                  <div className="typing-dots"><span /><span /><span /></div>
                ) : (
                  <>
                    <p>{message.text}</p>
                    {message.role === 'assistant' && Array.isArray(message.charts) && message.charts.length > 0 && (
                      <div className="chart-badges">
                        {message.charts.map((chart, idx) => {
                          const Icon = typeIconMap[chart.type] || BarChart3;
                          return (
                            <span key={`${chart.id || idx}`} className="chart-pill"><Icon size={12} /> {chart.title || 'Chart'}</span>
                          );
                        })}
                      </div>
                    )}
                    {message.role === 'assistant' && Array.isArray(message.suggestedFollowUps) && message.suggestedFollowUps.length > 0 && (
                      <div className="followup-row">
                        {message.suggestedFollowUps.map((followUp) => (
                          <button type="button" key={followUp} className="followup-chip" onClick={() => sendMessage(followUp)}>{followUp}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-sticky">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Type your BI question..."
            value={inputValue}
            disabled={isLoading}
            onInput={handleInputResize}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <button type="button" className="send-btn" disabled={isLoading} onClick={() => sendMessage()}>
            <Send size={16} />
          </button>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="kpi-row">
          <KpiCard label="Total Revenue" icon={IndianRupee} value={getKpiValue('totalRevenue')} prefix="₹" format="currency" />
          <KpiCard label="Avg ROI" icon={Percent} value={getKpiValue('avgROI')} format="decimal" />
          <KpiCard label="Total Conversions" icon={Target} value={getKpiValue('totalConversions')} format="integer" />
          <KpiCard label="Best Channel" icon={Trophy} value={getKpiValue('bestChannel')} format="text" />
        </div>

        <div className="dashboard-toolbar card">
          <button type="button" className="btn btn-primary" onClick={runExecutiveDashboard} disabled={isLoading}><Wand2 size={15} /> Executive Dashboard</button>
          <button type="button" className="btn btn-outline" onClick={() => setShowSnapshotInput((value) => !value)} disabled={charts.length === 0}><Save size={15} /> Save Snapshot</button>
          <button type="button" className="btn btn-outline" onClick={printDashboard}><Printer size={15} /> Export PDF</button>
        </div>

        {showSnapshotInput && (
          <div className="card snapshot-inline-form">
            <input
              value={snapshotTitle}
              onChange={(event) => setSnapshotTitle(event.target.value)}
              placeholder="Snapshot title"
            />
            <button type="button" className="btn btn-primary" onClick={saveSnapshot}>Save</button>
          </div>
        )}

        {charts.length === 0 ? (
          <div className="card charts-empty-state">
            <div className="empty-state-icon"><Sparkles size={28} /></div>
            <h3>Ask a question to generate charts</h3>
            <p>Try: "Show me revenue by channel"</p>
          </div>
        ) : (
          <div className="charts-grid-wide">
            {charts.map((chart) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                isFullscreen={fullScreenChartId === chart.id}
                onSwitchType={() => switchChartType(chart.id)}
                onToggleFullscreen={() => setFullScreenChartId((prev) => (prev === chart.id ? null : chart.id))}
                onDelete={() => removeChart(chart.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, prefix = '', format }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (format === 'text') {
      return;
    }

    const target = Number(value || 0);
    let frameId;
    const duration = 650;
    const startedAt = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      setDisplay(target * progress);
      if (progress < 1) frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value, format]);

  const formatted = useMemo(() => {
    if (format === 'text') return value || 'N/A';
    if (format === 'currency') return `${prefix}${Math.round(Number(display)).toLocaleString('en-IN')}`;
    if (format === 'decimal') return Number(display).toFixed(2);
    return Math.round(Number(display)).toLocaleString('en-IN');
  }, [display, format, prefix, value]);

  return (
    <article className="card kpi-tile">
      <div className="kpi-icon-wrap">
        {Icon ? <Icon size={14} /> : null}
      </div>
      <p>{label}</p>
      <h4>{formatted}</h4>
    </article>
  );
}

export default ChatDashboard;
