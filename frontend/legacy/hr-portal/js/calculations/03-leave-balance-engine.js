function leaveYearDates(year){
  const y=Number(year)||new Date().getFullYear();
  return {start:new Date(y,0,1),end:new Date(y,11,31)};
}
function leaveEmpStart(e){
  const raw=e.contractJoin||e.joinDate||e.startDate;
  if(!raw)return null;
  const d=new Date(raw); return isNaN(d)?null:d;
}
function leaveAnnual(e){return Math.max(0,Number(e.leaveDaysContract||e.ldc||21)||21);}
function isLeaveWorkday(d){
  const x=d instanceof Date?new Date(d):new Date(d);
  if(isNaN(x))return false;
  const day=x.getDay();
  return day!==5&&day!==6; // Sunday=0 through Thursday=4 are working days
}
function leaveWorkingDaysInYear(year){
  const y=Number(year)||new Date().getFullYear();
  return leavePerfGet('workdays|'+y,()=>countLeaveWorkdays(new Date(y,0,1),new Date(y,11,31)));
}
function leaveAccruedForPeriod(e,year,toDate){
  const y=Number(year),end0=toDate instanceof Date?new Date(toDate):new Date(toDate||leaveYearDates(y).end);
  const key='accrued|'+String(e?.id??'')+'|'+y+'|'+(isNaN(end0)?'bad':end0.toISOString().slice(0,10));
  return leavePerfGet(key,()=>{
    const dates=leaveYearDates(y),annual=leaveAnnual(e),join=leaveEmpStart(e);
    if(join&&join>dates.end)return 0;
    let start=join&&join>dates.start?new Date(join):new Date(dates.start),end=new Date(end0);
    if(end>dates.end)end=new Date(dates.end);
    if(end<start)return 0;
    const fullYearWorkdays=leaveWorkingDaysInYear(y);
    if(fullYearWorkdays<=0)return 0;
    const workedWorkdays=countLeaveWorkdays(start,end);
    return Math.min(annual,Math.max(0,annual*(workedWorkdays/fullYearWorkdays)));
  });
}
function leaveStartYear(e){const d=leaveEmpStart(e);return d?d.getFullYear():new Date().getFullYear();}
function leaveApprovedDays(e,year){
  const y=Number(year); if(!Number.isFinite(y)) return 0;
  const historical=Number(e && e['leaveUsed'+y] || 0) || 0;
  const eid=String(e?.id ?? '');
  const requested=getLvs().filter(l=>leaveEmployeeId(l)===eid && leaveTypeValue(l)==='annual' && String(l.status||'').toLowerCase()==='approved' && String(leaveDateValue(l,'from')||'').slice(0,4)===String(y));
  const fromRequests=requested.reduce((sum,l)=>sum+(Number(l.days)||0),0);
  // Historical employee fields are the authoritative minimum for closed years.
  // If both sources contain the same usage, do not double count them.
  return Math.max(historical,fromRequests);
}
function leaveApprovedDaysTo(e,year,toDate){
  const y=Number(year); if(!Number.isFinite(y)) return 0;
  const end=toDate instanceof Date?new Date(toDate):new Date(toDate||leaveYearDates(y).end);
  end.setHours(23,59,59,999);
  const startYear=leaveYearDates(y).start;
  const eid=String(e?.id ?? '');
  const requests=getLvs().filter(l=>leaveEmployeeId(l)===eid && leaveTypeValue(l)==='annual' && String(l.status||'').toLowerCase()==='approved');
  const requestDays=requests.reduce((sum,l)=>{
    const from=new Date(leaveDateValue(l,'from')||'');
    if(isNaN(from)||from.getFullYear()!==y||from>end)return sum;
    const days=Number(l.days)||0;
    return sum+countAnnualLeaveDays(from,new Date(leaveDateValue(l,'to')||from));
  },0);
  const historical=Number(e && e['leaveUsed'+y] || 0)||0;
  if(end>=leaveYearDates(y).end) return Math.max(historical,requestDays);
  // For the current/partial year, historical data should still be respected,
  // but only requests up to the requested date are counted.
  return Math.max(0,Math.max(historical,requestDays));
}
function leaveFutureApprovedDays(e,fromDate,year){
  const y=Number(year), start=fromDate instanceof Date?new Date(fromDate):new Date(fromDate||leaveYearDates(y).start);
  const eid=String(e?.id ?? '');
  return getLvs().filter(l=>leaveEmployeeId(l)===eid && leaveTypeValue(l)==='annual' && String(l.status||'').toLowerCase()==='approved').reduce((sum,l)=>{
    const from=new Date(leaveDateValue(l,'from')||'');
    const to=new Date(leaveDateValue(l,'to')||from); return (!isNaN(from)&&!isNaN(to)&&from.getFullYear()===y&&from>=start)?sum+countAnnualLeaveDays(from,to):sum;
  },0);
}
function leaveManualNet(e,year,toDate){
  const y=Number(year);if(!Number.isFinite(y))return 0;
  const end0=toDate?new Date(toDate):leaveYearDates(y).end;
  const key='manual|'+String(e?.id??'')+'|'+y+'|'+(isNaN(end0)?'bad':end0.toISOString().slice(0,10));
  return leavePerfGet(key,()=>{
    const end=new Date(end0);end.setHours(23,59,59,999),eid=String(e?.id??'');
    return db('leave_balance_adjustments',[]).filter(a=>String(a.empId??a.emp_id??'')===eid&&String(a.date||a.createdAt||'').slice(0,4)===String(y)&&new Date(a.date||a.createdAt||0)<=end).reduce((sum,a)=>sum+(Number(a.delta)||0),0);
  });
}
function leaveYearOverride(e,year){const o=e&&e.leaveYearOverrides&&e.leaveYearOverrides[String(Number(year))];return o&&typeof o==='object'?o:null;}
function leaveDefaultUsed(e,year,toDate){
  const y=Number(year);if(!Number.isFinite(y))return 0;
  const end0=toDate instanceof Date?new Date(toDate):new Date(toDate||leaveYearDates(y).end);
  const key='used|'+String(e?.id??'')+'|'+y+'|'+(isNaN(end0)?'bad':end0.toISOString().slice(0,10));
  return leavePerfGet(key,()=>{
    const end=new Date(end0);end.setHours(23,59,59,999),eid=String(e?.id??'');
    var override93 = e && e.leaveYearOverrides && e.leaveYearOverrides[String(y)];
    var snapshotDate93 = override93 && override93.asOf ? new Date(override93.asOf) : null;
    const requestDays=getLvs().filter(l=>leaveEmployeeId(l)===eid&&leaveTypeValue(l)==='annual'&&String(l.status||'').toLowerCase()==='approved').reduce((sum,l)=>{
      const from=new Date(leaveDateValue(l,'from')||''),to=new Date(leaveDateValue(l,'to')||from);
      if(isNaN(from)||isNaN(to)||from.getFullYear()!==y||from>end)return sum;
      if(snapshotDate93 && from<snapshotDate93)return sum; /* طلب قديم مسبقًا محسوب ضمن رصيد الاستيراد */
      return sum+countAnnualLeaveDays(from,to>end?end:to);
    },0);
    var baseline93 = Math.max(Number(e&&e['leaveUsed'+y]||0)||0,Number(e&&e.leaveHistoryByYear&&e.leaveHistoryByYear[String(y)]||0)||0,Number((override93&&override93.used)||0)||0);
    return baseline93 + requestDays;
  });
}
function leaveCarryForward(e,year){const y=Number(year)||new Date().getFullYear(),o=leaveYearOverride(e,y);if(o&&o.carry!==undefined)return Math.max(0,Number(o.carry)||0);if(y===leaveStartYear(e))return 0;if(y===2024){const prevClose=leaveYearClosing(e,2023);return Math.max(0,prevClose-10);}const prev=leaveYearOverride(e,y-1);if(prev&&prev.carryNext!==undefined)return Math.min(10,Math.max(0,Number(prev.carryNext)||0));return Math.min(10,Math.max(0,leaveYearClosing(e,y-1)));}
function leaveYearLedger(e,year){
  const y=Number(year),key='ledger|'+String(e?.id??'')+'|'+y;
  return leavePerfGet(key,()=>{
    const dates=leaveYearDates(y),o=leaveYearOverride(e,y),opening=leaveCarryForward(e,y);
    const entitlement=o&&o.entitlement!==undefined?Math.max(0,Number(o.entitlement)||0):leaveAccruedForPeriod(e,y,dates.end);
    const used=o&&o.used!==undefined?Math.max(0,Number(o.used)||0):leaveDefaultUsed(e,y,dates.end);
    const adjustment=o&&o.adjustment!==undefined?Number(o.adjustment)||0:leaveManualNet(e,y);
    const close=o&&o.yearEnd!==undefined?Math.max(0,Number(o.yearEnd)||0):Math.max(0,opening+entitlement+adjustment-used);
    const carry=Math.min(10,Math.max(0,close)),eos=y>=2024?Math.max(0,close-10):0;
    return {year:y,opening,entitlement,used,adjustment,close,carry,eos,override:o};
  });
}
function leaveCurrentLedger(e){const y=new Date().getFullYear(),o=leaveYearOverride(e,y),now=new Date();if(o&&o.current!==undefined)return Math.max(0,Number(o.current)||0);return Math.max(0,leaveCarryForward(e,y)+leaveAccruedForPeriod(e,y,now)+leaveManualNet(e,y,now)-leaveDefaultUsed(e,y,now));}
function leaveYearClosing(e,year){const y=Number(year),o=leaveYearOverride(e,y),now=new Date();if(y<leaveStartYear(e))return 0;if(o&&o.yearEnd!==undefined)return Math.max(0,Number(o.yearEnd)||0);if(y===now.getFullYear())return Math.max(0,leaveCarryForward(e,y)+leaveAccruedForPeriod(e,y,leaveYearDates(y).end)+leaveManualNet(e,y)-leaveDefaultUsed(e,y,leaveYearDates(y).end));return leaveYearLedger(e,y).close;}
function leaveYearExcess(e,year){return Math.max(0,leaveYearClosing(e,year)-10);}
function leaveAccumulatedEos(e,endYear){const start=Math.max(2024,leaveStartYear(e)),end=Number(endYear)||new Date().getFullYear();let total=Number(e.leaveEosExcess)||0;for(let y=start;y<end;y++)total+=leaveYearExcess(e,y);return Math.max(0,total);}
function leaveCumulativeAccruedToToday(e){const start=leaveStartYear(e),now=new Date(),cy=now.getFullYear();let total=0;for(let y=start;y<=cy;y++){const o=leaveYearOverride(e,y);total+=o&&o.entitlement!==undefined&&y<cy?Math.max(0,Number(o.entitlement)||0):leaveAccruedForPeriod(e,y,y===cy?now:leaveYearDates(y).end);}return total;}
function leaveCumulativeUsedToToday(e){const start=leaveStartYear(e),now=new Date(),cy=now.getFullYear();let total=0;for(let y=start;y<=cy;y++){const o=leaveYearOverride(e,y);total+=o&&o.used!==undefined&&y<cy?Math.max(0,Number(o.used)||0):leaveDefaultUsed(e,y,y===cy?now:leaveYearDates(y).end);}return total;}
function leaveCumulativeManualToToday(e){const start=leaveStartYear(e),now=new Date(),cy=now.getFullYear();let total=0;for(let y=start;y<=cy;y++){const o=leaveYearOverride(e,y);total+=o&&o.adjustment!==undefined?Number(o.adjustment)||0:leaveManualNet(e,y,y===cy?now:leaveYearDates(y).end);}return total;}
function leaveCumulativeBalanceToToday(e){return Math.max(0,leaveCumulativeAccruedToToday(e)-leaveCumulativeUsedToToday(e)+leaveCumulativeManualToToday(e));}
function leaveProjectedYearEnd(e,year){return leaveYearClosing(e,Number(year)||new Date().getFullYear());}
function leaveCurrentBalance(e){return Math.max(0,leaveCurrentLedger(e));}
function consumeLeaveBalance(e,days){const d=Math.max(0,Number(days)||0),current=leaveCurrentBalance(e),y=new Date().getFullYear();e.leaveYearOverrides=e.leaveYearOverrides||{};e.leaveYearOverrides[String(y)]={...(e.leaveYearOverrides[String(y)]||{}),current:Math.max(0,current-d),updatedAt:new Date().toISOString()};e.leaveBalance=Math.max(0,current-d);return 0;}
function addLeaveBalance(e,days){const d=Math.max(0,Number(days)||0),current=leaveCurrentBalance(e),y=new Date().getFullYear();e.leaveYearOverrides=e.leaveYearOverrides||{};e.leaveYearOverrides[String(y)]={...(e.leaveYearOverrides[String(y)]||{}),current:current+d,updatedAt:new Date().toISOString()};e.leaveBalance=current+d;}
