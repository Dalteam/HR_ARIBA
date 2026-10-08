
/* V122: جهة العمل ومواقع العمل (من الموارد البشرية) في تطبيق الموظف (إضافة فقط) */
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


  /* ===== V122: تطبيق الموظف — جهة العمل + مواقع العمل (من الموارد البشرية) في الرئيسية وملفي ===== */
  function hav(a,b,c,d){ var R=6371000,r=Math.PI/180,x=Math.sin((c-a)*r/2),y=Math.sin((d-b)*r/2); return 2*R*Math.asin(Math.sqrt(x*x+Math.cos(a*r)*Math.cos(c*r)*y*y)); }
  function activeTab(){ var b=document.querySelector('.bnav .bni.on'); return b?b.id.replace('tb-',''):''; }
  function emp(){ return (window.ARIBA_CTX&&ARIBA_CTX.employee)||{}; }
  function assignedIds(){ var a=emp().workLocationIds; return Array.isArray(a)?a.filter(Boolean):[]; }
  function typeTag(l){ return l.type==='hq'?T('مقر رئيسي','Head office'):T('مشروع','Project'); }
  function statusOf(l){
    var zero=(Number(l.lat)===0&&Number(l.lng)===0);
    if(zero) return {cls:'bad',txt:T('إحداثيات غير مضبوطة','Coordinates not set')};
    if(!window.userLoc) return {cls:'',txt:T('نصف القطر ','Radius ')+(l.radius_m||200)+T(' م',' m')};
    var d=hav(userLoc.lat,userLoc.lng,Number(l.lat),Number(l.lng)), inside=d<=(Number(l.radius_m)||200);
    return {cls:inside?'ok':'',txt:inside?T('داخل النطاق ✓','Inside ✓'):(Math.round(d)>=1000?(d/1000).toFixed(1)+T(' كم',' km'):Math.round(d)+T(' م',' m'))};
  }
  var CSSL='.a22-row{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--bd)}.a22-row:last-child{border-bottom:0}.a22-ic{width:34px;height:34px;border-radius:11px;background:rgba(41,179,94,.15);color:#1f9a4f;display:grid;place-items:center;flex:none}.a22-nm{flex:1;min-width:0;font-weight:800;font-size:13px}.a22-tg{font-size:10px;background:rgba(1,77,61,.1);color:#014D3D;border-radius:999px;padding:2px 9px;font-weight:700}body.ariba-dark .a22-tg{background:rgba(228,228,188,.14);color:#E4E4BC}.a22-st{font-size:11px;color:var(--mu);font-weight:700;white-space:nowrap}.a22-st.ok{color:#1f9a4f}.a22-st.bad{color:#c0392b}.a22-emp{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:var(--mu)}.a22-emp b{color:var(--tx);font-size:13px}.a22-note{font-size:11px;color:var(--mu);line-height:1.7;margin:6px 0 2px}';
  var st=document.createElement('style'); st.id='ariba122-css'; st.textContent=CSSL; document.head.appendChild(st);
  var PIN='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';
  var lastSig='';
  function cardHtml(){
    var E=emp(), locs=((window.ME&&ME.locations)||[]).filter(function(l){ return l.type!=='remote'; }), assigned=assignedIds().length>0, er=(window.ME&&ME.employer)||E.employer||'—';
    var rows=locs.map(function(l){ var s=statusOf(l); return '<div class="a22-row"><div class="a22-ic">'+PIN+'</div><div class="a22-nm">'+esc(isEN()?(l.name_en||l.name):l.name)+'</div><span class="a22-tg">'+typeTag(l)+'</span><span class="a22-st '+s.cls+'">'+esc(s.txt)+'</span></div>'; }).join('');
    return '<div class="card-title">📍 '+T('جهة العمل ومواقع العمل','Employer & work locations')+'</div>'
      +'<div class="a22-emp"><span>'+T('جهة العمل','Employer')+':</span><b>'+esc(er)+'</b></div>'
      +(rows||'<div class="a22-note">'+T('لا يوجد موقع عمل','No work location')+'</div>')
      ;
  }
  function ensure(){
    try{
      var tab=activeTab(); if(tab!=='home'&&tab!=='prof') return;
      var root=document.getElementById('appContent'); if(!root||!window.ME) return;
      var sig=JSON.stringify([tab,((ME.locations||[]).map(function(l){ return [l.id,l.name,l.lat,l.lng,l.radius_m]; })),assignedIds(),ME.employer,isEN(),window.userLoc?[Math.round(userLoc.lat*2000),Math.round(userLoc.lng*2000)]:0]);
      var c=document.getElementById('a22Loc');
      if(c&&sig===lastSig) return;
      if(!c){ c=document.createElement('div'); c.id='a22Loc'; c.className='card'; root.appendChild(c); }
      else if(c.parentNode!==root) root.appendChild(c);
      c.innerHTML=cardHtml(); lastSig=sig;
    }catch(e){}
  }
  setInterval(ensure,1000);
})();
