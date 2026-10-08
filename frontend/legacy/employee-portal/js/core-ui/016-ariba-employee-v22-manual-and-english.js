
(function(){
'use strict';
/* Disable the V21 background polling completely. Employee refresh is manual only. */
try{if(window.ARIBA_SILENT_SYNC&&window.ARIBA_SILENT_SYNC.timer)clearInterval(window.ARIBA_SILENT_SYNC.timer);}catch(e){}
/* Override the public sync trigger so only the button calls it. */
var oldSync=window.ARIBA_SYNC_NOW;
window.ARIBA_MANUAL_REFRESH_EMP=async function(){
 var b=document.getElementById('ARIBA_MANUAL_REFRESH_EMP');if(b){b.classList.add('busy');b.disabled=true;}
 try{
  if(window.refreshAribaContext){
    var c=await window.refreshAribaContext();
    window.__ARIBA_LAST_MANUAL_CONTEXT=c;
    if(typeof window.syncFromHR==='function')window.syncFromHR();
    var tab=document.querySelector('.bni.on');var id=tab?tab.id.replace(/^tb-/,''):'home';
    var f={home:window.renderHome,att:window.renderAtt,lv:window.renderLv,pay:window.renderPay,team:window.renderTeam,prof:window.renderProf,approvals:window.renderApprovals,overtime:window.renderOvertime};
    if(typeof f[id]==='function')await Promise.resolve(f[id]());
  }else if(typeof oldSync==='function')await oldSync();
  if(typeof toast==='function')toast(T('تم التحديث والحفظ','Updated and synced'),'tok');
 }catch(e){console.error(e);if(typeof toast==='function')toast(T('تعذر إكمال التحديث','Update failed'),'ter');}
 finally{if(b){b.classList.remove('busy');b.disabled=false;}}
};
window.ARIBA_SYNC_NOW=function(){return window.ARIBA_MANUAL_REFRESH_EMP();};

/* Remove automatic start/visibility polling installed by V19. */
try{window.removeEventListener('visibilitychange',window.ARIBA_SYNC_NOW);}catch(e){}

/* Full English UI additions and employee English name usage. */
var ADD={
 'أريبا':'Ariba','أربيا':'Ariba','تطبيق الموظف':'Employee App','الرئيسية':'Home','الحضور والانصراف':'Attendance','الحضور':'Attendance','الإجازات':'Leaves','الراتب':'Salary','فريقي':'My Team','ملفي':'My Profile','الإشعارات':'Notifications','طلبات معلقة':'Pending Requests','الموافقات':'Approvals','عمل إضافي':'Overtime','طلب عمل إضافي':'Overtime Request','الوثائق':'Documents','وثائقي':'My Documents','مرفقات الطلبات':'Request Attachments','كشف الراتب':'Salary Statement','قسيمة الراتب':'Salary Slip','عرض القسيمة':'View Salary Slip','طباعة':'Print','الشهر':'Month','السنة':'Year','تاريخ الانتهاء':'Expiry Date','متبقي':'Remaining','منتهي':'Expired','ينتهي اليوم':'Expires Today','ينتهي خلال':'Expires in','الإقامة / الهوية':'Iqama / ID','انتهاء الإقامة':'Iqama Expiry','جواز السفر':'Passport','انتهاء الجواز':'Passport Expiry','التأمين الطبي':'Medical Insurance','انتهاء التأمين':'Insurance Expiry','العقد':'Contract','انتهاء العقد':'Contract End','تنبيهات انتهاء الوثائق والعقود':'Document & Contract Expiry Alerts','جهة العمل':'Employer','القسم':'Department','الجنسية':'Nationality','المدير المباشر':'Direct Manager','الرقم الوظيفي':'Employee No.','الاسم':'Name','الاسم بالعربي':'Arabic Name','الاسم بالإنجليزي':'English Name','البيانات الشخصية':'Personal Information','الوثائق والعقد':'Documents & Contract','أرصدة الإجازات':'Leave Balances','الراتب الحالي':'Current Salary','بيانات البنك':'Bank Details','الراتب الأساسي':'Basic Salary','بدل السكن':'Housing Allowance','بدل المواصلات':'Transport Allowance','بدل المشروع':'Project Allowance','بدلات أخرى':'Other Allowances','الإجمالي':'Gross Salary','الصافي':'Net Salary','صافي الراتب المستحق':'Net Salary Payable','الراتب الشهري المعتمد':'Approved Monthly Payroll','الرواتب الشهرية المعتمدة':'Approved Monthly Payroll','لا توجد قسيمة راتب معتمدة للشهر والسنة المحددين.':'No approved salary slip is available for the selected month and year.','تاريخ المباشرة':'Join Date','طبيعة العقد':'Contract Nature','مدة العقد (شهر)':'Contract Duration (Months)','محدد المدة':'Fixed-term','غير محدد المدة':'Indefinite-term','الحالة':'Status','التاريخ':'Date','الوقت':'Time','ملاحظات':'Notes','إرسال الطلب':'Submit Request','حفظ':'Save','إلغاء':'Cancel','تحديث':'Update','تم التحديث والحفظ':'Updated and synced','تعذر إكمال التحديث':'Update failed','لا توجد بيانات':'No data','لا توجد طلبات':'No requests','مقبول':'Approved','مرفوض':'Rejected','معلق':'Pending','قيد المراجعة':'Under Review','حاضر':'Present','متأخر':'Late','غائب':'Absent','إجازة':'Leave','عن بعد':'Remote','رمضان':'Ramadan','السبت':'Saturday','الأحد':'Sunday','الاثنين':'Monday','الثلاثاء':'Tuesday','الأربعاء':'Wednesday','الخميس':'Thursday','الجمعة':'Friday'
};
function applyEnglishNames(){try{
 var l=typeof window.ARIBA_UI_LANG==='function'?window.ARIBA_UI_LANG():(localStorage.getItem('ariba_ui_lang')||'ar');
 if(l!=='en')return;
 var name=document.getElementById('userNameHdr');
 if(window.ME&&name)name.textContent=window.ME.nameEn||window.ME.name||'';
 if(window.ME){window.ME.name=window.ME.nameEn||window.ME.name;}
}catch(e){}}
function patchMap(){try{if(typeof ARIBA_UI_MAP==='object'){Object.keys(ADD).forEach(function(k){ARIBA_UI_MAP[k]=ADD[k];});}if(typeof applyUIlang==='function')applyUIlang();applyEnglishNames();}catch(e){}}
setTimeout(patchMap,100);setTimeout(patchMap,600);setTimeout(patchMap,1500);

/* Add a fixed manual update button to the old header without redesigning it. */
function addButton(){var hdr=document.querySelector('.hdr');if(!hdr)return;if(document.getElementById('ARIBA_MANUAL_REFRESH_EMP'))return;var b=document.createElement('button');b.id='ARIBA_MANUAL_REFRESH_EMP';b.innerHTML='<i class="ti ti-refresh"></i> <span>التحديث</span>';b.title='التحديث';b.onclick=window.ARIBA_MANUAL_REFRESH_EMP;hdr.appendChild(b);}
setTimeout(addButton,250);setTimeout(addButton,900);

/* Ensure English always uses the stored English name from the same employee context. */
var oldRenderProf=window.renderProf;if(typeof oldRenderProf==='function'&&!oldRenderProf.__v22Name){window.renderProf=function(){applyEnglishNames();return oldRenderProf.apply(this,arguments);};window.renderProf.__v22Name=true;}
var oldRenderHome=window.renderHome;if(typeof oldRenderHome==='function'&&!oldRenderHome.__v22Name){window.renderHome=function(){applyEnglishNames();return oldRenderHome.apply(this,arguments);};window.renderHome.__v22Name=true;}
})();
