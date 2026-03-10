import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ChevronDown, Database, FolderOpenDot, History, LayoutDashboard, X } from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';
import api from '../api';
import { getApiErrorMessage } from '../utils/errorUtils';
import { useToast } from '../hooks/useToast';

function Sidebar({ open, onClose, activeDataset, activeDatasetId, demoDataset }) {
  const dashboardPath = activeDatasetId ? '/chat' : '/upload';
  const { addToast } = useToast();
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [snapshots, setSnapshots] = useState([]);

  const loadSnapshots = useCallback(async () => {
    if (!activeDatasetId) {
      setSnapshots([]);
      return;
    }

    try {
      const { data } = await api.get('/api/snapshots', { params: { datasetId: activeDatasetId } });
      setSnapshots(Array.isArray(data) ? data : []);
    } catch (error) {
      addToast({ type: 'warning', message: getApiErrorMessage(error, 'Failed to load snapshots') });
    }
  }, [activeDatasetId, addToast]);

  useEffect(() => {
    Promise.resolve().then(loadSnapshots);
    window.addEventListener('snapshot-saved', loadSnapshots);
    return () => window.removeEventListener('snapshot-saved', loadSnapshots);
  }, [loadSnapshots]);

  return (
    <>
      <div className={`sidebar-backdrop ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <button type="button" className="sidebar-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="brand-wrap">
          <div className="brand-mark" />
          <div className="brand-copy">
            <h1>NykaaSight</h1>
            <p>Marketing Intelligence</p>
          </div>
        </div>

        <div className="nav-section-label">MAIN</div>
        <nav className="side-nav">
          <NavLink to={dashboardPath} className="side-link">
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>
        </nav>

        <div className="nav-section-label">DATA</div>
        <nav className="side-nav">
          <NavLink to="/upload" className="side-link">
            <Database size={16} />
            Upload Data
          </NavLink>
          <NavLink to="/history" className="side-link">
            <History size={16} />
            History
          </NavLink>
        </nav>

        {demoDataset && (
          <Link to={`/chat/${demoDataset.id}`} className="demo-link">
            <span><BarChart3 size={14} /> Nykaa Demo</span>
            <span className="demo-badge">DEMO</span>
          </Link>
        )}

        <div className="snapshots-wrap">
          <button type="button" className="snapshots-toggle" onClick={() => setSnapshotsOpen((value) => !value)}>
            <span><FolderOpenDot size={14} /> Saved Dashboards</span>
            <ChevronDown size={14} className={snapshotsOpen ? 'open' : ''} />
          </button>
          {snapshotsOpen && (
            <div className="snapshots-list">
              {snapshots.length === 0 && <p className="dataset-empty">No saved snapshots</p>}
              {snapshots.map((snapshot) => (
                <Link
                  key={snapshot.id}
                  to={`/chat/${snapshot.dataset_id}?sessionId=${snapshot.session_id}&snapshotId=${snapshot.id}`}
                  className="snapshot-link"
                >
                  {snapshot.title}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="dataset-card">
          <div className="dataset-card-header">
            <BarChart3 size={15} />
            ACTIVE DATASET
          </div>
          {activeDataset ? (
            <>
              <div className="dataset-name">{activeDataset.name}</div>
              <span className="dataset-badge">{activeDataset.row_count} rows</span>
            </>
          ) : (
            <p className="dataset-empty">No active dataset loaded</p>
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
