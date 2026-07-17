"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Challenges" },
  { href: "/giveaway", label: "Giveaway" },
  { href: "/profile", label: "Profile" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white/95 backdrop-blur border-t border-gray-100 flex justify-around py-2.5">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`text-[11px] px-4 py-1 tracking-tight ${
              active ? "text-brand-red font-semibold" : "text-gray-400"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
