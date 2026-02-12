import './ViewToggle.css';

function ViewToggle({ activeView, onViewChange }) {
  return (
    <div className="page-tabs">
      <button
        className={`page-tab ${activeView === 'table' ? 'active' : ''}`}
        onClick={() => onViewChange('table')}
      >
        Table
      </button>
      <button
        className={`page-tab ${activeView === 'visualizations' ? 'active' : ''}`}
        onClick={() => onViewChange('visualizations')}
      >
        Visualizations
      </button>
    </div>
  );
}

export default ViewToggle;
