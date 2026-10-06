import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import Layout from "./components/Layout";
import RequireRole from "./components/RequireRole";
import Login from "./pages/Login";
import Placeholder from "./pages/Placeholder";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/orders" element={
              <RequireRole roles={["cutting_supervisor"]}><Placeholder title="Cutting Orders" /></RequireRole>} />
            <Route path="/verify" element={
              <RequireRole roles={["cutting_verifier"]}><Placeholder title="Verification Terminal" /></RequireRole>} />
            <Route path="/sewing" element={
              <RequireRole roles={["sewing_supervisor"]}><Placeholder title="Sewing Queue" /></RequireRole>} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}