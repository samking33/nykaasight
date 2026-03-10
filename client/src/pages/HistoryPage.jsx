import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useToast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/errorUtils';

function HistoryPage({ setActiveDatasetId }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [datasets, setDatasets] = useState([]);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const [{ data: datasetsData }, { data: sessionsData }] = await Promise.all([
          api.get('/api/datasets'),
          api.get('/api/sessions'),
        ]);

        setDatasets(Array.isArray(datasetsData) ? datasetsData : []);
        setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      } catch (error) {
        addToast({ type: 'error', message: getApiErrorMessage(error, 'Unable to load history') });
      }
    };

    loadHistory();
  }, [addToast]);

  const openDataset = (datasetId) => {
    setActiveDatasetId(datasetId);
    navigate(`/chat/${datasetId}`);
  };

  const openSession = (session) => {
    setActiveDatasetId(session.dataset_id);
    navigate(`/chat/${session.dataset_id}?sessionId=${session.session_id}`);
  };

  return (
    <div className="history-page-grid">
      <section className="card history-card">
        <h2>Datasets</h2>
        <p className="section-subtitle">All uploaded datasets</p>

        {datasets.length === 0 ? (
          <p className="muted">No datasets available.</p>
        ) : (
          <div className="history-list">
            {datasets.map((dataset) => (
              <article key={dataset.id} className="history-item dataset-item">
                <div>
                  <h3>{dataset.name}</h3>
                  <p>{dataset.row_count} rows</p>
                  <p>{new Date(dataset.created_at).toLocaleString('en-IN')}</p>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => openDataset(dataset.id)}>
                  Open
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card history-card">
        <h2>Recent Sessions</h2>
        <p className="section-subtitle">Timeline of previous AI chat sessions</p>

        {sessions.length === 0 ? (
          <p className="muted">No sessions found.</p>
        ) : (
          <div className="session-timeline">
            {sessions.map((session) => (
              <button type="button" key={session.session_id} className="session-item" onClick={() => openSession(session)}>
                <span className="session-dot" />
                <div className="session-content">
                  <div className="session-head">
                    <span className="dataset-badge">{session.dataset_name}</span>
                    <span className="muted">{new Date(session.created_at).toLocaleString('en-IN')}</span>
                  </div>
                  <p className="session-preview">{session.first_user_message || 'No user prompt found.'}</p>
                  <p className="muted">{session.message_count} messages</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default HistoryPage;
