import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RedirectProvider } from './components/RedirectHandler';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { Dashboard } from './pages/Dashboard';
import { AdminPanel } from './pages/AdminPanel';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { QRTestPage } from './pages/QRTestPage';
import { StorePage } from './pages/StorePage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RedirectProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/hakkimizda" element={<LandingPage />} />
              <Route path="/giris" element={<LoginPage />} />
              <Route path="/kayit" element={<RegisterPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/panel" element={<Dashboard />} />
              <Route path="/islem" element={<Dashboard />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin-giris" element={<AdminLoginPage />} />
              <Route path="/test-qr" element={<QRTestPage />} />
              <Route path="/magaza/:id" element={<StorePage />} />
            </Route>
          </Routes>
        </RedirectProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
