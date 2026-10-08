
(function(){
'use strict';
var LREMOTE={id:'L7',name:'عمل عن بعد',nameEn:'Remote Work',employer:'all',type:'remote',scope:'open',scopeLabel:'النطاق مفتوح — الموقع الجغرافي مفتوح بأي مكان',lat:0,lng:0,radius:999999999,color:'#014D3D',active:true};
var LEG={id:'L8',name:'مصر',nameEn:'Egypt',employer:'all',type:'remote',scope:'cairo_giza',scopeLabel:'محافظة القاهرة والجيزة بالكامل',lat:30.0444,lng:31.2357,radius:999999999,color:'#29B35E',active:true};
function ensure(){
 try{
  var a=getLocs(), map={};a.forEach(function(x){map[String(x.id)]=x;});
  [LREMOTE,LEG].forEach(function(x){if(!map[x.id])a.push(Object.assign({},x));else Object.assign(map[x.id],x);});
  dbS('locs',a);
  if(window.ARIBA_HR_TOKEN&&window.syncLocationsToCloud)window.syncLocationsToCloud(a).catch(function(){});
  if(typeof rLocs==='function')rLocs();
 }catch(e){console.warn(e);}
}
try{
 var oldFrom=window.syncLocationsFromCloud;
 if(oldFrom){
  window.syncLocationsFromCloud=async function(){
   var local=getLocs(), cloud=await oldFrom();
   var a=Array.isArray(cloud)&&cloud.length?cloud.slice():local.slice(),map={};
   a.forEach(function(x){map[String(x.id)]=x;});
   local.forEach(function(x){if(!map[String(x.id)])a.push(x);});
   dbS('locs',a);return a;
  };
 }
}catch(e){}
setTimeout(ensure,700);
})();
