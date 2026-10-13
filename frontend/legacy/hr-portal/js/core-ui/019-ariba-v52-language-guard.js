
(function(){
  try{
    var v=localStorage.getItem('hr7_lang');
    if(v!=='ar' && v!=='en') localStorage.setItem('hr7_lang','ar');
    // Keep the shared key aligned so the employee app and HR app speak the same language.
    var a=localStorage.getItem('hr7_lang');
    localStorage.setItem('ariba_ui_lang',a);
  }catch(e){}
})();
