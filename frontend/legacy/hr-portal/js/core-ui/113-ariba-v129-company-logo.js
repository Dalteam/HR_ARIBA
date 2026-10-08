
/* V129: شعار الشركة من الإعدادات (إضافة فقط) */
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


  /* ===== V129: شعار الشركة من الإعدادات — بيستبدل اللوجو الظاهر في الشريط الجانبي وفي طباعة المسير، ويتحفظ على السيرفر ===== */
  var KEY='ariba_company_logo_v1', CLOUD='company_logo', DEFAULT=null, LOGO=null, pulled=false;
  function tokenL(){ var t=window.ARIBA_HR_TOKEN||''; return UUID.test(t)?t:''; }
  function load(){ try{ LOGO=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){ LOGO=null; } window.ARIBA_COMPANY_LOGO=(LOGO&&LOGO.data)||''; }
  function saveLocal(){ try{ if(LOGO&&LOGO.data) localStorage.setItem(KEY,JSON.stringify(LOGO)); else localStorage.removeItem(KEY); }catch(e){ notify(T('الصورة كبيرة على تخزين المتصفح','The image is too large for browser storage'),true); } window.ARIBA_COMPANY_LOGO=(LOGO&&LOGO.data)||''; }
  async function push(){ var t=tokenL(); if(!t) return false; try{ await rpc('ariba_hr_set_setting',{p_token:t,p_key:CLOUD,p_value:LOGO&&LOGO.data?LOGO:{data:'',updated:Date.now()}}); return true; }catch(e){ return false; } }
  async function pull(){
    var t=tokenL(); if(!t||pulled) return; pulled=true;
    try{ var r=await rpc('ariba_hr_get_setting',{p_token:t,p_key:CLOUD}), v=r&&r.value;
      if(v&&typeof v==='object'&&(Number(v.updated)||0)>(Number(LOGO&&LOGO.updated)||0)){ LOGO=(v.data?v:null); saveLocal(); applyAll(); paintCard(); }
      else if(!v&&LOGO&&LOGO.data){ push(); }
    }catch(e){ pulled=false; }
  }
  /* ---------- تطبيق الشعار على الأماكن اللي بتعرض اللوجو ---------- */
  function sideImgs(){ return [].slice.call(document.querySelectorAll('#SB img[alt="ARIBA"],.sidebar img[alt="ARIBA"],aside img[alt="ARIBA"],#LG img[alt="ARIBA"]')); }
  function applyAll(){
    var imgs=sideImgs();
    if(DEFAULT===null&&imgs[0]&&!imgs[0].getAttribute('data-a29')) DEFAULT=imgs[0].getAttribute('src')||'';
    imgs.forEach(function(im){
      if(LOGO&&LOGO.data){ if(im.getAttribute('src')!==LOGO.data){ im.setAttribute('src',LOGO.data); } im.setAttribute('data-a29','1'); }
      else if(im.getAttribute('data-a29')==='1'){ if(DEFAULT) im.setAttribute('src',DEFAULT); im.removeAttribute('data-a29'); }
    });
    paintHeader();
  }

  /* ---------- هيدر الشريط الجانبي: اللوجو ملاي المكان + اسم الشركة (من الإعدادات) تحته ---------- */
  var DEF_AR='حلول اريبا لخدمات الأعمال', DEF_EN='Ariba Business Solutions';
  var cssH=document.createElement('style'); cssH.id='ariba129-header-css'; cssH.textContent='#SB .lbx{flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:7px!important;padding:14px 12px 12px!important;text-align:center}#SB .lbx .lic{width:100%!important;height:auto!important;padding:0!important;display:flex!important;justify-content:center!important;background:transparent!important}#SB .lbx .lic img{width:auto!important;height:auto!important;max-width:100%!important;max-height:104px!important;object-fit:contain!important}#SB .lbx .lt{width:100%!important;text-align:center!important}#SB .lbx .lt p{display:none!important}#SB .lbx .lt h1{font-size:13.5px!important;line-height:1.4!important;font-weight:800!important;margin:0!important;white-space:normal!important;word-break:break-word}';
  document.head.appendChild(cssH);
  function companyName(){
    var s={}; try{ s=db('settings',{})||{}; }catch(e){}
    var ar=(s.coAr||'').trim(), en=(s.coEn||'').trim();
    return isEN()?(en||DEF_EN):(ar||DEF_AR);
  }
  function paintHeader(){
    try{
      var h=document.getElementById('coN'); if(h){ var nm=companyName(); if(h.textContent!==nm) h.textContent=nm; }
      document.querySelectorAll('#SB .lbx .lt p').forEach(function(p){ if(p.style.display!=='none') p.style.display='none'; });
    }catch(e){}
  }
  /* الاسم الافتراضي في الإعدادات (لو لسه محدش حفظ اسم) = "حلول اريبا لخدمات الأعمال" */
  (function(){ var o=window.loadSet; if(typeof o!=='function'||o.__v129) return;
    var g=function(){ var r=o.apply(this,arguments); try{ var s=db('settings',{})||{}; if(!(s.coAr||'').trim()){ var el=document.getElementById('CN_AR'); if(el) el.value=DEF_AR; } }catch(e){} paintHeader(); return r; }; g.__v129=1; window.loadSet=g; })();
  (function(){ var o=window.saveSet; if(typeof o!=='function'||o.__v129n) return;
    var g=function(){ var r=o.apply(this,arguments); try{ paintHeader(); pushNames(); }catch(e){} return r; }; g.__v129n=1; window.saveSet=g; })();
  /* اسم الشركة على السيرفر (كل الأجهزة بنفس الاسم) */
  var NAMES_KEY='company_names', namesPulled=false;
  function namesObj(){ var s={}; try{ s=db('settings',{})||{}; }catch(e){} return {coAr:(s.coAr||'').trim(),coEn:(s.coEn||'').trim(),updated:Number(localStorage.getItem('ariba_company_names_ts'))||0}; }
  async function pushNames(){ var t=tokenL(); if(!t) return; try{ var o=namesObj(); o.updated=Date.now(); localStorage.setItem('ariba_company_names_ts',String(o.updated)); await rpc('ariba_hr_set_setting',{p_token:t,p_key:NAMES_KEY,p_value:o}); }catch(e){} }
  async function pullNames(){
    var t=tokenL(); if(!t||namesPulled) return; namesPulled=true;
    try{ var r=await rpc('ariba_hr_get_setting',{p_token:t,p_key:NAMES_KEY}), v=r&&r.value, l=namesObj();
      if(v&&(v.coAr||v.coEn)&&(Number(v.updated)||0)>l.updated){ var s=db('settings',{})||{}; if(v.coAr) s.coAr=v.coAr; if(v.coEn) s.coEn=v.coEn; dbS('settings',s); localStorage.setItem('ariba_company_names_ts',String(v.updated)); try{ var a=document.getElementById('CN_AR'),e=document.getElementById('CN_EN'); if(a&&v.coAr) a.value=v.coAr; if(e&&v.coEn) e.value=v.coEn; }catch(x){} paintHeader(); }
      else if(!v&&(l.coAr||l.coEn)) pushNames();
    }catch(e){ namesPulled=false; }
  }
  /* ---------- معالجة الصورة: تصغير + شفافية + حجم معقول ---------- */
  function readImage(file){
    return new Promise(function(res,rej){
      var fr=new FileReader(); fr.onerror=function(){ rej(new Error('read')); };
      fr.onload=function(){ var im=new Image(); im.onerror=function(){ rej(new Error('image')); };
        im.onload=function(){
          var W=im.naturalWidth||im.width||300, H=im.naturalHeight||im.height||150; if(!W||!H){ rej(new Error('size')); return; }
          var sc=Math.min(1,520/Math.max(W,H)); if(/svg/i.test(file.type)) sc=520/Math.max(W,H);
          var w=Math.max(1,Math.round(W*sc)), h=Math.max(1,Math.round(H*sc)), c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.drawImage(im,0,0,w,h);
          var hasAlpha=false; try{ var d=x.getImageData(0,0,w,h).data; for(var i=3;i<d.length;i+=40){ if(d[i]<250){ hasAlpha=true; break; } } }catch(e){}
          var out=(hasAlpha||/png|svg|gif|webp/i.test(file.type))?c.toDataURL('image/png'):c.toDataURL('image/jpeg',0.9);
          if(out.length>420000){ var k=0.7; c.width=Math.round(w*k); c.height=Math.round(h*k); c.getContext('2d').drawImage(im,0,0,c.width,c.height); out=hasAlpha?c.toDataURL('image/png'):c.toDataURL('image/jpeg',0.85); }
          res(out);
        }; im.src=fr.result; };
      fr.readAsDataURL(file);
    });
  }
  /* ---------- كارت الإعدادات (بعد كارت بيانات الشركة مباشرة) ---------- */
  function currentSrc(){ return (LOGO&&LOGO.data)||DEFAULT||''; }
  function paintCard(){
    var c=document.getElementById('LG_CARD'); if(!c) return;
    var pv=c.querySelector('#LG_PREV'); if(pv) pv.innerHTML=currentSrc()?'<img src="'+currentSrc()+'" alt="" style="max-height:90px;max-width:100%;object-fit:contain">':'<span style="color:var(--mu);font-size:12px">'+T('لا يوجد شعار','No logo')+'</span>';
    var rs=c.querySelector('#LG_RESET'); if(rs) rs.style.display=(LOGO&&LOGO.data)?'':'none';
    var st=c.querySelector('#LG_STAT'); if(st&&!st.getAttribute('data-keep')) st.textContent=(LOGO&&LOGO.data)?T('شعار مخصص','Custom logo'):T('الشعار الافتراضي','Default logo');
  }
  async function commit(msg){
    LOGO&&(LOGO.updated=Date.now()); saveLocal(); applyAll(); paintCard();
    var ok=await push(), st=document.getElementById('LG_STAT'); if(st){ st.setAttribute('data-keep','1'); st.textContent=msg+' — '+(ok?T('اتحفظ على السيرفر ✓','Saved to the server ✓'):T('اتحفظ على الجهاز ده (سجّل دخول سحابي عشان يتحفظ على السيرفر)','Saved on this device (sign in to the cloud to save on the server)')); st.style.color=ok?'var(--gr)':'var(--am)'; setTimeout(function(){ st.removeAttribute('data-keep'); },6000); }
  }
  function ensureCard(){
    var pg=document.getElementById('pg-set'); if(!pg||document.getElementById('LG_CARD')) return;
    var first=pg.querySelector('.card'); if(!first) return;
    var c=document.createElement('div'); c.className='card'; c.id='LG_CARD'; c.style.cssText='margin-top:12px;max-width:900px;padding:14px';
    c.innerHTML='<div class="ct" style="margin-bottom:12px"><i class="ti ti-photo"></i> <span>'+T('شعار الشركة','Company logo')+'</span></div>'
      +'<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div id="LG_PREV" style="width:190px;height:110px;background:#fff;border:1px dashed var(--bd);border-radius:10px;display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box"></div>'
      +'<div style="flex:1;min-width:210px"><label style="font-size:11px;color:var(--mu);font-weight:600;display:block;margin-bottom:4px">'+T('اختار صورة الشعار','Choose the logo image')+'</label><input type="file" id="LG_FILE" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="width:100%;font-size:12px">'
      +'<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn bgr bsm" id="LG_RESET">'+T('رجوع للشعار الافتراضي','Back to the default logo')+'</button><span id="LG_STAT" style="font-size:12px;color:var(--mu)"></span></div></div></div>';
    first.parentNode.insertBefore(c,first.nextSibling);
    c.querySelector('#LG_FILE').onchange=async function(){
      var f=this.files&&this.files[0]; if(!f) return;
      try{ var d=await readImage(f); LOGO={data:d,updated:Date.now(),name:f.name}; await commit(T('اتغيّر الشعار','Logo updated')); }catch(e){ notify(T('تعذر قراءة الصورة','Could not read the image'),true); }
      this.value='';
    };
    c.querySelector('#LG_RESET').onclick=function(){ LOGO=null; commit(T('رجع الشعار الافتراضي','Default logo restored')); };
    paintCard(); pull();
  }
  load();
  setInterval(function(){ applyAll(); ensureCard(); if(!pulled&&tokenL()) pull(); if(!namesPulled&&tokenL()) pullNames(); },900); setTimeout(function(){ applyAll(); ensureCard(); },250);
  window.ARIBA_LOGO={get:function(){ return window.ARIBA_COMPANY_LOGO||''; },reload:function(){ load(); applyAll(); paintCard(); }};
})();
