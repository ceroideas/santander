import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SucursalList } from './components/SucursalList';
import { SucursalForm } from './components/SucursalForm';
import { DashboardSucursal } from './components/DashboardSucursal';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SucursalList />} />
        <Route path="/nueva" element={<SucursalForm />} />
        <Route path="/editar/:id" element={<SucursalForm />} />
        <Route path="/sucursal/:id" element={<DashboardSucursal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
