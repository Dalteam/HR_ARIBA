
(function(){
  const ARCH='ariba_payroll_archive_v3';

  function archiveAll(key,payload){
    try{
      const all=JSON.parse(localStorage.getItem(ARCH)||'{}');
      all[key]=payload;
      localStorage.setItem(ARCH,JSON.stringify(all));
    }catch(e){ console.warn('payroll archive',e); }
  }

  function getArchived(key){
    try{
      const all=JSON.parse(localStorage.getItem(ARCH)||'{}');
      return all[key]||null;
    }catch(e){return null;}
  }

  const oldSave=window.savePayroll;
  if(typeof oldSave==='function'){
    window.savePayroll=function(rows,approved,approvedAt){
      oldSave.apply(this,arguments);
      try{
        const key=window.getPayKey ? window.getPayKey() :
          ('pay_'+(document.getElementById('payYear')?.value||new Date().getFullYear())+
          '_'+String(document.getElementById('payMonth')?.value||new Date().getMonth()+1).padStart(2,'0'));
        archiveAll(key,{
          rows:rows||[],
          approved:!!approved,
          approvedAt:approvedAt||null,
          savedAt:new Date().toISOString(),
          version:4
        });
      }catch(e){}
    };
  }

  const oldLoad=window.loadPayroll;
  if(typeof oldLoad==='function'){
    window.loadPayroll=function(){
      try{
        const key=window.getPayKey ? window.getPayKey() :
          ('pay_'+(document.getElementById('payYear')?.value||new Date().getFullYear())+
          '_'+String(document.getElementById('payMonth')?.value||new Date().getMonth()+1).padStart(2,'0'));
        const archived=getArchived(key);
        if(archived && archived.approved && Array.isArray(archived.rows)){
          window.renderPayroll(archived.rows,true,archived.approvedAt||null);
          return;
        }
      }catch(e){}
      oldLoad.apply(this,arguments);
    };
  }

  window.aribaGetPayrollArchive=getArchived;
})();
