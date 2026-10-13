
/* ============================================================
   ARIBA V80 — إضافة فقط: نقل رسائل التنبيه (toast) من أسفل
   يمين الشاشة إلى أعلى المنتصف، عشان تبقى واضحة أكتر.
   ============================================================ */
(function(){
  'use strict';
  var style = document.createElement('style');
  style.textContent = '.toast{position:fixed!important;top:20px!important;bottom:auto!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;text-align:center}';
  document.head.appendChild(style);
})();
