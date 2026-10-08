
(function(){
  window.__leavePerfCache=window.__leavePerfCache||new Map();
  window.clearLeavePerfCache=function(){window.__leavePerfCache.clear();};
  window.leavePerfGet=function(k,fn){var c=window.__leavePerfCache,v=c.get(k);if(v!==undefined)return v;v=fn();c.set(k,v);return v;};
})();
