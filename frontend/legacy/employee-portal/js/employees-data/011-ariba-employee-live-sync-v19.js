
(function(){
  'use strict';
  /*
   * Silent live sync:
   * - Reads the same authenticated Supabase context used by HR.
   * - Never rebuilds the page just because the timer fired.
   * - Re-renders only when the active employee context actually changes.
   * - Never re-renders while the user is typing/selecting a field.
   * This fixes the visible white/blank flash caused by unconditional renderHome/renderPay/etc.
   */
  var POLL_MS=1000, lastSig='', inFlight=false, timer=null, pending=false, started=false;
  window.ARIBA_SILENT_SYNC={version:19,interval:POLL_MS};

  function activeTab(){
    var b=document.querySelector('.bni.on');
    return b?b.id.replace(/^tb-/,''):'home';
  }
  function editing(){
    var a=document.activeElement;
    return !!(a && (a.matches('input,select,textarea,[contenteditable="true"]') || a.closest('form')));
  }
  function stable(v){
    if(v===null||typeof v!=='object')return v;
    if(Array.isArray(v))return v.map(stable);
    var o={},k=Object.keys(v).sort();
    for(var i=0;i<k.length;i++)o[k[i]]=stable(v[k[i]]);
    return o;
  }
  function signature(c){
    try{
      if(!c)return '';
      /* Include all employee-facing data so HR edits propagate without guessing which field changed. */
      return JSON.stringify(stable({
        employee:c.employee||null,
        requests:c.requests||[],
        notifications:c.notifications||[],
        attendance:c.attendance||[],
        team:c.team||[],
        locations:c.locations||[],
        payroll:c.payroll||[],
        documents:c.documents||[],
        holidays:c.holidays||[]
      }));
    }catch(e){return '';}
  }
  function renderActive(){
    var tab=activeTab();
    var fns={home:window.renderHome,att:window.renderAtt,lv:window.renderLv,pay:window.renderPay,team:window.renderTeam,prof:window.renderProf,approvals:window.renderApprovals,overtime:window.renderOvertime};
    var fn=fns[tab];
    if(typeof fn!=='function')return;
    /* Render on the next frame so the browser paints the existing page first. */
    requestAnimationFrame(function(){
      try{
        var r=fn();
        if(r&&typeof r.catch==='function')r.catch(function(){});
      }catch(e){}
    });
  }
  async function poll(){
    if(inFlight || !window.ARIBA_SESSION || !window.refreshAribaContext || document.hidden)return;
    inFlight=true;
    try{
      var c=await window.refreshAribaContext();
      var sig=signature(c);
      if(!lastSig){lastSig=sig;pending=false;return;}
      if(sig!==lastSig){
        lastSig=sig;
        if(editing()) pending=true;
        else {pending=false;renderActive();}
      }
    }catch(e){}
    finally{inFlight=false;}
  }
  function start(){
    if(started)return;
    started=true;
    if(timer)clearInterval(timer);
    timer=null;
    /* manual refresh only */
  }
  function stop(){
    if(timer){clearInterval(timer);timer=null;}
    started=false;inFlight=false;lastSig='';pending=false;
  }
  window.ARIBA_SYNC_NOW=poll;
  window.addEventListener('focusout',function(){
    if(pending && !editing()){
      pending=false;
      setTimeout(renderActive,80);
    }
  });
  /* no automatic refresh on visibility */

  /* Start/stop around the existing secure login without changing its UI. */
  var oldLogin=window.doLogin;
  if(typeof oldLogin==='function' && !oldLogin.__aribaSilentWrapped){
    var wrappedLogin=async function(){var r=await oldLogin.apply(this,arguments);/* manual refresh only; no automatic polling */return r;};
    wrappedLogin.__aribaSilentWrapped=true;
    window.doLogin=wrappedLogin;
  }
  var oldLogout=window.doLogout;
  if(typeof oldLogout==='function' && !oldLogout.__aribaSilentWrapped){
    var wrappedLogout=async function(){stop();return oldLogout.apply(this,arguments);};
    wrappedLogout.__aribaSilentWrapped=true;
    window.doLogout=wrappedLogout;
  }
  /* manual refresh only; no automatic polling */
})();
