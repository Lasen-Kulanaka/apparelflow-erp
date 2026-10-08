import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { DEMO_PASSWORD, DEMO_USERS, HOME_BY_ROLE, NAV_BY_ROLE } from "../demo";

export default function Layout() {
  const { user, loading, login, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) return <p className="page">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;

  async function switchRole(e) {
    const email = e.target.value;
    if (!email) return;
    const u = await login(email, DEMO_PASSWORD); // a real login, not a client-side trick
    navigate(HOME_BY_ROLE[u.role]);
  }

  return (
    <>
      <header className="header">
        <nav>
          <strong style={{ marginRight: "1.5rem" }}>ApparelFlow</strong>
          {NAV_BY_ROLE[user.role].map((l) => (
            <Link key={l.to} to={l.to}>{l.label}</Link>
          ))}
        </nav>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span>{user.full_name}</span>
          <span className="role-pill">{user.role.replace(/_/g, " ")}</span>
          <select aria-label="Switch demo role" value="" onChange={switchRole}>
            <option value="">Switch role</option>
            {DEMO_USERS.filter((d) => d.role !== user.role).map((d) => (
              <option key={d.email} value={d.email}>{d.label}</option>
            ))}
          </select>
          <button className="secondary" onClick={() => { logout(); navigate("/login"); }}>
            Log out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}