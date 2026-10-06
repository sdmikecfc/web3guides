import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BetaEntry from "./BetaEntry";
import {KITCHEN_DESCRIPTION,KITCHEN_SITE} from '@/lib/chef/site-metadata';

export const metadata: Metadata = {
  title: {absolute:"Domain Kitchen · Open beta"},
  description: KITCHEN_DESCRIPTION,
  alternates:{canonical:KITCHEN_SITE},
  robots: { index: false, follow: false },
};

export default function DinerPreviewPage() {
  if (process.env.NODE_ENV !== "development" && process.env.DINER_PREVIEW_ENABLED === "false") notFound();
  return <BetaEntry />;
}
