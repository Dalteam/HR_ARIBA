
/* V118: جرس الإشعارات (إضافة فقط) */
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


  /* ================= V118: جرس الإشعارات (برنامج الـ HR + تطبيق الموظف) ================= */
  var IS_HR=!!(document.getElementById('NV')||typeof window.hrLogout==='function'&&document.querySelector('.topbar'));
  var B={items:[],unread:0,known:null,open:false,loading:false,err:''};
  function tokenB(){ var t=IS_HR?(window.ARIBA_HR_TOKEN||''):(window.ARIBA_SESSION||''); return UUID.test(t)?t:''; }
  var BELL='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  var KIC={
    template:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    request:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    ok:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/></svg>',
    no:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>'
  };
  var CSSB='\
  .a9-bell{position:relative;flex:none;cursor:pointer;font-family:inherit}\
  body:not(.a9-hr) .a9-bell{width:36px;height:36px;border-radius:12px;border:1px solid var(--bd);background:var(--c2);color:var(--tx);display:inline-grid;place-items:center;padding:0}\
  .a9-bell:active{transform:scale(.93)}\
  .a9-badge{position:absolute;top:-6px;inset-inline-end:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#d64545;color:#fff;font-size:10px;font-weight:800;display:none;align-items:center;justify-content:center;border:2px solid var(--p,var(--c,#fff));box-sizing:border-box;line-height:1;font-variant-numeric:tabular-nums}\
  .a9-badge.on{display:flex}\
  .a9-bell.ring svg{animation:a9ring .9s ease;transform-origin:50% 8%}\
  @keyframes a9ring{0%,100%{transform:rotate(0)}15%{transform:rotate(16deg)}30%{transform:rotate(-14deg)}45%{transform:rotate(10deg)}60%{transform:rotate(-8deg)}75%{transform:rotate(4deg)}}\
  #a9Panel{position:fixed;z-index:2147483000;width:min(94vw,390px);max-height:min(76vh,560px);display:none;flex-direction:column;background:var(--c,#fff);color:var(--tx,#111);border:1px solid var(--bd,#ddd);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden}\
  #a9Panel.on{display:flex}\
  .a9-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--bd,#ddd)}\
  .a9-h b{font-size:14px;flex:1}\
  .a9-new{background:rgba(214,69,69,.13);color:#d64545;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:800}\
  .a9-mk{background:none;border:0;color:var(--gr,#29B35E);font-weight:800;font-size:11.5px;cursor:pointer;font-family:inherit;padding:2px 4px}\
  .a9-mk:disabled{opacity:.4;cursor:default}\
  .a9-x{background:none;border:0;color:var(--mu,#777);font-size:20px;line-height:1;cursor:pointer;padding:0 2px}\
  .a9-l{overflow:auto;flex:1;-webkit-overflow-scrolling:touch}\
  .a9-i{display:flex;gap:10px;padding:11px 14px;border-bottom:1px solid var(--bd,#eee);cursor:pointer;align-items:flex-start;text-align:start}\
  .a9-i.un{background:rgba(41,179,94,.09)}\
  .a9-i:hover{background:var(--c2,#f3f3f3)}\
  .a9-ic{width:34px;height:34px;border-radius:11px;flex:none;display:grid;place-items:center}\
  .a9-ic.template{background:rgba(66,133,244,.14);color:#3b7ddd}.a9-ic.request{background:rgba(214,158,46,.17);color:#b9811a}.a9-ic.ok{background:rgba(41,179,94,.17);color:#1f9a4f}.a9-ic.no{background:rgba(214,69,69,.15);color:#d64545}\
  .a9-t{font-size:12.5px;font-weight:800;line-height:1.45}\
  .a9-b{font-size:11.5px;color:var(--mu,#777);line-height:1.55;margin-top:2px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}\
  .a9-m{font-size:10.5px;color:var(--mu,#777);margin-top:3px}\
  .a9-dot{width:8px;height:8px;border-radius:50%;background:#d64545;flex:none;margin-top:7px}\
  .a9-e{padding:34px 14px;text-align:center;color:var(--mu,#777);font-size:12.5px;line-height:1.8}\
  @media (max-width:520px){#a9Panel{inset-inline:8px;width:auto}}';
  var stB=document.createElement('style'); stB.id='ariba118-bell-css'; stB.textContent=CSSB; document.head.appendChild(stB);
  if(IS_HR) document.body.classList.add('a9-hr');

  function iconKind(n){
    var t=String(n.title||''), k=String(n.kind||'');
    if(k==='template') return 'template'; if(k==='request') return 'request';
    if(/⚠|رفض|اعترض|reject|object/i.test(t)) return 'no'; return 'ok';
  }
  function ago(ts){
    var d=new Date(ts); if(isNaN(d)) return ''; var s=Math.max(0,(Date.now()-d.getTime())/1000);
    if(s<60) return T('الآن','just now'); if(s<3600) return T('منذ '+Math.floor(s/60)+' د',Math.floor(s/60)+'m ago'); if(s<86400) return T('منذ '+Math.floor(s/3600)+' س',Math.floor(s/3600)+'h ago');
    if(s<172800) return T('أمس','yesterday'); return d.toLocaleDateString(isEN()?'en-GB':'ar-SA-u-ca-gregory-nu-latn',{day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function tr2(s){ return (isEN()&&window.ARIBA_TR)?window.ARIBA_TR(s):s; }

  /* ---------- زر الجرس ---------- */
  function ensureBtn(){
    var b=document.getElementById('a9Bell');
    if(b&&document.body.contains(b)) return b;
    b=document.createElement('button'); b.type='button'; b.id='a9Bell'; b.className='a9-bell'+(IS_HR?' ib':''); b.setAttribute('aria-label',T('الإشعارات','Notifications')); b.title=T('الإشعارات','Notifications');
    b.innerHTML=BELL+'<span class="a9-badge" id="a9Badge"></span>'; b.onclick=function(ev){ ev.stopPropagation(); toggle(); };
    var host=IS_HR?document.querySelector('.tbr'):document.querySelector('.hdr-user');
    if(!host) return null;
    var anchor=IS_HR?document.getElementById('langBtn'):host.firstElementChild;
    if(anchor&&anchor.parentNode===host) host.insertBefore(b,anchor); else host.appendChild(b);
    return b;
  }
  function paintBadge(){
    var bd=document.getElementById('a9Badge'); if(!bd) return;
    var n=B.unread; bd.textContent=n>99?'99+':String(n); bd.classList.toggle('on',n>0);
    var b=document.getElementById('a9Bell'); if(b) b.title=n>0?(T('لديك '+n+' إشعار جديد','You have '+n+' new notification'+(n>1?'s':''))):T('الإشعارات','Notifications');
  }
  /* ---------- اللوحة ---------- */
  function panel(){
    var p=document.getElementById('a9Panel'); if(p) return p;
    p=document.createElement('div'); p.id='a9Panel'; p.setAttribute('role','dialog'); document.body.appendChild(p);
    p.addEventListener('click',function(e){ e.stopPropagation(); });
    return p;
  }
  function render(){
    var p=panel(); p.dir=isEN()?'ltr':'rtl';
    var un=B.unread, head='<div class="a9-h"><b>'+T('الإشعارات','Notifications')+'</b>'+(un>0?'<span class="a9-new">'+un+' '+T('جديد','new')+'</span>':'')+'<button type="button" class="a9-mk" id="a9MarkAll"'+(un>0?'':' disabled')+'>'+T('تعليم الكل كمقروء','Mark all as read')+'</button><button type="button" class="a9-x" id="a9Close" aria-label="'+T('إغلاق','Close')+'">×</button></div>';
    var body='';
    if(!tokenB()) body='<div class="a9-e">'+T('لا توجد إشعارات.','No notifications.')+'</div>';
    else if(B.err&&!B.items.length) body='<div class="a9-e">'+esc(tr2(B.err))+'</div>';
    else if(B.loading&&!B.items.length) body='<div class="a9-e">'+T('جاري التحميل…','Loading…')+'</div>';
    else if(!B.items.length) body='<div class="a9-e">'+T('لا توجد إشعارات.','No notifications.')+'</div>';
    else body=B.items.map(function(n){ var ic=iconKind(n); return '<div class="a9-i'+(n.is_read?'':' un')+'" data-id="'+esc(n.id)+'"><div class="a9-ic '+ic+'">'+KIC[ic]+'</div><div style="flex:1;min-width:0"><div class="a9-t">'+esc(tr2(n.title))+'</div>'+(n.body?'<div class="a9-b">'+esc(tr2(n.body))+'</div>':'')+'<div class="a9-m">'+ago(n.created_at)+'</div></div>'+(n.is_read?'':'<span class="a9-dot"></span>')+'</div>'; }).join('');
    p.innerHTML=head+'<div class="a9-l">'+body+'</div>';
    var c=p.querySelector('#a9Close'); if(c) c.onclick=close;
    var m=p.querySelector('#a9MarkAll'); if(m) m.onclick=markAll;
    p.querySelectorAll('.a9-i').forEach(function(el){ el.onclick=function(){ openItem(el.getAttribute('data-id')); }; });
  }
  function place(){
    var b=document.getElementById('a9Bell'), p=panel(); if(!b) return; var r=b.getBoundingClientRect();
    p.style.top=Math.round(r.bottom+8)+'px';
    if(window.innerWidth>520){ var rtl=(document.documentElement.dir||getComputedStyle(document.body).direction)==='rtl'; p.style.insetInlineStart='auto'; p.style.insetInlineEnd=''; if(rtl){ p.style.left=Math.max(8,Math.round(r.left))+'px'; p.style.right='auto'; } else { p.style.right=Math.max(8,Math.round(window.innerWidth-r.right))+'px'; p.style.left='auto'; } }
    else { p.style.left=''; p.style.right=''; }
  }
  function toggle(){ B.open?close():open(); }
  function open(){ B.open=true; var p=panel(); place(); p.classList.add('on'); render(); refresh(true); }
  function close(){ B.open=false; var p=document.getElementById('a9Panel'); if(p) p.classList.remove('on'); }
  document.addEventListener('click',function(e){ if(B.open&&!e.target.closest('#a9Panel')&&!e.target.closest('#a9Bell')) close(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&B.open) close(); });
  window.addEventListener('resize',function(){ if(B.open) place(); });

  /* ---------- الاتصال بالسيرفر ---------- */
  async function refresh(force){
    var t=tokenB(); if(!t){ B.items=[]; B.unread=0; paintBadge(); if(B.open) render(); return; }
    if(B.loading&&!force) return; B.loading=true;
    try{
      var r=await rpc('ariba_my_notifications',{p_token:t,p_limit:40}); B.err='';
      var items=(r&&r.items)||[], unreadIds=items.filter(function(n){ return !n.is_read; }).map(function(n){ return n.id; });
      var fresh=[]; if(B.known!==null) fresh=items.filter(function(n){ return !n.is_read&&B.known.indexOf(n.id)<0; });
      B.items=items; B.unread=Number(r&&r.unread)||0; B.known=B.known===null?unreadIds:B.known.concat(unreadIds.filter(function(i){ return B.known.indexOf(i)<0; }));
      paintBadge(); if(B.open) render();
      if(fresh.length){ announce(fresh); }
    }catch(e){ B.err=String(e&&e.message||e); if(B.open) render(); }
    B.loading=false;
  }
  function announce(fresh){
    var b=document.getElementById('a9Bell'); if(b){ b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); setTimeout(function(){ b.classList.remove('ring'); },1000); }
    try{ navigator.vibrate&&navigator.vibrate([60,40,60]); }catch(e){}
    try{ if(!B.open&&typeof window.toast==='function'){ var n=fresh[0]; window.toast('🔔 '+tr2(n.title)+(fresh.length>1?(' (+'+(fresh.length-1)+')'):''),'tin'); } }catch(e){}
  }
  async function markIds(ids){
    var t=tokenB(); if(!t) return;
    try{ await rpc('ariba_mark_notifications_read',{p_token:t,p_ids:ids&&ids.length?ids:null}); }catch(e){ refresh(true); }
  }
  function markAll(){
    B.items.forEach(function(n){ n.is_read=true; }); B.unread=0; B.known=(B.known||[]).concat(B.items.map(function(n){ return n.id; })); paintBadge(); render();
    markIds(null);
  }
  /* ---------- فتح إشعار: علّمه مقروء وروح للشاشة المناسبة ---------- */
  function openItem(id){
    var n=B.items.filter(function(x){ return String(x.id)===String(id); })[0]; if(!n) return;
    if(!n.is_read){ n.is_read=true; B.unread=Math.max(0,B.unread-1); paintBadge(); markIds([n.id]); }
    close(); go(n);
  }
  function clickId(ids){ for(var i=0;i<ids.length;i++){ var el=document.getElementById(ids[i]); if(el){ el.click(); return true; } } return false; }
  function go(n){
    var k=String(n.kind||''), st=String(n.stage||'');
    try{
      if(IS_HR){
        if(k==='template_decision'||k==='template'){ if(typeof window.showPg==='function') window.showPg('forms'); return; }
        if(typeof window.showPg==='function') window.showPg('lv');
        var tabs=[].slice.call(document.querySelectorAll('.tbar .tab,.tabs .tab')), want=(k==='request')?'lv1':'lv2', tab=tabs.filter(function(t){ return (t.getAttribute('onclick')||'').indexOf("'"+want+"'")>=0; })[0];
        if(tab&&typeof window.sT==='function') window.sT(tab,want);
      } else {
        if(k==='template'||k==='template_decision') clickId(['tb-docs','tb-prof']);
        else if(k==='request'&&st==='manager') clickId(['tb-team','tb-lv']);
        else clickId(['tb-lv']);
      }
    }catch(e){}
  }
  /* ---------- دورة الحياة ---------- */
  var tick=0;
  setInterval(function(){
    ensureBtn(); paintBadge();
    if(!IS_HR){ /* الكارت القديم للإشعارات في الرئيسية بقى مكرر مع الجرس */
      document.querySelectorAll('#appContent .card-title').forEach(function(t){ if(/^\s*(🔔\s*)?(الإشعارات|Notifications)/.test(t.textContent)){ var c=t.closest('.card'); if(c&&c.style.display!=='none') c.style.display='none'; } });
    }
    tick++; if(tick%30===0&&document.visibilityState!=='hidden') refresh(false);
  },1000);
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') refresh(false); });
  setTimeout(function(){ ensureBtn(); refresh(true); },1500);
  window.ARIBA_BELL={refresh:function(){ return refresh(true); },state:B};
})();
