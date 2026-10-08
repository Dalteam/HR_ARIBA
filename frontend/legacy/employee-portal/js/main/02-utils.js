// ====== UTILS ======
function gLS(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function sLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function gLSJ(k){try{var r=gLS(k);return r?JSON.parse(r):null;}catch(e){return null;}}
function tod(){return new Date().toISOString().slice(0,10);}
function fN(n){return n?Number(n).toLocaleString('ar-SA',{maximumFractionDigits:2}):'0';}
function fD(d){if(!d)return'—';try{return new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{year:'numeric',month:'short',day:'numeric'});}catch(e){return d;}}
function ec(n){if(!n)return'var(--bl)';var c=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];return c[n.charCodeAt(0)%c.length];}
function av(n,c,s){var i=(n||'').charAt(0);return'<div style="width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+c+'22;color:'+c+';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:'+(s*0.4)+'px;flex-shrink:0">'+i+'</div>';}

function toast(msg,type){
  var w=document.getElementById('toastWrap');if(!w)return;
  var d=document.createElement('div');d.className='toast';
  d.style.borderColor=type==='ter'?'var(--rd)':type==='tin'?'var(--gr)':'var(--bd)';
  d.textContent=msg;w.appendChild(d);
  setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},3000);
}

