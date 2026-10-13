
(function(){
  'use strict';
  function sync(){
    var lg=document.getElementById('LG');
    var lgDisplay=lg?getComputedStyle(lg).display:'none';
    var loggedIn=(lgDisplay==='none'||lgDisplay==='');
    if(loggedIn){
      document.documentElement.classList.add('ariba-authenticated');
      document.body.classList.add('ariba-authenticated');
      document.body.classList.remove('ariba-auth-locked');
    }else{
      document.documentElement.classList.remove('ariba-authenticated');
      document.body.classList.remove('ariba-authenticated');
      document.body.classList.add('ariba-auth-locked');
    }
  }
  function boot(){
    sync();
    var lg=document.getElementById('LG');
    if(lg)new MutationObserver(sync).observe(lg,{attributes:true,attributeFilter:['style','class','hidden']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
