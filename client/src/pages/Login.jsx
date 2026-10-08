import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { DEMO_PASSWORD, DEMO_USERS, HOME_BY_ROLE } from "../demo";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  async function doLogin(e, p) {
    setErrors({});
    // Client-side checks are for instant feedback only; the server re-validates
    const next = {};
    if (!e.trim()) next.email = "Email is required";
    if (!p) next.password = "Password is required";
    if (Object.keys(next).length) return setErrors(next);

    setSubmitting(true);
    try {
      const u = await login(e.trim(), p);
      navigate(HOME_BY_ROLE[u.role]);
    } catch (err) {
      if (err.details) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      } else {
        setErrors({ form: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="brand">
        <h1>ApparelFlow</h1>
        <p>Cutting Verification &amp; Sewing Queue Gate</p>
      </div>
      
      <form className="card" noValidate onSubmit={(ev) => { ev.preventDefault(); doLogin(email, password); }}>
        <h2 style={{ marginTop: 0 }}>Sign in</h2>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errors.email} autoComplete="username" />
          {errors.email && <p className="error-text">{errors.email}</p>}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password} autoComplete="current-password" />
          {errors.password && <p className="error-text">{errors.password}</p>}
        </div>

        {errors.form && <p className="error-text" role="alert">{errors.form}</p>}
        <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      </form>

      <section className="card" aria-label="Demo credentials">
        <h2 style={{ marginTop: 0 }}>Demo credentials</h2>
        <p className="muted">Password for all: <code>{DEMO_PASSWORD}</code></p>
        {DEMO_USERS.map((d) => (
          <div key={d.email} style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
            <span><strong>{d.label}</strong><br /><span className="muted">{d.email}</span></span>
            <button className="secondary" type="button" onClick={() => doLogin(d.email, DEMO_PASSWORD)}>
              Sign in as
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}