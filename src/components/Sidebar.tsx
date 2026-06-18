'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';

const TOP_NAV = [
  { href: '/sales', icon: 'DB', label: 'Dashboard' },
];

const SALES_SUBMENU = [
  { href: '/sales/leads', icon: 'L', label: 'Leads' },
  { href: '/sales/opportunities', icon: 'O', label: 'Opportunities' },
  { href: '/sales/pipeline', icon: 'P', label: 'Pipeline' },
  { href: '/sales/quotations', icon: 'Q', label: 'Quotations' },
  { href: '/sales/forecasts', icon: 'F', label: 'Forecasts' },
];

export default function Sidebar() {
  const path = usePathname();
  const { data: session } = useSession();
  const topNavItems = TOP_NAV;

  return (
    <aside className="sidebar-scroll w-60 flex-shrink-0 bg-[#0f1d33] border-r border-[#1d2f4f] flex flex-col h-screen sticky top-0 overflow-y-auto">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-[#1d2f4f]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#2f65c8] shadow-sm flex items-center justify-center text-white font-bold text-sm">ST</div>
          <div>
            <div className="text-sm font-bold text-[#edf3ff] leading-tight">Splendid Sales</div>
            <div className="text-xs text-[#b8c8e6]">Splendid Technology</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-1">
        {topNavItems.map(({ href, icon, label }) => {
          const active = path === '/sales' || path.startsWith('/sales/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-white text-[#10213d] shadow-sm'
                  : 'text-[#dbe7ff] hover:text-white hover:bg-[#173156]'
              }`}
            >
              <span className="text-base w-5 text-center opacity-90">{icon}</span>
              {label}
            </Link>
          );
        })}

        <div className="pt-3 mt-3 border-t border-[#1d2f4f]">
          <div className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-[#8ea3c8] uppercase">Sales</div>
          <div className="space-y-1">
            {SALES_SUBMENU.map(({ href, icon, label }) => {
              const active = path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-white text-[#10213d] shadow-sm'
                      : 'text-[#dbe7ff] hover:text-white hover:bg-[#173156]'
                  }`}
                >
                  <span className="text-base w-5 text-center opacity-90">{icon}</span>
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-[#1d2f4f]">
        <Link
          href="/settings"
          className={`mb-2 flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
            path.startsWith('/settings')
              ? 'bg-white text-[#10213d] shadow-sm'
              : 'text-[#dbe7ff] hover:text-white hover:bg-[#173156]'
          }`}
        >
          <span className="text-base w-5 text-center opacity-90">SET</span>
          Settings
        </Link>
        <div className="px-3 py-2 rounded-md bg-[#132845] border border-[#2a4369]">
          <div className="text-xs text-[#edf3ff] font-medium truncate">{session?.user?.name ?? 'User'}</div>
          <div className="text-xs text-[#b8c8e6] truncate">{session?.user?.email}</div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-2 w-full text-xs text-[#c7d6f2] hover:text-white py-1 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
