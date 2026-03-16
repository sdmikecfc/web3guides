import Link from "next/link";
export default function SubdomainNotFound() {
  return (
    <div style={{ display: "flex", minHeight: "60vh", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
      <p style={{ fontFamily: "'Bungee', cursive", fontSize: "5rem", color: "var(--subdomain-accent)", marginBottom: 8 }}>404</p>
      <h1 style={{ fontFamily: "'Bungee', cursive", fontWeight: 400, fontSize: "1.5rem", color: "#1a1a1a", marginBottom: 12 }}>Guide not found</h1>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.95rem", color: "#6b7280", marginBottom: 32 }}>
        The guide you&apos;re looking for doesn&apos;t exist or has been removed.
      </p>
      <Link href="/"
        style={{ borderRadius: 12, padding: "10px 24px", fontFamily: "'DM Sans', sans-serif", fontSize: "0.9rem", fontWeight: 700, color: "#fff", textDecoration: "none", background: "var(--subdomain-accent)" }}>
        ← Back to guides
      </Link>
    </div>
  );
}
