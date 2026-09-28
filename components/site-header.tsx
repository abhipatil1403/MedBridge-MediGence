"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { navigation } from "@/lib/navigation";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [open]);

  return (
    <header className="site-header">
      <div className="site-header__inner container">
        <Link className="brand" href="/" aria-label="MedBridge home" onClick={() => setOpen(false)}>
          <span className="brand__mark" aria-hidden="true"><span /><span /><span /></span>
          <span>MEDBRIDGE</span>
        </Link>

        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </nav>

        <button
          ref={toggleRef}
          className="menu-toggle"
          type="button"
          aria-controls="mobile-navigation"
          aria-expanded={open}
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
        </button>
      </div>

      {open && (
        <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
          <div className="container mobile-nav__inner">
            {navigation.map((item, index) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                <span className="mobile-nav__number">0{index + 1}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
