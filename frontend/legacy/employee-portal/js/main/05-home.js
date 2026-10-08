// ====== HOME ======
function renderHome(){
  var el=document.getElementById('appContent');
  if(!el)return;
  syncFromHR();
  var today=new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var lvs=getMyLeaves();
  var lastLv=lvs.length>0?lvs[lvs.length-1]:null;
  el.innerHTML=
    '<div class="card">'+
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'+
        av(ME.name,ec(ME.name),48)+
        '<div>'+
          '<div style="font-size:16px;font-weight:700">أهلاً، '+ME.name.split(' ')[0]+' 👋</div>'+
          '<div style="font-size:11px;color:var(--mu)">'+today+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="kpi-row">'+
        '<div class="kpi" style="border-top:3px solid var(--gr)">'+
          '<div class="kpi-label">رصيد الإجازة</div>'+
          '<div class="kpi-val" style="color:var(--gr)">'+ME.leave_bal+'</div>'+
          '<div class="kpi-sub">يوم'+(ME.leave_carry>0?' + '+ME.leave_carry+' مرحّل':'')+' </div>'+
        '</div>'+
        '<div class="kpi" style="border-top:3px solid var(--cy)">'+
          '<div class="kpi-label">عن بعد المتبقي</div>'+
          '<div class="kpi-val" style="color:var(--cy)">'+(ME.remote_limit-ME.remote_used)+'</div>'+
          '<div class="kpi-sub">من '+ME.remote_limit+' يوم</div>'+
        '</div>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--mu)">'+ME.job+(ME.dept?' — '+ME.dept:'')+'</div>'+
    '</div>'+
    (lastLv?
      '<div class="card">'+
        '<div class="card-title"><i class="ti ti-history"></i> آخر طلب</div>'+
        '<div style="display:flex;align-items:center;justify-content:space-between">'+
          '<div style="font-size:12px">'+(LVL[lastLv.type]?LVL[lastLv.type].ar:lastLv.type)+(lastLv.from_date?' — '+fD(lastLv.from_date):'')+'</div>'+
          '<span class="b '+(lastLv.status==='approved'?'bg':lastLv.status==='rejected'?'br':'ba')+'">'+(lastLv.status==='approved'?'موافق':lastLv.status==='rejected'?'مرفوض':'معلق')+'</span>'+
        '</div>'+
      '</div>':'');
}

