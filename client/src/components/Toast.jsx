import { X } from 'lucide-react';

function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-item ${toast.type || 'info'}`}>
          <div className="toast-message">{toast.message}</div>
          <button type="button" className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toast;
