import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RedirectProvider } from './components/RedirectHandler';
import { ScrollToTop } from './components/ScrollToTop';
import { ToastContainer } from './components/ToastContainer';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { Dashboard } from './pages/Dashboard';
import { AdminPanel } from './pages/AdminPanel';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { QRTestPage } from './pages/QRTestPage';
import { StorePage } from './pages/StorePage';
import { KVKKPage } from './pages/KVKKPage';
import { MusteriKosullariPage } from './pages/MusteriKosullariPage';
import { EsnafKosullariPage } from './pages/EsnafKosullariPage';
import { GizlilikPage } from './pages/GizlilikPage';
import { ADMIN_PANEL_PATH, ADMIN_LOGIN_PATH } from './lib/admin-routes';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RedirectProvider>
          {/* Her rota değişiminde sayfayı otomatik olarak en üste kaydırır */}
          <ScrollToTop />
          <ToastContainer />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/hakkimizda" element={<LandingPage />} />
              <Route path="/giris" element={<LoginPage />} />
              <Route path="/kayit" element={<RegisterPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/panel" element={<Dashboard />} />
              <Route path="/islem" element={<Dashboard />} />
              {/*
                Yönetici paneli — güvenlik amacıyla tahmin edilebilir `/admin`
                yolu tamamen kaldırıldı; erişim yalnızca gizli `/codcu` yolundan
                sağlanır. Kimlik doğrulama kontrolleri sayfaların içinde aynen korunur.
              */}
              <Route path={ADMIN_PANEL_PATH} element={<AdminPanel />} />
              <Route path={ADMIN_LOGIN_PATH} element={<AdminLoginPage />} />
              <Route path="/test-qr" element={<QRTestPage />} />
              <Route path="/magaza/:id" element={<StorePage />} />
              <Route path="/yasal/kvkk" element={<KVKKPage />} />
              <Route path="/yasal/musteri-kosullari" element={<MusteriKosullariPage />} />
              <Route path="/yasal/esnaf-kosullari" element={<EsnafKosullariPage />} />
              <Route path="/yasal/gizlilik" element={<GizlilikPage />} />
              {/*
                Tanımsız tüm adresler (kaldırılan `/admin` ve `/admin-giris` dahil)
                anasayfaya yönlendirilir; böylece yönetici paneli dışarıya
                hiçbir ipucu vermez.
              */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </RedirectProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;