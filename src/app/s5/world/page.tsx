/**
 * /s5/world — kept as a PERMANENT REDIRECT to /s5.
 *
 * The map was staged here while the art was made, so links to it exist in
 * commits, notes and possibly bookmarks. Redirecting costs one file and means
 * none of them break.
 */
import { redirect } from "next/navigation";

export default function WorldRedirect() {
  redirect("/s5");
}
