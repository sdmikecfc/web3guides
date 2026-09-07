import css from "../_ui/ui.module.css";

export function WorkshopHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className={css.workshopHeading}>
    <div><span className={css.eyebrow}>✦ {eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
  </header>;
}
