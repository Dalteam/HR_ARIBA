// EOS
function rEOS(){
  var eosDateEl=document.getElementById('eosEndDate');
  var endDateVal=(eosDateEl&&eosDateEl.value)?eosDateEl.value:new Date().toISOString().slice(0,10);
  var endD=new Date(endDateVal);
  var eosLawEl=document.getElementById('eosLawSel');
  var law=(eosLawEl&&eosLawEl.value)?eosLawEl.value:'m84';
  var lawNames={m84:'م.84 إنهاء الشركة',m74:'م.74 اتفاق',m85:'م.85 استقالة',m75:'م.75 قسرية',m77:'م.77 تعسفي',m80:'م.80 تأديبي',m74r:'م.74(4) تقاعد',m74d:'م.74(3) وفاة'};
  var ef=document.getElementById('eosEmpFilter');
  if(ef&&ef.options.length<=1){var employers=[];aEmps().filter(function(e){return !e.isTerminated && e.excludeFromEOS!==true&&!e.isHourly;}).forEach(function(e){if(employers.indexOf(e.employer)<0)employers.push(e.employer);});employers.sort().forEach(function(em){var o=document.createElement('option');o.value=em;o.textContent=em;ef.appendChild(o);});}
  var filterEmp=(ef&&ef.value)?ef.value:'';
  var emps=aEmps().filter(function(e){return !e.isHourly&&(filterEmp?e.employer===filterEmp:true);});
  function getYrs(e){if(!e.contractJoin)return e.yearsOfService||0;return Math.max(0,Math.round(((endD-new Date(e.contractJoin))/(365.25*24*3600*1000))*100)/100);}
  function calcByLaw(sal,hou,yrs,sel){var base=sal+hou,y1=Math.min(yrs,5),y2=Math.max(0,yrs-5),eos84=Math.round(((base/2)*y1+base*y2)*100)/100;if(sel==='m84'||sel==='m74'||sel==='m74r'||sel==='m74d')return eos84;if(sel==='m85'||sel==='m75'){if(yrs<2)return 0;if(yrs<5)return Math.round(eos84/3*100)/100;if(yrs<10)return Math.round(eos84*2/3*100)/100;return eos84;}if(sel==='m77'){var c77=Math.max(Math.round(base*2),Math.round((base/30*15)*yrs));return Math.round((eos84+c77)*100)/100;}return 0;}
  var ths='padding:7px 10px;text-align:right;font-size:10px;font-weight:700;border-bottom:2px solid var(--bl);background:var(--c2)';
  var thl='padding:7px 10px;text-align:center;font-size:10px;font-weight:700;border-bottom:2px solid var(--bl);background:rgba(59,130,246,.12);color:var(--bl)';
  document.getElementById('eosHead').innerHTML='<tr><th style="'+ths+'">م</th><th style="'+ths+';min-width:120px">الموظف</th><th style="'+ths+'">جهة العمل</th><th style="'+ths+'">المباشرة</th><th style="'+ths+'">الخدمة</th><th style="'+ths+'">الأساسي</th><th style="'+ths+'">السكن</th><th style="'+ths+'">الوعاء</th><th style="'+thl+'">'+(lawNames[law]||law)+'</th></tr>';
  var tds='padding:7px 10px;border-bottom:1px solid rgba(36,48,68,.25);text-align:right';
  var body='',totBase=0,totEOS=0;
  emps.forEach(function(e,i){
    var yrs=getYrs(e),sal=e.salary||0,hou=e.housingAllowance||0,base=sal+hou,eos=calcByLaw(sal,hou,yrs,law);
    totBase+=base;totEOS+=eos;
    var durText=yrs.toFixed(2)+' سنة';
    if(e.contractJoin){var d1=new Date(e.contractJoin),fy=endD.getFullYear()-d1.getFullYear();if(endD.getMonth()<d1.getMonth()||(endD.getMonth()===d1.getMonth()&&endD.getDate()<d1.getDate()))fy--;var ay=new Date(d1.getFullYear()+fy,d1.getMonth(),d1.getDate()),fm=0,tmp=new Date(ay);while(new Date(tmp.getFullYear(),tmp.getMonth()+1,tmp.getDate())<=endD){tmp=new Date(tmp.getFullYear(),tmp.getMonth()+1,tmp.getDate());fm++;}var fd=Math.round((endD-tmp)/86400000)+1;durText=fy+' سنة '+fm+' شهر '+fd+' يوم';}
    var ec=eos===0?'var(--dm)':law==='m77'?'var(--rd)':'var(--bl)';
    body+='<tr><td style="'+tds+';color:var(--dm)">'+(i+1)+'</td><td style="'+tds+';font-weight:600">'+e.nameAr.split(' ').slice(0,3).join(' ')+'</td><td style="'+tds+'"><span class="b bb" style="font-size:10px">'+e.employer+'</span></td><td style="'+tds+'">'+fD(e.contractJoin)+'</td><td style="'+tds+';color:var(--pu);font-weight:600">'+durText+'</td><td style="'+tds+';color:var(--gr)">'+fN(sal)+'</td><td style="'+tds+'">'+fN(hou)+'</td><td style="'+tds+';color:var(--cy);font-weight:600">'+fN(base)+'</td><td style="'+tds+';color:'+ec+';font-weight:'+(eos>0?'700':'400')+';text-align:center">'+(eos>0?fN(eos)+' ر.س':'—')+'</td></tr>';
  });
  document.getElementById('eosBody').innerHTML=body;
  var ftd='padding:7px 10px;background:rgba(59,130,246,.08);border-top:2px solid var(--bl);font-weight:700;font-size:11px;text-align:right';
  document.getElementById('eosFoot').innerHTML='<tr><td style="'+ftd+'" colspan="7">الإجمالي ('+emps.length+' موظف)</td><td style="'+ftd+';color:var(--cy)">'+fN(Math.round(totBase))+'</td><td style="'+ftd+';color:var(--bl);text-align:center">'+fN(Math.round(totEOS))+' ر.س</td></tr>';
  document.getElementById('eosKPIs').innerHTML='<div style="background:var(--bl)15;border:1px solid var(--bl)44;border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:var(--mu)">القانون</div><div style="font-size:13px;font-weight:800;color:var(--bl)">'+(lawNames[law]||law)+'</div></div><div style="background:var(--gr)15;border:1px solid var(--gr)44;border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:var(--mu)">إجمالي المكافآت</div><div style="font-size:14px;font-weight:800;color:var(--gr)">'+fN(Math.round(totEOS))+' ر.س</div></div><div style="background:var(--cy)15;border:1px solid var(--cy)44;border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:var(--mu)">إجمالي الوعاء</div><div style="font-size:14px;font-weight:800;color:var(--cy)">'+fN(Math.round(totBase))+' ر.س</div></div><div style="background:var(--pu)15;border:1px solid var(--pu)44;border-radius:10px;padding:10px;text-align:center"><div style="font-size:10px;color:var(--mu)">عدد الموظفين</div><div style="font-size:14px;font-weight:800;color:var(--pu)">'+emps.length+'</div></div>';
}
function exportEOS(){
  try{var eosDateEl=document.getElementById('eosEndDate');var date=eosDateEl&&eosDateEl.value?eosDateEl.value:new Date().toISOString().slice(0,10);var eosLawEl=document.getElementById('eosLawSel');var law=eosLawEl&&eosLawEl.value?eosLawEl.value:'m84';var rows=[['م','الموظف','جهة العمل','تاريخ المباشرة','مدة الخدمة','الأساسي','السكن','الوعاء','المكافأة ('+law+')']];var trs=document.querySelectorAll('#eosBody tr');for(var i=0;i<trs.length;i++){var cells=trs[i].cells;var row=[];for(var j=0;j<cells.length;j++)row.push(cells[j].textContent.trim().replace('—','0'));rows.push(row);}var csv='﻿'+rows.map(function(r){return r.map(function(v){return '"'+v+'"';}).join(',');}).join('\n');var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='EOS_'+law+'_'+date+'.csv';a.click();toast('تم تصدير Excel');}catch(e){console.error(e);}
}
