

// Static employee seed intentionally removed for security. Employee data is fetched only after authenticated HR session.
var D=[];


// EXPAND
function expand(e){return{id:e.id,username:e.u,password:e.pw,empNo:String(e.empNo||e.employeeNo||e.id||''),nameAr:e.na,nameEn:e.ne,employer:e.em,sponsor:e.sp,nationality:e.nat,isSaudi:e.saudi,isMonaException:e.mona||false,isHourly:e.hourly||false,religion:e.rel,marital:e.mar,gender:e.gen,dept:e.dep,dob:e.dob,education:e.edu,empType:e.et,jobTitle:e.jt,jobTitleContract:e.jc,mobile:e.mb,email:e.ml,iban:e.ib,bank:e.bk,iqamaNo:e.iq,iqamaExpiry:e.iqe,iqamaDaysLeft:e.iqd||e.iqamaDaysLeft||9999,passportNo:e.pn,passportExpiry:e.ppe,passportDaysLeft:e.ppd||e.passportDaysLeft||9999,insuranceCo:e.ic,insuranceClass:e.icl,insuranceCard:e.icard,insuranceExpiry:e.ie,insuranceDaysLeft:e.id2||e.insuranceDaysLeft||9999,contractJoin:e.cj,contractEnd:e.ce,contractDaysLeft:e.cd||e.contractDaysLeft||9999,contractType:e.ct,contractNature:e.cn||((e.dur&&e.ce)?'fixed':'indefinite'),contractDuration:e.dur,isTerminated:e.term,terminationReason:e.tr,lastDay:e.ld,leaveBalance:e.lb,leaveDaysContract:e.ldc,leaveUsed2023:e.l3,leaveUsed2024:e.l4,leaveUsed2025:e.l5,leaveUsed2026:e.l6,yearsOfService:e.ys,salary:e.sal,housingAllowance:e.hou,transportAllowance:e.tra,projectAllowance:e.prj,otherAllowance:e.oth,salaryTotal:e.tot,insuranceSub:e.ins,insuranceComp:e.inc,netSalary:e.net,eosLaborLaw:e.eos,managerId:e.managerId||'',insSystem:e.ins_sys||'old',wpsType:e.wps||'wps',currency:e.cur||'ريال سعودي',exchRate:e.exr||(e.cur&&e.cur!=='ريال سعودي'?3.75:1),payMethod:e.pm||'مدد',extraAllowance:e.ext||0,netSalary:e.nsar||(e.cur&&e.cur!=='ريال سعودي'?Math.round((e.net||0)*(e.exr||1)*100)/100:(e.net||0))};}
// HELPERS
const CLR=['#29B35E','#29B35E','#E4E4BC','#6B7280','#014D3D','#014D3D','#E4E4BC','#E4E4BC','#14b8a6','#a855f7'];
const cMap={};let ci=0;const ec=n=>{if(!cMap[n]){cMap[n]=CLR[ci%CLR.length];ci++;}return cMap[n];};
const ini=n=>(n||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]||'').join('');
const fD=d=>{if(!d)return'—';try{return new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn');}catch{return d;}};
const fN=n=>n?Number(n).toLocaleString('en-US',{maximumFractionDigits:2}):'0';
const tod=()=>new Date().toISOString().slice(0,10);
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);
let LANG=localStorage.getItem('hr7_lang')||'ar';
var __ARIBA_MEMORY_DB=window.__ARIBA_MEMORY_DB||{};
var __ARIBA_SENSITIVE_KEYS=Object.freeze({emps:1,att:1,payroll:1,leaves:1,perms:1,documents:1,workflow:1});
function db(k,def){
  /* V102: بيانات الموظفين دايمًا من مصدر واحد كامل (hr7_emps) من أول لحظة */
  if(k==='emps'){try{var __v102=localStorage.getItem('hr7_emps');if(__v102){var __a102=JSON.parse(__v102);if(Array.isArray(__a102)&&__a102.length)return __a102;}}catch(ex){}}
  if(__ARIBA_SENSITIVE_KEYS[k]){
    // اقرأ من الـ memory أولاً
    if(Object.prototype.hasOwnProperty.call(__ARIBA_MEMORY_DB,k)) return __ARIBA_MEMORY_DB[k];
    // لو مش موجود في الـ memory، اقرأ من localStorage المشفرة
    var stored=_sGet('hr7_'+k,null);
    if(stored!==null){__ARIBA_MEMORY_DB[k]=stored; return stored;}
    return def;
  }
  try{var v=localStorage.getItem('hr7_'+k);return v?JSON.parse(v):def;}catch(ex){return def;}
}

// ===== حماية البيانات =====
var _ARK=(function(){var k='ARIBA2030HR';return k+k;})();
function _enc(s){try{var r='';for(var i=0;i<s.length;i++)r+=String.fromCharCode(s.charCodeAt(i)^_ARK.charCodeAt(i%_ARK.length));return btoa(unescape(encodeURIComponent(r)));}catch(e){return s;}}
function _dec(s){try{var r=decodeURIComponent(escape(atob(s)));var o='';for(var i=0;i<r.length;i++)o+=String.fromCharCode(r.charCodeAt(i)^_ARK.charCodeAt(i%_ARK.length));return o;}catch(e){return s;}}
function _sSet(k,v){try{localStorage.setItem('_ar_'+btoa(k),_enc(JSON.stringify(v)));}catch(e){}}
function _sGet(k,def){try{var r=localStorage.getItem('_ar_'+btoa(k));return r?JSON.parse(_dec(r)):def;}catch(e){return def;}}

function dbS(k,v){
  /* V102: حفظ الموظفين = دمج بالـ id في hr7_emps (مفيش موظف أو حقل بيضيع) */
  if(k==='emps'&&Array.isArray(v)){
    try{
      var cur=[];try{cur=JSON.parse(localStorage.getItem('hr7_emps')||'[]')||[];}catch(ex){cur=[];}
      var byId={},order=[];
      cur.forEach(function(e){if(!e||e.id==null)return;var i=String(e.id);if(!byId[i])order.push(i);byId[i]=e;});
      v.forEach(function(e){if(!e||e.id==null)return;var i=String(e.id);if(!byId[i])order.push(i);byId[i]=e;});
      localStorage.setItem('hr7_emps',JSON.stringify(order.map(function(i){return byId[i];})));
    }catch(ex){console.error('ARIBA V102 dbS emps',ex);}
    return;
  }
  if(__ARIBA_SENSITIVE_KEYS[k]){
    __ARIBA_MEMORY_DB[k]=v;
    _sSet('hr7_'+k,v); // نسخة مشفرة
    return;
  }
  try{localStorage.setItem('hr7_'+k,JSON.stringify(v));}catch{}
}
function toast(m,t='tok'){const el=document.getElementById('TST');el.textContent=m;el.className='toast on '+t;setTimeout(()=>el.classList.remove('on'),3200);}
function cM(id){document.getElementById(id).classList.remove('on');if(id==='LBM')document.body.classList.remove('lbm-focus');}
function oM(id){document.getElementById(id).classList.add('on');if(id==='LBM')document.body.classList.add('lbm-focus');}
document.querySelectorAll('.mw').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('on');}));
function dBadge(d){if(!d||d>=9999)return'<span class="b bk">—</span>';if(d<=0)return'<span class="b br">منتهي</span>';if(d<=30)return`<span class="b br">${d}ي</span>`;if(d<=90)return`<span class="b ba">${d}ي</span>`;return`<span class="b bg">${d}ي</span>`;}
function av(n,c,s=30){c=('#014D3D'===c||'#29B35E'===c)?c:'#014D3D';return`<div class="av" style="width:${s}px;height:${s}px;background:${c}22;color:${c};font-size:${Math.round(s*.34)}px">${ini(n)}</div>`;}
function di(l,v){return`<div class="di"><div class="dl">${l}</div><div class="dv">${v||'—'}</div></div>`;}
