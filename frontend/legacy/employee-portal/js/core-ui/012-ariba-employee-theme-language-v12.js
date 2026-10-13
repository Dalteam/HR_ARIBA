
(function(){
'use strict';
var THEME_KEY='ariba_employee_theme';
function theme(){
 return localStorage.getItem(THEME_KEY)||'light';
}
function applyTheme(){
 var t=theme();
 document.body.classList.toggle('ariba-light',t==='light');
 document.body.classList.toggle('ariba-dark',t==='dark');
 var b=document.getElementById('aribaModeBtn');
 if(b){
   var en=(localStorage.getItem('ariba_ui_lang')||localStorage.getItem('hr7_lang')||'ar')==='en';
   b.textContent=en?(t==='light'?'Dark Mode':'Light Mode'):(t==='light'?'ليلي':'نهاري');
   b.title=en?'Toggle Theme':'تبديل الوضع';
 }
 document.documentElement.style.setProperty('color-scheme',t);
}
function addControls(){
 var hdr=document.querySelector('.hdr');
 if(!hdr)return;
 if(document.getElementById('aribaModeBtn'))return;
 var box=document.createElement('div');box.className='ariba-top-actions';
 var mode=document.createElement('button');mode.id='aribaModeBtn';mode.className='ariba-mode-btn';
 mode.onclick=function(){localStorage.setItem(THEME_KEY,theme()==='light'?'dark':'light');applyTheme();};
 var lang=document.createElement('button');lang.id='aribaLangBtn';lang.className='ariba-lang-btn';
 lang.onclick=function(){
   var l=localStorage.getItem('ariba_ui_lang')||localStorage.getItem('hr7_lang')||'ar';
   var nl=l==='en'?'ar':'en';
   localStorage.setItem('ariba_ui_lang',nl);
   localStorage.setItem('hr7_lang',nl);
   location.reload();
 };
 box.appendChild(mode);box.appendChild(lang);hdr.appendChild(box);
}
function boot(){addControls();applyTheme();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('storage',function(e){if(e.key===THEME_KEY)applyTheme();});
})();
