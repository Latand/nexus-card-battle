"use client";

import Link from "next/link";
import { loadGuideSections } from "@/features/guide/content/sections.uk";

const sections = loadGuideSections("uk");

export function GuidePage() {
  return (
    <main
      className="min-h-screen bg-[#080907] text-[#f7efd7]"
      data-testid="guide-page"
    >
      <div className="mx-auto grid w-full max-w-[1080px] gap-6 px-4 py-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 md:py-10 md:px-6">
        <header className="md:col-span-2 grid gap-2">
          <b className="text-[11px] font-black uppercase tracking-[0.18em] text-[#d4b06a]">
            Бойова картотека
          </b>
          <h1 className="text-3xl font-black uppercase leading-tight tracking-[0.04em] text-[#fff0ad] [text-shadow:0_3px_0_rgba(0,0,0,0.72)] md:text-[clamp(32px,5vw,44px)]">
            Як грати
          </h1>
          <p className="text-sm font-bold leading-snug text-[#cdbe98]">
            Коротко про правила бою, колекцію карт і прогрес гравця в Нексусі.
          </p>
          <Link
            href="/"
            className="text-[11px] font-black uppercase tracking-[0.16em] text-[#d4b06a] underline-offset-4 hover:text-[#ffe08a] hover:underline"
            data-testid="guide-back-home"
          >
            ← На головну
          </Link>
        </header>

        <GuideAnchorNav />

        <article className="grid gap-7" data-testid="guide-sections">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="grid scroll-mt-24 gap-3 rounded-md border border-[#d4b06a]/25 bg-[linear-gradient(180deg,rgba(20,25,28,0.96),rgba(8,10,13,0.98))] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.42)] md:p-5"
              data-testid={`guide-section-${section.id}`}
            >
              <h2 className="text-lg font-black uppercase tracking-[0.06em] text-[#fff0ad] md:text-xl">
                {section.title}
              </h2>
              <div className="grid gap-3 text-sm font-medium leading-relaxed text-[#e6dcc1] md:text-[15px]">
                {section.body}
              </div>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}

function GuideAnchorNav() {
  return (
    <>
      <nav
        aria-label="Розділи інструкції"
        className="hidden md:sticky md:top-4 md:z-10 md:block md:self-start"
        data-testid="guide-nav-desktop"
      >
        <div className="grid gap-1 rounded-md border border-[#d4b06a]/25 bg-[linear-gradient(180deg,rgba(20,25,28,0.96),rgba(8,10,13,0.98))] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.42)]">
          <b className="px-1 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#d4b06a]">
            Розділи
          </b>
          <ul className="grid gap-0.5">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded px-2 py-1.5 text-[12px] font-black uppercase tracking-[0.04em] text-[#cdbe98] transition hover:bg-white/5 hover:text-[#ffe08a]"
                  data-testid={`guide-nav-${section.id}`}
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <details
        className="md:hidden rounded-md border border-[#d4b06a]/25 bg-[linear-gradient(180deg,rgba(20,25,28,0.96),rgba(8,10,13,0.98))] p-3 shadow-[0_10px_28px_rgba(0,0,0,0.42)] [&[open]>summary>span]:rotate-90"
        data-testid="guide-nav-mobile"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#d4b06a]">
          Розділи
          <span aria-hidden="true" className="inline-block transition-transform">
            ›
          </span>
        </summary>
        <ul className="mt-2 grid gap-0.5">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded px-2 py-1.5 text-[12px] font-black uppercase tracking-[0.04em] text-[#cdbe98] hover:bg-white/5 hover:text-[#ffe08a]"
                data-testid={`guide-nav-mobile-${section.id}`}
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
