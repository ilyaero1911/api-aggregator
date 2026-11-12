"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Плавное появление элементов с атрибутом data-reveal при прокрутке. Следит и за новыми элементами. */
export function Reveal() {
  const path = usePathname();
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    const scan = () => document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    const onScroll = () => document.querySelector(".site-head")?.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); mo.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [path]);
  return null;
}
