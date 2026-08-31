/**
 * Yönetici paneli rota sabitleri.
 *
 * Güvenlik gereği yönetici paneli tahmin edilebilir `/admin` yolunda değil,
 * gizli `/codcu` yolu altında sunulur. Rota değişikliği gerektiğinde yalnızca
 * bu dosya güncellenir; router ve tüm yönlendirmeler bu sabitleri kullanır.
 */

/** Yönetici panelinin gizli kök yolu. */
export const ADMIN_PANEL_PATH = '/codcu';

/** Yönetici giriş ekranının gizli yolu. */
export const ADMIN_LOGIN_PATH = '/codcu/giris';