import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { HOME_BY_ROLE } from "../demo";

export default function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return children;
}