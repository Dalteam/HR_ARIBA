
(function(){
'use strict';
window.ARIBA_EXCEL_REPORT_DATA=[];
var DARK='#014D3D',LIGHT='#29B35E',BEIGE='#E4E4BC',GRAY_DARK='#4B5563',GRAY_LIGHT='#B8BFBC',BLACK='#111111',WHITE='#FFFFFF';
function N(v){return String(v||'').trim().replace(/\s+/g,' ').replace(/أ/g,'ا').replace(/إ/g,'ا').replace(/آ/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase();}
function current(){return ARIBA_EXCEL_REPORT_DATA.filter(function(x){return !x.isTerminated;});}
function terminated(){return ARIBA_EXCEL_REPORT_DATA.filter(function(x){return x.isTerminated;});}
function fDate(v){if(!v)return'—';try{return new Date(v).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn');}catch(e){return v;}}
function daysTo(v){if(!v)return null;var d=new Date(v),t=new Date();if(isNaN(d.getTime()))return null;d.setHours(0,0,0,0);t.setHours(0,0,0,0);return Math.ceil((d-t)/86400000);}
function badgeDays(d){if(d===null)return'<span class="b bk">—</span>';if(d<=0)return'<span class="b br">منتهي</span>';if(d<=30)return'<span class="b br">'+d+' يوم</span>';if(d<=90)return'<span class="b ba">'+d+' يوم</span>';return'<span class="b bg">'+d+' يوم</span>';}
function money(v){return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';}
function showExcelReport(title,html){if(typeof showRpt==='function')showRpt(title,html);}
function reportLeave(){
 var a=current();
 showExcelReport('أرصدة الإجازات', '<table><tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>المستحق السنوي</th><th>رصيد الخدمة</th><th>الرصيد الحالي</th><th>بدل الإجازة حتى اليوم</th></tr>'+
 a.map(function(x){return'<tr><td>'+x.id+'</td><td>'+x.name+'</td><td>'+x.employer+'</td><td>'+Number(x.leaveAnnual||21).toFixed(0)+' يوم</td><td>'+Number(x.leaveBalanceService||0).toFixed(2)+'</td><td style="font-weight:700;color:'+(Number(x.leaveBalanceCurrent||0)>0?'var(--gr)':'var(--rd)')+'">'+Number(x.leaveBalanceCurrent||0).toFixed(2)+' يوم</td><td>'+money(x.leaveAllowanceToday)+'</td></tr>';}).join('')+'</table>');
}
function reportIq(){
 var a=current().filter(function(x){return x.iqamaNo||x.iqamaExpiry;}).sort(function(a,b){return (daysTo(a.iqamaExpiry)??9999)-(daysTo(b.iqamaExpiry)??9999);});
 showExcelReport('تقرير الإقامات','<table><tr><th>#</th><th>الموظف</th><th>رقم الإقامة</th><th>جهة العمل</th><th>الانتهاء</th><th>المتبقي</th></tr>'+
 a.map(function(x){var d=daysTo(x.iqamaExpiry);return'<tr><td>'+x.id+'</td><td>'+x.name+'</td><td>'+x.iqamaNo+'</td><td>'+x.employer+'</td><td>'+fDate(x.iqamaExpiry)+'</td><td>'+badgeDays(d)+'</td></tr>';}).join('')+'</table>');
}
function reportPp(){
 var a=current().filter(function(x){return x.passportNo||x.passportExpiry;}).sort(function(a,b){return (daysTo(a.passportExpiry)??9999)-(daysTo(b.passportExpiry)??9999);});
 showExcelReport('تقرير الجوازات','<table><tr><th>#</th><th>الموظف</th><th>الجواز</th><th>الجنسية</th><th>الانتهاء</th><th>المتبقي</th></tr>'+
 a.map(function(x){return'<tr><td>'+x.id+'</td><td>'+x.name+'</td><td>'+x.passportNo+'</td><td>'+x.nationality+'</td><td>'+fDate(x.passportExpiry)+'</td><td>'+badgeDays(daysTo(x.passportExpiry))+'</td></tr>';}).join('')+'</table>');
}
function reportCt(){
 var a=current().filter(function(x){return x.contractEnd;}).sort(function(a,b){return (daysTo(a.contractEnd)??9999)-(daysTo(b.contractEnd)??9999);});
 showExcelReport('تقرير العقود','<table><tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>بداية العقد</th><th>الانتهاء</th><th>المتبقي</th></tr>'+
 a.map(function(x){return'<tr><td>'+x.id+'</td><td>'+x.name+'</td><td>'+x.employer+'</td><td>'+fDate(x.contractStart)+'</td><td>'+fDate(x.contractEnd)+'</td><td>'+badgeDays(daysTo(x.contractEnd))+'</td></tr>';}).join('')+'</table>');
}
function reportEOS(){
 var a=terminated().filter(function(x){return Number(x.eosLaborLaw||x.eosEndContract||0)>0;});
 showExcelReport('مكافآت نهاية الخدمة','<table><tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>آخر يوم عمل</th><th>سبب/بند الانتهاء</th><th>مكافأة نهاية الخدمة حسب نظام العمل</th></tr>'+
 a.map(function(x){return'<tr><td>'+x.id+'</td><td>'+x.name+'</td><td>'+x.employer+'</td><td>'+fDate(x.lastDay)+'</td><td>'+ (x.reason||'—') +'</td><td style="font-weight:700;color:var(--gr)">'+money(x.eosLaborLaw||x.eosEndContract)+'</td></tr>';}).join('')+'</table>');
}
function reportAlerts(){
 var a=current(),out=[];
 a.forEach(function(x){[['iqamaExpiry','الهوية / الإقامة'],['passportExpiry','الجواز'],['contractEnd','العقد']].forEach(function(p){var d=daysTo(x[p[0]]);if(d!==null&&d<=90)out.push({x:x,type:p[1],d:d,date:x[p[0]]});});});
 out.sort(function(a,b){return a.d-b.d;});
 showExcelReport('التنبيهات العاجلة','<table><tr><th>#</th><th>الموظف</th><th>نوع الوثيقة</th><th>تاريخ الانتهاء</th><th>المتبقي</th></tr>'+
 out.map(function(q){return'<tr><td>'+q.x.id+'</td><td>'+q.x.name+'</td><td>'+q.type+'</td><td>'+fDate(q.date)+'</td><td>'+badgeDays(q.d)+'</td></tr>';}).join('')+'</table>');
}
function reportTerminated(){
 var a=terminated();
 showExcelReport('المنتهية خدماتهم ('+a.length+')','<table><tr><th>#</th><th>الاسم</th><th>جهة العمل</th><th>الجنسية</th><th>آخر يوم عمل</th><th>السبب / البند</th></tr>'+
 a.map(function(x){return'<tr><td>'+x.id+'</td><td>'+x.name+'</td><td>'+x.employer+'</td><td>'+x.nationality+'</td><td>'+fDate(x.lastDay)+'</td><td>'+ (x.reason||'—') +'</td></tr>';}).join('')+'</table>');
}
/* Override report buttons with Excel-backed reports. */
/* تم حذف سطر كان بيستبدل تقارير التبويب الصحيحة (اللي بتاخد بيانات حية من aEmps/tEmps) بنسخة قديمة بتاخد بيانات مجمّدة من وقت استيراد الإكسل الأول */

/* Dashboard: the urgent-alert KPI/list is generated from the same Excel-backed report data. */
function dashboardAlerts(){
 var a=current(),out=[];
 a.forEach(function(x){[['iqamaExpiry','الهوية / الإقامة'],['passportExpiry','الجواز'],['contractEnd','العقد']].forEach(function(p){var d=daysTo(x[p[0]]);if(d!==null&&d<=90)out.push({x:x,type:p[1],d:d,date:x[p[0]]});});});
 var ac=document.getElementById('AC');if(ac)ac.textContent=out.length;
 var box=document.getElementById('AL');
 if(box)box.innerHTML=out.sort(function(a,b){return a.d-b.d;}).slice(0,12).map(function(q){return'<div class="al '+(q.d<=30?'alr':'ala')+'"><i class="ti ti-alert-triangle"></i><div><strong>'+q.x.name+'</strong> — '+q.type+': '+fDate(q.date)+' ('+(q.d<=0?'منتهي':q.d+' يوم')+')</div></div>';}).join('')||'<div style="color:var(--mu);padding:12px">لا توجد تنبيهات</div>';
}
window.ARIBA_REFRESH_EXCEL_REPORTS=function(){dashboardAlerts();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(dashboardAlerts,800);},{once:true});else setTimeout(dashboardAlerts,800);
})();
