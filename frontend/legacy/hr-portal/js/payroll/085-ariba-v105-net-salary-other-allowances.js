
/* V105: الصافي كان بيرجع لقيمة قديمة (netSalaryLocal) ومش بيشمل البدلات الأخرى.
   تصحيح لمرة واحدة للموظفين اللي صافيهم ناقص بالظبط قيمة البدلات الأخرى/الإضافية. */
(function(){
  try{
    if(localStorage.getItem('hr7_v105_net_fixed')) return;
    var a=JSON.parse(localStorage.getItem('hr7_emps')||'[]'); if(!Array.isArray(a)) return;
    var fixed=[];
    a.forEach(function(e){
      if(!e) return;
      var extra=(Number(e.otherAllowance)||0)+(Number(e.extraAllowance)||0);
      if(!(extra>0)) return;
      var tot=Number(e.salaryTotal)||0, ins=Number(e.insuranceSub)||0, ded=Number(e.otherDeductions)||0;
      var right=Math.round((tot-ins-ded)*100)/100;
      var cur=Number(e.netSalaryLocal||e.netSalary)||0;
      if(Math.abs((cur+extra)-right)<0.02){
        e.netSalary=right; e.netSalaryLocal=right;
        var rate=(e.currency&&e.currency!=='ريال سعودي')?(Number(e.exchRate)||1):1;
        e.netSalarySAR=Math.round(right*rate*100)/100;
        e.updatedAt=new Date().toISOString(); fixed.push(String(e.id));
      }
    });
    if(fixed.length){
      localStorage.setItem('hr7_emps',JSON.stringify(a));
      try{ var q=JSON.parse(localStorage.getItem('hr7_cloud_sync_queue_v100')||'[]'); localStorage.setItem('hr7_cloud_sync_queue_v100',JSON.stringify(Array.from(new Set(q.concat(fixed))))); }catch(e){}
    }
    localStorage.setItem('hr7_v105_net_fixed','1');
  }catch(e){ console.warn('V105 net fix',e); }
})();
