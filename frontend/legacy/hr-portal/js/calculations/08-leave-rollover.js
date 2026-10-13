
function rolloverLeaves(){
  const now=new Date(),year=now.getFullYear(),emps=aEmps();let changed=false;
  emps.forEach(e=>{
    const last=Number(e.leaveRolloverThrough)||0;
    if(last>=year)return;
    const start=leaveStartYear(e);
    let eos=Number(e.leaveEosExcess)||0;
    for(let y=Math.max(start,last+1);y<year;y++) eos+=leaveYearExcess(e,y);
    const prevClosing=leaveYearClosing(e,year-1),carry=Math.min(10,Math.max(0,prevClosing));
    e.leaveCarryover=carry;e.leaveEosExcess=eos;e.leaveEosCalculatedThrough=year-1;e.leaveRolloverThrough=year;e.leaveCurrentOverride=undefined;e.leaveBalance=carry;changed=true;
  });
  if(changed){saveEmps(emps);toast('✓ تم تحديث ترحيل الإجازات: بحد أقصى 10 أيام للعام الجديد، والزائد يُرحّل لرصيد نهاية الخدمة.');}
}
