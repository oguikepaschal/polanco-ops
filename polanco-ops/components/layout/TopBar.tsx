'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { getInitials } from '@/lib/formatters'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/inventory': 'Inventory',
  '/inventory/add': 'Add Vehicle',
  '/leads': 'Leads',
  '/leads/add': 'Add Lead',
  '/deals': 'Deal Sheets',
  '/deals/new': 'New Deal',
  '/settings': 'Settings',
}

interface TopBarProps {
  action?: React.ReactNode
}

export function TopBar({ action }: TopBarProps) {
  const pathname = usePathname()
  const { data: currentUser } = useCurrentUser()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Match exact path first, then check prefixes for detail pages
  const title = PAGE_TITLES[pathname] ?? deriveTitle(pathname)

  const initials = getInitials(currentUser?.full_name)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Wipe the service worker's runtime caches so nothing from this session
    // (pages, API responses) survives on a shared device. The precache holds
    // only static build assets, so it's kept for offline startup. Best-effort:
    // a cache failure must never block sign-out.
    try {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !k.includes('precache')).map((k) => caches.delete(k)))
    } catch (err) {
      console.error('Failed to clear caches on sign-out:', err)
    }
    // Full reload to clear any client-side cache (react-query) and let
    // middleware route the now-unauthenticated user to /login.
    window.location.href = '/login'
  }

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 md:h-20 lg:h-24 bg-base border-b border-[var(--border)]">
      <div className="relative h-full flex items-center justify-between px-4 lg:max-w-6xl lg:mx-auto">
        {/* Left slot: Polanco badge (mark-only icon), present on every authed
            screen. Links home to the dashboard. Back affordances live in the
            page body below the TopBar, so nothing here competes with them. */}
        <Link
          href="/dashboard"
          aria-label="Polanco — go to dashboard"
          className="flex items-center shrink-0 transition-all duration-150 ease-out active:scale-[0.97]"
        >
          <Image
            src="/icons/icon-192.png"
            alt="Polanco"
            width={36}
            height={36}
            priority
            className="w-8 h-8 md:w-9 md:h-9 rounded-lg object-contain"
          />
        </Link>

        {/* Center slot: page title, absolutely centered on the screen midpoint so
            it stays visually centered regardless of the left (badge) and right
            (avatar) content widths — a plain justify-between would off-center it.
            The pointer-events-none overlay never intercepts taps on the badge or
            avatar; horizontal padding keeps the title clear of both, and truncate
            trims overly long titles on narrow screens. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-16">
          <h1 className="font-cormorant text-xl md:text-3xl lg:text-4xl font-semibold text-ink leading-tight truncate text-center">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {action}

          <ThemeToggle />

          {/* Avatar + dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="w-8 h-8 rounded-full bg-ink flex items-center justify-center text-base font-inter text-xs font-semibold transition-all duration-150 ease-out active:scale-[0.97]"
            >
              {initials}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-10 w-52 bg-surface-elevated rounded-xl shadow-elevated border border-[var(--border)] overflow-hidden z-50">
                {currentUser && (
                  <div className="px-4 py-3 border-b border-[var(--border)]">
                    <p className="font-inter text-xs font-semibold text-ink truncate">
                      {currentUser.full_name}
                    </p>
                    {/* text-ink-soft (not the usual text-ink-muted) — --surface-elevated
                        sits close enough to --ink-muted's contrast floor that muted text
                        here would read thin; ink-soft has ample headroom. */}
                    <p className="font-inter text-[10px] text-ink-soft capitalize">
                      {currentUser.role}
                    </p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm font-inter text-danger hover:bg-danger/10 transition-all duration-150 ease-out active:scale-[0.97]"
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function deriveTitle(pathname: string): string {
  if (pathname.startsWith('/inventory')) return 'Inventory'
  if (pathname.startsWith('/leads')) return 'Leads'
  if (pathname.startsWith('/deals')) return 'Deal Sheets'
  return 'Polanco Ops'
}
