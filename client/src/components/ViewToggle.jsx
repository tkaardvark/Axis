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
        className={`page-tab ${activeView === 'charts' ? 'active' : ''}`}
        onClick={() => onViewChange('charts')}
      >
        Charts
      </button>
    </div>
  );
}

export default ViewToggle;
