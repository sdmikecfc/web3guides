"use client";

import dynamic from "next/dynamic";

const ReviewStage = dynamic(() => import("./ReviewStage"), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>Opening the art inspection room…</p>,
});

export default function ReviewClient() {
  return <ReviewStage />;
}
