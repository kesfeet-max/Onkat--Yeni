import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { KVKKContent } from '../components/LegalTexts';

export function KVKKPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <BrandLogo to="/" size="lg" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-700" />
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-primary-700">
              Kişisel Verilerin Korunması ve İşlenmesi Aydınlatma Metni
            </h1>
          </div>

          <KVKKContent />
        </div>

        <div className="text-center mt-6">
          <Link to="/" className="text-primary-600 font-semibold hover:text-primary-700 text-sm">
            ← Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  );
}