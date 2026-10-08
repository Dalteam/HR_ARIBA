
/* V103: علامة الإصدار + تحذير لو البرنامج مفتوح في أكتر من تبويب
   (تبويب قديم مفتوح بيكتب بياناته القديمة فوق التعديلات الجديدة) */
(function(){
  'use strict';
  var VER = 'V113';
  function badge(){
    if(document.getElementById('aribaVerBadge')) return;
    var b = document.createElement('div');
    b.id = 'aribaVerBadge';
    b.textContent = 'إصدار ' + VER + ' ✓';
    b.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;background:#0f766e;color:#fff;font:600 11px Tahoma,Arial,sans-serif;padding:4px 9px;border-radius:12px;opacity:.85;pointer-events:none';
    document.body.appendChild(b);
  }
  if(document.body) badge(); else document.addEventListener('DOMContentLoaded', badge);
  try{ localStorage.setItem('ariba_hr_running_version', VER); }catch(e){}

  var warned = 0;
  function warnOtherTab(){
    if(Date.now() - warned < 60000) return; warned = Date.now();
    try{ window.toast('⚠ البرنامج مفتوح في تبويب أو نافذة تانية وبيغيّر البيانات. اقفل كل النسخ التانية وخلي تبويب واحد بس، وإلا التعديلات ممكن تضيع', 'ter'); }catch(e){}
    var b = document.getElementById('aribaVerBadge');
    if(b){ b.style.background = '#b91c1c'; b.textContent = '⚠ البرنامج مفتوح في تبويب تاني'; }
  }
  /* أي تبويب تاني يكتب بيانات الموظفين → نحذّر */
  window.addEventListener('storage', function(ev){
    if(ev.key === 'hr7_emps' || ev.key === 'hr7_term_emps') warnOtherTab();
  });
  /* تبويبات الإصدار الجديد بتعرّف بعض */
  try{
    var ch = new BroadcastChannel('ariba_hr_tabs');
    var me = Math.random().toString(36).slice(2);
    ch.onmessage = function(m){ if(m.data && m.data.id !== me){ warnOtherTab(); if(m.data.t === 'hi') ch.postMessage({ t: 'here', id: me }); } };
    ch.postMessage({ t: 'hi', id: me });
  }catch(e){}
})();
