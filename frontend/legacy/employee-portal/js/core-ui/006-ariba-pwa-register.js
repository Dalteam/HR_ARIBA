
(function(){
  if(!('serviceWorker' in navigator)) return;
  window.addEventListener('load',function(){ navigator.serviceWorker.register('./sw.js').catch(function(e){ console.warn('ARIBA PWA service worker:',e); }); });
  var deferred;
  window.addEventListener('beforeinstallprompt',function(e){ e.preventDefault(); deferred=e; var b=document.getElementById('aribaInstallBtn'); if(b) b.style.display='block'; });
  document.addEventListener('click',function(e){ if(e.target && e.target.id==='aribaInstallBtn' && deferred){ deferred.prompt(); deferred.userChoice.finally(function(){ deferred=null; e.target.style.display='none'; }); }});
  window.addEventListener('appinstalled',function(){ var b=document.getElementById('aribaInstallBtn'); if(b) b.style.display='none'; });
})();
