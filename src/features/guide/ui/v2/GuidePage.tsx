"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadGuideSections } from "@/features/guide/content/sections.uk";
import { cn } from "@/shared/lib/cn";
import { AtmosphericBackground } from "@/shared/ui/v2/AtmosphericBackground";

const sections = loadGuideSections("uk");

function useActiveSection(sectionIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(sectionIds[0] ?? null);

  useEffect(() => {
    if (sectionIds.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sectionIds]);

  return activeId;
}

function smoothScrollTo(id: string) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  };
}

export function GuidePage() {
  const sectionIds = sections.map((section) => section.id);
  const activeId = useActiveSection(sectionIds);

  return (
    <AtmosphericBackground withParticles>
      <main data-testid="guide-page" className="flex-1 px-4 pb-20 pt-[60px] sm:pt-[68px]">
        <div className="mx-auto flex w-full max-w-[1200px] gap-12">
          <div className="mx-auto w-full max-w-[780px] flex-1">
            <header className="mb-10">
              <Link
                href="/"
                data-testid="guide-back-home"
                className="text-sm text-accent-quiet hover:text-accent hover:underline"
              >
                {"← На головну"}
              </Link>
              <h1 className="mt-4 text-[36px] font-normal leading-tight text-ink">Як грати</h1>
              <p className="mt-2 text-base text-ink-mute">
                Коротко про правила, карти і прогрес.
              </p>
            </header>

            <details
              data-testid="guide-nav-mobile"
              className="mb-8 rounded border border-accent-quiet/40 px-4 py-3 xl:hidden"
            >
              <summary className="cursor-pointer text-xs uppercase tracking-wider text-accent">
                Зміст
              </summary>
              <ul className="mt-3 grid gap-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      data-testid={`guide-nav-mobile-${section.id}`}
                      onClick={smoothScrollTo(section.id)}
                      className="text-sm text-ink-mute hover:text-accent"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>

            <div data-testid="guide-sections" className="grid gap-12">
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  data-testid={`guide-section-${section.id}`}
                  className="scroll-mt-24"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="text-xs uppercase tracking-[0.18em] text-accent-quiet">
                      {section.title}
                    </h2>
                    <span className="h-px flex-1 bg-accent-quiet/50" aria-hidden />
                  </div>
                  <div className="grid gap-4 text-base leading-[1.55] text-ink/90 [&_b]:text-ink [&_i]:text-ink">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <nav
            data-testid="guide-nav-desktop"
            className="sticky top-20 hidden h-fit w-48 shrink-0 xl:block"
          >
            <ul className="grid gap-3 border-l border-accent-quiet/30 pl-4">
              {sections.map((section) => {
                const isActive = section.id === activeId;
                return (
                  <li key={section.id} className="relative">
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute -left-[17px] top-0 h-full w-[2px] bg-accent"
                      />
                    )}
                    <a
                      href={`#${section.id}`}
                      data-testid={`guide-nav-${section.id}`}
                      onClick={smoothScrollTo(section.id)}
                      className={cn(
                        "block text-sm transition-colors hover:text-accent",
                        isActive ? "text-accent" : "text-ink-mute",
                      )}
                    >
                      {section.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </main>
    </AtmosphericBackground>
  );
}

export default GuidePage;
