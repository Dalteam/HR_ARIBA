
/* V114: تغيير كلمة المرور في أي وقت من تطبيق الموظف (إضافة فقط — بدون تعديل أي كود موجود) */
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

  /* نافذة تغيير كلمة المرور (اختيارية — الموظف يفتحها وقت ما يحب) */
  function openChange(){
    if(document.getElementById('aribaPw2Modal')) return;
    if(!UUID.test(token())){ notify(T('سجّل الدخول بحسابك الأول','Please sign in first'),true); return; }
    var w=overlay('aribaPw2Modal');
    w.innerHTML='<div style="background:#fff;color:#111;max-width:380px;width:100%;border-radius:14px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.35)">'
      +'<div style="font-size:17px;font-weight:700;margin-bottom:6px">🔒 '+T('تغيير كلمة المرور','Change password')+'</div>'
      +'<div style="font-size:12.5px;color:#555;line-height:1.7;margin-bottom:14px">'+T('اكتب كلمة المرور الحالية ثم الجديدة. هتشتغل من أول تسجيل دخول بعد الحفظ.','Enter your current password, then the new one. It works from your next sign-in.')+'</div>'
      +'<input id="aribaPw2Old" type="password" placeholder="'+T('كلمة المرور الحالية','Current password')+'" autocomplete="current-password" style="'+INP+'">'
      +'<input id="aribaPw2New" type="password" placeholder="'+T('كلمة المرور الجديدة (8 على الأقل، حروف وأرقام)','New password (min 8, letters and numbers)')+'" autocomplete="new-password" style="'+INP+'">'
      +'<input id="aribaPw2New2" type="password" placeholder="'+T('أعد كتابة كلمة المرور الجديدة','Repeat new password')+'" autocomplete="new-password" style="'+INP+'">'
      +'<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:#444;margin-bottom:10px;cursor:pointer"><input id="aribaPw2Show" type="checkbox"> '+T('إظهار كلمات المرور','Show passwords')+'</label>'
      +'<div id="aribaPw2Err" style="display:none;color:#b91c1c;font-size:12.5px;margin-bottom:10px"></div>'
      +'<div style="display:flex;gap:8px"><button id="aribaPw2Save" type="button" style="flex:1;padding:11px;border:0;border-radius:8px;background:#0f766e;color:#fff;font-size:15px;font-weight:700;cursor:pointer">'+T('حفظ كلمة المرور','Save password')+'</button>'
      +'<button id="aribaPw2Cancel" type="button" style="padding:11px 16px;border:1px solid #ccc;border-radius:8px;background:#f3f4f6;color:#111;font-size:14px;cursor:pointer">'+T('إلغاء','Cancel')+'</button></div></div>';
    document.body.appendChild(w);
    var kill=closeOn(w);
    var err=w.querySelector('#aribaPw2Err'), btn=w.querySelector('#aribaPw2Save');
    var fOld=w.querySelector('#aribaPw2Old'), fNew=w.querySelector('#aribaPw2New'), fNew2=w.querySelector('#aribaPw2New2');
    w.querySelector('#aribaPw2Cancel').onclick=kill;
    w.querySelector('#aribaPw2Show').onchange=function(){ var t=this.checked?'text':'password'; fOld.type=t; fNew.type=t; fNew2.type=t; };
    function fail(m){ err.textContent=m; err.style.display='block'; btn.disabled=false; btn.textContent=T('حفظ كلمة المرور','Save password'); }
    async function save(){
      var o=fOld.value, n=fNew.value, n2=fNew2.value;
      if(!o||!n) return fail(T('اكتب كلمة المرور الحالية والجديدة','Enter the current and new password'));
      if(n!==n2) return fail(T('كلمتين المرور الجديدتين مش زي بعض','The new passwords do not match'));
      if(n.length<8) return fail(T('كلمة المرور الجديدة لازم 8 حروف على الأقل','New password must be at least 8 characters'));
      if(!/[A-Za-z\u0621-\u064A]/.test(n)||!/[0-9\u0660-\u0669]/.test(n)) return fail(T('لازم تحتوي على حروف وأرقام','It must contain letters and numbers'));
      if(n===o) return fail(T('الكلمة الجديدة لازم تختلف عن الحالية','New password must differ from the current one'));
      btn.disabled=true; btn.textContent=T('جاري الحفظ…','Saving…');
      try{
        await rpc('ariba_change_my_password',{p_token:token(),p_old:o,p_new:n});
        kill(); notify('✓ '+T('تم تغيير كلمة المرور','Password changed'),false);
      }catch(e){ fail(e.message||T('حصلت مشكلة','Something went wrong')); }
    }
    btn.onclick=save;
    [fOld,fNew,fNew2].forEach(function(f){ f.addEventListener('keydown',function(e){ if(e.key==='Enter') save(); }); });
    setTimeout(function(){ try{ fOld.focus(); }catch(e){} },50);
  }
  window.aribaOpenChangePassword=openChange;

  /* زر المفتاح في الهيدر + كارت "الأمان" في صفحة ملفي — إضافة فقط */
  function ensure(){
    try{
      var hu=document.querySelector('.hdr-user');
      if(hu && !document.getElementById('aribaPwHdrBtn')){
        var b=document.createElement('button'); b.id='aribaPwHdrBtn'; b.type='button';
        b.title=T('تغيير كلمة المرور','Change password');
        b.style.cssText='background:none;border:none;color:var(--mu,#888);cursor:pointer;padding:4px';
        b.innerHTML='<i class="ti ti-key" style="font-size:18px"></i>';
        b.onclick=openChange;
        var first=hu.querySelector('button'); if(first) hu.insertBefore(b,first); else hu.appendChild(b);
      }
      var el=document.getElementById('appContent');
      if(el && el.querySelector('.profile-hero') && !document.getElementById('aribaPwCard')){
        var c=document.createElement('div'); c.className='card'; c.id='aribaPwCard';
        c.innerHTML='<div class="card-title">🔒 '+T('الأمان','Security')+'</div>'
          +'<div style="font-size:12px;color:var(--mu,#888);line-height:1.7;margin-bottom:10px">'+T('تقدر تغيّر كلمة المرور في أي وقت.','You can change your password at any time.')+'</div>'
          +'<button type="button" id="aribaPwCardBtn" style="width:100%;padding:11px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-size:14px;font-weight:700;cursor:pointer">🔑 '+T('تغيير كلمة المرور','Change password')+'</button>';
        el.appendChild(c);
        c.querySelector('#aribaPwCardBtn').onclick=openChange;
      }
    }catch(e){}
  }
  setInterval(ensure,1000); setTimeout(ensure,300);
})();
