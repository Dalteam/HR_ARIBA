
/* V130: الاستشاري والتمهير والتدريب غير خاضعين للتأمينات تلقائيا (إضافة فقط) */
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


  /* ===== V130: الاستشاري والتمهير والتدريب = غير خاضعين للتأمينات الاجتماعية تلقائيًا (المسير + بيانات الموظف + الحسبة) ===== */
  var KINDS={consultant:'استشاري',tamheer:'تمهير',trainee:'تدريب'};
  /* نوع الموظف من بياناته: wpsType الصريح أولًا، وبعدين من المسمى/القسم/جهة العمل */
  function kindOf(e){
    if(!e) return '';
    var w=String(e.wpsType||e.wps||'wps');
    if(w==='consultant'||w==='tamheer'||w==='trainee') return w;
    if(w!=='wps') return w;                                  /* external / no_wps / remote: برضه غير خاضعين (نفس قاعدة البرنامج الأصلية) */
    var job=String(e.jobTitle||e.job||e.jt||''), dep=String(e.department||e.dept||e.dep||''), emp=String(e.employer||e.em||''), typ=String(e.empType||''), cat=String(e.excelCategory||'');
    if(/تمهير/.test(emp)||/تمهير/.test(job)||/تمهير/.test(dep)) return 'tamheer';
    if(/استشاري|مستشار|استشاريه|استشارية/.test(job)||cat==='consultant'||/مهمة محددة/.test(typ)) return 'consultant';
    if(/متدرب|تدريب|trainee|intern/i.test(job)||/^\s*تدريب\s*$/.test(dep)||/تدريب/.test(emp)||/متدرب/.test(typ)) return 'trainee';
    return '';
  }
  window.ARIBA_INS_KIND=kindOf; window.ARIBA_INS_EXEMPT=function(e){ return !!kindOf(e); };
  var EX='غير خاضع';
  /* دوال التأمينات الأصلية: نفس الاسم ونفس الشكل، لكن بتعتبر النوع المشتق */
  window.noIns_wps=function(e){ return !!kindOf(e); };
  (function(){ var o=window.insStatusText; if(typeof o==='function'&&!o.__v130){ var g=function(e){ if(kindOf(e)) return EX; return o.apply(this,arguments); }; g.__v130=1; window.insStatusText=g; } })();
  (function(){ var o=window.calcIns; if(typeof o==='function'&&!o.__v130){ var g=function(e){ if(kindOf(e)) return {base:0,empAmt:0,erAmt:0,status:EX}; return o.apply(this,arguments); }; g.__v130=1; window.calcIns=g; } })();
  /* ---------- الحفظ: الموظف المشتق نوعه بيتخزن بنوعه (عشان يبان في بياناته وعلى السيرفر) ---------- */
  (function(){ var o=window.saveEmps; if(typeof o!=='function'||o.__v130) return;
    var g=function(d){ try{ if(Array.isArray(d)) d.forEach(function(e){ if(e&&(!e.wpsType||e.wpsType==='wps')){ var k=kindOf(Object.assign({},e,{wpsType:'wps'})); if(k&&k!=='wps'){ e.wpsType=k; if(e.insuranceSub) e.insuranceSub=0; if(e.insuranceComp) e.insuranceComp=0; } } }); }catch(x){} return o.apply(this,arguments); };
    g.__v130=1; window.saveEmps=g; })();
  /* ---------- فورم الموظف: النوع بيتظبط لوحده أول ما المسمى/القسم/جهة العمل يتكتبوا + معاينة الراتب بتقول "غير خاضع" ---------- */
  function formObj(f){ var v=function(n){ return (f.elements[n]&&f.elements[n].value)||''; }; return {wpsType:v('wpsType')||'wps',jobTitle:v('jt'),department:v('dep'),employer:v('em')}; }
  function syncForm(){
    var f=document.getElementById('EF2'); if(!f||!f.elements['wpsType']) return;
    var o=formObj(f); if(o.wpsType!=='wps') return;
    var k=kindOf(o); if(k&&k!=='wps'){ f.elements['wpsType'].value=k; try{ if(typeof window.cSP==='function') window.cSP(); }catch(e){} }
  }
  (function(){ var o=window.cSP; if(typeof o!=='function'||o.__v130) return;
    var g=function(){ var r=o.apply(this,arguments);
      try{ var f=document.getElementById('EF2'), sp=document.getElementById('SP'); if(!f||!sp) return r;
        var k=kindOf(formObj(f)); if(!k) return r;
        var cells=[].slice.call(sp.firstElementChild?sp.firstElementChild.children:[]); if(cells.length>=4){
          var gross=cells[0].children[1]?cells[0].children[1].textContent:'';
          [1,2].forEach(function(i){ var v=cells[i].children[1]; if(v){ v.textContent=EX; v.style.color='var(--mu)'; } });
          if(cells[3].children[1]) cells[3].children[1].textContent=gross;
        }
      }catch(e){} return r; };
    g.__v130=1; window.cSP=g; })();
  var wired=false;
  setInterval(function(){
    var f=document.getElementById('EF2'); if(!f||!f.elements['wpsType']){ wired=false; return; }
    if(!wired){ wired=true; ['jt','dep','em'].forEach(function(n){ var el=f.elements[n]; if(el){ el.addEventListener('input',syncForm); el.addEventListener('change',syncForm); } }); }
    syncForm();
  },700);
  /* مرة واحدة: نحدّث استقطاع التأمينات المحفوظ لكل الموظفين بعد القاعدة الجديدة */
  setTimeout(function(){ try{ if(!localStorage.getItem('ariba_v130_ins')&&typeof window.refreshInsuranceDependentViews==='function'&&(getEmps()||[]).length){ window.refreshInsuranceDependentViews(); localStorage.setItem('ariba_v130_ins','1'); } }catch(e){} },2500);
})();
