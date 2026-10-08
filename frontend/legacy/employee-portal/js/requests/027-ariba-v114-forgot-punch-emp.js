
/* V114: طلب نسيان بصمة في تطبيق الموظف — يروح للموارد البشرية مباشرة (إضافة فقط) */
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

  /* ---------- نسيان بصمة: نوع طلب جديد يروح للموارد البشرية مباشرة ---------- */
  try{ if(typeof LVL==='object' && LVL && !LVL.forgot_punch) LVL.forgot_punch={ar:'نسيان بصمة',icon:'ti-fingerprint',color:'#0ea5e9'}; }catch(e){}
  function todayISO(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function openForgot(){
    if(document.getElementById('aribaFpModal')) return;
    var tk=window.ARIBA_SESSION||'';
    if(!UUID.test(tk)){ notify(T('سجّل الدخول بحسابك الأول','Please sign in first'),true); return; }
    var w=overlay('aribaFpModal'), kind='in';
    var lbl='display:block;font-size:12px;color:#444;margin:6px 0 3px';
    w.innerHTML='<div style="background:#fff;color:#111;max-width:400px;width:100%;max-height:92vh;overflow:auto;border-radius:14px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.35)">'
      +'<div style="font-size:17px;font-weight:700;margin-bottom:6px">🖐 '+T('نسيان بصمة','Forgot to punch')+'</div>'
      +'<div style="font-size:12.5px;color:#555;line-height:1.7;margin-bottom:10px">'+T('اختر نوع البصمة اللي نسيتها والتاريخ والوقت واكتب السبب. الطلب بيروح للموارد البشرية مباشرة، ولما يوافقوا بيتسجل الحضور/الانصراف في سجلك.','Choose the missed punch, date and time and write the reason. The request goes straight to HR; once approved it is recorded in your attendance.')+'</div>'
      +'<div id="aribaFpKinds" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:4px"></div>'
      +'<label style="'+lbl+'">'+T('التاريخ','Date')+'</label><input id="aribaFpDate" type="date" max="'+todayISO()+'" value="'+todayISO()+'" style="'+INP+'">'
      +'<label id="aribaFpL1" style="'+lbl+'"></label><input id="aribaFpT1" type="time" style="'+INP+'">'
      +'<div id="aribaFpBox2" style="display:none"><label style="'+lbl+'">'+T('وقت الخروج','Check-out time')+'</label><input id="aribaFpT2" type="time" style="'+INP+'"></div>'
      +'<label style="'+lbl+'">'+T('السبب (مطلوب)','Reason (required)')+'</label><textarea id="aribaFpNotes" rows="3" style="'+INP+';resize:vertical" placeholder="'+T('اكتب سبب نسيان البصمة','Why did you forget?')+'"></textarea>'
      +'<div id="aribaFpErr" style="display:none;color:#b91c1c;font-size:12.5px;margin-bottom:10px"></div>'
      +'<div style="display:flex;gap:8px"><button id="aribaFpSend" type="button" style="flex:1;padding:11px;border:0;border-radius:8px;background:#0f766e;color:#fff;font-size:15px;font-weight:700;cursor:pointer">'+T('إرسال الطلب','Send request')+'</button>'
      +'<button id="aribaFpCancel" type="button" style="padding:11px 16px;border:1px solid #ccc;border-radius:8px;background:#f3f4f6;color:#111;font-size:14px;cursor:pointer">'+T('إلغاء','Cancel')+'</button></div></div>';
    document.body.appendChild(w);
    var kill=closeOn(w);
    var err=w.querySelector('#aribaFpErr'), btn=w.querySelector('#aribaFpSend');
    var kinds=[['in',T('دخول','Check-in')],['out',T('خروج','Check-out')],['both',T('دخول وخروج','Both')]];
    var kb=w.querySelector('#aribaFpKinds');
    function paint(){
      kb.innerHTML=kinds.map(function(k){ var on=k[0]===kind; return '<button type="button" data-k="'+k[0]+'" style="padding:9px 4px;border-radius:8px;font-size:13px;cursor:pointer;border:2px solid '+(on?'#0f766e':'#ddd')+';background:'+(on?'#ecfdf5':'#f9fafb')+';color:#111;font-weight:'+(on?'700':'400')+'">'+k[1]+'</button>'; }).join('');
      kb.querySelectorAll('button').forEach(function(b){ b.onclick=function(){ kind=b.getAttribute('data-k'); paint(); }; });
      w.querySelector('#aribaFpL1').textContent = kind==='out' ? T('وقت الخروج','Check-out time') : T('وقت الدخول','Check-in time');
      w.querySelector('#aribaFpBox2').style.display = kind==='both' ? 'block' : 'none';
    }
    paint();
    w.querySelector('#aribaFpCancel').onclick=kill;
    function fail(m){ err.textContent=m; err.style.display='block'; btn.disabled=false; btn.textContent=T('إرسال الطلب','Send request'); }
    btn.onclick=async function(){
      var date=w.querySelector('#aribaFpDate').value, t1=w.querySelector('#aribaFpT1').value, t2=w.querySelector('#aribaFpT2').value, notes=w.querySelector('#aribaFpNotes').value.trim();
      if(!date) return fail(T('اختر التاريخ','Choose the date'));
      if(date>todayISO()) return fail(T('لا يمكن اختيار تاريخ في المستقبل','Date cannot be in the future'));
      if(!t1) return fail(T('اختر الوقت','Choose the time'));
      if(kind==='both'){ if(!t2) return fail(T('اختر وقت الخروج','Choose the check-out time')); if(t2<=t1) return fail(T('وقت الخروج لازم يكون بعد وقت الدخول','Check-out must be after check-in')); }
      if(!notes) return fail(T('اكتب السبب','Write the reason'));
      btn.disabled=true; btn.textContent=T('جاري الإرسال…','Sending…');
      var payload={kind:kind,date:date,time:t1,notes:notes}; if(kind==='both') payload.time2=t2;
      try{
        await rpc('ariba_submit_request',{p_token:window.ARIBA_SESSION,p_type:'forgot_punch',p_payload:payload});
        kill(); notify('✅ '+T('تم إرسال الطلب — بانتظار الموارد البشرية','Request sent — pending HR'),false);
        try{ if(typeof refreshAribaContext==='function') await refreshAribaContext(); else if(typeof refreshContext==='function') await refreshContext(); }catch(e){}
        try{ if(typeof window.renderLv==='function') window.renderLv(); }catch(e){}
      }catch(e){ fail(e.message||T('حصلت مشكلة','Something went wrong')); }
    };
  }
  window.aribaOpenForgotPunch=openForgot;
  /* اعتراض الضغط على زر "نسيان بصمة" في شبكة أنواع الطلبات قبل ما يشتغل نموذج الإجازات */
  document.addEventListener('click',function(ev){
    var t=ev.target && ev.target.closest ? ev.target.closest('.lv-type[data-k="forgot_punch"]') : null;
    if(!t) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    openForgot();
  },true);
})();
