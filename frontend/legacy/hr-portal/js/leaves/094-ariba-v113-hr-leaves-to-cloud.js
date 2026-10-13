
/* ============================================================
   V113: الإجازات اللي الموارد البشرية بتسجلها/بتعتمدها/بترفضها كانت بتتحفظ
   على الجهاز بس (البرنامج كان بيحاول يكتب في جدول مقفول وبيفشل بصمت)،
   فالموظف ومديره مكانوش بيشوفوها. دلوقتي كل تغيير بيتبعت للسحابة
   (ariba_hr_record_leave) ويظهر في "طلباتي" في تطبيق الموظف مع إشعار.
   ============================================================ */
(function(){
  'use strict';
  var SUPA='https://iwviydmapqpqihcdazpe.supabase.co', KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var SIGKEY='hr7_leave_cloud_sig_v113';
  var TYPES=['annual','sick','emergency','death','marriage','maternity','paternity','umrah','hajj','remote'];
  function rj(k,fb){ try{ var r=localStorage.getItem(k); return r?JSON.parse(r):fb; }catch(e){ return fb; } }
  function sigMap(){ return rj(SIGKEY,{})||{}; }
  function saveSig(m){ try{ localStorage.setItem(SIGKEY,JSON.stringify(m)); }catch(e){} }
  function rpc(fn,args){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); x.open('POST',SUPA+'/rest/v1/rpc/'+fn);
      x.setRequestHeader('apikey',KEY); x.setRequestHeader('Authorization','Bearer '+KEY); x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){ var d=null; try{ d=JSON.parse(x.responseText||'null'); }catch(e){}
        if(x.status>=200&&x.status<300) res(d); else rej(new Error((d&&(d.message||d.hint))||('HTTP '+x.status))); };
      x.onerror=function(){ rej(new Error('network')); }; x.send(JSON.stringify(args||{}));
    });
  }
  function fld(l,k){ try{ if(typeof leaveDateValue==='function'){ var v=leaveDateValue(l,k); if(v) return String(v).slice(0,10); } }catch(e){} return String(l[k]||l[k+'_date']||'').slice(0,10); }
  function ltype(l){ try{ if(typeof leaveTypeValue==='function') return leaveTypeValue(l); }catch(e){} return String(l.type||'annual'); }
  function ldays(l){ var d=Number(l.days); if(d>0) return d; try{ if(typeof leaveRequestDays==='function') return leaveRequestDays(l); }catch(e){} return null; }
  function isCloudOrigin(l){ return !!(l.workflowManaged||l.workflowRequestId||l.workflow_request_id||l.source==='cloud'); }
  function sig(l){ return [String(l.status||'pending').toLowerCase(),fld(l,'from'),fld(l,'to'),ldays(l),ltype(l)].join('|'); }

  var busy=false, again=null, warned=false;
  async function syncLeaves(list, opts){
    opts=opts||{};
    if(!UUID.test(window.ARIBA_HR_TOKEN||'')) return {sent:0,failed:0};
    if(busy){ again=list; return {sent:0,failed:0}; }
    busy=true;
    var m=sigMap(), sent=0, failed=0, lastErr='';
    for(var i=0;i<(list||[]).length;i++){
      var l=list[i];
      if(!l||!l.id||isCloudOrigin(l)) continue;
      var t=ltype(l); if(TYPES.indexOf(t)<0) continue;
      var from=fld(l,'from'), to=fld(l,'to')||from; if(!from) continue;
      if(opts.fromYear && Number(from.slice(0,4))<opts.fromYear) continue;
      var s=sig(l); if(m[l.id]===s) continue;
      try{
        await rpc('ariba_hr_record_leave',{p_token:window.ARIBA_HR_TOKEN,p_employee_id:String(l.empId||l.emp_id||''),p_hr_leave_id:String(l.id),
          p_type:t,p_from:from,p_to:to,p_days:ldays(l),p_notes:String(l.notes||''),p_status:String(l.status||'pending').toLowerCase()});
        m[l.id]=s; saveSig(m); sent++;
      }catch(e){ failed++; lastErr=String(e.message||e); }
    }
    busy=false;
    if(failed && !warned){ warned=true; try{ toast('⚠ '+failed+' إجازة مااتبعتتش لتطبيق الموظف ('+lastErr.slice(0,80)+') — هنعيد المحاولة','ter'); }catch(e){} }
    if(again){ var a=again; again=null; setTimeout(function(){ syncLeaves(a); },200); }
    return {sent:sent,failed:failed};
  }
  window.aribaSyncLeavesToCloud=syncLeaves;

  var prev=window.saveLvs;
  if(typeof prev==='function' && !prev.__v113){
    window.saveLvs=function(v){
      var r=prev.apply(this,arguments);
      try{ if(Array.isArray(v)){ var copy=v.slice(); setTimeout(function(){ syncLeaves(copy).then(function(res){ if(res.sent){ warned=false; } }); },80); } }catch(e){}
      return r;
    };
    window.saveLvs.__v113=true;
  }

  /* بعد تسجيل الدخول: ابعت إجازات السنة الحالية اللي لسه مااتبعتتش (مرة واحدة) + إعادة محاولة كل دقيقة */
  var backfilled=false;
  setInterval(async function(){
    if(!UUID.test(window.ARIBA_HR_TOKEN||'')) return;
    try{
      var list=(typeof getLvs==='function')?getLvs():[];
      var res=await syncLeaves(list,{fromYear:new Date().getFullYear()});
      if(!backfilled){ backfilled=true; if(res.sent){ try{ toast('✓ اتبعت '+res.sent+' إجازة لتطبيق الموظفين','tin'); }catch(e){} } }
    }catch(e){}
  }, 60000);
  setTimeout(function(){ if(UUID.test(window.ARIBA_HR_TOKEN||'')){ var list=(typeof getLvs==='function')?getLvs():[]; syncLeaves(list,{fromYear:new Date().getFullYear()}).then(function(res){ backfilled=true; if(res.sent){ try{ toast('✓ اتبعت '+res.sent+' إجازة لتطبيق الموظفين','tin'); }catch(e){} } }); } }, 6000);
})();
