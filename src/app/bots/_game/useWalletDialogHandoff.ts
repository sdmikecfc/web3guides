"use client";
import { useLayoutEffect, useRef } from "react";

/** RainbowKit portals to document.body, outside native dialogs' top layer.
 * Keep the wallet mounted, but hand modal focus to its picker/QR/account screen.
 * Inline sign-in has no native dialog and needs no handoff.
 */
export function useWalletDialogHandoff(walletModalOpen: boolean) {
  const surface = useRef<HTMLDivElement>(null);
  const suspended = useRef<{ dialogs: HTMLDialogElement[]; focus: HTMLElement | null } | null>(null);
  const generation = useRef(0);

  useLayoutEffect(() => {
    const current = ++generation.current;
    let resumeFrame = 0;
    const restore = () => {
      const previous = suspended.current;
      suspended.current = null;
      if (!previous) return;
      // An outer Rewards dialog can contain the wallet dialog. Restore their
      // original order, but never reopen a dialog removed by navigation.
      const connected = previous.dialogs.filter(dialog => dialog.isConnected);
      for (const dialog of [...connected].reverse()) if (!dialog.open) dialog.showModal();
      if (previous.focus?.isConnected && connected.some(dialog => dialog.contains(previous.focus))) previous.focus.focus({ preventScroll: true });
    };

    if (walletModalOpen && !suspended.current) {
      const dialogs: HTMLDialogElement[] = [];
      let dialog = surface.current?.closest<HTMLDialogElement>("dialog") ?? null;
      while (dialog) {
        if (dialog.open) dialogs.push(dialog);
        dialog = dialog.parentElement?.closest<HTMLDialogElement>("dialog") ?? null;
      }
      if (dialogs.length) {
        const active = document.activeElement;
        suspended.current = { dialogs, focus: active instanceof HTMLElement && dialogs.some(parent => parent.contains(active)) ? active : null };
        for (const parent of dialogs) parent.close();
      }
    } else if (!walletModalOpen && suspended.current) {
      // Let RainbowKit release its focus trap and finish handling Escape first.
      resumeFrame = requestAnimationFrame(restore);
    }
    return () => {
      cancelAnimationFrame(resumeFrame);
      // Signing in can replace the wallet with a garage choice inside the same
      // dialog. Restore surviving parents after commit even if this child leaves.
      // A dependency change or StrictMode restart invalidates this cleanup.
      queueMicrotask(() => { if (generation.current === current) restore(); });
    };
  }, [walletModalOpen]);

  return surface;
}
