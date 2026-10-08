function holidayDatesForYear(year){
  const y=Number(year)||new Date().getFullYear(), out=[];
  getHols().forEach(h=>{
    const base=new Date(h.date||''); if(isNaN(base))return;
    let start;
    if(h.recurring){
      start=new Date(y,base.getMonth(),base.getDate());
    }else{
      if(base.getFullYear()!==y)return;
      start=new Date(base);
    }
    for(let i=0;i<Math.max(1,Number(h.days)||1);i++){
      const d=new Date(start);d.setDate(d.getDate()+i);out.push([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'));
    }
  });
  return new Set(out);
}
function isOfficialHoliday(d){
  const x=d instanceof Date?new Date(d):new Date(d); if(isNaN(x))return false;
  const key=[x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-'); return holidayDatesForYear(x.getFullYear()).has(key);
}
function countLeaveWorkdays(fromDate,toDate){
  let start=fromDate instanceof Date?new Date(fromDate):new Date(fromDate);
  let end=toDate instanceof Date?new Date(toDate):new Date(toDate);
  if(isNaN(start)||isNaN(end)||start>end)return 0;
  start.setHours(0,0,0,0); end.setHours(0,0,0,0);
  let count=0;
  for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
    if(isLeaveWorkday(d)&&!isOfficialHoliday(d))count++;
  }
  return count;
}
function countAnnualLeaveDays(fromDate,toDate){return countLeaveWorkdays(fromDate,toDate);}
