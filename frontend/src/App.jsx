import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ETD8A12Panel from "./ETD8A12Panel";
import Login from "./Login";
import { getPanelToken } from "./panelAuth";

function ProtectedRoute({ children }) {
  if (!getPanelToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ETD8A12Panel />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
