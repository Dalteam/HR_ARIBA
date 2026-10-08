
(function(){
  'use strict';

  /*
   * Load terminated employees from the same employee master.
   * Nothing is deleted; current employees and terminated employees are
   * separated only at display/calculation time.
   */
  function terminatedEmployees(){
    try{
      var emps = typeof getEmps === 'function' ? (getEmps() || []) : [];
      return emps.filter(function(e){
        var status = String(
          e.status || e.employeeStatus || e.employmentStatus ||
          e.hrStatus || e.state || ''
        ).toLowerCase();

        return e.isTerminated === true ||
          status === 'terminated' ||
          status === 'inactive' ||
          status === 'end' ||
          status.indexOf('منته') >= 0 ||
          status.indexOf('انهاء') >= 0 ||
          status.indexOf('إنهاء') >= 0 ||
          status.indexOf('خدم') >= 0;
      });
    }catch(e){
      return [];
    }
  }

  window.ARIBA_TERMINATED_EMPLOYEES_V9 = terminatedEmployees;

  /*
   * Find the existing terminated-employees table/card and populate it
   * without creating a second page.
   */
  function renderTerminated(){
    var rows = terminatedEmployees();

    var containers = [
      document.getElementById('terminatedEmployees'),
      document.getElementById('terminated'),
      document.getElementById('termEmp'),
      document.getElementById('termTable'),
      document.getElementById('TERMINATED')
    ].filter(Boolean);

    if(!containers.length){
      /* Locate the existing page by its visible heading. */
      document.querySelectorAll('body *').forEach(function(el){
        if(el.children.length===0 && /المنتهية خدماتهم|منتهية الخدمات|Terminated Employees/i.test(el.textContent||'')){
          var p=el.parentElement;
          if(p && containers.indexOf(p)<0)containers.push(p);
        }
      });
    }

    if(!containers.length)return;

    var host=containers[0];

    /* Prefer an existing tbody so the page keeps its original design. */
    var tbody=host.querySelector('tbody');
    if(tbody){
      tbody.innerHTML=rows.map(function(e,i){
        return '<tr>'+
          '<td>'+esc(e.empNo||e.id||i+1)+'</td>'+
          '<td>'+esc(e.nameAr||e.name||'—')+'</td>'+
          '<td>'+esc(e.nameEn||'—')+'</td>'+
          '<td>'+esc(e.jobTitle||e.job||'—')+'</td>'+
          '<td>'+esc(e.dept||e.department||'—')+'</td>'+
          '<td>'+esc(e.employer||'—')+'</td>'+
          '<td>'+esc(e.terminationDate||e.endDate||e.contractEnd||'—')+'</td>'+
          '<td>'+esc(e.terminationReason||e.reason||'—')+'</td>'+
          '</tr>';
      }).join('');
      return;
    }

    /* If the existing page is a card/list rather than a table. */
    var list=host.querySelector('.list,.rows,.grid,.table-wrap,.tbl');
    if(list){
      list.innerHTML=rows.map(function(e,i){
        return '<div class="row" style="padding:9px;border-bottom:1px solid var(--bd)">'+
          '<b>'+esc(e.empNo||e.id||i+1)+'</b> — '+
          '<strong>'+esc(e.nameAr||e.name||'—')+'</strong>'+
          '<span style="color:var(--mu);margin-right:8px">'+esc(e.jobTitle||e.job||'')+'</span>'+
          '<span style="color:var(--mu);margin-right:8px">'+esc(e.terminationDate||e.endDate||'')+'</span>'+
          '</div>';
      }).join('');
    }
  }

  function esc(v){
    return String(v??'').replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }

  window.ARIBA_RENDER_TERMINATED_V9=renderTerminated;

  /* Run after the existing employee loader has populated the master. */
  function boot(){
    setTimeout(renderTerminated,700);
    setTimeout(renderTerminated,1800);
    setTimeout(renderTerminated,3500);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else boot();

  /* Keep the page synchronized with employee status changes. */
  /* automatic terminated refresh disabled */
})();
