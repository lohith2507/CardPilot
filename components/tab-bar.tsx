"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, ScanSearch, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Compare", icon: ScanSearch },
  { href: "/cards", label: "Wallet", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

export function TabBar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-lg items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium tracking-wide transition-colors",
                active ? "text-brand" : "text-muted hover:text-ink",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
