
/* V127: نسب التأمينات الاجتماعية على السحابة (إضافة فقط) */
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


  /* ===== V127: قواعد التأمينات الاجتماعية (الفترات) بتتحفظ في السحابة — كل الأجهزة بنفس النسب ===== */
  var KEY='insurance_rules';
  function tokenI(){ var t=window.ARIBA_HR_TOKEN||''; return UUID.test(t)?t:''; }
  function cur(){ try{ return getInsSettings(); }catch(e){ return null; } }
  function stamp(s){ if(s) s.__updated=Date.now(); return s; }
  var applying=false;
  async function push(){
    var t=tokenI(), s=cur(); if(!t||!s) return false;
    try{ var copy=JSON.parse(JSON.stringify(s)); if(!copy.__updated){ copy.__updated=Date.now(); }
      await rpc('ariba_hr_set_setting',{p_token:t,p_key:KEY,p_value:copy}); return true; }catch(e){ return false; }
  }
  /* لما نحفظ/نحذف فترة: نبصم وقت التعديل وندفع للسحابة */
  ['saveInsSettings','delInsRule'].forEach(function(nm){
    var o=window[nm]; if(typeof o!=='function'||o.__v127) return;
    var g=function(){ var r=o.apply(this,arguments); try{ var s=cur(); if(s){ stamp(s); dbS('insuranceRules',s); } }catch(e){} setTimeout(function(){ push().then(function(ok){ if(!ok&&tokenI()) notify(T('⚠️ نسب التأمينات اتحفظت محليًا بس','⚠️ Insurance rates saved locally only'),true); }); },50); return r; };
    g.__v127=1; window[nm]=g;
  });
  var pulled=false;
  async function pull(){
    var t=tokenI(); if(!t||pulled) return; pulled=true;
    try{
      var r=await rpc('ariba_hr_get_setting',{p_token:t,p_key:KEY}), v=r&&r.value, s=cur();
      if(v&&Array.isArray(v.effectiveRules)&&v.effectiveRules.length){
        if((Number(v.__updated)||0)>(Number(s&&s.__updated)||0)){ applying=true; dbS('insuranceRules',v); applying=false; try{ if(typeof refreshInsuranceDependentViews==='function') refreshInsuranceDependentViews(); }catch(e){} try{ if(document.getElementById('INS_CAP')&&typeof rInsSettings==='function') rInsSettings(); }catch(e){} try{ if(window.currentRows&&typeof window.renderPayroll==='function'&&!window.currentApproved) window.renderPayroll(window.currentRows,false,null); }catch(e){} }
        else if((Number(v.__updated)||0)<(Number(s&&s.__updated)||0)) push();
      } else if(s&&s.__updated) push();
    }catch(e){ pulled=false; }
  }
  setInterval(function(){ if(!pulled&&tokenI()) pull(); },1500);
})();
