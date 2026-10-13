
/* ============================================================
   ARIBA V72 — إضافة فقط: أداة صغيرة لاستبعاد/إرجاع موظف من
   مسير الرواتب (الحقل excludeFromPayroll كان موجود بالفعل
   ومُستخدم في حسابات المسير، لكن مفيش أي واجهة لتفعيله — هنا
   بس بنضيف الواجهة، من غير ما نلمس أي معادلة أو منطق حساب).
   ============================================================ */
(function(){
  'use strict';
  function empsList(){
    try{
      var a = (typeof window.v60all === 'function') ? window.v60all() : [];
      if(Array.isArray(a) && a.length) return a;
    }catch(e){}
    try{
      var b = (typeof window.aEmps === 'function') ? window.aEmps() : [];
      if(Array.isArray(b) && b.length) return b;
    }catch(e){}
    try{
      if(typeof CLEAN_EMPS !== 'undefined' && Array.isArray(CLEAN_EMPS) && CLEAN_EMPS.length){
        return CLEAN_EMPS.filter(function(e){ return !e.isTerminated && !e.term; });
      }
    }catch(e){}
    return [];
  }

  function buildCard(){
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'V72_EXCLUDE_CARD';
    card.style.cssText = 'padding:12px;margin-top:12px';
    card.innerHTML =
      '<div class="ct" style="margin-bottom:8px"><i class="ti ti-user-off"></i> استبعاد موظف من مسير الرواتب</div>'+
      '<select id="V72_EMP" style="width:100%;max-width:420px;margin-bottom:8px"></select>'+
      '<div id="V72_STATUS" style="font-size:11px;color:var(--mu);margin-bottom:8px"></div>'+
      '<div style="display:flex;gap:8px">'+
        '<button class="btn bsm" style="background:var(--rd);color:#fff" onclick="v72SetExclude(true)"><i class="ti ti-user-off"></i> استبعاد من المسير</button>'+
        '<button class="btn bsm" style="background:var(--gr);color:#fff" onclick="v72SetExclude(false)"><i class="ti ti-user-check"></i> إرجاع للمسير</button>'+
      '</div>';
    return card;
  }

  function populateSelect(){
    var sel = document.getElementById('V72_EMP'); if(!sel) return;
    var cur = sel.value;
    var list = empsList();
    sel.innerHTML = '<option value="">— اختر الموظف —</option>' + list.map(function(e){
      return '<option value="'+e.id+'">'+(e.nameAr||e.nameEn||e.id)+(e.excludeFromPayroll?' (مستبعد حاليًا)':'')+'</option>';
    }).join('');
    if(cur) sel.value = cur;
    updateStatus();
  }

  function updateStatus(){
    var sel = document.getElementById('V72_EMP'), box = document.getElementById('V72_STATUS');
    if(!sel || !box) return;
    var list = empsList();
    var e = list.find(function(x){ return String(x.id) === String(sel.value); });
    if(!e){ box.textContent = ''; return; }
    box.textContent = e.excludeFromPayroll ? '⚠️ هذا الموظف مستبعد حاليًا من مسير الرواتب.' : '✓ هذا الموظف مُدرج حاليًا في مسير الرواتب.';
  }

  window.v72SetExclude = function(val){
    var sel = document.getElementById('V72_EMP');
    if(!sel || !sel.value){ if(typeof toast==='function') toast('اختر الموظف أولاً', 'ter'); return; }
    var list = empsList();
    var idx = list.findIndex(function(x){ return String(x.id) === String(sel.value); });
    if(idx === -1){ if(typeof toast==='function') toast('تعذر إيجاد الموظف', 'ter'); return; }
    list[idx].excludeFromPayroll = val;
    try{
      if(typeof window.v60save === 'function') window.v60save(list);
      if(typeof toast==='function') toast(val ? '✓ تم استبعاد الموظف من المسير' : '✓ تم إرجاع الموظف لمسير الرواتب', 'tin');
    }catch(e){
      if(typeof toast==='function') toast('تعذر الحفظ', 'ter');
    }
    populateSelect();
  };

  function ensureCard(){
    try{
      var page = document.getElementById('pg-set');
      if(page && !document.getElementById('V72_EXCLUDE_CARD')){
        page.appendChild(buildCard());
        var sel = document.getElementById('V72_EMP');
        if(sel) sel.onchange = updateStatus;
      }
      // إعادة تعبئة القائمة باستمرار عشان تتأكد إنها فيها بيانات حقيقية
      // حتى لو الكارت اتبنى قبل ما بيانات الموظفين تجهز
      populateSelect();
    }catch(e){}
  }
  setInterval(ensureCard, 1500);
})();
