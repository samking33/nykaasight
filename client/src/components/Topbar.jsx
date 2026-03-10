import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const breadcrumbMap = {
  upload: 'Upload Data',
  chat: 'AI Dashboard',
  history: 'History',
};

function Topbar({ onToggleSidebar }) {
  const location = useLocation();
  const [, firstSegment] = location.pathname.split('/');
  const current = breadcrumbMap[firstSegment] || 'Dashboard';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn" onClick={onToggleSidebar}>
          <Menu size={18} />
        </button>
      </div>

      <div className="breadcrumb">NykaaSight / {current}</div>

      <div className="topbar-right">
        <div className="avatar">N</div>
      </div>
    </header>
  );
}

export default Topbar;
