import { useState } from 'react';

function TeamLogo({ logoUrl, teamName }) {
  const [imageError, setImageError] = useState(false);

  if (!logoUrl || imageError) {
    return (
      <div className="team-logo">
        <div className="logo-placeholder" />
      </div>
    );
  }

  return (
    <div className="team-logo">
      <img
        src={logoUrl}
        alt={teamName}
        onError={() => setImageError(true)}
      />
    </div>
  );
}

export default TeamLogo;
