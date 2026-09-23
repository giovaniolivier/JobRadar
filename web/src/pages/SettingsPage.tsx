import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="fade-in max-w-xl">
      <p className="label">Compte</p>
      <h1 className="mt-1 text-3xl sm:text-4xl">Paramètres</h1>
      <p className="mt-2 text-[var(--ink-soft)]">
        Session et accès — le profil candidat (CV, skills, préférences) se gère ailleurs.
      </p>

      <section className="mt-8 space-y-4 border-y border-[var(--hairline)] py-6">
        <div>
          <p className="label">Email de connexion</p>
          <p className="mt-1 font-medium">{user?.email}</p>
        </div>
        <div>
          <p className="label">Profil & CV</p>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Compétences, préférences de recherche, mot de passe et suppression de compte.
          </p>
          <Link
            to="/profile"
            className="mt-2 inline-block text-sm underline decoration-[var(--amber)] underline-offset-4"
          >
            Ouvrir Mon profil
          </Link>
        </div>
      </section>
    </div>
  );
}
