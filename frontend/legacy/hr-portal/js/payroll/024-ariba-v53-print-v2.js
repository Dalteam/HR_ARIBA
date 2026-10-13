
(function(){
'use strict';
function darkenEmployer(){
 try{
  if(!window.charts)return;
  Object.keys(window.charts).forEach(function(k){
   var ch=window.charts[k], labels=ch?.data?.labels||[];
   var i=labels.findIndex(function(x){return /^(اريبا|ariba)$/i.test(String(x).trim());});
   if(i<0)return;
   (ch.data.datasets||[]).forEach(function(d){
    if(Array.isArray(d.backgroundColor)){
     while(d.backgroundColor.length<labels.length)d.backgroundColor.push('#E8ECEA');
     d.backgroundColor[i]='#014D3D';
    }
   });
   ch.update('none');
  });
 }catch(e){}
}
setTimeout(darkenEmployer,500);setTimeout(darkenEmployer,1500);/* disabled: no recurring chart repaint */

window.printPayroll=function(){
 var rows=(window.currentRows||[]).slice().sort(function(a,b){
  var x=Number(String(a.empNo||a.id||'').replace(/\D/g,'')),y=Number(String(b.empNo||b.id||'').replace(/\D/g,''));
  return (isFinite(x)?x:999999)-(isFinite(y)?y:999999);
 });
 var m=document.getElementById('payMonth')?.value||'', y=document.getElementById('payYear')?.value||'';
 var months=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
 function n(v){return Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});}
 function e(v){return String(v??'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
 var tc=0,ts=0,te=0;
 var head='<tr>'+[
 'الرقم','الاسم','الوظيفة','أيام العمل','أيام التأمينات','الراتب الأساسي','بدل السكن','بدل النقل','بدل المشروع','بدلات أخرى',
 'الإضافي','بدل الإجازة','حسبة نهاية الخدمة','الإجمالي المستحق','الاستقطاعات','استقطاعات التأمينات الاجتماعية — حصة الموظف',
 'الإجمالي (العملات)','الإجمالي الصافي (الريال)','تأمينات حصة الشركة'
 ].map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr>';
 var body=rows.map(function(r){
  var ot=Number(r.overtime??r.ot??r.extraPay??0);
  var lp=Number(r.leaveComp??r.leaveAllowance??r.leavePay??r.annualLeavePay??0);
  var eos=Number(r.eosLawAmt??r.eosAmt??r.endService??r.endServiceAmount??0);
  var ded=Number(r.loanDeduct??0)+Number(r.otherDeduct??0)+Number(r.absenceDeduct??r.absence??0)+Number(r.discountDeduct??r.discount??0);
  var netc=Number(r.net??0)+eos, nets=Number(r.netSAR??(netc*(Number(r.exchRate)||1))), er=Number(r.insEr??r.insuranceEmployer??r.employerInsurance??0);
  tc+=netc;ts+=nets;te+=er;
  return '<tr><td>'+e(r.empNo)+'</td><td>'+e(r.name)+'</td><td>'+e(r.job)+'</td><td>'+n(r.workDays)+'</td><td>'+n(r.insDays??r.days)+'</td><td>'+n(r.sal)+'</td><td>'+n(r.hou)+'</td><td>'+n(r.tra)+'</td><td>'+n(r.prj)+'</td><td>'+n(r.oth)+'</td><td>'+n(ot)+'</td><td>'+n(lp)+'</td><td>'+n(eos)+'</td><td>'+n(r.totalDue)+'</td><td>'+n(ded)+'</td><td>'+n(r.insEmp)+'</td><td>'+n(netc)+'</td><td>'+n(nets)+' ر.س</td><td>'+n(er)+' ر.س</td></tr>';
 }).join('');
 var w=window.open('','_blank','width=1800,height=1000');
 if(!w){if(typeof toast==='function')toast('اسمح بالنوافذ المنبثقة للطباعة','ter');return;}
 w.document.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>مسير رواتب '+months[Number(m)]+' '+y+'</title><style>@page{size:A3 landscape;margin:5mm}body{font-family:"Segoe UI",Arial,sans-serif;margin:0;color:#111;font-size:8px}.head{text-align:center;border-bottom:2px solid #014D3D;padding-bottom:6px;margin-bottom:8px}.brand{color:#014D3D;font-size:15px;font-weight:800}.title{font-size:16px;font-weight:800;margin:3px}.meta{color:#555}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#014D3D;color:#fff;padding:4px 3px;border:1px solid #bfc8d4;font-size:7px}td{padding:3px;border:1px solid #cfd6df;font-size:7px;text-align:right;word-break:break-word}tr:nth-child(even){background:#f5f7f6}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:10px}.box{border:1px solid #cfd6df;border-radius:6px;padding:7px;background:#f5f7f6;text-align:center}.lbl{font-size:8px;color:#5d6662}.val{font-size:12px;font-weight:800;color:#014D3D;margin-top:3px}</style></head><body><div class="head"><div class="brand">شركة اريبا لخدمات الأعمال</div><div class="title">مسير الرواتب الشهري</div><div class="meta">'+months[Number(m)]+' '+y+' — '+(window.currentApproved?'معتمد':'غير معتمد')+'</div></div><table>'+head+body+'</table><div class="summary"><div class="box"><div class="lbl">اجمالي صافي العملات</div><div class="val">'+n(tc)+'</div></div><div class="box"><div class="lbl">اجمالي صافي بالريال</div><div class="val">'+n(ts)+' ر.س</div></div><div class="box"><div class="lbl">تامينات المنشأة</div><div class="val">'+n(te)+' ر.س</div></div><div class="box"><div class="lbl">عدد الموظفين</div><div class="val">'+rows.length+'</div></div></div><script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>');
 w.document.close();
};
})();
