import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CloudUpload, DatabaseZap, MessageSquareText, Rocket, ScanSearch, Sparkles, Wand2 } from 'lucide-react';
import Papa from 'papaparse';
import { useDropzone } from 'react-dropzone';
import api from '../api';
import { useToast } from '../hooks/useToast';
import { getApiErrorMessage } from '../utils/errorUtils';

const inferType = (values) => {
  const nonEmpty = values.filter((value) => value !== '' && value !== null && value !== undefined);
  if (!nonEmpty.length) return 'text';

  const allNumeric = nonEmpty.every((value) => Number.isFinite(Number(value)));
  if (allNumeric) return 'number';

  const allDate = nonEmpty.every((value) => !Number.isNaN(Date.parse(String(value))));
  if (allDate) return 'date';

  const unique = new Set(nonEmpty.map((value) => String(value).toLowerCase()));
  if (unique.size < 15) return 'categorical';

  return 'text';
};

const formatSize = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const HOSTED_UPLOAD_SAFE_LIMIT_BYTES = 4 * 1024 * 1024;

function UploadPage({ onDatasetReady }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (location.state?.toast) {
      addToast({ type: 'warning', message: location.state.toast });
    }
  }, [location.state, addToast]);

  const previewRows = useMemo(() => parsedRows.slice(0, 10), [parsedRows]);
  const hasNumericColumns = useMemo(
    () => columns.some((column) => column.type === 'number'),
    [columns]
  );

  const parseFile = (file) => {
    setError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data || [];
        const headers = Object.keys(rows[0] || {});
        const inferred = headers.map((name) => ({
          name,
          type: inferType(rows.map((row) => row[name])),
        }));

        setSelectedFile(file);
        setParsedRows(rows);
        setColumns(inferred);
        setPhase('selected');
      },
      error: () => {
        const message = 'Unable to parse CSV. Please upload a valid file.';
        setError(message);
        addToast({ type: 'error', message });
      },
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
    onDrop: (files) => files[0] && parseFile(files[0]),
  });

  const runUpload = async (file) => {
    if (!file) return;

    const isHosted = typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app');
    if (isHosted && file.size > HOSTED_UPLOAD_SAFE_LIMIT_BYTES) {
      const message = 'This CSV is too large for hosted upload limits. Use a smaller file or click Load Nykaa Sample Dataset.';
      setError(message);
      addToast({ type: 'warning', message });
      return;
    }

    setPhase('uploading');
    setProgress(15);

    const timer = window.setInterval(() => {
      setProgress((prev) => (prev >= 90 ? 90 : prev + 10));
    }, 250);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.replace('.csv', ''));

      const { data } = await api.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      window.clearInterval(timer);
      setProgress(100);
      setPhase('indexing');

      window.setTimeout(() => {
        setPhase('done');
        addToast({ type: 'success', message: 'Dataset uploaded and vector memory indexed successfully.' });
        onDatasetReady(data);

        window.setTimeout(() => {
          navigate(`/chat/${data.datasetId}`);
        }, 1000);
      }, 1100);
    } catch (uploadError) {
      window.clearInterval(timer);
      setPhase('selected');
      setProgress(0);
      setError(getApiErrorMessage(uploadError, 'Upload failed. Please try again.'));
    }
  };

  const loadSampleDataset = async () => {
    try {
      setPhase('indexing');
      const { data } = await api.get('/api/datasets/nykaa/load');
      onDatasetReady(data);
      addToast({ type: 'info', message: 'Nykaa demo dataset loaded' });
      navigate(`/chat/${data.datasetId}`);
    } catch (loadError) {
      setPhase('idle');
      const message = getApiErrorMessage(loadError, 'Unable to load Nykaa sample dataset');
      setError(message);
      addToast({ type: 'error', message });
    }
  };

  return (
    <div className="upload-grid">
      <section className="card upload-card-main">
        <h2>Upload Dataset</h2>
        <p className="section-subtitle">Import campaign-level CSV data to build AI dashboards.</p>

        <div {...getRootProps()} className={`upload-dropzone ${isDragActive ? 'active' : ''}`}>
          <input {...getInputProps()} />
          <CloudUpload size={28} />
          <div>
            <strong>Drop your CSV here</strong>
            <p>or click to browse local files</p>
          </div>
        </div>

        {selectedFile && (
          <div className="file-chip">
            <span>{selectedFile.name}</span>
            <span>{formatSize(selectedFile.size)}</span>
          </div>
        )}

        {phase === 'uploading' && (
          <div className="state-block">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <p>Uploading CSV...</p>
          </div>
        )}

        {phase === 'indexing' && (
          <div className="state-block state-indexing">
            <span className="loading-spinner" />
            <p>Indexing into vector memory...</p>
          </div>
        )}

        {previewRows.length > 0 && (
          <div className="preview-wrap">
            <h3>Preview (first 10 rows)</h3>
            {!hasNumericColumns && (
              <p className="warning-text">No numeric columns detected. Charts may be limited until numeric metrics are present.</p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column.name}>
                        {column.name}
                        <span className={`type-pill ${column.type}`}>{column.type.toUpperCase()}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${index}-${Object.values(row).join('-')}`}>
                      {columns.map((column) => (
                        <td key={`${index}-${column.name}`}>{String(row[column.name] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          disabled={!selectedFile || phase === 'uploading' || phase === 'indexing'}
          onClick={() => runUpload(selectedFile)}
        >
          <Rocket size={15} /> Analyze with AI
        </button>

        <div className="divider">— or —</div>

        <button type="button" className="btn btn-outline" onClick={loadSampleDataset}>
          <BarChart3 size={15} /> Load Nykaa Sample Dataset
        </button>

        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="card info-card">
        <h2>How it works</h2>
        <div className="steps-grid">
          <article className="step-card">
            <CloudUpload size={18} />
            <h4>1. Upload</h4>
            <p>Drop your marketing CSV and validate schema instantly.</p>
          </article>
          <article className="step-card">
            <DatabaseZap size={18} />
            <h4>2. Index</h4>
            <p>Data is chunked and embedded for vector memory retrieval.</p>
          </article>
          <article className="step-card">
            <MessageSquareText size={18} />
            <h4>3. Ask</h4>
            <p>Ask plain-English BI questions with context-aware reasoning.</p>
          </article>
          <article className="step-card">
            <Wand2 size={18} />
            <h4>4. Visualize</h4>
            <p>AI returns dashboard-ready chart configs and insights.</p>
          </article>
        </div>

        <div className="schema-box">
          <h3><ScanSearch size={16} /> Supported columns</h3>
          <p>Revenue, ROI, Conversions, Impressions, Channel_Used, Campaign_Type, Acquisition_Cost, Language, Segment, Date</p>
        </div>

        <div className="vector-note">
          <Sparkles size={16} />
          Your data is automatically chunked and indexed into vector memory for smarter AI responses.
        </div>
      </section>
    </div>
  );
}

export default UploadPage;
