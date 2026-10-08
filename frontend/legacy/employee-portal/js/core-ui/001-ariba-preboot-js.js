(function(){
  /* لو فيه جلسة محفوظة: منعرضش شاشة الدخول لحظة قبل ما التطبيق يفتح */
  try{
    var tok=''; try{ tok=localStorage.getItem('ariba_employee_session_v2')||''; }catch(e){}
    if(tok){
      var root=document.documentElement; root.classList.add('ariba-boot-session'); var t0=Date.now();
      var iv=setInterval(function(){
        var app=document.getElementById('sc-app'), stillTok=''; try{ stillTok=localStorage.getItem('ariba_employee_session_v2')||''; }catch(e){}
        if((app&&app.classList.contains('on'))||!stillTok||Date.now()-t0>9000){ root.classList.remove('ariba-boot-session'); clearInterval(iv); }
      },120);
    }
  }catch(e){}
  /* ===== عين إظهار/إخفاء كلمة المرور على أي حقل باسورد (شاشة الدخول + نوافذ تغيير كلمة المرور) ===== */
  var EYE='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYEOFF='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19C5.6 19 2 12 2 12a18.3 18.3 0 0 1 4.1-5.1M9.9 5.2A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.2 3.2"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"/></svg>';
  function en(){ try{ var l=localStorage.getItem('ariba_ui_lang')||localStorage.getItem('hr7_lang')||''; return l==='en'; }catch(e){ return false; } }
  function label(show){ return en()?(show?'Hide password':'Show password'):(show?'إخفاء كلمة المرور':'إظهار كلمة المرور'); }
  function attachEye(inp){
    if(!inp||inp.__ariba_eye||inp.type!=='password'||!inp.parentNode) return; inp.__ariba_eye=1;
    var cs=getComputedStyle(inp), ltr=(cs.direction==='ltr'), side=ltr?'right':'left';
    var wrap=document.createElement('span'); wrap.className='ariba-eye-wrap'; wrap.style.cssText='position:relative;display:block;width:100%';
    inp.parentNode.insertBefore(wrap,inp); wrap.appendChild(inp);
    var pad=(parseFloat(cs['padding'+(ltr?'Right':'Left')])||0)+34; inp.style['padding'+(ltr?'Right':'Left')]=pad+'px';
    var mb=cs.marginBottom||'0px';
    var b=document.createElement('button'); b.type='button'; b.tabIndex=-1; b.className='ariba-eye-btn'; b.title=label(false); b.setAttribute('aria-label',label(false)); b.innerHTML=EYE;
    b.style.cssText='position:absolute;top:0;bottom:'+mb+';'+side+':2px;width:34px;border:0;background:transparent;cursor:pointer;color:#8a94a0;display:flex;align-items:center;justify-content:center;padding:0;margin:0;outline:none';
    var timer=null;
    function set(show){ inp.type=show?'text':'password'; b.innerHTML=show?EYEOFF:EYE; b.title=label(show); b.setAttribute('aria-label',label(show)); b.style.color=show?'#29B35E':'#8a94a0'; clearTimeout(timer); if(show) timer=setTimeout(function(){ set(false); },15000); }
    b.addEventListener('mousedown',function(e){ e.preventDefault(); });          /* ما نخطفش الفوكس من الحقل */
    b.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); set(inp.type==='password'); try{ inp.focus(); }catch(x){} });
    inp.addEventListener('blur',function(){ setTimeout(function(){ if(document.activeElement!==b&&document.activeElement!==inp&&inp.type==='text') set(false); },200); });
    wrap.appendChild(b);
  }
  function scan(root){ (root||document).querySelectorAll&&(root||document).querySelectorAll('input[type="password"]').forEach(attachEye); }
  /* نمسح أول ما العناصر تتبني (أثناء تحميل الصفحة) وبعدين لأي نافذة جديدة */
  try{ new MutationObserver(function(muts){ scan(); var chk=document.getElementById('aribaPw2Show'); if(chk){ var lb=chk.closest('label'); if(lb) lb.remove(); } }).observe(document.documentElement,{childList:true,subtree:true}); }catch(e){}
  document.addEventListener('DOMContentLoaded',function(){ scan(); });
})();
