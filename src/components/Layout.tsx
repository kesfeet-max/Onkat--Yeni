import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';

export function Layout() {
  return (
    // Kök zemin kurumsal yeşil: footer altında/yanında beyaz boşluk kalmaz
    <div className="min-h-screen flex flex-col bg-primary-600">
      <main className="flex-1 bg-white">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
