
(function(){
  var add={"وثائقي":"My Documents","وثائق":"Documents","فتح":"Open","لا توجد وثائق مرفوعة":"No documents uploaded","مرفق الطلب (اختياري)":"Request Attachment (optional)","يمكن إرسال الطلب بدون مرفق. الحد الأقصى 12 MB.":"Attachment is optional. Maximum 12 MB.","عمل إضافي":"Overtime","طلب عمل إضافي":"Overtime Request","عدد الساعات":"Hours","السبب / المهمة":"Reason / Task","طلبات العمل الإضافي":"Overtime Requests","مرفق (اختياري)":"Attachment (optional)","مرفقات الطلبات":"Request Attachments","لا توجد مرفقات":"No attachments","الهوية / الإقامة":"ID / Iqama","جواز السفر":"Passport","شهادة الخبرة":"Experience Certificate","شهادة التخرج":"Degree Certificate","العنوان الوطني":"National Address","الوثائق الإلكترونية / Employee Documents":"Employee Documents","الوثائق المرفوعة":"Uploaded Documents","لا توجد وثائق":"No documents","تم رفع":"Uploaded"};
  function go(){
    try{
      if(typeof ARIBA_UI_MAP==='object'){Object.keys(add).forEach(function(k){ARIBA_UI_MAP[k]=add[k];});}
      if(typeof applyUIlang==='function')applyUIlang();
    }catch(e){}
  }
  setTimeout(go,700);setTimeout(go,1500);
})();
