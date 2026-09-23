import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `label py-1 transition-colors ${
    isActive ? "text-[var(--ink)] border-b border-[var(--amber)]" : "hover:text-[var(--ink)]"
  }`;

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--ink)] bg-[var(--paper)]/95 backdrop-blur-[2px]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-end gap-y-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-12 lg:py-6">
          <div className="min-w-0">
            <NavLink to="/" className="brand block text-[1.75rem] leading-none tracking-tight">
              JobRadar
            </NavLink>
            <p className="label mt-2">Tour de contrôle · candidatures</p>
          </div>

          <nav className="flex flex-wrap items-center gap-x-7 gap-y-2 lg:justify-center lg:pb-0.5">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/offers" className={linkClass}>
              Offres
            </NavLink>
            <NavLink to="/pipeline" className={linkClass}>
              Pipeline
            </NavLink>
            <NavLink to="/import" className={linkClass}>
              Import
            </NavLink>
            <NavLink to="/profile" className={linkClass}>
              Profil
            </NavLink>
          </nav>

          <div className="flex items-center gap-4 lg:justify-end lg:pb-0.5">
            <span className="mono text-xs text-[var(--ink-soft)]">{user?.name}</span>
            <button
              type="button"
              onClick={() => void logout()}
              className="btn btn-ghost !py-1.5 !text-xs"
            >
              Sortie
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
