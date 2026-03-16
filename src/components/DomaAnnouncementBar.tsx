/**
 * Persistent full-width announcement bar shown on every subdomain page.
 * Links to the Doma Protocol listing for web3guides.com.
 */
const DOMA_URL = "https://app.doma.xyz/domain/web3guides.com";

export default function DomaAnnouncementBar() {
  return (
    <a
      href={DOMA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="doma-announce-bar"
      aria-label="Own web3guides.com on Doma Protocol"
    >
      <span className="doma-announce-inner">
        {/* Diamond icon */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M12 2 L22 12 L12 22 L2 12 Z" stroke="#F5A623" strokeWidth="1.8" fill="none" />
          <circle cx="12" cy="12" r="2.5" fill="#F5A623" />
        </svg>

        <span className="doma-announce-label">
          <strong>web3guides.com</strong> is available to own on-chain via Doma Protocol
        </span>

        <span className="doma-announce-cta">
          View listing ↗
        </span>
      </span>
    </a>
  );
}
