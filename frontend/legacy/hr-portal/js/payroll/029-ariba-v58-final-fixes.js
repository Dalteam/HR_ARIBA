
(function(){
  'use strict';
  const STORE='ariba_payroll_archive_v58';

  function readStore(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return {}}}
  function writeStore(x){try{localStorage.setItem(STORE,JSON.stringify(x));return true}catch(e){return false}}
  function payKey(){
    var y=Number(document.getElementById('payYear')?.value)||new Date().getFullYear();
    var m=Number(document.getElementById('payMonth')?.value)||new Date().getMonth()+1;
    return 'pay_'+y+'_'+String(m).padStart(2,'0');
  }
  function monthName(m){
    return ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][Number(m)]||m;
  }
  function esc(v){return String(v??'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function normCur(c){
    var n=String(c||'ريال سعودي').trim().toLowerCase();
    if(n.includes('usd')||n.includes('دولار')) return 'USD';
    if(n.includes('sar')||n.includes('ريال')) return 'SAR';
    return String(c||'');
  }
  function collectApproved(){
    try{
      var k=payKey(), y=Number(document.getElementById('payYear')?.value)||new Date().getFullYear(),
          m=Number(document.getElementById('payMonth')?.value)||new Date().getMonth()+1;
      var raw=localStorage.getItem('hr7_approved_archive_'+k) || localStorage.getItem('hr7_'+k);
      if(!raw)return;
      var p=JSON.parse(raw);
      if(!p || !p.approved || !Array.isArray(p.rows))return;
      var all=readStore();
      all[k]={
        year:y,month:m,approved_at:p.approvedAt||new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn'),
        saved_at:new Date().toISOString(),employees:p.rows.length,rows:p.rows
      };
      writeStore(all);
    }catch(e){}
  }

  function localList(){return Object.values(readStore()).sort(function(a,b){
    return (Number(b.year)*100+Number(b.month))-(Number(a.year)*100+Number(a.month));
  });}

  function renderArchive(){
    var box=document.getElementById('ARIBA_PAYROLL_ARCHIVE'); if(!box)return;
    var list=localList();
    if(!list.length){
      box.innerHTML='<div style="padding:20px;text-align:center;color:var(--mu)">لا توجد مسيرات رواتب معتمدة محفوظة حتى الآن.</div>';
      return;
    }
    box.innerHTML=list.map(function(x){
      var netUSD=0,netSAR=0,insEr=0;
      (x.rows||[]).forEach(function(r){
        var val=Number(r.net||0)+Number(r.eosLawAmt||0);
        if(normCur(r.currency)==='USD') netUSD+=val; else netSAR+=Number(r.netSAR||r.net||0)+Number(r.eosLawAmt||0);
        insEr+=Number(r.insEr||0);
      });
      var parts=[];
      if(netUSD)parts.push(netUSD.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' USD');
      if(netSAR)parts.push(netSAR.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' SAR');
      return '<div class="ariba-archive-row" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px">'+
        '<div style="flex:1;min-width:180px"><strong>'+monthName(x.month)+' '+x.year+'</strong>'+
        '<div style="font-size:10px;color:var(--mu);margin-top:3px">معتمد — '+esc(x.approved_at||'')+' | '+Number(x.employees||0)+' موظف</div></div>'+
        '<div class="b bgr" style="padding:5px 9px">'+esc(parts.join(' | ')||'0')+'</div>'+
        '<div class="b ba" style="padding:5px 9px">تأمينات المنشأة '+insEr.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س</div>'+
        '<button class="btn bsm bpl" onclick="window.openPayrollArchive58('+Number(x.year)+','+Number(x.month)+')">فتح المسير</button>'+
      '</div>';
    }).join('');
  }

  window.openPayrollArchive58=function(y,m){
    var k='pay_'+Number(y)+'_'+String(Number(m)).padStart(2,'0'), x=readStore()[k];
    if(!x)return;
    var host=document.getElementById('ARIBA_PAYROLL_ARCHIVE_DETAIL'); if(!host)return;
    var rows=x.rows||[];
    var html='<div class="card" style="margin-top:10px;padding:0;overflow:auto"><div class="ch"><div class="ct">📁 مسير معتمد — '+monthName(m)+' '+y+'</div><button class="btn bsm" onclick="this.closest(\'.card\').remove()">إغلاق</button></div>'+
      '<div style="padding:8px;color:var(--mu);font-size:11px">تاريخ الاعتماد: '+esc(x.approved_at||'')+' | عدد الموظفين: '+rows.length+'</div>'+
      '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th>الرقم</th><th>الموظف</th><th>الوظيفة</th><th>العملة</th><th>الإجمالي المستحق</th><th>الصافي بالعملة</th><th>الصافي بالريال</th><th>تأمينات المنشأة</th></tr></thead><tbody>';
    rows.forEach(function(r,i){
      html+='<tr><td>'+esc(r.empNo||r.employee_id||i+1)+'</td><td>'+esc(r.nameAr||r.name||r.nameEn||'—')+'</td><td>'+esc(r.job||r.jobTitle||'—')+'</td><td>'+esc(r.currency||'ريال سعودي')+'</td><td>'+Number(r.totalDue||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</td><td>'+Number(r.net||0).toLocaleString('en-US',{minimumFractionDigits:2})+'</td><td>'+Number(r.netSAR||r.net||0).toLocaleString('en-US',{minimumFractionDigits:2})+' SAR</td><td>'+Number(r.insEr||0).toLocaleString('en-US',{minimumFractionDigits:2})+' SAR</td></tr>';
    });
    html+='</tbody></table></div>';
    host.innerHTML=html;
    host.scrollIntoView({behavior:'smooth',block:'start'});
  };

  /* The existing cloud sync remains active; this local archive is the durable UI
     fallback and is populated immediately after approval. */
  function afterApproval(){
    collectApproved();
    renderArchive();
  }

  /* Poll very lightly so approval is reflected even when the existing function
     is a lexical declaration and cannot be safely monkey-patched. */
  setInterval(function(){
    try{
      var pg=document.getElementById('pg-pay');
      if(pg && pg.classList.contains('on')){
        collectApproved();
        renderArchive();
      }
    }catch(e){}
  },800);

  /* Make the archive visible as soon as the payroll page opens. */
  setTimeout(afterApproval,500);
  setTimeout(afterApproval,1500);
  setTimeout(afterApproval,3000);

  /* Explicitly re-render after any click on the approval button. */
  document.addEventListener('click',function(ev){
    var b=ev.target.closest && ev.target.closest('button');
    if(b && /اعتماد|Approve/i.test(b.textContent||'')){
      setTimeout(afterApproval,200);
      setTimeout(afterApproval,900);
    }
  },true);

  /* Print: add a clear currency summary showing USD and SAR totals. */
  try{
    var oldPrint=window.printPayroll;
    if(typeof oldPrint==='function'){
      window.printPayroll=function(){
        var rows=window.currentRows||[];
        var usd=0,sar=0,er=0,count=rows.length;
        rows.forEach(function(r){
          var local=Number(r.net||0)+Number(r.eosLawAmt||0);
          if(normCur(r.currency)==='USD') usd+=local;
          sar+=Number(r.netSAR||0)+Number(r.eosLawAmt||0);
          er+=Number(r.insEr||0);
        });
        var summary='<div class="ariba-print-currency-summary">'+
          '<div class="x">إجمالي صافي العملات<strong>'+(usd?usd.toLocaleString('en-US',{minimumFractionDigits:2})+' USD':'0 USD')+'</strong></div>'+
          '<div class="x">إجمالي صافي بالريال<strong>'+sar.toLocaleString('en-US',{minimumFractionDigits:2})+' SAR</strong></div>'+
          '<div class="x">تأمينات المنشأة<strong>'+er.toLocaleString('en-US',{minimumFractionDigits:2})+' SAR</strong></div>'+
          '<div class="x">عدد الموظفين<strong>'+count+'</strong></div></div>';
        var page=document.getElementById('pg-pay'); if(!page)return;
        var printable=cloneForPrint(page),m=document.getElementById('payMonth')?.value||'',y=document.getElementById('payYear')?.value||'';
        var months=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
        var status=currentApproved?'مسير معتمد':'مسير غير معتمد';
        var win=window.open('','_blank','width=1400,height=900');if(!win){toast('اسمح بالنوافذ المنبثقة للطباعة','ter');return;}
        win.document.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>مسير رواتب '+(months[Number(m)]||m)+' '+y+'</title><style>'+printCSS()+'</style></head><body>');
        win.document.write('<div class="report-head"><div class="brand">شركة اريبا لخدمات الأعمال</div><h1>مسير الرواتب الشهري</h1><div class="meta">'+(months[Number(m)]||m)+' '+y+' — '+status+'</div></div>');
        win.document.write(summary+printable.innerHTML);
        win.document.write('<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\\/script></body></html>');win.document.close();
      };
    }
  }catch(e){}
})();
