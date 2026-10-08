
(function(){
  var URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  function norm(x){
    var b=(x&&x.data&&typeof x.data==='object')?x.data:{};
    var e=Object.assign({},b,x||{});
    e.id=String(x.id||x.employee_id||e.id||'');
    e.empNo=String(e.empNo||e.emp_no||e.employeeNumber||e.id);
    e.nameAr=e.nameAr||e.name_ar||'';
    e.nameEn=e.nameEn||e.name_en||'';
    e.dept=e.dept||e.department||'';
    e.jobTitle=e.jobTitle||e.job_title||'';
    e.contractJoin=e.contractJoin||e.joinDate||e.join_date||'';
    e.managerId=e.managerId||e.manager_id||'';
    e.isTerminated=e.isTerminated===true;
    return e;
  }
  async function load(){
    /* ARIBA v95: هذه الدالة كانت بتمسح كل بيانات الموظفين المحلية (بما فيها أي تعديل
       لسه ماتزامنش، وكل الموظفين المنتهية خدمتهم بالكامل) وتستبدلها بس بالموظفين
       النشطين من السحابة، في كل مرة تفتح فيها الصفحة. كانت خفية في الاختبار لأن بيئة
       الاختبار مالهاش اتصال حقيقي بالسحابة، لكنها كانت بتشتغل فعليًا وتخرب البيانات
       على الموقع الحقيقي المنشور. تم تعطيلها بالكامل لأن كل مزامنة البيانات بقت
       بتتم بشكل آمن عن طريق aribaSyncEmployee لكل موظف على حدة. */
    return;
  }
  function boot(){}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
  /* AUTO CLOUD REFRESH DISABLED */
})();
