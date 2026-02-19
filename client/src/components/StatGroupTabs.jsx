import './StatGroupTabs.css';

const DEFAULT_GROUPS = [
  { key: 'Efficiency', label: 'Efficiency' },
  { key: 'Offense', label: 'Offense' },
  { key: 'Defense', label: 'Defense' },
  { key: 'GameFlow', label: 'Game Flow' },
  { key: 'Experimental', label: 'Experimental' },
];

function StatGroupTabs({ active, onChange, groups }) {
  const items = groups || DEFAULT_GROUPS;
  return (
    <div className="stat-group-tabs">
      {items.map((group) => (
        <button
          key={group.key}
          className={`stat-group-tab ${active === group.key ? 'active' : ''}`}
          onClick={() => onChange(group.key)}
        >
          {group.label}
        </button>
      ))}
    </div>
  );
}

export default StatGroupTabs;
