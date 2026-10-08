// ====== PAY ======
function renderPay(){
  var el=document.getElementById('appContent');if(!el)return;
  syncFromHR();
  var tot=(ME.salary||0)+(ME.hou||0)+(ME.tra||0)+(ME.prj||0)+(ME.oth||0);
  el.innerHTML=
    '<div class="card">'+
      '<div class="card-title"><i class="ti ti-cash"></i> كشف الراتب</div>'+
      row('الراتب الأساسي',fN(ME.salary)+' ر.س')+
      (ME.hou>0?row('بدل السكن',fN(ME.hou)+' ر.س'):'')+
      (ME.tra>0?row('بدل المواصلات',fN(ME.tra)+' ر.س'):'')+
      (ME.prj>0?row('بدل المشروع',fN(ME.prj)+' ر.س'):'')+
      (ME.oth>0?row('بدلات أخرى',fN(ME.oth)+' ر.س'):'')+
      '<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:14px;border-top:1px solid var(--bd);margin-top:6px">'+
        '<span>الإجمالي</span><span style="color:var(--bl)">'+fN(tot)+' ر.س</span></div>'+
      '<div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:800;font-size:16px">'+
        '<span>الصافي</span><span style="color:var(--gr)">'+fN(ME.net)+' ر.س</span></div>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title"><i class="ti ti-building-bank"></i> بيانات البنك</div>'+
      row('IBAN',ME.iban||'—')+
    '</div>';
}
function row(l,v){return'<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(36,48,68,.3);font-size:12px"><span style="color:var(--mu)">'+l+'</span><span style="font-weight:600">'+v+'</span></div>';}

