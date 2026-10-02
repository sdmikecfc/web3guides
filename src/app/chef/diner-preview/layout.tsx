import type { ReactNode } from 'react';
import css from './beta-badge.module.css';

export default function DinerLayout({ children }: { children: ReactNode }) {
  return <>{children}<span className={css.badge} aria-label="Beta version">Beta</span></>;
}
