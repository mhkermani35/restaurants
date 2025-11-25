// main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
// وارد کردن کامپوننت اصلی
import RestaurantRatingApp from './RestaurantRatingApp.jsx';

// توجه: در محیط لوکال، متغیرهای فایربیس (مثل __app_id) تعریف نشده‌اند.
// برای جلوگیری از خطا هنگام اجرا، مقادیر پیش‌فرض خالی برای آن‌ها تعریف می‌کنیم.
// این مقادیر فقط برای اجرای محلی هستند و در محیط Canvas اصلی به درستی مقداردهی می‌شوند.
window.__app_id = window.__app_id || 'local-app-id';
window.__firebase_config = window.__firebase_config || JSON.stringify({});
window.__initial_auth_token = window.__initial_auth_token || null;

// رندر کردن کامپوننت اصلی درون المان با id="root"
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RestaurantRatingApp />
  </React.StrictMode>,
);