
/* ============================================================
   ARIBA V54 — إصلاح إضافي فقط (Additive-only patch)
   المشكلة: شاشة الدخول (#LG) كانت مخفية دائمًا، فكان البرنامج
   "يدخل" محليًا بدون توكن سحابي حقيقي (ARIBA_HR_TOKEN فاضي).
   والنتيجة: لوحة "طلبات الموظفين المعلقة" (loadWorkflowQueue)
   ما كانتش بتشتغل لأنها بترجع فاضية لو مفيش توكن.
   هذا الباتش لا يعدّل ولا يحذف أي كود موجود — فقط يضيف:
   1) إظهار شاشة الدخول لو مفيش توكن سحابي صالح.
   2) ربط زرار الدخول بنفس دالة ariba_login السحابية
      المستخدمة بالفعل في تطبيق الموظف (نفس المشروع/المفتاح).
   3) تحديث دوري خفيف للوحة الطلبات المعلقة بعد تسجيل الدخول.
   ============================================================ */
(function(){
  'use strict';
  var SUPA_URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var SUPA_KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var TOKEN_KEY='ariba_hr_session_v3';

  async function cloudRpc(fn,args){
    var r=await fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});
    var t=await r.text(),d=null; try{d=t?JSON.parse(t):null;}catch(e){d=null;}
    if(!r.ok) throw new Error((d&&(d.message||d.hint||d.error))||'تعذر الاتصال بالخادم');
    return d;
  }

  function safeToast(msg,type){
    try{ if(typeof window.toast==='function'){ window.toast(msg,type); return; } }catch(e){}
    console.log('[ARIBA]',msg);
  }

  function afterLoginSuccess(){
    try{ if(typeof window.loadWorkflowQueue==='function') window.loadWorkflowQueue().then(function(){ try{ if(typeof window.rWorkflowQueue==='function') window.rWorkflowQueue(); }catch(e){} }); }catch(e){}
    try{ if(typeof window.uBadges==='function') window.uBadges(); }catch(e){}
    // تحديث دوري خفيف للطلبات المعلقة (كل 20 ثانية) طالما فيه توكن سحابي حقيقي
    if(!window.__ariba54Poll){
      window.__ariba54Poll=setInterval(function(){
        if(window.ARIBA_HR_TOKEN && window.ARIBA_HR_TOKEN!=='local_admin_token' && typeof window.loadWorkflowQueue==='function'){
          window.loadWorkflowQueue().then(function(){ try{ if(typeof window.rWorkflowQueue==='function') window.rWorkflowQueue(); }catch(e){} }).catch(function(){});
        }
      },20000);
    }
  }

  function hideLoginScreen(){
    var lg=document.getElementById('LG');
    if(lg) lg.style.display='none';
  }

  function showLoginScreen(){
    var lg=document.getElementById('LG');
    if(lg) lg.style.display='flex';
  }

  async function doHrLogin(){
    var uEl=document.getElementById('LU'), pEl=document.getElementById('LP'), errEl=document.getElementById('LE'), btn=document.getElementById('LB');
    var u=(uEl&&uEl.value||'').trim(), p=(pEl&&pEl.value||'').trim();
    if(!u||!p) return;
    if(btn) btn.disabled=true;
    if(errEl) errEl.style.display='none';
    try{
      // المحاولة الأولى: تسجيل دخول سحابي حقيقي (نفس دالة تطبيق الموظف)
      var d=await cloudRpc('ariba_login',{p_username:u,p_password:p});
      if(d && d.token){
        window.ARIBA_HR_TOKEN=d.token;
        try{ sessionStorage.setItem(TOKEN_KEY,d.token); }catch(e){}
        hideLoginScreen();
        safeToast('✓ تم تسجيل الدخول واتصال المزامنة السحابية','tin');
        afterLoginSuccess();
        return;
      }
      throw new Error('بيانات الدخول غير صحيحة');
    }catch(cloudErr){
      // احتياطي: حساب الإدارة المحلي القديم (بدون مزامنة سحابية لطلبات الموظفين)
      var validLocalAdmin=false; /* V104 */
      if(validLocalAdmin){
        window.ARIBA_HR_TOKEN='local_admin_token';
        hideLoginScreen();
        safeToast('⚠ تم الدخول محليًا — تنبيه: طلبات الموظفين السحابية لن تظهر بهذا الحساب، سجّل دخول بحساب موظف حقيقي لرؤيتها','ter');
        return;
      }
      if(errEl){ errEl.textContent='❌ '+(cloudErr.message||'بيانات الدخول غير صحيحة'); errEl.style.display='block'; }
    }finally{
      if(btn) btn.disabled=false;
    }
  }
  window.aribaHrRealLogin=doHrLogin;

  function wireUI(){
    var btn=document.getElementById('LB'), pEl=document.getElementById('LP');
    if(btn && !btn.__ariba54Wired){ btn.__ariba54Wired=true; btn.addEventListener('click',doHrLogin); }
    if(pEl && !pEl.__ariba54Wired){ pEl.__ariba54Wired=true; pEl.addEventListener('keydown',function(ev){ if(ev.key==='Enter') doHrLogin(); }); }
  }

  function boot(){
    wireUI();
    // لو فيه توكن سحابي صالح محفوظ من قبل (مش التوكن المحلي القديم) شغّل التحديث الدوري على طول
    if(window.ARIBA_HR_TOKEN && window.ARIBA_HR_TOKEN!=='local_admin_token'){
      hideLoginScreen();
      afterLoginSuccess();
    }else if(!window.ARIBA_HR_TOKEN){
      // مفيش توكن خالص (أول مرة تفتح البرنامج، أو الجلسة السحابية انتهت) — اعرض شاشة الدخول
      showLoginScreen();
    }
    // لو دخل بالحساب المحلي القديم فقط، سيب الشاشة مخفية زي ما كانت (سلوك قديم بدون تغيير)
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
