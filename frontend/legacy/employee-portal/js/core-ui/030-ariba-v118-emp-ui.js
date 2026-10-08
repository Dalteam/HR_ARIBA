
/* V118: واجهة تطبيق الموظف — بصمة مباشرة من الرئيسية + شكل أشيك بنفس الألوان + علامة الشركة في خلفية البطاقة (إضافة فقط) */
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


  /* ================= V118: واجهة تطبيق الموظف — بصمة مباشرة من الرئيسية + شكل أشيك (نفس الألوان) ================= */
  var SVG={
    mark:'<svg viewBox="0 0 105 110" width="64" height="67" aria-hidden="true" style="display:block;filter:drop-shadow(0 3px 5px rgba(0,0,0,.22))"><defs><linearGradient id="a8mg" gradientUnits="userSpaceOnUse" x1="5" y1="0" x2="68" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".78"/><stop offset="1" stop-color="#fff" stop-opacity=".52"/></linearGradient></defs><polygon points="5,39 100,4 100,33 5,68" fill="#fff"/><polygon points="5,70 43,55 100,77 100,106" fill="url(#a8mg)"/></svg>',
    finger:'<svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11c0 3.5-.5 6-2 8.5"/><path d="M8.5 8.2A4.5 4.5 0 0 1 16.5 11c0 2.2-.2 4.6-1.3 7"/><path d="M5.3 10.5a7 7 0 0 1 13.4-.5"/><path d="M3.6 15.5A13 13 0 0 1 3 12a9 9 0 0 1 18 0c0 1.4-.1 2.8-.4 4.1"/><path d="M12 11v1.5c0 2-.4 4-1.1 5.8"/></svg>',
    out:'<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
    check:'<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/></svg>',
    pin:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    flag:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>',
    home:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    att:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    lv:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    pay:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/></svg>',
    team:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2A5 5 0 0 1 21 19"/></svg>',
    prof:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    ot:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/></svg>',
    docs:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    key:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/></svg>',
    logout:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    leave:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-6 7 6v11"/><path d="M9 21v-5h6v5"/></svg>',
    wallet:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h12v4"/><path d="M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14" r="1.2"/></svg>'
  };
  /* ---------- CSS: نفس الألوان، شكل أنعم ---------- */
  var CSS='\
  body .hdr{padding:10px 14px!important;gap:8px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(1,77,61,.10)!important;box-shadow:0 2px 14px rgba(1,77,61,.06)}\
  body .hdr-title{font-size:17px!important;font-weight:800!important;letter-spacing:.2px}\
  body .hdr-user{gap:6px!important}\
  body .hdr #userNameHdr{display:none}\
  body .hdr .ariba-top-actions{margin:0!important;gap:6px!important}\
  body .hdr button{font-family:inherit}\
  .a8-ib{width:36px;height:36px;border-radius:12px!important;border:1px solid var(--bd)!important;background:var(--c2)!important;color:var(--tx)!important;display:inline-grid!important;place-items:center;padding:0!important;cursor:pointer;transition:transform .15s,background .2s}\
  .a8-ib:active{transform:scale(.92)}\
  body .hdr .ariba-mode-btn,body .hdr #aribaLangBtn{min-width:36px;height:36px;border-radius:12px!important;padding:0 10px!important;font-size:11px!important;font-weight:800!important}\
  body #ARIBA_MANUAL_REFRESH_EMP{width:36px;height:36px;padding:0!important;border-radius:12px!important;display:inline-grid!important;place-items:center;background:#014D3D!important;color:#fff!important;border:0!important;box-shadow:none!important}\
  body #ARIBA_MANUAL_REFRESH_EMP span,body #ARIBA_MANUAL_REFRESH_EMP i{display:none!important}\
  body #ARIBA_MANUAL_REFRESH_EMP.busy svg{animation:a8spin 1s linear infinite}\
  body.ariba-dark #ARIBA_MANUAL_REFRESH_EMP{background:#29B35E!important;color:#013D31!important}\
  @keyframes a8spin{to{transform:rotate(360deg)}}\
  body .content{padding:14px 14px 96px!important}\
  body .card{border-radius:22px!important;padding:16px!important;border:1px solid rgba(1,77,61,.08)!important;box-shadow:0 8px 24px rgba(1,77,61,.07)!important;margin-bottom:14px!important}\
  body.ariba-dark .card{border-color:rgba(255,255,255,.08)!important;box-shadow:0 8px 24px rgba(0,0,0,.2)!important}\
  body .card-title{font-size:14px!important;font-weight:800!important;margin-bottom:12px!important}\
  body .btn{border-radius:14px!important;padding:12px 16px!important;font-weight:800!important;box-shadow:0 6px 16px rgba(1,77,61,.14)}\
  body .btn:active{transform:scale(.98)}\
  body .kpi{border-radius:16px!important}\
  /* الشريط السفلي: عائم، بأيقونات، وتبويب نشط واضح */\
  body .bnav{left:10px!important;right:10px!important;bottom:10px!important;border-radius:24px!important;border:1px solid rgba(1,77,61,.10)!important;box-shadow:0 12px 34px rgba(1,77,61,.18)!important;padding:6px 4px!important;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;gap:2px}\
  body .bnav::-webkit-scrollbar{display:none}\
  body .bni{flex:1 0 62px!important;min-width:62px;padding:7px 4px 6px!important;border-radius:18px!important;font-size:10px!important;font-weight:700!important;gap:3px!important;position:relative;transition:background .2s,color .2s}\
  body .bni svg{display:block;transition:transform .2s}\
  body .bni span{white-space:nowrap}\
  body.ariba-light .bni.on{background:rgba(1,77,61,.10)!important;color:#014D3D!important}\
  body.ariba-dark .bni.on{background:rgba(41,179,94,.20)!important;color:#29B35E!important}\
  body .bni.on svg{transform:translateY(-1px) scale(1.08)}\
  /* بطاقة البصمة — نهاري: بيج + أخضر / ليلي: أخضر الثيم + بيج */\
  .a8-hero{position:relative;border-radius:30px;padding:16px 16px 18px;margin-bottom:14px;overflow:hidden;color:#014D3D;background:linear-gradient(165deg,#FBF8EF 0%,#F0EAD8 100%);border:1px solid rgba(1,77,61,.12);box-shadow:0 14px 34px rgba(1,77,61,.12)}\
  body.ariba-dark .a8-hero{color:#E4E4BC;background:linear-gradient(165deg,#075444 0%,#013D31 100%);border:1px solid rgba(228,228,188,.16);box-shadow:0 14px 34px rgba(0,0,0,.28)}\
  .a8-top{position:relative;z-index:1;display:flex;align-items:center;gap:11px}\
  .a8-av{width:44px;height:44px;border-radius:50%;flex:none;background:#014D3D;color:#fff;border:2px solid rgba(1,77,61,.22);display:grid;place-items:center;font-weight:800;font-size:18px;overflow:hidden}\
  body.ariba-dark .a8-av{background:rgba(228,228,188,.14);color:#E4E4BC;border-color:rgba(228,228,188,.4)}\
  .a8-av img{width:100%;height:100%;object-fit:cover;display:block}\
  .a8-hello{font-size:12px;opacity:.78;line-height:1.3}\
  .a8-name{font-size:17px;font-weight:800;line-height:1.3}\
  .a8-clock{position:relative;z-index:1;margin-top:10px;text-align:center;font-size:36px;font-weight:800;letter-spacing:1.5px;font-variant-numeric:tabular-nums;direction:ltr;color:#014D3D}\
  body.ariba-dark .a8-clock{color:#fff}\
  .a8-clock small{font-size:14px;font-weight:700;opacity:.75;margin-inline-start:6px;letter-spacing:0}\
  .a8-date{position:relative;z-index:1;text-align:center;font-size:12px;opacity:.78}\
  .a8-pw{position:relative;z-index:1;width:184px;height:184px;margin:10px auto 4px}\
  .a8-wm{position:absolute;left:50%;top:50%;width:250px;height:262px;margin:-131px 0 0 -125px;z-index:0;pointer-events:none;opacity:.22}\
  body.ariba-dark .a8-wm{opacity:.15}\
  .a8-wm .u{fill:#014D3D}.a8-wm .l{fill:#29B35E}\
  body.ariba-dark .a8-wm .u{fill:#E4E4BC}body.ariba-dark .a8-wm .l{fill:#E4E4BC;fill-opacity:.55}\
  .a8-ring{position:absolute;inset:0;transform:rotate(-90deg);z-index:1}\
  .a8-ring circle{fill:none;stroke-width:6;stroke-linecap:round}\
  .a8-ring .bg{stroke:rgba(1,77,61,.14)}\
  body.ariba-dark .a8-ring .bg{stroke:rgba(228,228,188,.2)}\
  .a8-ring .fg{stroke:#29B35E;transition:stroke-dashoffset .8s ease}\
  .a8-btn{position:absolute;inset:16px;z-index:2;border-radius:50%;border:0;color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-family:inherit;font-size:15px;font-weight:800;background:radial-gradient(circle at 30% 24%,#4bdc86,#29B35E 58%,#1d9a4c);box-shadow:0 12px 28px rgba(1,77,61,.32),inset 0 2px 8px rgba(255,255,255,.38);transition:transform .15s,filter .2s;-webkit-tap-highlight-color:transparent}\
  .a8-btn:active{transform:scale(.95)}\
  .a8-btn.out{background:radial-gradient(circle at 30% 24%,#dc7777,#B54A4A 58%,#9a3b3b)}\
  .a8-btn.done{background:radial-gradient(circle at 30% 24%,#7fb3a3,#4f8c7a 58%,#3f7565);cursor:default}\
  .a8-btn.busy{filter:saturate(.7) brightness(.92);pointer-events:none}\
  .a8-btn.busy:before{content:"";position:absolute;inset:-6px;border-radius:50%;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:a8spin .9s linear infinite}\
  .a8-btn:not(.done):not(.busy):after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid rgba(41,179,94,.55);animation:a8pulse 2.2s ease-out infinite;pointer-events:none}\
  @keyframes a8pulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.28);opacity:0}}\
  .a8-btn span{font-size:13.5px;line-height:1.2;text-align:center;padding:0 8px}\
  .a8-btn.ok{animation:a8ok .6s ease}\
  @keyframes a8ok{0%{transform:scale(.9)}50%{transform:scale(1.06)}100%{transform:scale(1)}}\
  .a8-chips{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin-top:6px}\
  .a8-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(1,77,61,.07);border:1px solid rgba(1,77,61,.16);color:#014D3D;border-radius:999px;padding:6px 11px;font-size:11.5px;font-weight:700;max-width:100%}\
  .a8-chip.ok{background:rgba(41,179,94,.16);border-color:rgba(41,179,94,.45)}\
  .a8-chip.bad{background:rgba(181,74,74,.12);border-color:rgba(181,74,74,.4);color:#8f3636}\
  body.ariba-dark .a8-chip{background:rgba(228,228,188,.12);border-color:rgba(228,228,188,.22);color:#E4E4BC}\
  body.ariba-dark .a8-chip.ok{background:rgba(41,179,94,.22);border-color:rgba(41,179,94,.55)}\
  body.ariba-dark .a8-chip.bad{background:rgba(240,122,122,.2);border-color:rgba(240,122,122,.5);color:#ffd2d2}\
  .a8-chip .d{width:7px;height:7px;border-radius:50%;background:#c9a24a;flex:none}\
  .a8-chip.ok .d{background:#29B35E}.a8-chip.bad .d{background:#d96b6b}\
  .a8-sess{position:relative;z-index:1;margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center}\
  .a8-s{background:rgba(1,77,61,.08);color:#014D3D;border-radius:8px;padding:3px 9px;font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}\
  body.ariba-dark .a8-s{background:rgba(0,0,0,.2);color:#E4E4BC}\
  .a8-back{position:relative;z-index:1;display:block;margin:8px auto 0;background:rgba(1,77,61,.08);border:1px solid rgba(1,77,61,.25);color:#014D3D;border-radius:999px;padding:8px 16px;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer}\
  body.ariba-dark .a8-back{background:rgba(228,228,188,.14);border-color:rgba(228,228,188,.3);color:#E4E4BC}\
  .a8-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}\
  .a8-tile{background:var(--c);border:1px solid rgba(1,77,61,.08);border-radius:20px;padding:12px 8px;text-align:center;box-shadow:0 6px 18px rgba(1,77,61,.06)}\
  body.ariba-dark .a8-tile{border-color:rgba(255,255,255,.08)}\
  .a8-tile .v{font-size:22px;font-weight:800;line-height:1.1;margin-top:4px;font-variant-numeric:tabular-nums}\
  .a8-tile .l{font-size:10.5px;color:var(--mu);margin-top:2px;line-height:1.3}\
  .a8-tile .ic{width:34px;height:34px;border-radius:12px;margin:0 auto;display:grid;place-items:center;background:rgba(41,179,94,.14);color:#29B35E}\
  .a8-qa{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}\
  .a8-q{background:var(--c);border:1px solid rgba(1,77,61,.08);border-radius:20px;padding:12px 4px 10px;text-align:center;cursor:pointer;font-family:inherit;color:var(--tx);box-shadow:0 6px 18px rgba(1,77,61,.06);transition:transform .15s}\
  body.ariba-dark .a8-q{border-color:rgba(255,255,255,.08)}\
  .a8-q:active{transform:scale(.95)}\
  .a8-q .ic{width:40px;height:40px;border-radius:14px;margin:0 auto 6px;display:grid;place-items:center;background:rgba(1,77,61,.09);color:#014D3D}\
  body.ariba-dark .a8-q .ic{background:rgba(41,179,94,.18);color:#29B35E}\
  .a8-q span{font-size:11px;font-weight:800;line-height:1.25;display:block}\
  /* بطاقة الموظف الأصلية: بنخفي سطر الاسم المكرر ونسيب باقي البيانات */\
  .a8-hide-dup{display:none!important}\
  .a8-sec{font-size:12px;font-weight:800;color:var(--mu);margin:2px 4px 8px}';
  var st=document.createElement('style'); st.id='ariba118-ui-css'; st.textContent=CSS; document.head.appendChild(st);

  /* ---------- أدوات ---------- */
  function riyadhNow(){ var p={}; new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date()).forEach(function(x){ p[x.type]=x.value; }); if(p.hour==='24') p.hour='00'; return {date:p.year+'-'+p.month+'-'+p.day,h:+p.hour,m:+p.minute,s:+p.second}; }
  function secs(t){ if(!t) return null; var a=String(t).split(':'); return (+a[0])*3600+(+a[1]||0)*60+(parseFloat(a[2])||0); }
  function hm(t){ return t?String(t).slice(0,5):''; }
  function fmtHM(sec){ sec=Math.max(0,Math.floor(sec)); var h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60); return h+T('س ','h ')+('0'+m).slice(-2)+T('د','m'); }
  function dOf(a){ return String(a.attendance_date||a.date||'').slice(0,10); }
  function nameOf(){ var n=isEN()?(ME&&(ME.name_en||ME.nameEn)):(ME&&ME.name); if(!n&&ME) n=ME.name||''; if(isEN()&&n&&/[\u0600-\u06FF]/.test(n)&&window.ARIBA_TR) n=window.ARIBA_TR(n); return String(n||'').trim(); }
  /* الاسم: الاسم الأول + اسم العائلة (الأخير) — مع مراعاة الأسماء المركبة زي "عبد الله" */
  function shortName(n){
    var t=String(n||'').trim().split(/\s+/).filter(Boolean); if(t.length<=1) return t[0]||'';
    var first=t[0]; if(/^(عبد|عبدال|أبو|ابو|أم|ام|Abdul|Abd|Abu|Umm)$/i.test(first)&&t.length>2) first=t[0]+' '+t[1];
    var last=t[t.length-1]; if(first.indexOf(' ')>0&&t.length<=2) return first;
    return first+' '+last;
  }
  function greet(h){ if(h<12) return T('صباح الخير','Good morning'); if(h<17) return T('مساء الخير','Good afternoon'); return T('مساء الخير','Good evening'); }
  function esc2(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /* ---------- حالة اليوم من سجلات السيرفر (كل الجلسات) ---------- */
  function todayState(){
    var d=riyadhNow().date, rows=((window.ME&&ME.attendance)||[]).filter(function(a){ return dOf(a)===d && a.time_in; }).sort(function(a,b){ return String(a.time_in).localeCompare(String(b.time_in)); });
    var n=rows.length, open=rows.filter(function(r){ return !r.time_out; }).pop();
    var outs=rows.filter(function(r){ return r.time_out; }).map(function(r){ return String(r.time_out); }).sort(), lastOut=outs.length?outs[outs.length-1]:'';
    var closedSec=0; rows.forEach(function(r){ if(r.time_out){ var x=secs(r.time_out)-secs(r.time_in); if(x>0) closedSec+=x; } });
    return {rows:rows,n:n,open:open,firstIn:n?rows[0].time_in:'',lastOut:lastOut,closedSec:closedSec,late:n&&rows[0].status==='late'};
  }
  /* ---------- إعدادات الدوام (للانصراف المتوقع) ---------- */
  var SET=null, setLoading=false, SETAT=0;
  function applyRemote(){ try{ if(SET&&SET.remote_days_per_year!=null&&window.ME&&isFinite(Number(SET.remote_days_per_year))) ME.remote_limit=Number(SET.remote_days_per_year); }catch(x){} }
  function loadSettings(){
    if(setLoading||!window.ARIBA_SESSION) return; if(SET&&Date.now()-SETAT<60000) return; setLoading=true;
    rpc('ariba_get_attendance_settings',{p_token:window.ARIBA_SESSION}).then(function(r){ SET=r||{}; SETAT=Date.now(); applyRemote(); }).catch(function(){ if(!SET) SET={}; SETAT=Date.now(); }).then(function(){ setLoading=false; paint(); });
  }
  function expectedOut(S){
    if(!SET||!SET.flexible_enabled||!S.firstIn) return null;
    var sh=Number(SET.shift_hours)||8, e=secs(S.firstIn)+sh*3600;
    if(S.late&&SET.flex_window_end) e=Math.min(e,secs(SET.flex_window_end));
    return {sec:e,shift:sh*3600};
  }
  /* ---------- الموقع ---------- */
  var LOC={state:'idle',text:'',near:null,dist:null,t:0,watchTimer:null};
  function hav(a,b,c,d){ var R=6371000,r=Math.PI/180,x=Math.sin((c-a)*r/2),y=Math.sin((d-b)*r/2); return 2*R*Math.asin(Math.sqrt(x*x+Math.cos(a*r)*Math.cos(c*r)*y*y)); }
  function evalLoc(){
    var ALL=((window.ME&&ME.locations)||[]).filter(function(l){ return l.type!=='remote'&&l.lat!=null&&l.lng!=null; });
    var L=ALL.filter(function(l){ return !(Number(l.lat)===0&&Number(l.lng)===0); });
    if(ALL.length&&!L.length){ LOC={state:'out',text:T('إحداثيات موقع عملك غير مضبوطة','Your work location coordinates are not set')}; return; }
    if(!window.userLoc){ return; }
    if(!L.length){ LOC={state:'gps',text:T('تم تحديد موقعك','Location detected')}; return; }
    var best=null,bd=1e12; L.forEach(function(l){ var d=hav(userLoc.lat,userLoc.lng,+l.lat,+l.lng); if(d<bd){ bd=d; best=l; } });
    var inside=bd<=(+best.radius_m||200), nm=isEN()?(best.name_en||best.name):best.name;
    LOC={state:inside?'in':'out',text:inside?(T('داخل نطاق: ','Inside: ')+nm):(T('خارج النطاق — أقرب موقع ','Outside — nearest ')+nm+' ('+Math.round(bd)+T(' م',' m')+')')};
  }
  function pollLoc(){
    if(!navigator.geolocation){ LOC={state:'na',text:T('الموقع غير مدعوم في هذا الجهاز','Location is not supported')}; paint(); return; }
    navigator.geolocation.getCurrentPosition(function(p){ window.userLoc={lat:p.coords.latitude,lng:p.coords.longitude}; evalLoc(); paint(); },function(e){
      LOC={state:'denied',text:(e&&e.code===1)?T('فعّل صلاحية الموقع','Allow location access'):T('تعذر تحديد الموقع','Unable to detect location')}; paint(); },{enableHighAccuracy:true,maximumAge:15000,timeout:12000});
  }
  function isHome(){ var b=document.getElementById('tb-home'); return !!(b&&b.classList.contains('on')); }
  function startLoc(){ stopLoc(); LOC.state='loading'; LOC.text=T('جاري تحديد موقعك…','Locating you…'); pollLoc(); LOC.watchTimer=setInterval(function(){ if(isHome()) pollLoc(); },20000); }
  function stopLoc(){ if(LOC.watchTimer){ clearInterval(LOC.watchTimer); LOC.watchTimer=null; } }

  /* ---------- رسم البطاقة ---------- */
  var busy=false, lastKey='';
  function heroHtml(){
    var S=todayState(), now=riyadhNow(), nm=nameOf(), first=nm.split(/\s+/)[0]||'', shown=shortName(nm);
    var ph=(window.ME&&ME.photoUrl)?'<img src="'+esc2(ME.photoUrl)+'" alt="">':esc2((first||'؟').charAt(0));
    var mode=!S.n?'in':(S.open?'out':'done');
    var label=mode==='in'?T('سجّل حضورك','Check in'):mode==='out'?T('سجّل انصرافك','Check out'):T('تم الانصراف','Checked out');
    var icon=mode==='in'?SVG.finger:mode==='out'?SVG.out:SVG.check;
    var workedSec=S.closedSec+(S.open?Math.max(0,(now.h*3600+now.m*60+now.s)-secs(S.open.time_in)):0), ex=expectedOut(S), R=82, C=2*Math.PI*R;
    var prog=ex?Math.min(1,workedSec/ex.shift):(S.n?Math.min(1,workedSec/28800):0);
    var chips='';
    var lc=LOC.state==='in'||LOC.state==='gps'?'ok':(LOC.state==='out'||LOC.state==='denied'||LOC.state==='na')?'bad':'';
    chips+='<span class="a8-chip '+lc+'"><span class="d"></span>'+SVG.pin+'<span>'+esc2(LOC.text||T('جاري تحديد موقعك…','Locating you…'))+'</span></span>';
    if(S.n&&S.open&&ex) chips+='<span class="a8-chip">'+SVG.flag+'<span>'+T('الانصراف المتوقع ','Expected check-out ')+('0'+Math.floor(ex.sec/3600)%24).slice(-2)+':'+('0'+Math.floor((ex.sec%3600)/60)).slice(-2)+'</span></span>';
    if(S.n) chips+='<span class="a8-chip"><span>'+T('ساعات اليوم ','Today ')+fmtHM(workedSec)+'</span></span>';
    var sess=S.n>0?S.rows.map(function(r){ return '<span class="a8-s" dir="ltr">'+hm(r.time_in)+' → '+(r.time_out?hm(r.time_out):'…')+'</span>'; }).join(''):'';
    var h12=((now.h+11)%12)+1, ap=now.h<12?T('ص','AM'):T('م','PM');
    return '<div class="a8-top"><div class="a8-av">'+ph+'</div><div><div class="a8-hello">'+greet(now.h)+'</div><div class="a8-name">'+esc2(shown)+'</div></div></div>'
      +'<div class="a8-clock" id="a8Clock">'+('0'+h12).slice(-2)+':'+('0'+now.m).slice(-2)+':'+('0'+now.s).slice(-2)+'<small>'+ap+'</small></div>'
      +'<div class="a8-date">'+new Date().toLocaleDateString(isEN()?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Riyadh'})+'</div>'
      +'<div class="a8-pw"><div class="a8-wm"><svg viewBox="0 0 105 110" width="100%" height="100%" aria-hidden="true"><polygon class="u" points="5,39 100,4 100,33 5,68"/><polygon class="l" points="5,70 43,55 100,77 100,106"/></svg></div><svg class="a8-ring" viewBox="0 0 184 184"><circle class="bg" cx="92" cy="92" r="'+R+'"/><circle class="fg" cx="92" cy="92" r="'+R+'" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+(C*(1-prog)).toFixed(1)+'"/></svg>'
      +'<button type="button" class="a8-btn '+mode+(busy?' busy':'')+'" id="a8Punch" aria-label="'+esc2(label)+'">'+icon+'<span>'+label+'</span></button></div>'
      +'<div class="a8-chips">'+chips+'</div>'
      +(sess?'<div class="a8-sess">'+sess+'</div>':'')
      +(mode==='done'?'<button type="button" class="a8-back" id="a8Back">↩ '+T('رجوع للعمل — تسجيل حضور مرة أخرى','Back to work — check in again')+'</button>':'');
  }
  function lvBal(){ var v=ME&&ME.leave_bal; return (v==null||isNaN(v))?'—':Number(v).toFixed(2).replace(/\.00$/,''); }
  function tilesHtml(){
    var ye=ME&&ME.leaveYearEnd, rem=(ME&&ME.remote_limit!=null)?(ME.remote_limit-(ME.remote_used||0)):null;
    var tile=function(ic,v,l){ return '<div class="a8-tile"><div class="ic">'+ic+'</div><div class="v">'+v+'</div><div class="l">'+l+'</div></div>'; };
    return '<div class="a8-tiles">'+tile(SVG.leave,lvBal(),T('رصيد الإجازة (يوم)','Leave balance (days)'))+tile(SVG.lv,(ye==null||isNaN(ye))?'—':Number(ye).toFixed(2).replace(/\.00$/,''),T('رصيد نهاية العام','Year-end balance'))+tile(SVG.wallet,rem==null?'—':rem,T('عن بعد المتبقي','Remote days left'))+'</div>';
  }
  function qaHtml(){
    var q=function(id,ic,l){ return '<button type="button" class="a8-q" data-go="'+id+'"><div class="ic">'+ic+'</div><span>'+l+'</span></button>'; };
    return '<div class="a8-qa">'+q('lv',SVG.lv,T('طلب إجازة','Leave request'))+q('fp',SVG.finger.replace(/width="46" height="46"/,'width="22" height="22"'),T('نسيت بصمة','Forgot punch'))+q('ot',SVG.ot,T('عمل إضافي','Overtime'))+q('docs',SVG.docs,T('مستنداتي','My documents'))+'</div>';
  }
  function navTo(label){ var b=[].slice.call(document.querySelectorAll('.bnav .bni')).filter(function(x){ return new RegExp(label,'i').test(x.textContent); })[0]; if(b) b.click(); }
  function bindQa(root){
    root.querySelectorAll('[data-go]').forEach(function(b){ b.onclick=function(){ var k=b.getAttribute('data-go'); if(k==='lv') document.getElementById('tb-lv').click(); else if(k==='fp'){ if(window.aribaOpenForgotPunch) window.aribaOpenForgotPunch(); else document.getElementById('tb-lv').click(); } else if(k==='ot') (document.getElementById('tb-overtime')||document.getElementById('tb-lv')).click(); else if(k==='docs') (document.getElementById('tb-docs')||document.getElementById('tb-prof')).click(); }; });
  }
  /* ---------- البصمة ---------- */
  async function punch(kind){
    if(busy) return; var fn=window[kind==='in'?'doIn':'doOut']; if(typeof fn!=='function') return;
    busy=true; paint(true);
    var ra=window.renderAtt; window.renderAtt=function(){ if(isHome()) return; return ra.apply(this,arguments); };   /* الدوال الأصلية بتنادي renderAtt بعد البصمة — منعناها تحوّل الصفحة */
    try{
      await fn();
      try{ if(typeof window.refreshAribaContext==='function') await window.refreshAribaContext(); }catch(e){}
      var b=document.getElementById('a8Punch'); if(b){ b.classList.add('ok'); } try{ navigator.vibrate&&navigator.vibrate(35); }catch(e){}
    }finally{ window.renderAtt=ra; busy=false; lastKey=''; paint(true); }
  }
  /* ---------- حقن البطاقة في الرئيسية ---------- */
  function paint(force){
    var el=document.getElementById('appContent'); if(!el||!isHome()) return;
    var hero=document.getElementById('a8Hero');
    if(!hero) return;
    var S=todayState(), key=[S.n,!!S.open,S.lastOut,LOC.text,LOC.state,busy,!!SET,isEN(),Math.floor(Date.now()/60000)].join('|');
    if(!force&&key===lastKey) return; lastKey=key;
    hero.innerHTML=heroHtml();
    var pb=document.getElementById('a8Punch'); if(pb){ pb.onclick=function(){ var S2=todayState(); if(!S2.n||!S2.open&&false) return punch('in'); if(S2.open) return punch('out'); }; var S3=todayState(); pb.onclick=function(){ var st=todayState(); if(!st.n) punch('in'); else if(st.open) punch('out'); }; }
    var bk=document.getElementById('a8Back'); if(bk) bk.onclick=function(){ punch('in'); };
  }
  function dedupeOld(el){
    /* كارت الموظف الأصلي: السطر العلوي (صورة + اسم + وظيفة + تاريخ) مكرر مع البطاقة الجديدة → نخفيه ونسيب الشبكة بتاعة (جهة العمل/القسم/الجنسية/الوظيفة) */
    var kids=[].slice.call(el.children).filter(function(c){ return c.id!=='a8Wrap'; });
    var pc=kids.filter(function(c){ return c.classList.contains('card') && c.firstElementChild && c.children.length>=2; })[0];
    if(pc){ var top=pc.firstElementChild; if(top&&!top.getAttribute('data-a8h')){ top.setAttribute('data-a8h','1'); top.classList.add('a8-hide-dup'); } }
  }
  function injectHome(){
    var el=document.getElementById('appContent'); if(!el||!isHome()) return;
    if(document.getElementById('a8Hero')){ return; }
    if(!window.ME) return;
    var wrap=document.createElement('div'); wrap.id='a8Wrap';
    lastTiles=tilesHtml(); wrap.innerHTML='<div class="a8-hero" id="a8Hero"></div>'+lastTiles+qaHtml()+'<div class="a8-sec">'+T('بياناتي','My details')+'</div>';
    el.insertBefore(wrap,el.firstChild); bindQa(wrap);
    dedupeOld(el);
    /* الكروت الأصلية للرصيد (نفس الأرقام الموجودة في البلاطات) نخفيها */
    el.querySelectorAll(':scope > div:not(#a8Wrap)').forEach(function(d){ if(d.querySelector(':scope > .card .kpi-val')||d.querySelectorAll(':scope > .card').length>=2&&/\d/.test(d.textContent)&&!d.querySelector('.profile-hero')){ /* صف كروت الرصيد */ if(d.children.length&&[].every.call(d.children,function(c){ return c.classList.contains('card'); })&&d.children.length===2) d.classList.add('a8-hide-dup'); } });
    lastKey=''; paint(true); loadSettings(); startLoc();
  }
  /* ---------- رأس الصفحة والشريط السفلي ---------- */
  function polishChrome(){
    var ic={'tb-home':SVG.home,'tb-att':SVG.att,'tb-lv':SVG.lv,'tb-pay':SVG.pay,'tb-team':SVG.team,'tb-prof':SVG.prof,'tb-overtime':SVG.ot,'tb-docs':SVG.docs};
    document.querySelectorAll('.bnav .bni').forEach(function(b){ var i=b.querySelector('i'); if(i&&ic[b.id]&&!b.querySelector('svg')){ i.insertAdjacentHTML('afterend',ic[b.id]); i.style.display='none'; } else if(!i&&ic[b.id]&&!b.querySelector('svg')){ b.insertAdjacentHTML('afterbegin',ic[b.id]); } });
    var on=document.querySelector('.bnav .bni.on'); if(on&&on!==polishChrome.last){ polishChrome.last=on; try{ on.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'}); }catch(e){} }
    var set=function(id,svg,cls){ var b=document.getElementById(id); if(b&&!b.getAttribute('data-a8')){ b.setAttribute('data-a8','1'); if(cls) b.classList.add(cls); var i=b.querySelector('i'); if(i) i.style.display='none'; b.insertAdjacentHTML('afterbegin',svg); } };
    set('ARIBA_MANUAL_REFRESH_EMP',SVG.refresh); set('aribaPwHdrBtn',SVG.key,'a8-ib');
    var lo=document.querySelector('.hdr-user button[onclick*="doLogout"]'); if(lo&&!lo.getAttribute('data-a8')){ lo.setAttribute('data-a8','1'); lo.classList.add('a8-ib'); lo.style.color='var(--rd)'; var ii=lo.querySelector('i'); if(ii) ii.style.display='none'; lo.insertAdjacentHTML('afterbegin',SVG.logout); }
  }
  /* ---------- دورة حياة ---------- */
  var lastTiles='';
  function refreshTiles(){
    try{ var t=document.querySelector('#a8Wrap .a8-tiles'); if(!t) return; var h=tilesHtml(); if(h===lastTiles) return; lastTiles=h; var d=document.createElement('div'); d.innerHTML=h; var n=d.firstElementChild; if(n) t.replaceWith(n); }catch(x){}
  }
  var lastLocSig='';
  function tick(){
    loadSettings(); applyRemote(); if(isHome()) refreshTiles();
    try{ var ls=JSON.stringify(((window.ME&&ME.locations)||[]).map(function(l){ return [l.id,l.lat,l.lng,l.radius_m,l.name]; })); if(ls!==lastLocSig){ lastLocSig=ls; evalLoc(); lastKey=''; } }catch(e){}
    if(isHome()){
      var c=document.getElementById('a8Clock'); if(c){ var n=riyadhNow(), h12=((n.h+11)%12)+1; c.innerHTML=('0'+h12).slice(-2)+':'+('0'+n.m).slice(-2)+':'+('0'+n.s).slice(-2)+'<small>'+(n.h<12?T('ص','AM'):T('م','PM'))+'</small>'; }
      paint(false);
    } else stopLoc();
  }
  var wasHome=false;
  setInterval(function(){
    polishChrome();
    var h=isHome();
    if(h&&!document.getElementById('a8Hero')) injectHome();
    if(h&&!wasHome&&document.getElementById('a8Hero')&&!LOC.watchTimer) startLoc();
    wasHome=h; tick();
  },1000);
  (function(){ var f=window.renderHome; if(typeof f==='function'&&!f.__a8){ var g=function(){ var r=f.apply(this,arguments); try{ setTimeout(injectHome,0); }catch(e){} return r; }; g.__a8=1; window.renderHome=g; } })();
  /* الأحداث اللي بتغير حاجات الصفحة: لغة/سمة */
  try{ new MutationObserver(function(){ if(isHome()) { var el=document.getElementById('appContent'); if(el&&!document.getElementById('a8Hero')) injectHome(); } }).observe(document.getElementById('appContent')||document.body,{childList:true}); }catch(e){}
})();
