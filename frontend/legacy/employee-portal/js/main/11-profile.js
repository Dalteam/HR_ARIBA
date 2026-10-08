// ====== PROFILE ======
function renderProf(){
  var el=document.getElementById('appContent');if(!el)return;
  syncFromHR();
  el.innerHTML=
    '<div class="card" style="text-align:center">'+
      av(ME.name,ec(ME.name),64)+
      '<div style="font-size:16px;font-weight:700;margin:10px 0 4px">'+ME.name+'</div>'+
      '<div style="font-size:12px;color:var(--mu)">'+ME.job+'</div>'+
      '<div style="font-size:11px;color:var(--dm);margin-top:2px">'+ME.username+'</div>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title">البيانات الشخصية</div>'+
      row('الجنسية',ME.nationality||'—')+
      row('جهة العمل',ME.employer||'—')+
      row('الوظيفة',ME.job||'—')+
      row('القسم',ME.dept||'—')+
      row('الجوال',ME.mobile||'—')+
      row('البريد',ME.email||'—')+
      row('البنك / IBAN',ME.iban||'—')+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title">الوثائق</div>'+
      row('رقم الإقامة',ME.iqama||'—')+
      row('انتهاء الإقامة',fD(ME.iqama_exp))+
      row('تاريخ المباشرة',fD(ME.join))+
      row('انتهاء العقد',fD(ME.end))+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title">العقد والإجازات</div>'+
      row('المستحق سنوياً',ME.leave_contract+' يوم')+
      row('الرصيد المتاح',ME.leave_bal+' يوم')+
      (ME.leave_carry>0?row('رصيد مرحّل',ME.leave_carry+' يوم (محجوز نهاية الخدمة)'):'')+ 
    '</div>';
}

