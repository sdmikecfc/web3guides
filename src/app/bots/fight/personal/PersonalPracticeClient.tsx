"use client";

/** Local art preview only. Competition and inventory APIs are never called here. */
export default function PersonalPracticeClient() {
  return <iframe
    title="Personal robots — version 8 weapon practice"
    src="/api/bots/personal-preview/index.html?view=practice&embedded=1"
    allow="autoplay"
    style={{ width: "100%", height: "100%", minHeight: 0, border: 0, display: "block", background: "#191d22" }}
  />;
}
