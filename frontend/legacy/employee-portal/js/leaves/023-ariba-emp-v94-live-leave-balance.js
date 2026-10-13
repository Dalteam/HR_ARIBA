
/* ============================================================
   V94: رصيد الإجازة كان بيتعرض من رقم مجمّد اتخزن وقت آخر استيراد
   بيانات، فكان يختلف عن رصيد الموارد البشرية اللي بيتحسب لحظيًا
   كل يوم. هنا بنعيد نفس معادلة الترحيل والاستحقاق بالظبط جوه
   تطبيق الموظف، عشان الرقمين يفضلوا متطابقين دايمًا تلقائيًا.
   ============================================================ */
(function(){
  'use strict';
  function isWorkday94(d){var day=d.getDay();return day!==5&&day!==6;}
  function getHolidaySet94(){
    var set={};
    try{
      var hols=(typeof ARIBA_CTX!=='undefined'&&ARIBA_CTX&&ARIBA_CTX.holidays)||(typeof gLSJ==='function'?gLSJ(HR+'hols'):null)||[];
      hols.forEach(function(h){
        if(!h||!h.date)return;
        var start=new Date(h.date);
        if(isNaN(start))return;
        var span=Math.max(1,Number(h.days)||1);
        for(var i=0;i<span;i++){
          var d=new Date(start);d.setDate(d.getDate()+i);
          set[d.toISOString().slice(0,10)]=true;
        }
      });
    }catch(e){}
    return set;
  }
  function workdaysBetween94(start,end,holSet){
    if(!(start instanceof Date)||!(end instanceof Date)||isNaN(start)||isNaN(end)||end<start) return 0;
    var n=0,d=new Date(start.getFullYear(),start.getMonth(),start.getDate());
    var last=new Date(end.getFullYear(),end.getMonth(),end.getDate());
    while(d<=last){
      if(isWorkday94(d) && !(holSet && holSet[d.toISOString().slice(0,10)])) n++;
      d.setDate(d.getDate()+1);
    }
    return n;
  }
  function computeLiveLeaveBalance94(m){
    try{
      var holSet=getHolidaySet94();
      var y=new Date().getFullYear();
      var overrides=m.leaveYearOverrides||{};
      var cur=overrides[String(y)]||{};
      var prev=overrides[String(y-1)]||{};
      var carry=prev.carryNext!==undefined?Math.min(10,Math.max(0,Number(prev.carryNext)||0)):0;
      var annual=Number(m.leaveDaysContract||21)||21;
      var yearStart=new Date(y,0,1);
      var joinDate=m.contractJoin?new Date(m.contractJoin):null;
      var startDate=(joinDate&&joinDate>yearStart)?joinDate:yearStart;
      var now=new Date();
      var yearEnd=new Date(y,11,31);
      var fullYearWorkdays=workdaysBetween94(yearStart,yearEnd,holSet)||1;
      var workedWorkdays=workdaysBetween94(startDate,now,holSet);
      var accrued=Math.min(annual,Math.max(0,annual*(workedWorkdays/fullYearWorkdays)));
      var baselineUsed=Number(cur.used||0)||0;
      var asOf=cur.asOf?new Date(cur.asOf):null;
      var extraUsed=0;
      var myReqs=(typeof getMyLeaves==='function')?getMyLeaves():(m.workflowRequests||[]);
      (myReqs||[]).forEach(function(r){
        if(!r||r.type!=='annual'||r.status!=='approved')return;
        var from=r.from_date?new Date(r.from_date):null;
        var to=r.to_date?new Date(r.to_date):from;
        if(!from||isNaN(from)||from.getFullYear()!==y)return;
        if(asOf&&from<=asOf)return; /* محسوب أصلًا ضمن رصيد الاستيراد */
        var clampedTo=to>now?now:to;
        if(clampedTo<from)return;
        extraUsed+=workdaysBetween94(from,clampedTo,holSet);
      });
      var used=baselineUsed+extraUsed;
      var bal=Math.max(0,carry+accrued-used);
      return Math.round(bal*100)/100;
    }catch(e){ return null; }
  }
  window.computeLiveLeaveBalance94=computeLiveLeaveBalance94;

  var oldRC94=window.refreshAribaContext;
  if(typeof oldRC94==='function' && !oldRC94.__aribaV94){
    var rc94=async function(){
      var c=await oldRC94.apply(this,arguments);
      try{
        if(window.ME){
          var live=computeLiveLeaveBalance94(window.ME);
          if(live!==null){ window.ME.leave_bal=live; }
        }
      }catch(e){}
      return c;
    };
    rc94.__aribaV94=true;
    window.refreshAribaContext=rc94;
  }
})();
