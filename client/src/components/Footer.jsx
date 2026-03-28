import { useNavigate, useSearchParams } from 'react-router-dom';
import './Footer.css';

function Footer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleAboutClick = () => {
    const params = searchParams.toString();
    navigate(params ? `/app/methodology?${params}` : '/app/methodology');
  };

  return (
    <footer className="app-footer">
      <p className="footer-text">Learn more about our ratings and methodology <span className="footer-about-link" role="link" tabIndex={0} onClick={handleAboutClick} onKeyDown={(e) => e.key === 'Enter' && handleAboutClick()}>here</span>.</p>
    </footer>
  );
}

export default Footer;
