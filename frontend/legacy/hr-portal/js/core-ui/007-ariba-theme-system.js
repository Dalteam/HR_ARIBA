
(function(){
  var KEY='ariba_ui_theme';
  function get(){try{return localStorage.getItem(KEY)||'dark'}catch(e){return 'dark'}}
  function set(v){document.documentElement.setAttribute('data-ariba-theme',v);try{localStorage.setItem(KEY,v)}catch(e){};update();}
  function update(){var b=document.getElementById('aribaThemeBtn');if(!b)return;var v=document.documentElement.getAttribute('data-ariba-theme')||'dark';b.innerHTML=v==='dark'?'<i class="ti ti-sun"></i><span class="ariba-theme-label">نهاري</span>':'<i class="ti ti-moon"></i><span class="ariba-theme-label">ليلي</span>';b.title=v==='dark'?'التبديل إلى الوضع النهاري':'التبديل إلى الوضع الليلي';}
  window.toggleAribaTheme=function(){set((document.documentElement.getAttribute('data-ariba-theme')||'dark')==='dark'?'light':'dark')};
  document.documentElement.setAttribute('data-ariba-theme',get());
  document.addEventListener('DOMContentLoaded',function(){
    var host=document.querySelector('.tbr')||document.querySelector('.hdr-user');
    if(host&&!document.getElementById('aribaThemeBtn')){var b=document.createElement('button');b.id='aribaThemeBtn';b.className='ariba-theme-btn';b.type='button';b.onclick=window.toggleAribaTheme;host.insertBefore(b,host.firstChild);}
    update();
  });
})();
