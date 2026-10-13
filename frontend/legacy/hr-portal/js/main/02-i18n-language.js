// LANG
const TX={ar:{sal:'الرواتب حسب جهة العمل',nat:'الجنسيات',emp2:'جهات العمل',alr:'تنبيهات عاجلة',dept:'الأقسام',pend:'طلبات معلقة',pay2:'ملخص الرواتب',add:'إضافة موظف',undo:'تراجع',save:'حفظ وتحديث',cancel:'إلغاء',attlog:'سجل الحضور',monrpt:'تقرير شهري',lvpend:'معلقة',lvall:'كل الطلبات',lvnew:'طلب جديد',lvbal:'الأرصدة',lvhol:'الإجازات الرسمية',pholdays:'الإجازات الرسمية السعودية',holinfo:'الإجازات الرسمية لا تُحسب من رصيد الإجازة السنوية',payroll:'مسير الرواتب الشهري',byemp:'إجمالي حسب جهة العمل',insinfo:'التأمينات: تُحسب تلقائياً حسب النظام التأميني وتاريخ الاستحقاق | غير السعودي: 2% أخطار مهنية على المنشأة',slip:'كشف الراتب التفصيلي',eosinfo:'المادة 84: نصف شهر عن كل سنة من أول 5 سنوات، ثم أجر شهر عن كل سنة تالية',iqama:'الإقامات',passports:'الجوازات',insurance:'التأمين الطبي',contracts:'العقود',cn:'طبيعة العقد',locs:'مواقع البصمة الجغرافية',addloc:'إضافة موقع',locinfo:'تُستخدم هذه المواقع في تطبيق الموظف للبصمة',settings:'إعدادات الشركة',saveSet:'حفظ',print:'طباعة',submit:'إرسال الطلب',HRL:'مسؤول HR',ft:'إضافة موظف',tab1:'البيانات الأساسية',tab2:'الوثائق',tab3:'العقد',tab4:'الراتب',personal:'البيانات الشخصية',nameAr:'الاسم بالعربي *',nameEn:'الاسم بالإنجليزي',empNo:'الرقم الوظيفي',emp3:'جهة العمل *',nat2:'الجنسية',dept2:'القسم',job:'الوظيفة',mob:'الجوال',email2:'البريد الإلكتروني',bank:'البنك',iban:'IBAN',sponsor:'الكفيل',rel:'الديانة',notes:'ملاحظات',docs:'الوثائق الرسمية',iq:'رقم الإقامة',iqe:'انتهاء الإقامة',pp:'رقم الجواز',ppe:'انتهاء الجواز',ins:'التأمين الطبي',ico:'شركة التأمين',icl:'فئة التأمين',icard:'رقم البطاقة',ie:'انتهاء التأمين',contract:'بيانات العقد',ct:'نوع العقد',dur:'مدة العقد (شهر)',cj:'تاريخ المباشرة',ce:'انتهاء العقد',ldc:'أيام الإجازة السنوية',salary:'الراتب والبدلات',sal2:'الراتب الأساسي',hou:'بدل السكن',tra:'بدل المواصلات',prj:'بدل المشروع',oth:'بدلات أخرى',ded:'استقطاعات أخرى',basic:'أساسي',docs2:'وثائق',fin:'مالية',leaves:'إجازات',lvemp:'الموظف *',from:'من تاريخ *',to:'إلى تاريخ *',lvnotes:'ملاحظات',attmod:'تسجيل/تعديل حضور'},
en:{sal:'Payroll by Employer',nat:'Nationalities',emp2:'Employers',alr:'Urgent Alerts',dept:'Departments',pend:'Pending Requests',pay2:'Payroll Summary',add:'Add Employee',undo:'Undo',save:'Save & Update',cancel:'Cancel',attlog:'Attendance Log',monrpt:'Monthly Report',lvpend:'Pending',lvall:'All Requests',lvnew:'New Request',lvbal:'Balances',lvhol:'Public Holidays',pholdays:'Saudi Public Holidays',holinfo:'Public holidays are not counted as annual leave',payroll:'Monthly Payroll',byemp:'Total by Employer',insinfo:'GOSI: calculated automatically by insurance scheme and effective date | Non-Saudi: 2% occupational hazards paid by employer',slip:'Detailed Salary Slip',eosinfo:'Art.84: half-month wage for each of the first 5 years, then one month for each following year',iqama:'Iqama',passports:'Passports',insurance:'Medical Insurance',contracts:'Contracts',cn:'Contract Term',locs:'GPS Fingerprint Locations',addloc:'Add Location',locinfo:'Used in employee app for GPS fingerprint check-in',settings:'Company Settings',saveSet:'Save',print:'Print',submit:'Submit',HRL:'HR Admin',ft:'Add Employee',tab1:'Basic Info',tab2:'Documents',tab3:'Contract',tab4:'Salary',personal:'Personal Data',nameAr:'Full Name (Arabic) *',nameEn:'Full Name (English)',emp3:'Employer *',nat2:'Nationality',dept2:'Department',job:'Job Title',mob:'Mobile',email2:'Email',bank:'Bank',iban:'IBAN',sponsor:'Sponsor',rel:'Religion',notes:'Notes',docs:'Official Documents',iq:'Iqama/ID No',iqe:'Iqama Expiry',pp:'Passport No',ppe:'Passport Expiry',ins:'Medical Insurance',ico:'Insurance Company',icl:'Insurance Class',icard:'Card Number',ie:'Insurance Expiry',contract:'Contract Details',ct:'Contract Type',dur:'Duration (months)',cj:'Start Date',ce:'Contract End',ldc:'Annual Leave Days',salary:'Salary & Allowances',sal2:'Basic Salary',hou:'Housing Allowance',tra:'Transport Allowance',prj:'Project Allowance',oth:'Other Allowances',ded:'Other Deductions',basic:'Basic',docs2:'Documents',fin:'Finance',leaves:'Leaves',lvemp:'Employee *',from:'From Date *',to:'To Date *',lvnotes:'Notes',attmod:'Record Attendance'}};
function T(k){return(TX[LANG]||TX.ar)[k]||TX.ar[k]||k;}
function applyLang(){
  Object.keys(TX.ar).forEach(k=>{
    const el=document.getElementById('t_'+k);
    if(!el)return;
    const badge=el.querySelector('span.b');
    el.textContent=T(k);
    if(badge)el.appendChild(badge);
  });
  const cn=document.getElementById('contractNature');if(cn){cn.options[0].text=LANG==='en'?'Fixed-term':'محدد المدة';cn.options[1].text=LANG==='en'?'Indefinite-term':'غير محدد المدة';}
  const ct=document.querySelector('select[name=ct]');if(ct&&ct.options.length>=3){ct.options[0].text=LANG==='en'?'New':'جديد';ct.options[1].text=LANG==='en'?'Renewal':'تجديد العقد';ct.options[2].text=LANG==='en'?'Specific assignment':'مهمة محددة';}
  var h=document.getElementById('H');
  if(h){h.lang=LANG;h.dir=LANG==='en'?'ltr':'rtl';}
  document.body.dir=LANG==='en'?'ltr':'rtl';
  document.body.style.fontFamily=LANG==='en'?'var(--font-en)':'var(--font-ar)';
  // أعد بناء الـ sidebar items
  var sb=document.getElementById('SB');
  if(sb) sb.dir=LANG==='en'?'ltr':'rtl';
  // حدث زر اللغة
  var btn=document.getElementById('langBtnTxt');
  if(btn) btn.textContent=LANG==='ar'?'EN':'AR';
}
function tLang(){
  LANG=LANG==='ar'?'en':'ar';
  localStorage.setItem('hr7_lang',LANG);
  applyLang();
  buildNav();
  // حدث زر اللغة
  var btn=document.getElementById('langBtnTxt');
  if(btn) btn.textContent=LANG==='ar'?'EN':'AR';
  // أعد بناء الصفحة الحالية
  var cur=document.querySelector('.pg.on');
  if(cur){
    var pgId=cur.id.replace('pg-','');
    if(typeof loads[pgId]==='function') loads[pgId]();
  }
  toast(LANG==='ar'?'✓ اللغة العربية':'✓ English Mode','tin');
  setTimeout(function(){try{applyUIlang();}catch(e){}},0);
}
