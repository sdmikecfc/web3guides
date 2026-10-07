"use client";
/**
 * The RENDER-path half of lib/arcade/mode: usePathname() returns the same
 * string on the server render and in the browser, so copy that switches on it
 * never causes a hydration mismatch (arcadeNow() would: it is always false on
 * the server). Use this in components, arcadeNow() in fetch/storage call sites.
 */
import { usePathname } from "next/navigation";
import { isArcadePath } from "./mode";

export function useArcade(): boolean {
  return isArcadePath(usePathname());
}
