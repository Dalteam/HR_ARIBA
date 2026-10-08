
/* V114: ثبات شاشة الطلبات المعلقة — رسم واحد بدل عارضين متنافسين (إضافة فقط) */
(function(){
  'use strict';
  /* ---------- شاشة "معلقة": رسم واحد ثابت بدل ما عارضين يمسحوا بعض كل كام ثانية ----------
     كان فيه عارضين بيكتبوا في نفس الصندوق (#LVP):
       - rLvPend (القائمة المحلية) كل 10 ثواني
       - rWorkflowQueue (الطلبات السحابية + السابقة) كل 8 ثواني
     فكل واحد كان بيمسح التاني. دلوقتي الاتنين بيروحوا لدالة واحدة بترسم الاتنين مع بعض،
     وما بتلمس الصفحة إلا لو المحتوى اتغير فعلاً. */
  var busy=false, lastRaw=null;
  var origLv=window.rLvPend, origQ=window.rWorkflowQueue;
  function inTemp(fn){
    var real=document.getElementById('LVP'); if(!real) return null;
    var tmp=document.createElement('div'); tmp.style.display='none';
    real.id='LVP__real'; tmp.id='LVP'; document.body.appendChild(tmp);
    var html='';
    try{ fn(); html=tmp.innerHTML; }finally{ if(tmp.parentNode) tmp.parentNode.removeChild(tmp); real.id='LVP'; }
    return html;
  }
  function render(){
    if(busy) return; busy=true;
    try{
      var real=document.getElementById('LVP'); if(!real) return;
      var lvb=document.getElementById('LVB'), count=null;
      /* 1) العارض المحلي بالكامل مرة عشان يظبط عدّاد البادج زي الأول */
      if(typeof origLv==='function'){ inTemp(function(){ origLv(); }); if(lvb) count=lvb.textContent; }
      /* 2) المحلي من غير الطلبات المربوطة بالسحابة (الأخيرة بتظهر في قائمة السحابة) */
      var localHtml='';
      if(typeof origLv==='function'){
        var gl=window.getLvs, gp=window.getPerms;
        try{
          if(typeof gl==='function') window.getLvs=function(){ return gl.apply(this,arguments).filter(function(l){ return !(l.workflowManaged||l.workflowRequestId); }); };
          if(typeof gp==='function') window.getPerms=function(){ return gp.apply(this,arguments).filter(function(l){ return !(l.workflowManaged||l.workflowRequestId); }); };
          var n0=lvb?lvb.textContent:'';
          localHtml=inTemp(function(){ origLv(); })||'';
          var localCount=lvb?Number(lvb.textContent)||0:0;
          if(localCount===0) localHtml='';
        } finally { window.getLvs=gl; window.getPerms=gp; if(lvb&&count!==null) lvb.textContent=count; }
      }
      /* 3) الطلبات السحابية + السابقة */
      var queueHtml=(typeof origQ==='function')?(inTemp(function(){ origQ(); })||''):'';
      var raw=localHtml+queueHtml;
      if(raw!==lastRaw || !real.innerHTML.trim()){ real.innerHTML=raw; lastRaw=raw; }
    }catch(e){
      try{ if(typeof origQ==='function') origQ(); }catch(x){}
    }finally{ busy=false; }
  }
  if(typeof origLv==='function' && typeof origQ==='function'){
    window.rLvPend=render; window.rWorkflowQueue=render;
    setTimeout(render,200);
  }
})();
