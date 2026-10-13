function calcEOS(sal,yrs,hou=0){var base=(Number(sal)||0)+(Number(hou)||0),y=Math.max(0,Number(yrs)||0);return Math.round(((base/2)*Math.min(y,5)+base*Math.max(0,y-5))*100)/100;}
