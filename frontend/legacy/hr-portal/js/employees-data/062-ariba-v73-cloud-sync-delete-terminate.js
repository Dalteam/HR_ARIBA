
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  function cloudDeactivate(employeeId){
    if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return;
    fetch(CLOUD_URL+'/rest/v1/rpc/ariba_hr_deactivate_employee', {
      method:'POST',
      headers:{apikey:CLOUD_KEY, Authorization:'Bearer '+CLOUD_KEY, 'Content-Type':'application/json'},
      body: JSON.stringify({p_token: window.ARIBA_HR_TOKEN, p_employee_id: String(employeeId)})
    }).catch(function(){});
  }

  var oldDelEmp73 = window.delEmp;
  if(typeof oldDelEmp73 === 'function' && !oldDelEmp73.__v73){
    window.delEmp = function(id, name){
      var r = oldDelEmp73.apply(this, arguments);
      cloudDeactivate(id);
      return r;
    };
    window.delEmp.__v73 = true;
  }

  var oldTermEmp73 = window.termEmp;
  if(typeof oldTermEmp73 === 'function' && !oldTermEmp73.__v73){
    window.termEmp = function(id){
      var r = oldTermEmp73.apply(this, arguments);
      cloudDeactivate(id);
      return r;
    };
    window.termEmp.__v73 = true;
  }
})();
