// One deterministic timetable for train movement, train doors and both PSD rows.
export function sampleMetroService(time,phase=0,dir=1){
  const t=((time+phase+(dir<0?45:0))%90+90)%90,far=318;
  const smooth=x=>{const n=Math.max(0,Math.min(1,x));return n*n*(3-2*n);};
  let x=0,visible=true,alight=0,board=0;
  if(t<22)x=-dir*far*(1-t/22)**2;
  else if(t<46){const k=t-22;alight=smooth((k-1)/1.5)*(1-smooth((k-21)/1.5));board=smooth((k-4)/1.5)*(1-smooth((k-21)/1.5));}
  else if(t<68)x=dir*far*((t-46)/22)**2;
  else visible=false;
  return {x,visible,alight,board,stopped:t>=22&&t<46,phase:t};
}
