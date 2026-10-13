
/* V104: أي حد داخل بكلمة المرور الافتراضية لازم يغيّرها قبل ما يكمل */
(function(){
  'use strict';
  var SUPA='https://iwviydmapqpqihcdazpe.supabase.co', KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function token(){ return window.ARIBA_HR_TOKEN || window.ARIBA_SESSION || ''; }
  function rpc(fn,args){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); x.open('POST',SUPA+'/rest/v1/rpc/'+fn);
      x.setRequestHeader('apikey',KEY); x.setRequestHeader('Authorization','Bearer '+KEY); x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){ var d=null; try{ d=JSON.parse(x.responseText||'null'); }catch(e){}
        if(x.status>=200&&x.status<300) res(d); else rej(new Error((d&&(d.message||d.hint))||('HTTP '+x.status))); };
      x.onerror=function(){ rej(new Error('تعذر الاتصال بالإنترنت')); };
      x.send(JSON.stringify(args||{}));
    });
  }
  var checked={}, open=false;
  function show(username){
    if(open) return; open=true;
    var w=document.createElement('div'); w.id='aribaPwModal';
    w.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl;font-family:Tahoma,Arial,sans-serif';
    w.innerHTML='<div style="background:#fff;color:#111;max-width:380px;width:100%;border-radius:14px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.35)">'
     +'<div style="font-size:17px;font-weight:700;margin-bottom:6px">🔒 غيّر كلمة المرور</div>'
     +'<div style="font-size:12.5px;color:#555;line-height:1.7;margin-bottom:14px">حسابك <b>'+String(username||'').replace(/[<>&"]/g,'')+'</b> لسه على كلمة المرور الافتراضية، ودي معروفة وسهل تتخمن. لازم تغيّرها عشان تكمل.</div>'
     +'<input id="apwOld" type="password" placeholder="كلمة المرور الحالية" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:8px;border:1px solid #ccc;border-radius:8px;font-size:14px">'
     +'<input id="apwNew" type="password" placeholder="كلمة المرور الجديدة (8 على الأقل، حروف وأرقام)" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:8px;border:1px solid #ccc;border-radius:8px;font-size:14px">'
     +'<input id="apwNew2" type="password" placeholder="أعد كتابة كلمة المرور الجديدة" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:10px;border:1px solid #ccc;border-radius:8px;font-size:14px">'
     +'<div id="apwErr" style="display:none;color:#b91c1c;font-size:12.5px;margin-bottom:10px"></div>'
     +'<button id="apwBtn" style="width:100%;padding:11px;border:0;border-radius:8px;background:#0f766e;color:#fff;font-size:15px;font-weight:700;cursor:pointer">حفظ كلمة المرور</button></div>';
    document.body.appendChild(w);
    var err=w.querySelector('#apwErr'), btn=w.querySelector('#apwBtn');
    function fail(m){ err.textContent=m; err.style.display='block'; btn.disabled=false; btn.textContent='حفظ كلمة المرور'; }
    btn.onclick=async function(){
      var o=w.querySelector('#apwOld').value, n=w.querySelector('#apwNew').value, n2=w.querySelector('#apwNew2').value;
      if(!o||!n) return fail('اكتب كلمة المرور الحالية والجديدة');
      if(n!==n2) return fail('كلمتين المرور الجديدتين مش زي بعض');
      if(n.length<8) return fail('كلمة المرور الجديدة لازم 8 حروف على الأقل');
      btn.disabled=true; btn.textContent='جاري الحفظ…';
      try{
        await rpc('ariba_change_my_password',{p_token:token(),p_old:o,p_new:n});
        w.remove(); open=false; checked[token()]='ok';
        try{ window.toast('✓ تم تغيير كلمة المرور','tin'); }catch(e){ alert('تم تغيير كلمة المرور'); }
      }catch(e){ fail(e.message||'حصلت مشكلة'); }
    };
  }
  async function check(){
    var t=token(); if(!UUID.test(t) || checked[t]) return;
    checked[t]='pending';
    try{ var d=await rpc('ariba_password_status',{p_token:t}); checked[t]='ok'; if(d&&d.must_change) show(d.username); }
    catch(e){ delete checked[t]; }
  }
  setInterval(check,3000); setTimeout(check,1500);
})();
