import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Menu, Moon, Sun } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import KeysPage from '@/pages/KeysPage'
import UsagePage from '@/pages/UsagePage'
import SwordPage from '@/pages/SwordPage'
import AgentPage from '@/pages/AgentPage'

const queryClient = new QueryClient()

const navItems: Array<{ to: string; label: string; external?: boolean }> = [
  { to: '/sword', label: 'SwordCLI' },
  { to: '/keys', label: 'Keys' },
  { to: '/usage', label: 'Usage' },
  { to: '/agent', label: 'Agent' },
]

function getPreferredDarkMode() {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem('theme')
  return stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

function NavItem({ to, children, external = false }: { to: string; children: React.ReactNode; external?: boolean }) {
  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer"
        className="relative text-sm px-1 py-4 transition-colors text-muted-foreground hover:text-foreground">
        {children}
        <span className="ml-1 text-[10px]">↗</span>
      </a>
    )
  }
  return (
    <NavLink to={to}
      className={({ isActive }) =>
        `relative text-sm px-1 py-4 transition-colors ${
          isActive ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-foreground'
                   : 'text-muted-foreground hover:text-foreground'
        }`
      }>
      {children}
    </NavLink>
  )
}

function useDarkMode() {
  const [dark, setDark] = useState(getPreferredDarkMode)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  function toggle() {
    setDark(current => {
      const next = !current
      localStorage.setItem('theme', next ? 'dark' : 'light')
      return next
    })
  }
  return { dark, toggle }
}

function DarkModeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onToggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}

function Brand() {
  return (
    <Link to="/sword" className="flex items-center gap-2 transition-opacity hover:opacity-70">
      <span className="inline-block size-2 rounded-full bg-foreground" />
      <span className="font-semibold tracking-tight text-sm">SwordCLI</span>
    </Link>
  )
}

const isDesktopApp = typeof window !== 'undefined' && (window as any).__FREEAPI_DESKTOP__ === true
if (isDesktopApp) {
  document.documentElement.classList.add('desktop')
}

function Navbar() {
  const { dark, toggle } = useDarkMode()
  const location = useLocation()
  const navigate = useNavigate()

  function isActiveRoute(to: string) {
    return location.pathname === to
  }

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur ${isDesktopApp ? 'bg-background/45' : 'bg-background/80'}`}
      style={isDesktopApp ? ({ WebkitAppRegion: 'drag' } as React.CSSProperties) : undefined}>
      <div className={`mx-auto flex max-w-6xl items-center px-4 sm:px-6 ${isDesktopApp ? 'pl-20 sm:pl-20' : ''}`}
        style={isDesktopApp ? { minHeight: 52 } : undefined}>
        <Brand />
        <nav className="ml-10 hidden items-center gap-6 md:flex"
          style={isDesktopApp ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}>
          {navItems.map((item) => (
            <NavItem key={item.to} to={item.to} external={item.external}>
              {item.label}
            </NavItem>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-1 md:flex"
          style={isDesktopApp ? ({ WebkitAppRegion: 'no-drag' } as React.CSSProperties) : undefined}>
          <DarkModeToggle dark={dark} onToggle={toggle} />
        </div>
        <div className="ml-auto md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'icon' })}
              aria-label="Open navigation menu"><Menu /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                {navItems.map((item) => (
                  <DropdownMenuItem key={item.to} onClick={() => navigate(item.to)}
                    className={isActiveRoute(item.to) ? 'bg-accent text-accent-foreground font-medium' : undefined}>
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <div className={`min-h-screen ${isDesktopApp ? 'desktop-backdrop' : 'bg-background'}`}>
          <Navbar />
          <main className="max-w-6xl mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/sword" replace />} />
              <Route path="/sword" element={<SwordPage />} />
              <Route path="/keys" element={<KeysPage />} />
              <Route path="/usage" element={<UsagePage />} />
              <Route path="/agent" element={<AgentPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
