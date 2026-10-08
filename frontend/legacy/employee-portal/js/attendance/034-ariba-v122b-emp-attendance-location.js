
/* V122b: حالة الموقع في تبويب الحضور من مواقع الموظف المحددة (إضافة فقط) */
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


  /* ===== V122b: حالة الموقع في تبويب الحضور بقت من مواقع الموظف (السيرفر) مش من تخزين المتصفح القديم ===== */
  function hav(a,b,c,d){ var R=6371000,r=Math.PI/180,x=Math.sin((c-a)*r/2),y=Math.sin((d-b)*r/2); return 2*R*Math.asin(Math.sqrt(x*x+Math.cos(a*r)*Math.cos(c*r)*y*y)); }
  var LAST=null;
  function badge(){ var b=document.querySelector('.loc-badge'); return b?{b:b,dot:b.querySelector('.loc-dot')||document.getElementById('locDot'),txt:b.querySelector('span')||document.getElementById('locTxt')}:null; }
  function apply(){ if(!LAST) return; var o=badge(); if(!o) return; if(o.dot) o.dot.style.background=LAST.dot; if(o.txt&&o.txt.textContent!==LAST.text){ o.txt.textContent=LAST.text; o.txt.style.color=LAST.color; } }
  function paint(dotColor,text,txtColor){ LAST={dot:dotColor,text:text,color:txtColor}; apply(); }
  function nm(l){ return isEN()?(l.name_en||l.name):l.name; }
  window.detectLoc=function(){
    if(!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function(pos){
      var la=pos.coords.latitude, ln=pos.coords.longitude; window.userLoc={lat:la,lng:ln};
      var ALL=((window.ME&&ME.locations)||[]).filter(function(l){ return l&&l.type!=='remote'&&l.lat!=null&&l.lng!=null; });
      var L=ALL.filter(function(l){ return !(Number(l.lat)===0&&Number(l.lng)===0); });
      if(!ALL.length){ window.nearLoc=null; paint('var(--am)','⚠️ '+T('لا يوجد موقع عمل','No work location'),'var(--am)'); return; }
      if(!L.length){ window.nearLoc=null; paint('var(--am)','⚠️ '+T('إحداثيات موقع عملك غير مضبوطة','Your work location coordinates are not set'),'var(--am)'); return; }
      var best=null, bd=Infinity; L.forEach(function(l){ var d=hav(la,ln,Number(l.lat),Number(l.lng)); if(d<bd){ bd=d; best=l; } });
      var inside=bd<=(Number(best.radius_m)||200);
      if(inside){ window.nearLoc={id:best.id,name:best.name,type:best.type||'office'}; paint('var(--gr)','📍 '+nm(best),'var(--gr)'); }
      else { window.nearLoc=null; paint('var(--rd)','❌ '+T('خارج النطاق — أقرب موقع ','Outside — nearest ')+nm(best)+' ('+(bd>=1000?(bd/1000).toFixed(1)+T(' كم',' km'):Math.round(bd)+T(' م',' m'))+')','var(--rd)'); }
    },function(e){
      window.nearLoc=null; paint('var(--rd)','❌ '+((e&&e.code===1)?T('فعّل صلاحية الموقع','Allow location access'):T('تعذر تحديد الموقع','Unable to detect location')),'var(--rd)');
    },{enableHighAccuracy:true,maximumAge:15000,timeout:12000});
  };
  /* الشريط الفعلي في شاشة الحضور بيتكتب فيه نص عام من كود السحابة؛ بنرجّع نتيجة مواقع الموظف فوقه، ونعيد الحساب لما المواقع أو الشريط يتغيروا */
  var lastSig='', lastBadgeEl=null, lastRun=0;
  setInterval(function(){
    try{
      var o=badge(); if(!o){ lastBadgeEl=null; return; }
      var sig=JSON.stringify(((window.ME&&ME.locations)||[]).map(function(l){ return [l.id,l.lat,l.lng,l.radius_m,l.name]; }))+isEN();
      if(o.b!==lastBadgeEl||sig!==lastSig||Date.now()-lastRun>15000){ lastBadgeEl=o.b; lastSig=sig; lastRun=Date.now(); window.detectLoc(); }
      apply();
    }catch(e){}
  },800);
})();
