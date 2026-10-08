
/* V114: إعدادات كلمات المرور في برنامج الموارد البشرية: تغيير كلمة مرور حسابي + إعادة تعيين كلمة مرور موظف (إضافة فقط) */
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

  /* ---------- HR: زر تغيير كلمة مرور حسابي في الهيدر ---------- */
  function copyText(t){ try{ navigator.clipboard.writeText(t); return true; }catch(e){ return false; } }
  function activeEmps(){
    var a=[]; try{ a=(typeof getEmps==='function'?getEmps():[]); }catch(e){}
    return a.filter(function(e){ return e && e.nameAr && !(e.isTerminated||e.term); })
            .sort(function(x,y){ return String(x.nameAr).localeCompare(String(y.nameAr),'ar'); });
  }
  function showResetResult(name,r){
    var w=overlay('aribaPw2Result');
    w.innerHTML='<div style="background:#fff;color:#111;max-width:400px;width:100%;border-radius:14px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.35)">'
      +'<div style="font-size:17px;font-weight:700;margin-bottom:8px">🔑 '+T('كلمة مرور مؤقتة','Temporary password')+'</div>'
      +'<div style="font-size:13px;margin-bottom:6px">'+esc(name)+'</div>'
      +'<div style="background:#f3f4f6;border-radius:10px;padding:12px;margin-bottom:10px;line-height:2">'+T('اسم المستخدم','Username')+': <b dir="ltr">'+esc(r&&r.username)+'</b><br>'+T('كلمة المرور المؤقتة','Temporary password')+': <b dir="ltr" style="font-size:18px" id="aribaPw2Tmp">'+esc(r&&r.temporary_password)+'</b></div>'
      +'<div style="font-size:12px;color:#555;line-height:1.7;margin-bottom:12px">'+T('ادّيها للموظف. أول ما يدخل هيتطلب منه يغيّرها بكلمة خاصة بيه، وأي جهاز كان داخل على حسابه اتعمله خروج. مش هتظهر تاني بعد ما تقفل النافذة.','Give it to the employee. They must change it at first sign-in and any signed-in device is logged out. It will not be shown again after you close this window.')+'</div>'
      +'<div style="display:flex;gap:8px"><button id="aribaPw2Copy" type="button" style="flex:1;padding:10px;border:0;border-radius:8px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer">'+T('نسخ','Copy')+'</button>'
      +'<button id="aribaPw2Close" type="button" style="padding:10px 16px;border:1px solid #ccc;border-radius:8px;background:#f3f4f6;color:#111;cursor:pointer">'+T('إغلاق','Close')+'</button></div></div>';
    document.body.appendChild(w);
    var kill=closeOn(w);
    w.querySelector('#aribaPw2Close').onclick=kill;
    w.querySelector('#aribaPw2Copy').onclick=function(){ if(copyText(String(r&&r.temporary_password||''))) this.textContent=T('تم النسخ ✓','Copied ✓'); };
  }
  async function resetFor(emp,btn){
    if(!UUID.test(window.ARIBA_HR_TOKEN||'')){ notify(T('لازم تكون داخل بحسابك السحابي','You must be signed in with your cloud account'),true); return; }
    if(!confirm(T('هتطلع كلمة مرور مؤقتة جديدة لـ '+emp.nameAr+'، والقديمة هتبطل. متأكد؟','Generate a new temporary password for '+emp.nameAr+'? The old one will stop working.'))) return;
    var old=btn.textContent; btn.disabled=true; btn.textContent=T('جاري الإنشاء…','Generating…');
    try{
      var r=await rpc('ariba_hr_reset_password',{p_token:window.ARIBA_HR_TOKEN,p_employee_id:String(emp.id)});
      showResetResult(emp.nameAr,r);
    }catch(e){ notify('❌ '+(e.message||e),true); }
    btn.disabled=false; btn.textContent=old;
  }

  function fillEmps(){
    var sel=document.getElementById('aribaPwEmpSel'); if(!sel) return;
    var q=((document.getElementById('aribaPwEmpQ')||{}).value||'').trim().toLowerCase();
    var keep=sel.value;
    var list=activeEmps().filter(function(e){ return !q || (String(e.nameAr)+' '+String(e.nameEn||'')+' '+String(e.empNo||'')).toLowerCase().indexOf(q)>=0; });
    sel.innerHTML='<option value="">'+T('— اختر الموظف —','— Select employee —')+'</option>'+list.map(function(e){
      return '<option value="'+esc(e.id)+'">'+esc(e.nameAr)+(e.empNo?' — '+esc(e.empNo):'')+'</option>'; }).join('');
    if(keep) sel.value=keep;
  }

  function ensure(){
    try{
      var lo=document.querySelector('button[onclick="hrLogout()"]');
      if(lo && !document.getElementById('aribaPwHdrBtn')){
        var b=document.createElement('button'); b.id='aribaPwHdrBtn'; b.type='button'; b.className='ib';
        b.title=T('تغيير كلمة مرور حسابي','Change my password'); b.setAttribute('aria-label',b.title);
        b.style.fontSize='12px'; b.innerHTML='<i class="ti ti-key"></i>';
        b.onclick=openChange; lo.parentNode.insertBefore(b,lo);
      }
      var pg=document.getElementById('pg-set');
      if(pg && !document.getElementById('aribaPwSetCard')){
        var c=document.createElement('div'); c.className='card'; c.id='aribaPwSetCard'; c.style.cssText='margin-top:12px;max-width:900px';
        c.innerHTML='<div class="ct"><i class="ti ti-lock"></i> '+T('كلمات المرور والأمان','Passwords &amp; security')+'</div>'
          +'<div style="margin-top:10px;font-weight:700">'+T('كلمة مرور حسابي','My account password')+'</div>'
          +'<div style="font-size:12px;color:var(--mu);margin:4px 0 8px">'+T('غيّر كلمة مرور دخولك للبرنامج في أي وقت.','Change your sign-in password at any time.')+'</div>'
          +'<button type="button" class="btn bpl" id="aribaPwMineBtn"><i class="ti ti-key"></i> '+T('تغيير كلمة المرور','Change password')+'</button>'
          +'<div style="border-top:1px solid var(--bd);margin:16px 0 12px"></div>'
          +'<div style="font-weight:700">'+T('إعادة تعيين كلمة مرور موظف','Reset an employee password')+'</div>'
          +'<div style="font-size:12px;color:var(--mu);margin:4px 0 8px">'+T('بتطلع كلمة مرور مؤقتة، والقديمة بتبطل، والموظف بيغيّرها أول ما يدخل تطبيق الموظف.','Generates a temporary password, the old one stops working, and the employee must change it at first sign-in.')+'</div>'
          +'<div class="fg"><div><label>'+T('بحث بالاسم أو الرقم الوظيفي','Search by name or employee no.')+'</label><input id="aribaPwEmpQ" type="text" autocomplete="off"></div>'
          +'<div><label>'+T('الموظف','Employee')+'</label><select id="aribaPwEmpSel"></select></div></div>'
          +'<button type="button" class="btn bpl" id="aribaPwResetBtn" style="margin-top:10px"><i class="ti ti-refresh"></i> '+T('إعادة تعيين كلمة المرور','Reset password')+'</button>';
        pg.appendChild(c);
        c.querySelector('#aribaPwMineBtn').onclick=openChange;
        c.querySelector('#aribaPwEmpQ').addEventListener('input',fillEmps);
        c.querySelector('#aribaPwEmpSel').addEventListener('focus',fillEmps);
        c.querySelector('#aribaPwResetBtn').onclick=function(){
          var id=c.querySelector('#aribaPwEmpSel').value;
          if(!id){ notify(T('اختر الموظف الأول','Select an employee first'),true); return; }
          var emp=activeEmps().find(function(e){ return String(e.id)===String(id); });
          if(!emp){ notify(T('الموظف غير موجود','Employee not found'),true); return; }
          resetFor(emp,this);
        };
        fillEmps();
      }
      var s=document.getElementById('aribaPwEmpSel');
      if(s && s.options.length<=1) fillEmps();
    }catch(e){}
  }
  setInterval(ensure,1000); setTimeout(ensure,300);
})();
