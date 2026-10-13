
/* V116: إصلاح قائمة موظفي العمل الإضافي، توحيد كل الطلبات بدون تكرار، المخالصة الرسمية بدون إيموجي، زر الاعتماد النهائي (إضافة فقط) */
(function(){
  'use strict';
  var SUPA='https://iwviydmapqpqihcdazpe.supabase.co', KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isEN(){
    try{ if(typeof window.ARIBA_UI_LANG==='function') return window.ARIBA_UI_LANG()==='en'; }catch(e){}
    try{ return (typeof LANG!=='undefined' && LANG==='en'); }catch(e){}
    return false;
  }
  function T(ar,en){ return isEN()?en:ar; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function token(){ return window.ARIBA_HR_TOKEN || window.ARIBA_SESSION || ''; }
  function notify(msg,isErr){
    try{ if(typeof window.toast==='function'){ window.toast(msg, isErr?'ter':'tin'); return; } }catch(e){}
    alert(msg);
  }
  function rpc(fn,args){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); x.open('POST',SUPA+'/rest/v1/rpc/'+fn);
      x.setRequestHeader('apikey',KEY); x.setRequestHeader('Authorization','Bearer '+KEY); x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){ var d=null; try{ d=JSON.parse(x.responseText||'null'); }catch(e){}
        if(x.status>=200&&x.status<300) res(d); else rej(new Error((d&&(d.message||d.hint))||('HTTP '+x.status))); };
      x.onerror=function(){ rej(new Error(T('تعذر الاتصال بالإنترنت','Cannot connect to the internet'))); };
      x.send(JSON.stringify(args||{}));
    });
  }
  var INP='width:100%;box-sizing:border-box;padding:10px;margin-bottom:8px;border:1px solid #ccc;border-radius:8px;font-size:14px;background:#fff;color:#111';
  function overlay(id){
    var w=document.createElement('div'); w.id=id;
    w.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Tahoma,Arial,sans-serif';
    w.dir=isEN()?'ltr':'rtl';
    return w;
  }
  function closeOn(w){
    function esc_(e){ if(e.key==='Escape'){ kill(); } }
    function kill(){ document.removeEventListener('keydown',esc_); if(w.parentNode) w.parentNode.removeChild(w); }
    document.addEventListener('keydown',esc_);
    w.addEventListener('mousedown',function(e){ if(e.target===w) kill(); });
    return kill;
  }

  /* ===== 1) esc غير معرّفة في البرنامج → كانت بتوقف تجهيز قائمة موظفي "العمل الإضافي" ===== */
  if(typeof window.esc!=='function'){ window.esc=function(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }; }
  (function(){
    var prev=window.populateHrOvertimeForm;
    /* لو القائمة فاضية بعد التجهيز الأصلي، نعيد تجهيزها تاني (حالة تحميل الموظفين متأخر) */
    setInterval(function(){
      try{
        var sel=document.getElementById('HR_OT_EMP');
        if(sel && sel.options.length<=1 && typeof window.populateHrOvertimeForm==='function' && typeof getEmps==='function' && getEmps().length) window.populateHrOvertimeForm();
      }catch(e){}
    },1500);
  })();

  /* ===== 2) كل الطلبات: صندوق سحابي واحد بدون تكرار، وبدون الطلبات المعروضة فعلاً في الجدول فوق ===== */
  var TYPE_EX={forgot_punch:'نسيان بصمة',overtime:'عمل إضافي'};
  var STAGE={manager:'بانتظار المدير المباشر',hr:'بانتظار الموارد البشرية',ceo:'بانتظار الرئيس التنفيذي'};
  function typeAr(t){ try{ if(typeof LVL==='object'&&LVL[t]&&LVL[t].ar) return LVL[t].ar; }catch(e){} return TYPE_EX[t]||t; }
  function detail(r){
    var p=r.payload||{};
    if(p.from) return window.esc(p.from+' ← '+(p.to||p.from)+(p.days?' | '+p.days+' يوم':''));
    if(r.request_type==='overtime') return window.esc((p.date||'')+(p.hours?' | '+p.hours+' ساعة':''));
    if(r.request_type==='forgot_punch') return window.esc((p.date||'')+' '+String(p.time||'').slice(0,5)+(p.time2?' ← '+String(p.time2).slice(0,5):''));
    return window.esc((p.date||'')+(p.amount?' | '+Number(p.amount).toLocaleString('en-US')+' ر.س':''));
  }
  var lastSig=null;
  function normAll(){
    try{
      var lat=document.getElementById('LAT'); if(!lat||!lat.parentNode) return;
      var parent=lat.parentNode, changed=false;
      /* صناديق Workflow Requests المكررة (نفس الطلبات موجودة في القائمة السحابية) */
      document.querySelectorAll('.ct').forEach(function(t){ if(t.textContent.trim().slice(-17)==='Workflow Requests'){ var c=t.closest('.card'); if(c && !c.querySelector('#LAT') && !c.contains(lat)){ c.remove(); changed=true; } } });
      /* صندوق السحابة القديم (V67) نستبدله بصندوق واحد */
      document.querySelectorAll('#v67CloudAllBox').forEach(function(c){ c.remove(); changed=true; });
      var ef=(document.getElementById('LFE')||{}).value||'', tf=(document.getElementById('LFT')||{}).value||'', sf=(document.getElementById('LFS')||{}).value||'';
      var shown={}; try{ getLvs().forEach(function(l){ if(l.workflowRequestId) shown[String(l.workflowRequestId)]=1; }); }catch(e){}
      var all=(window.ARIBA_ALL_CLOUD_REQUESTS&&window.ARIBA_ALL_CLOUD_REQUESTS.length)?window.ARIBA_ALL_CLOUD_REQUESTS:(window.ARIBA_WORKFLOW_QUEUE||[]);
      var list=all.filter(function(x){
        var r=x.request||{}, e=x.employee||{}, eid=String(r.employee_id||e.id||''), st=String(r.status||'pending').toLowerCase();
        if(shown[String(r.id)]) return false;
        if(ef && eid!==String(ef)) return false;
        if(tf && r.request_type!==tf) return false;
        if(sf && st!==sf) return false;
        return true;
      });
      var sig=JSON.stringify(list.map(function(x){ var r=x.request||{}; return [r.id,r.status,r.current_stage]; }));
      var mine=document.getElementById('ariba116AllCloud');
      if(mine && sig===lastSig && !changed) return;
      if(mine) mine.remove();
      lastSig=sig;
      if(!list.length) return;
      var stB={pending:'<span class="b ba">معلق</span>',approved:'<span class="b bg">موافق</span>',rejected:'<span class="b br">مرفوض</span>'};
      var rows=list.map(function(x){
        var r=x.request||{}, e=x.employee||{}, st=String(r.status||'pending').toLowerCase();
        var name=(e.nameAr||e.nameEn||r.employee_id||'—').split(' ').slice(0,3).join(' ');
        return '<tr data-rid="'+window.esc(r.id)+'"><td style="font-weight:600">'+window.esc(name)+'</td><td>'+window.esc(typeAr(r.request_type))+'</td><td>'+detail(r)+'</td><td>'+(st==='pending'?window.esc(STAGE[r.current_stage]||'معلق'):'')+'</td><td>'+(stB[st]||window.esc(st))+'</td><td><button type="button" class="btn bsm" data-a24del="'+window.esc(r.id)+'" data-st="'+window.esc(st)+'" data-lbl="'+window.esc(name+' — '+typeAr(r.request_type))+'" style="background:transparent;color:#e5484d;border:1px solid #e5484d" title="حذف">🗑</button></td></tr>';
      }).join('');
      var box=document.createElement('div'); box.id='ariba116AllCloud'; box.className='card'; box.style.marginTop='12px';
      box.innerHTML='<div class="ct" style="padding:10px 12px">طلبات أخرى من تطبيق الموظف</div><div class="tw"><table><tr><th>الموظف</th><th>النوع</th><th>التفاصيل</th><th>المرحلة</th><th>الحالة</th><th></th></tr>'+rows+'</table></div>';
      var host=lat.closest('.card')||lat.parentNode; host.parentNode.insertBefore(box, host.nextSibling);
    }catch(e){ window.__v116err=String(e&&e.stack||e); }
  }
  (function(){
    var lat=document.getElementById('LAT');
    function hook(){
      var l=document.getElementById('LAT'); if(!l||!l.parentNode||l.__v116) return;
      l.__v116=1;
      try{ var obs=new MutationObserver(function(){ normAll(); }); obs.observe(l.parentNode,{childList:true}); var cd=l.closest('.card'); if(cd&&cd.parentNode) obs.observe(cd.parentNode,{childList:true}); }catch(e){}
    }
    hook(); setInterval(function(){ hook(); normAll(); },1000);
    ['LFE','LFT','LFS'].forEach(function(id){ var el=document.getElementById(id); if(el) el.addEventListener('change',function(){ setTimeout(normAll,400); }); });
  })();

  /* ===== 3) المخالصة الرسمية: بدون إيموجي ===== */
  var EMO=/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  function cleanDoc(h){
    return String(h).replace(EMO,'').replace(/>[ \t]+/g,'>');
  }
  (function(){
    var orig=window.aribaPrintOfficialSettlement; if(typeof orig!=='function') return;
    window.aribaPrintOfficialSettlement=function(){
      var ph=window.printHtml;
      window.printHtml=function(t,h){ return ph.call(this,t,cleanDoc(h)); };
      try{ return orig.apply(this,arguments); } finally{ window.printHtml=ph; }
    };
  })();

  /* ===== 4) زر "اعتماد نهائي" في الطلبات المعلقة (يمرر كل المراحل المتبقية بالنيابة ويسجّلها) ===== */
  function addFinal(){
    try{
      var box=document.getElementById('LVP'); if(!box) return;
      box.querySelectorAll('button[onclick*="ariba62Approve"]').forEach(function(ap){
        if(ap.getAttribute('data-v116f')==='1') return;
        var it=null; try{ it=JSON.parse(ap.getAttribute('data-item')||'null'); }catch(e){}
        var r=(it&&it.request)||{}; if(!r.id) return;
        ap.setAttribute('data-v116f','1');
        if(r.status && r.status!=='pending') return;
        if(r.current_stage!=='manager' && r.current_stage!=='hr') return;   /* مرحلة الرئيس: الموافقة العادية نهائية أصلاً */
        var nb=document.createElement('button'); nb.type='button'; nb.className=ap.className; nb.setAttribute('style',(ap.getAttribute('style')||'')+';background:#0a5c9e;color:#fff;margin-inline-start:4px');
        nb.textContent='اعتماد نهائي'; nb.title='اعتماد الطلب نهائياً بالنيابة عن كل المراحل المتبقية';
        nb.onclick=async function(){
          var t=window.ARIBA_HR_TOKEN||'';
          if(!UUID.test(t)){ notify('لازم تكون داخل بحسابك السحابي',true); return; }
          if(!confirm('هيتم اعتماد الطلب نهائياً بالنيابة عن كل المراحل المتبقية (المدير المباشر / الموارد البشرية / الرئيس التنفيذي) وهيتسجل في السجل إنه اعتماد بالنيابة. متأكد؟')) return;
          var reason=prompt('ملاحظة الاعتماد (اختياري):'); if(reason===null) return;
          nb.disabled=true; var old=nb.textContent; nb.textContent='جاري الاعتماد…';
          try{
            await rpc('ariba_hr_final_approve',{p_token:t,p_request_id:r.id,p_reason:reason||'اعتماد نهائي من الموارد البشرية'});
            notify('✓ تم الاعتماد النهائي للطلب',false);
            try{ if(typeof window.loadWorkflowQueue==='function') await window.loadWorkflowQueue(); }catch(e){}
            try{ if(typeof window.rLvPend==='function') window.rLvPend(); }catch(e){}
            try{ if(typeof window.rAllLv==='function') window.rAllLv(); }catch(e){}
            try{ if(typeof window.rLvBal==='function') window.rLvBal(); }catch(e){}
          }catch(e){ notify(e.message||'تعذر الاعتماد',true); nb.disabled=false; nb.textContent=old; }
        };
        ap.parentNode.insertBefore(nb, ap.nextSibling);
      });
    }catch(e){}
  }
  setInterval(addFinal,800);
})();
