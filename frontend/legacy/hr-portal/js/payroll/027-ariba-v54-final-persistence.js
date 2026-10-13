
(function(){
  'use strict';
  const ARCH='ariba_approved_payroll_history_v54';

  function read(){
    try{return JSON.parse(localStorage.getItem(ARCH)||'{}')}catch(e){return {}}
  }
  function write(x){
    try{localStorage.setItem(ARCH,JSON.stringify(x));return true}catch(e){return false}
  }
  function key(y,m){return 'pay_'+Number(y)+'_'+String(Number(m)).padStart(2,'0');}
  function currentKey(){
    return key(
      document.getElementById('payYear')?.value || new Date().getFullYear(),
      document.getElementById('payMonth')?.value || new Date().getMonth()+1
    );
  }
  function monthName(m){
    return ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][Number(m)]||m;
  }
  function esc(v){
    return String(v??'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]});
  }

  function saveApprovedArchive(){
    try{
      var k=currentKey(), raw=localStorage.getItem('hr7_'+k);
      if(!raw)return;
      var p=JSON.parse(raw);
      if(!p?.approved || !Array.isArray(p.rows))return;
      var all=read();
      all[k]={
        year:Number(document.getElementById('payYear')?.value)||new Date().getFullYear(),
        month:Number(document.getElementById('payMonth')?.value)||new Date().getMonth()+1,
        approved_at:p.approvedAt||new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn'),
        saved_at:new Date().toISOString(),
        employees:p.rows.length,
        rows:p.rows
      };
      write(all);
    }catch(e){console.warn('archive save',e)}
  }

  function localRecords(){
    var a=read();
    return Object.keys(a).map(function(k){return a[k]}).sort(function(x,y){
      return (Number(y.year)*100+Number(y.month))-(Number(x.year)*100+Number(x.month));
    });
  }

  window.__aribaSaveApprovedArchiveV54=saveApprovedArchive;

  /* Capture every approval, then immediately write a durable local archive. */
  try{
    var oldApprove=window.approvePayroll;
    if(typeof oldApprove==='function'){
      window.approvePayroll=function(){
        var r=oldApprove.apply(this,arguments);
        setTimeout(function(){
          saveApprovedArchive();
          if(typeof window.loadPayrollArchive53==='function')window.loadPayrollArchive53();
        },250);
        return r;
      };
    }
  }catch(e){}

  /* Merge cloud history with local history. Local is the fallback so the list
     remains visible after refresh/logout even if the RPC is temporarily unavailable. */
  window.loadPayrollArchive53=function(){
    var box=document.getElementById('ARIBA_PAYROLL_ARCHIVE');
    if(!box)return;
    var local=localRecords();
    function render(records){
      if(!records.length){
        box.innerHTML='<div style="padding:22px;text-align:center;color:var(--mu)">لا توجد مسيرات رواتب معتمدة محفوظة حتى الآن.</div>';
        return;
      }
      box.innerHTML=records.map(function(x){
        var total=0,net=0;
        (x.rows||[]).forEach(function(r){
          total+=Number(r.totalDue||r.total||0)||0;
          net+=Number(r.netSAR||r.net||0)||0;
        });
        return '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 12px;border-bottom:1px solid var(--bd)">'+
          '<div style="min-width:150px;flex:1"><strong>'+monthName(x.month)+' '+x.year+'</strong>'+
          '<div style="font-size:10px;color:var(--mu);margin-top:3px">معتمد — '+esc(x.approved_at||'')+' | '+Number(x.employees||0)+' موظف</div></div>'+
          '<div class="b bgr" style="padding:5px 9px">'+total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' إجمالي</div>'+
          '<div class="b ba" style="padding:5px 9px">'+net.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR صافي</div>'+
          '<button class="btn bsm bpl" onclick="openPayrollArchive53('+Number(x.year)+','+Number(x.month)+')">مراجعة</button></div>';
      }).join('');
    }

    /* Show local records immediately — no waiting on network. */
    render(local);

    /* Then merge any cloud records without deleting local ones. */
    if(window.ARIBA_HR_TOKEN && typeof hrRPC==='function'){
      hrRPC('ariba_payroll_archive',{p_token:window.ARIBA_HR_TOKEN}).then(function(d){
        var cloud=d?.archives||[], all=read();
        cloud.forEach(function(x){
          var k=key(x.year,x.month);
          if(!all[k] || !all[k].rows?.length){
            all[k]={
              year:Number(x.year),month:Number(x.month),approved_at:x.approved_at||'',
              saved_at:new Date().toISOString(),employees:Number(x.employees||0),rows:x.rows||[]
            };
          }
        });
        write(all);
        render(localRecords());
      }).catch(function(){});
    }
  };

  /* Review button reads local archive first, so an approved month can always be opened. */
  window.openPayrollArchive53=function(y,m){
    var rec=read()[key(y,m)];
    if(rec && Array.isArray(rec.rows)){
      var host=document.getElementById('ARIBA_PAYROLL_ARCHIVE_DETAIL');
      if(host){
        var html='<div class="card" style="margin-top:10px;padding:0;overflow:auto"><div class="ch"><div class="ct">📁 مسير معتمد — '+monthName(m)+' '+y+'</div><button class="btn bsm" onclick="this.closest(\'.card\').remove()">إغلاق</button></div>'+
        '<div style="padding:8px;font-size:11px;color:var(--mu)">تاريخ الاعتماد: '+esc(rec.approved_at||'')+' | عدد الموظفين: '+Number(rec.employees||rec.rows.length)+'</div>'+
        '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th>#</th><th>الموظف</th><th>العملة</th><th>الإجمالي</th><th>الصافي المحلي</th><th>الصافي بالريال</th></tr></thead><tbody>';
        rec.rows.forEach(function(r,i){
          html+='<tr><td>'+esc(r.empNo||r.employee_id||r.id||i+1)+'</td><td>'+esc(r.nameAr||r.name||r.nameEn||'—')+'</td><td>'+esc(r.currency||'ريال سعودي')+'</td><td>'+Number(r.totalDue||r.total||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td><td>'+Number(r.net||r.netLocal||r.netSalary||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td><td style="font-weight:800;color:var(--gr)">'+Number(r.netSAR||r.net||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR</td></tr>';
        });
        html+='</tbody></table></div>';
        host.innerHTML=html;
        host.scrollIntoView({behavior:'smooth',block:'start'});
        return;
      }
    }
    /* If no local copy exists, fall back to the cloud implementation if available. */
    try{
      if(window.ARIBA_HR_TOKEN && typeof hrRPC==='function'){
        hrRPC('ariba_payroll_archive',{p_token:window.ARIBA_HR_TOKEN,p_year:Number(y),p_month:Number(m)}).then(function(d){
          var x=(d?.archives||[])[0];
          if(x){
            var all=read();all[key(y,m)]={
              year:Number(y),month:Number(m),approved_at:x.approved_at||'',saved_at:new Date().toISOString(),
              employees:Number(x.employees||0),rows:x.rows||[]
            };write(all);window.openPayrollArchive53(y,m);
          }
        });
      }
    }catch(e){}
  };

  /* If an already-running page has an approved payroll, capture it now too. */
  setTimeout(saveApprovedArchive,700);
})();
