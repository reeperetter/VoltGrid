import { useEffect, useMemo, useState } from "react";
import { HELP_SECTIONS, HELP_UI, LANGS, type HelpAction, type Lang } from "./content";

const LANG_KEY = "voltgrid.helpLang";
const STEPS_KEY = "voltgrid.helpSteps";

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "uk" || v === "pl" || v === "en") return v;
  } catch {
    /* сховище недоступне — лишаємо українську */
  }
  return "uk";
}

function loadSteps(): boolean[] {
  try {
    const v = JSON.parse(localStorage.getItem(STEPS_KEY) ?? "[]") as unknown;
    if (Array.isArray(v)) return v.map(Boolean);
  } catch {
    /* ігноруємо */
  }
  return [];
}

interface Props {
  onClose: () => void;
  onGo: (action: HelpAction) => void;
}

/** Інтерактивна довідка: три мови, пошук, розділи, що розгортаються, чекліст швидкого старту, кнопки переходу. */
export function HelpPanel({ onClose, onGo }: Props) {
  const [lang, setLang] = useState<Lang>(loadLang);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | undefined>("what");
  const [done, setDone] = useState<boolean[]>(loadSteps);
  const ui = HELP_UI[lang];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function chooseLang(l: Lang) {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ігноруємо */
    }
  }

  function toggleStep(i: number) {
    const next = ui.stepsList.map((_, idx) => (idx === i ? !done[idx] : !!done[idx]));
    setDone(next);
    try {
      localStorage.setItem(STEPS_KEY, JSON.stringify(next));
    } catch {
      /* ігноруємо */
    }
  }

  const q = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      HELP_SECTIONS.filter(
        (s) => q === "" || s.title[lang].toLowerCase().includes(q) || s.body[lang].some((p) => p.toLowerCase().includes(q)),
      ),
    [q, lang],
  );

  return (
    <aside className="help-panel" role="dialog" aria-label={ui.title} lang={lang}>
      <div className="help-head">
        <strong>{ui.title}</strong>
        <div className="help-langs" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l.id} className={l.id === lang ? "active" : undefined} onClick={() => chooseLang(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} aria-label={ui.close}>✕</button>
      </div>
      <input
        className="help-search"
        type="search"
        placeholder={ui.search}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="help-body">
        {q === "" && (
          <section className="help-steps">
            <h3>{ui.steps}</h3>
            <ol>
              {ui.stepsList.map((s, i) => (
                <li key={i}>
                  <label>
                    <input type="checkbox" checked={!!done[i]} onChange={() => toggleStep(i)} /> <span className={done[i] ? "done" : undefined}>{s}</span>
                  </label>
                </li>
              ))}
            </ol>
          </section>
        )}
        {sections.length === 0 && <p>{ui.empty}</p>}
        {sections.map((s) => {
          const isOpen = q !== "" || open === s.id;
          return (
            <section key={s.id} className="help-section">
              <h3>
                <button className="help-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen && q === "" ? undefined : s.id)}>
                  {isOpen ? "▾" : "▸"} {s.title[lang]}
                </button>
              </h3>
              {isOpen && (
                <div className="help-text">
                  {s.body[lang].map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {s.action && (
                    <button
                      onClick={() => {
                        onGo(s.action!.run);
                        onClose();
                      }}
                    >
                      {s.action.label[lang]}
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
