import { Navigate, Route, Routes } from "react-router-dom";
import { CafeteriaPage } from "./cafeteria/CafeteriaPage";
import { ReceptionPage } from "./recepcion/ReceptionPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/recepcion" replace />} />
      <Route path="/recepcion" element={<ReceptionPage />} />
      <Route path="/cafeteria" element={<CafeteriaPage />} />
      <Route path="*" element={<Navigate to="/recepcion" replace />} />
    </Routes>
  );
}
