
/* ============================================================
   ARIBA V55 — إصلاحات إضافية فقط (Additive-only patch)
   1) ربط بيانات الـ60 موظف "منتهية خدماتهم" (المتاحة فقط عبر
      window.ARIBA_EXCEL_EMPLOYEES بسبب closure) بباقي البرنامج
      (تبويب المنتهية خدماتهم، التقارير، الوثائق).
   2) حذف زرار "التأمين الطبي - طباعة منفردة" من صفحة التقارير.
   3) توصيل رقم/قائمة "طلبات معلقة" في لوحة البيانات بالطلبات
      السحابية الحقيقية القادمة من تطبيق الموظف.
   ============================================================ */
(function(){
  'use strict';

  /* ---------- 1) دمج الموظفين المنتهية خدماتهم في القائمة الحية ---------- */
  function mergeSealedTerminated(){
    try{
      var sealed = window.ARIBA_EXCEL_EMPLOYEES;
      if(!Array.isArray(sealed) || !sealed.length) return;

      // أ) ضيفهم لمصفوفة CLEAN_EMPS نفسها (تستخدمها v60seed كمصدر أساسي)
      if(typeof CLEAN_EMPS!=='undefined' && Array.isArray(CLEAN_EMPS)){
        var haveIds = {};
        CLEAN_EMPS.forEach(function(e){ if(e && e.id) haveIds[String(e.id)]=true; });
        sealed.forEach(function(e){
          if(e && e.id && !haveIds[String(e.id)]){
            CLEAN_EMPS.push(e);
            haveIds[String(e.id)]=true;
          }
        });
      }

      // ب) ولو الملف local storage كان اتزرع (seeded) قبل كده من غير الموظفين المنتهية، ضيفهم فيه كمان
      try{
        var raw = localStorage.getItem('hr7_emps');
        var arr = raw ? JSON.parse(raw) : [];
        if(!Array.isArray(arr)) arr = [];
        var ids2 = {};
        arr.forEach(function(e){ if(e && e.id) ids2[String(e.id)]=true; });
        var added=false;
        sealed.forEach(function(e){
          if(e && e.id && !ids2[String(e.id)]){
            arr.push(e); ids2[String(e.id)]=true; added=true;
          }
        });
        if(added || !raw){ localStorage.setItem('hr7_emps', JSON.stringify(arr)); }
      }catch(ex){}
    }catch(e){ console.warn('V55 merge terminated', e); }
  }
  mergeSealedTerminated();

  function refreshEmployeeViews(){
    try{ if(typeof window.rEmps==='function') window.rEmps(); }catch(e){}
    try{ if(typeof window.uBadges==='function') window.uBadges(); }catch(e){}
    try{ if(typeof window.loadDash==='function' && document.getElementById('pg-dash')?.classList.contains('on')) window.loadDash(); }catch(e){}
    try{ if(typeof window.loadDocs==='function' && document.getElementById('pg-docs')?.classList.contains('on')) window.loadDocs(); }catch(e){}
  }
  refreshEmployeeViews();

  /* ---------- 2) حذف زرار "التأمين الطبي - طباعة منفردة" ---------- */
  function removeStandaloneInsuranceButton(){
    try{
      document.querySelectorAll('[data-v60-ins]').forEach(function(el){ el.remove(); });
    }catch(e){}
  }
  removeStandaloneInsuranceButton();
  var oldBuildRpts55 = window.buildRpts;
  if(typeof oldBuildRpts55==='function' && !oldBuildRpts55.__v55){
    window.buildRpts = function(){
      var r = oldBuildRpts55.apply(this, arguments);
      setTimeout(removeStandaloneInsuranceButton, 30);
      return r;
    };
    window.buildRpts.__v55 = true;
  }
  // شبكة أمان لو الزرار اتضاف بعد كده بأي شكل
  setInterval(removeStandaloneInsuranceButton, 3000);

  /* ---------- 3) طلبات معلقة حقيقية في لوحة البيانات ---------- */
  function updatePendingKpiAndList(){
    try{
      var cloudQueue = window.ARIBA_WORKFLOW_QUEUE || [];
      var localPending = 0;
      try{
        localPending = (getLvs().filter(function(l){return l.status==='pending';}).length) +
                       (getPerms().filter(function(l){return l.status==='pending';}).length);
      }catch(e){}

      // كل الكروت اللي فيها "طلبات معلقة" (نستخدم نفس أسلوب البحث المستخدم بالفعل في الملف)
      var KR = document.getElementById('KR');
      if(KR){
        var cards = KR.querySelectorAll('div[style*="border-radius:18px"]') ||
                    KR.querySelectorAll('div[style*="border-radius:12px"]');
        cards.forEach(function(c){
          var txt = c.textContent || '';
          if(/طلبات معلقة/.test(txt)){
            var span = c.querySelector('span[style*="font-weight:900"]');
            if(span){ span.textContent = String(localPending + cloudQueue.length); }
          }
        });
      }

      // قائمة تفصيلية داخل بطاقة "طلبات معلقة" في أعلى لوحة البيانات (#PL)
      var PL = document.getElementById('PL');
      if(PL){
        if(!cloudQueue.length){
          PL.innerHTML = '<div style="color:var(--mu);text-align:center;padding:14px;font-size:12px">✓ لا توجد طلبات سحابية معلقة حاليًا</div>';
        } else {
          PL.innerHTML = cloudQueue.slice(0,15).map(function(x){
            var r = x.request||{}, e = x.employee||{};
            var name = e.nameAr || e.nameEn || r.employee_id || '—';
            var stage = r.current_stage==='manager' ? 'بانتظار المدير المباشر' : r.current_stage==='hr' ? 'بانتظار الموارد البشرية' : r.current_stage==='ceo' ? 'بانتظار الرئيس التنفيذي' : 'قيد المعالجة';
            return '<div style="padding:8px 10px;border-bottom:1px solid var(--bd);font-size:12px"><strong>'+name+'</strong> — '+(r.request_type||'طلب')+' <span style="color:var(--mu)">('+stage+')</span></div>';
          }).join('');
        }
      }
    }catch(e){ console.warn('V55 pending kpi', e); }
  }

  // نفّذها أول مرة وبعد كل تحديث لقائمة الطلبات السحابية (اللي بيحصل كل 20 ثانية من الباتش السابق)
  setTimeout(updatePendingKpiAndList, 1200);
  setInterval(updatePendingKpiAndList, 4000);

  var oldShowPg55 = window.showPg;
  if(typeof oldShowPg55==='function' && !oldShowPg55.__v55){
    window.showPg = function(id, el){
      var r = oldShowPg55.apply(this, arguments);
      if(id==='dash'){ setTimeout(updatePendingKpiAndList, 200); }
      return r;
    };
    window.showPg.__v55 = true;
  }
})();
