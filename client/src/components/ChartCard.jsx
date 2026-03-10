import { Expand, SlidersHorizontal, X } from 'lucide-react';
import ChartRenderer from './ChartRenderer';

function ChartCard({
  chart,
  isFullscreen,
  onSwitchType,
  onToggleFullscreen,
  onDelete,
}) {
  return (
    <article className={`card chart-frame ${chart.animationState === 'enter' ? 'enter' : ''} ${chart.animationState === 'update' ? 'update' : ''} ${isFullscreen ? 'fullscreen' : ''}`}>
      <header className="chart-frame-head">
        <h3>{chart.config.title || 'Untitled Chart'}</h3>
        <span className="chart-type-pill">{chart.config.type || 'bar'}</span>
        <div className="chart-tools">
          <button type="button" className="icon-btn" onClick={onSwitchType}><SlidersHorizontal size={14} /></button>
          <button type="button" className="icon-btn" onClick={onToggleFullscreen}><Expand size={14} /></button>
          <button type="button" className="icon-btn" onClick={onDelete} aria-label="Delete chart">
            <X size={14} />
          </button>
        </div>
      </header>
      <p className="chart-muted">{chart.config.description}</p>
      <ChartRenderer
        config={chart.config}
        data={chart.processedData?.data || []}
        xKey={chart.processedData?.xKey}
        yKey={chart.processedData?.yKey}
      />
      <footer className="chart-footer">
        {(chart.processedData?.data || []).length} data points · {chart.config.aggregation} of {chart.config.dataKey} by {chart.config.categoryKey}
      </footer>
    </article>
  );
}

export default ChartCard;
