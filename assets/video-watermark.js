(() => {
"use strict";
const $=id=>document.getElementById(id);
const input=$("video-file"),drop=$("video-drop"),wrap=$("video-source-wrap"),video=$("source-video"),mode=$("mode"),style=$("mask-style"),strength=$("strength"),strengthValue=$("strength-value"),fps=$("export-fps"),quality=$("export-quality"),add=$("add-keyframe"),undo=$("undo-keyframe"),clear=$("clear-keyframes"),process=$("process-video"),cancel=$("cancel-video"),list=$("keyframe-list"),progress=$("video-progress"),bar=$("video-bar"),percent=$("video-percent"),status=$("video-status"),detail=$("video-progress-detail"),message=$("video-message"),preview=$("export-preview"),download=$("download-video"),autoDetect=$("auto-detect-logo"),autoTrack=$("auto-track-logo"),autoHint=$("auto-detect-hint");
const MAX_DURATION=300,MAX_BYTES=250*1024*1024,MAX_OUTPUT_BYTES=350*1024*1024;
let sourceUrl=null,outputUrl=null,keys=[],draft=null,pendingRect=null,dragStart=null,busy=false,cancelRequested=false,raf=0,recorder=null,exportStream=null,sourceStream=null;
const say=s=>{message.textContent=s;};
const waitEvent=(target,name,timeout=15000)=>new Promise((resolve,reject)=>{let timer=setTimeout(()=>{cleanup();reject(Error("Timed out while waiting for video "+name+"."));},timeout);const cleanup=()=>{clearTimeout(timer);target.removeEventListener(name,done);target.removeEventListener("error",fail);};const done=()=>{cleanup();resolve();};const fail=()=>{cleanup();reject(Error("The browser could not "+name+" the video."));};target.addEventListener(name,done,{once:true});target.addEventListener("error",fail,{once:true});});
function revokeOutput(){if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=null;preview.removeAttribute("src");preview.hidden=true;download.removeAttribute("href");download.hidden=true;$("export-empty").hidden=false;$("video-output-meta").hidden=true;}
function updateControls(){
const hasVideo=!!video.src&&Number.isFinite(video.duration)&&video.duration>0;
add.disabled=!hasVideo||mode.value!=="moving"||!pendingRect||busy;autoDetect.disabled=!hasVideo||busy;autoTrack.disabled=!hasVideo||busy||mode.value!=="moving"||(!pendingRect&&!keys.length);
undo.disabled=!keys.length||busy;clear.disabled=!keys.length||busy;
process.disabled=!hasVideo||!keys.length||busy;
strength.disabled=style.value!=="blur"||busy;
$("strength-control").style.opacity=style.value==="blur"?"1":".45";
}
function updateKeyList(){
if(!keys.length){list.textContent="No watermark area selected yet.";updateControls();return;}
list.replaceChildren();
keys.forEach((k,i)=>{const item=document.createElement("span");item.className="keyframe-chip";item.textContent=(mode.value==="static"?"Fixed area":"Keyframe "+(i+1))+" · "+formatTime(k.time);list.append(item);});
updateControls();
}
function formatTime(s){const m=Math.floor(s/60),sec=(s%60).toFixed(1).padStart(4,"0");return m+":"+sec;}
function accept(file){
if(!file)return;
if(!["video/mp4","video/webm","video/quicktime"].includes(file.type)&&!(/\.(mp4|webm|mov)$/i.test(file.name))){say("Choose an MP4, WebM or MOV video. MOV playback depends on browser codec support.");return;}
if(file.size>MAX_BYTES){say("This file is larger than 250 MB. Choose a smaller or compressed video.");return;}
if(sourceUrl)URL.revokeObjectURL(sourceUrl);
sourceUrl=URL.createObjectURL(file);video.pause();video.src=sourceUrl;video.load();wrap.hidden=false;drop.hidden=true;keys=[];draft=null;pendingRect=null;revokeOutput();$("video-meta").textContent="Reading video information…";say("Loading video metadata…");updateKeyList();
}
input.addEventListener("change",()=>accept(input.files?.[0]));
$("change-video").addEventListener("click",()=>{if(!busy)input.click();});
["dragenter","dragover"].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add("dragover");}));
["dragleave","drop"].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove("dragover");}));
drop.addEventListener("drop",e=>accept(e.dataTransfer?.files?.[0]));
video.addEventListener("loadedmetadata",()=>{
if(!Number.isFinite(video.duration)||video.duration<=0){say("Video metadata could not be read. Try another MP4 or WebM file.");return;}
if(video.duration>MAX_DURATION){video.pause();video.removeAttribute("src");video.load();wrap.hidden=true;drop.hidden=false;say("This video is longer than 5 minutes. Trim it to 5:00 or less and try again.");return;}
$("video-meta").textContent=video.videoWidth+" × "+video.videoHeight+" px · "+formatTime(video.duration)+" · "+(video.audioTracks?.length?"Audio track detected":"Audio depends on browser capture support");
say("Video ready. Pause on a clear frame and drag around the watermark.");updateControls();
});


function grayFrame(data,w,h){const g=new Uint8Array(w*h);for(let i=0,j=0;i<data.length;i+=4,j++)g[j]=(data[i]*3+data[i+1]*6+data[i+2])/10;return g;}
async function autoTrackLogo(){
 if(busy||mode.value!=="moving"||(!pendingRect&&!keys.length))return;
 const startTime=video.currentTime;
 if(startTime>1.25){say("For reliable tracking, begin near the start of the clip (0:00–0:01).");return;}
 const initial=pendingRect||getRegion(startTime);
 if(!initial){say("Draw a tight box around the logo first.");return;}
 const wasPaused=video.paused,oldTime=video.currentTime;
 autoTrack.disabled=true;autoDetect.disabled=true;autoHint.textContent="Tracking logo across sampled frames…";say("Auto-tracking is matching the selected logo at one-second intervals. Keep this tab open.");
 const c=document.createElement("canvas");c.width=320;c.height=Math.max(2,Math.round(320*video.videoHeight/video.videoWidth));
 const cx=c.getContext("2d",{willReadFrequently:true}),sx=video.videoWidth/c.width,sy=video.videoHeight/c.height;
 const bw=Math.max(8,Math.min(c.width-1,Math.round(initial.w/sx))),bh=Math.max(8,Math.min(c.height-1,Math.round(initial.h/sy)));const box={x:Math.max(0,Math.min(c.width-bw,Math.round(initial.x/sx))),y:Math.max(0,Math.min(c.height-bh,Math.round(initial.y/sy))),w:bw,h:bh};
 try{
  video.pause();await seekTo(startTime);cx.drawImage(video,0,0,c.width,c.height);
  const first=grayFrame(cx.getImageData(0,0,c.width,c.height).data,c.width,c.height);
  const samples=[];for(let y=2;y<box.h-2;y+=4)for(let x=2;x<box.w-2;x+=4)samples.push([x,y,first[(box.y+y)*c.width+box.x+x]]);
  if(samples.length<12)throw Error("The selected logo area is too small to track. Draw a larger, tighter box.");
  const vals=samples.map(v=>v[2]),mean=vals.reduce((a,b)=>a+b,0)/vals.length;
  const denom=Math.sqrt(vals.reduce((a,v)=>a+(v-mean)**2,0));
  if(denom<18)throw Error("The selected area has too little visual detail. Select the logo and its clear edges, not a flat patch.");
  const found=[{time:startTime,rect:{...initial}}];let px=box.x,py=box.y,confidence=1;
  const total=Math.ceil((video.duration-startTime));
  for(let sec=1;sec<=total;sec++){
   const t=Math.min(video.duration-.04,startTime+sec);if(t<=found[found.length-1].time+.01)break;
   await seekTo(t);cx.drawImage(video,0,0,c.width,c.height);const frame=grayFrame(cx.getImageData(0,0,c.width,c.height).data,c.width,c.height);
   const rx=Math.max(0,Math.round(c.width*.14)),ry=Math.max(0,Math.round(c.height*.14));
   let best=-1,bx=px,by=py;
   for(let y=Math.max(0,py-ry);y<=Math.min(c.height-box.h,py+ry);y+=2){
    for(let x=Math.max(0,px-rx);x<=Math.min(c.width-box.w,px+rx);x+=2){
     let sum=0,sum2=0,cross=0;
     for(const [ox,oy,v] of samples){const q=frame[(y+oy)*c.width+x+ox];sum+=q;sum2+=q*q;cross+=q*v;}
     const n=samples.length,cov=cross-sum*mean,varB=sum2-sum*sum/n;
     const score=varB>1?cov/Math.sqrt(denom*denom*varB):0;
     if(score>best){best=score;bx=x;by=y;}
    }
   }
   confidence=best;
   if(best<.48){autoHint.textContent="Tracking stopped at "+formatTime(found[found.length-1].time)+" · manual correction needed";break;}
   px=bx;py=by;
   found.push({time:t,rect:{x:px*sx,y:py*sy,w:box.w*sx,h:box.h*sy}});
   updateProgress(sec/Math.max(1,total)*100,"Tracking "+formatTime(t)+" / "+formatTime(video.duration));
  }
  if(found.length<2)throw Error("Logo tracking confidence was too low. Add manual keyframes at clear positions.");
  keys=found;pendingRect=null;updateKeyList();drawSelection();
  say("Auto-tracked "+(found.length-1)+" positions. Review the keyframe timeline and preview the full export; add manual keyframes wherever tracking drifted.");
  if(confidence>=.48)autoHint.textContent="Tracked "+(found.length-1)+" intervals · review required";
 }catch(err){say(err.message||"Auto-tracking failed. Use manual keyframes.");}
 finally{
  try{await seekTo(oldTime);}catch{}
  if(!wasPaused)try{await video.play();}catch{}
  autoDetect.disabled=false;autoTrack.disabled=false;updateControls();
 }
}
autoTrack.addEventListener("click",autoTrackLogo);

async function seekTo(time){
 if(Math.abs(video.currentTime-time)<0.025)return;
 const done=waitEvent(video,"seeked",12000);
 video.currentTime=time;
 await done;
}
async function autoDetectCornerLogo(){
 if(busy||!video.videoWidth||!Number.isFinite(video.duration)||video.duration<=0)return;
 const wasPaused=video.paused,oldTime=video.currentTime;
 autoDetect.disabled=true;autoHint.textContent="Scanning sampled frames…";say("Scanning four corner regions across representative frames. This may take a moment.");
 const sample=document.createElement("canvas");sample.width=320;sample.height=Math.max(2,Math.round(320*video.videoHeight/video.videoWidth));
 const sc=sample.getContext("2d",{willReadFrequently:true});
 const times=[0,0.2,0.4,0.6,0.8].map(p=>Math.min(Math.max(0,video.duration-0.08),video.duration*p));
 const frames=[];
 try{
  video.pause();
  for(const t of [...new Set(times)]){await seekTo(t);sc.drawImage(video,0,0,sample.width,sample.height);frames.push(sc.getImageData(0,0,sample.width,sample.height).data);}
  if(frames.length<3)throw Error("Not enough readable frames to scan. Draw the watermark manually.");
  const cw=Math.round(sample.width*.2),ch=Math.round(sample.height*.14),marginX=Math.round(sample.width*.025),marginY=Math.round(sample.height*.025);
  const candidates=[
   {name:"Top-left",x:marginX,y:marginY},{name:"Top-right",x:sample.width-marginX-cw,y:marginY},
   {name:"Bottom-left",x:marginX,y:sample.height-marginY-ch},{name:"Bottom-right",x:sample.width-marginX-cw,y:sample.height-marginY-ch}
  ];
  let best=null;
  for(const c of candidates){
   let persistent=0,edgeTotal=0;
   for(let y=c.y+1;y<c.y+ch-1;y+=2)for(let x=c.x+1;x<c.x+cw-1;x+=2){
    let hits=0;
    for(const data of frames){
     const i=(y*sample.width+x)*4, l=(data[i]+data[i+1]+data[i+2])/3;
     const r=(data[i+4]+data[i+5]+data[i+6])/3, b=(data[i+sample.width*4]+data[i+sample.width*4+1]+data[i+sample.width*4+2])/3;
     if(Math.abs(r-l)+Math.abs(b-l)>58)hits++;
    }
    if(hits>=Math.ceil(frames.length*.6))persistent++;
    if(hits>0)edgeTotal++;
   }
   const score=persistent/Math.max(1,Math.ceil(cw/2)*Math.ceil(ch/2));
   const density=edgeTotal/Math.max(1,Math.ceil(cw/2)*Math.ceil(ch/2));
   const ranked=score*Math.min(1,density*2);
   if(!best||ranked>best.ranked)best={...c,ranked,score,density,name:c.name};
  }
  if(!best||best.score<0.018||best.density<0.035)throw Error("No confident corner-logo candidate found. Draw a tight box manually; this scan does not detect every watermark.");
  const sx=video.videoWidth/sample.width,sy=video.videoHeight/sample.height;
  const rect={x:best.x*sx,y:best.y*sy,w:cw*sx,h:ch*sy};
  if(mode.value==="moving"){pendingRect=rect;say("Possible "+best.name+" logo found. Review the highlighted box, then save it as a keyframe at "+formatTime(video.currentTime)+".");}
  else{keys=[{time:0,rect}];pendingRect=null;say("Possible "+best.name+" logo found. Review the highlighted box carefully; adjust manually if it includes scene details.");}
  autoHint.textContent="Candidate: "+best.name+" · review before export";updateKeyList();drawSelection();
 }catch(err){say(err.message||"Automatic logo scan failed. Use manual selection.");autoHint.textContent="No confirmed candidate";}
 finally{
  try{await seekTo(oldTime);}catch{}
  if(!wasPaused)try{await video.play();}catch{}
  autoDetect.disabled=false;updateControls();
 }
}
autoDetect.addEventListener("click",autoDetectCornerLogo);

function point(e){const r=video.getBoundingClientRect();return{x:Math.max(0,Math.min(video.videoWidth,(e.clientX-r.left)*video.videoWidth/r.width)),y:Math.max(0,Math.min(video.videoHeight,(e.clientY-r.top)*video.videoHeight/r.height))};}
function drawSelection(){
const old=$("selection-overlay");if(old)old.remove();
const box=document.createElement("div");box.id="selection-overlay";box.setAttribute("aria-hidden","true");box.style.cssText="position:absolute;pointer-events:none;border:2px solid #c3adff;background:#9b83ff25;box-shadow:0 0 0 9999px #080b1366;z-index:3;";
const r=draft||pendingRect||getRegion(video.currentTime);if(r){const vr=video.getBoundingClientRect(),wr=video.parentElement.getBoundingClientRect();box.style.left=(vr.left-wr.left+r.x/video.videoWidth*vr.width)+"px";box.style.top=(vr.top-wr.top+r.y/video.videoHeight*vr.height)+"px";box.style.width=(r.w/video.videoWidth*vr.width)+"px";box.style.height=(r.h/video.videoHeight*vr.height)+"px";video.parentElement.append(box);}
}
function getRegion(t){
const sorted=[...keys].sort((a,b)=>a.time-b.time);if(!sorted.length)return null;
if(mode.value==="static"||t<=sorted[0].time)return sorted[0].rect;
if(t>=sorted[sorted.length-1].time)return sorted[sorted.length-1].rect;
for(let i=0;i<sorted.length-1;i++){const a=sorted[i],b=sorted[i+1];if(t>=a.time&&t<=b.time){const p=(t-a.time)/(b.time-a.time);return{x:a.rect.x+(b.rect.x-a.rect.x)*p,y:a.rect.y+(b.rect.y-a.rect.y)*p,w:a.rect.w+(b.rect.w-a.rect.w)*p,h:a.rect.h+(b.rect.h-a.rect.h)*p};}}
return null;
}
video.addEventListener("pointerdown",e=>{
if(busy||!video.videoWidth||video.paused===false)return;
e.preventDefault();video.setPointerCapture?.(e.pointerId);dragStart=point(e);draft={x:dragStart.x,y:dragStart.y,w:0,h:0};drawSelection();
});
video.addEventListener("pointermove",e=>{if(!dragStart)return;const p=point(e);draft={x:Math.min(dragStart.x,p.x),y:Math.min(dragStart.y,p.y),w:Math.abs(p.x-dragStart.x),h:Math.abs(p.y-dragStart.y)};drawSelection();});
function finishSelection(){
if(!dragStart)return;dragStart=null;
if(!draft||draft.w<6||draft.h<6){draft=null;drawSelection();say("Select a slightly larger watermark area.");return;}
const rect={...draft};draft=null;
if(mode.value==="static"){keys=[{time:0,rect}];pendingRect=null;say("Fixed watermark area selected. You can now process the video.");}
else{pendingRect=rect;say("Area marked. Tap Add keyframe at playhead to save this position at "+formatTime(video.currentTime)+".");}
updateKeyList();drawSelection();
}
video.addEventListener("pointerup",finishSelection);video.addEventListener("pointercancel",finishSelection);
video.addEventListener("seeked",drawSelection);video.addEventListener("timeupdate",drawSelection);
add.addEventListener("click",()=>{if(!pendingRect){say("Pause the video and drag a box around the watermark first.");return;}keys=keys.filter(k=>Math.abs(k.time-video.currentTime)>.08);keys.push({time:video.currentTime,rect:{...pendingRect}});keys.sort((a,b)=>a.time-b.time);pendingRect=null;updateKeyList();drawSelection();say("Keyframe saved at "+formatTime(video.currentTime)+". Move the playhead and mark the next position.");});
undo.addEventListener("click",()=>{keys.pop();pendingRect=null;updateKeyList();drawSelection();say("Last watermark mark removed.");});
clear.addEventListener("click",()=>{keys=[];draft=null;pendingRect=null;updateKeyList();drawSelection();say("All watermark marks cleared.");});
mode.addEventListener("change",()=>{if(mode.value==="static"&&keys.length>1)keys=[keys[0]];pendingRect=null;updateKeyList();drawSelection();});
style.addEventListener("change",updateControls);strength.addEventListener("input",()=>strengthValue.textContent=strength.value+" px");
function makeMask(ctx,canvas,region,scale){
const x=region.x*scale,y=region.y*scale,w=region.w*scale,h=region.h*scale;
if(style.value==="cover"){ctx.fillStyle="#11131c";ctx.fillRect(x,y,w,h);return;}
if(style.value==="blur"){
const blur=Number(strength.value);
ctx.save();ctx.beginPath();ctx.rect(Math.max(0,x-blur*2),Math.max(0,y-blur*2),Math.min(canvas.width-x+blur*2,w+blur*4),Math.min(canvas.height-y+blur*2,h+blur*4));ctx.clip();ctx.filter="blur("+blur+"px)";ctx.drawImage(video,0,0,canvas.width,canvas.height);ctx.restore();return;
}
if(style.value==="pixelate"){
const pixel=Math.max(5,Math.round(Math.min(w,h)/14)),pw=Math.max(1,Math.round(w/pixel)),ph=Math.max(1,Math.round(h/pixel));
const small=document.createElement("canvas");small.width=pw;small.height=ph;const sc=small.getContext("2d");sc.drawImage(video,region.x,region.y,region.w,region.h,0,0,pw,ph);
ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(small,x,y,w,h);ctx.restore();
}
}
function updateProgress(p,label){const n=Math.max(0,Math.min(100,Math.floor(p)));bar.style.width=n+"%";percent.textContent=n+"%";if(label)status.textContent=label;}
function stopTracks(){if(exportStream)exportStream.getTracks().forEach(t=>t.stop());if(sourceStream)sourceStream.getTracks().forEach(t=>t.stop());exportStream=null;sourceStream=null;}
function stopRecorder(){return new Promise(resolve=>{if(!recorder||recorder.state==="inactive"){resolve();return;}const r=recorder;r.addEventListener("stop",resolve,{once:true});try{r.stop();}catch{resolve();}});}
cancel.addEventListener("click",()=>{cancelRequested=true;cancel.hidden=true;say("Cancelling export…");video.pause();if(recorder&&recorder.state!=="inactive")recorder.stop();});
process.addEventListener("click",async()=>{
if(busy||!keys.length)return;
if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){say("This browser cannot export video. Use the latest Chrome browser.");return;}
if(mode.value==="moving"&&keys.length<2){say("Moving watermark mode needs at least two keyframes. Add one at each important position.");return;}
busy=true;cancelRequested=false;process.disabled=true;cancel.hidden=false;add.disabled=undo.disabled=clear.disabled=true;video.pause();say("");progress.hidden=false;updateProgress(0,"Preparing video…");detail.textContent="Export runs in real time. Keep this tab open and prevent your phone from sleeping.";
let recorderLocal=null,chunks=[],rafId=0,started=false;
try{
const originalW=video.videoWidth,originalH=video.videoHeight;
const scale=Math.min(1,1920/originalW,1080/originalH);
const out=document.createElement("canvas");out.width=Math.max(2,Math.round(originalW*scale));out.height=Math.max(2,Math.round(originalH*scale));
const ctx=out.getContext("2d",{alpha:false});if(!ctx)throw Error("Canvas processing is unavailable in this browser.");
exportStream=out.captureStream(Number(fps.value));
if(typeof video.captureStream==="function"||typeof video.mozCaptureStream==="function"){
const capture=video.captureStream||video.mozCaptureStream;sourceStream=capture.call(video);
sourceStream.getAudioTracks().forEach(track=>exportStream.addTrack(track));
}
const mime=["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"].find(x=>MediaRecorder.isTypeSupported(x));
if(!mime)throw Error("This browser does not support WebM export. Try the latest Chrome.");
const bitrate=Number(quality.value)*1000000;
recorderLocal=new MediaRecorder(exportStream,{mimeType:mime,videoBitsPerSecond:bitrate,audioBitsPerSecond:128000});recorder=recorderLocal;
recorderLocal.ondataavailable=e=>{if(e.data?.size){chunks.push(e.data);const total=chunks.reduce((n,c)=>n+c.size,0);if(total>MAX_OUTPUT_BYTES&&!cancelRequested){cancelRequested=true;say("Export stopped: output exceeded the 350 MB safety limit. Choose Standard quality or a smaller video.");video.pause();if(recorderLocal.state!=="inactive")recorderLocal.stop();}}};
const stopped=new Promise((resolve,reject)=>{recorderLocal.onstop=resolve;recorderLocal.onerror=()=>reject(Error("The browser's video recorder failed during export."));});
const sorted=[...keys].sort((a,b)=>a.time-b.time);
const regionAt=t=>{
if(mode.value==="static")return sorted[0].rect;
if(t<=sorted[0].time)return sorted[0].rect;
if(t>=sorted[sorted.length-1].time)return sorted[sorted.length-1].rect;
for(let i=0;i<sorted.length-1;i++){const a=sorted[i],b=sorted[i+1];if(t>=a.time&&t<=b.time){const p=(t-a.time)/(b.time-a.time);return{x:a.rect.x+(b.rect.x-a.rect.x)*p,y:a.rect.y+(b.rect.y-a.rect.y)*p,w:a.rect.w+(b.rect.w-a.rect.w)*p,h:a.rect.h+(b.rect.h-a.rect.h)*p};}}
return null;
};
const draw=()=>{ctx.filter="none";ctx.drawImage(video,0,0,out.width,out.height);const r=regionAt(video.currentTime);if(r)makeMask(ctx,out,r,scale);};
const finish=()=>{if(recorderLocal.state==="recording")recorderLocal.stop();};
const tick=()=>{
if(cancelRequested||video.ended||video.paused){finish();return;}
draw();const p=video.duration?video.currentTime/video.duration*100:0;updateProgress(p,"Processing "+formatTime(video.currentTime)+" / "+formatTime(video.duration));
rafId=requestAnimationFrame(tick);
};
if(video.currentTime!==0){const seekDone=waitEvent(video,"seeked");video.currentTime=0;await seekDone;}
draw();recorderLocal.start(1000);started=true;
await video.play();tick();
await stopped;cancelAnimationFrame(rafId);
if(cancelRequested)throw Error("Export cancelled or stopped by the output-size safety limit. Try Standard quality or a shorter video.");
if(!chunks.length)throw Error("No video data was produced. Check browser codec support and try again.");
const blob=new Blob(chunks,{type:"video/webm"});if(!blob.size)throw Error("The exported video is empty. Try another browser.");
revokeOutput();outputUrl=URL.createObjectURL(blob);preview.src=outputUrl;preview.hidden=false;$("export-empty").hidden=true;download.href=outputUrl;download.hidden=false;
const meta=$("video-output-meta");meta.hidden=false;meta.textContent="WebM · "+(blob.size/1024/1024).toFixed(1)+" MB · "+out.width+" × "+out.height+" px · "+fps.value+" FPS";
updateProgress(100,"Export complete");say("Your edited video is ready. Preview it before downloading.");
}catch(error){
cancelAnimationFrame(rafId);if(recorderLocal&&recorderLocal.state!=="inactive")await stopRecorder();
if(error.name==="NotAllowedError")say("Playback was blocked. Tap play on the source video once, then try export again.");
else say(error.message||"Video export failed. Try a smaller file or Standard quality.");
}finally{
if(video.paused===false)video.pause();stopTracks();recorder=null;busy=false;cancel.hidden=true;process.disabled=!keys.length;updateControls();if(!cancelRequested&&bar.style.width!=="100%")detail.textContent="Export finished. You can preview and download the WebM file.";
}
});
window.addEventListener("beforeunload",()=>{if(sourceUrl)URL.revokeObjectURL(sourceUrl);if(outputUrl)URL.revokeObjectURL(outputUrl);stopTracks();});
updateControls();
})();