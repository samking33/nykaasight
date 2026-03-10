import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import UploadPage from './pages/UploadPage';
import ChatDashboard from './pages/ChatDashboard';
import HistoryPage from './pages/HistoryPage';
import api from './api';
import { useToast } from './hooks/useToast';
import { getApiErrorMessage } from './utils/errorUtils';

function App() {
  const location = useLocation();
  const { addToast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [activeDatasetId, setActiveDatasetId] = useState(null);

  const loadDatasets = useCallback(async () => {
    try {
      const { data } = await api.get('/api/datasets');
      const next = (Array.isArray(data) ? data : []).map((item) => ({
        ...item,
        isDemo: item.name === 'Nykaa Demo',
      }));
      setDatasets(next);

      if (next.length) {
        setActiveDatasetId((prev) => prev || next[0].id);
      }
    } catch (error) {
      setDatasets([]);
      addToast({ type: 'error', message: getApiErrorMessage(error, 'Failed to load datasets') });
    }
  }, [addToast]);

  useEffect(() => {
    const boot = async () => {
      try {
        await api.get('/api/datasets/nykaa/load');
      } catch {
        // Demo dataset load is best-effort.
      } finally {
        await loadDatasets();
      }
    };

    boot();
  }, [loadDatasets]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const activeDataset = useMemo(
    () => datasets.find((item) => item.id === activeDatasetId) || null,
    [datasets, activeDatasetId]
  );
  const demoDataset = useMemo(
    () => datasets.find((item) => item.isDemo) || null,
    [datasets]
  );

  const handleDatasetReady = (dataset) => {
    const normalized = {
      id: dataset.datasetId,
      name: dataset.name,
      row_count: dataset.rowCount,
      columns: dataset.columns,
    };

    setDatasets((prev) => {
      const exists = prev.some((item) => item.id === normalized.id);
      if (exists) {
        return prev.map((item) => (item.id === normalized.id ? { ...item, ...normalized } : item));
      }
      return [normalized, ...prev];
    });
    setActiveDatasetId(normalized.id);
  };

  return (
    <div className="app-shell">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeDataset={activeDataset}
        activeDatasetId={activeDatasetId}
        demoDataset={demoDataset}
      />

      <div className="content-shell">
        <Topbar onToggleSidebar={() => setSidebarOpen((value) => !value)} />

        <main className="page-content">
          <Routes>
            <Route path="/" element={<Navigate to="/upload" replace />} />
            <Route
              path="/upload"
              element={<UploadPage onDatasetReady={handleDatasetReady} />}
            />
            <Route
              path="/chat"
              element={<Navigate to={activeDatasetId ? `/chat/${activeDatasetId}` : '/upload'} replace />}
            />
            <Route
              path="/chat/:datasetId"
              element={<ChatDashboard setActiveDatasetId={setActiveDatasetId} />}
            />
            <Route
              path="/history"
              element={<HistoryPage setActiveDatasetId={setActiveDatasetId} />}
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
