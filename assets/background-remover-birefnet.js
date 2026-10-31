import { AutoModel, AutoProcessor, RawImage, pipeline, env } from "https://esm.sh/@huggingface/transformers@3.7.2";
(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const file=$("bg-file"),drop=$("bg-drop"),original=$("bg-original"),preview=$("bg-preview-area"),run=$("bg-process"),reset=$("bg-reset"),result=$("bg-result"),placeholder=$("bg-placeholder"),download=$("bg-download"),message=$("bg-message"),progress=$("bg-progress"),status=$("bg-status"),percent=$("bg-percent"),bar=$("bg-bar");
 let selected=null,sourceUrl=null,resultUrl=null,modelPromise=null,busy=false,cutoutBitmap=null,renderVersion=0;
 if(!file||!drop||!run)return;
 env.allowLocalModels=false;env.useBrowserCache=true;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const say=t=>{message.textContent=t;};
 // Older Android WebViews may not expose HTMLCanvasElement.toBlob. Add a local,
 // no-network fallback so both model internals and PNG export can use it safely.
 if(typeof globalThis.HTMLCanvasElement!=="undefined" && typeof HTMLCanvasElement.prototype.toBlob!=="function"){
  Object.defineProperty(HTMLCanvasElement.prototype,"toBlob",{configurable:true,writable:true,value:function(callback,type="image/png",quality){
   try{const data=this.toDataURL(type,quality);fetch(data).then(r=>r.blob()).then(b=>callback(b),()=>callback(null));}catch(_){callback(null);}
  }});
 }
 function clearResult(){renderVersion++;if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;cutoutBitmap?.close?.();cutoutBitmap=null;result.removeAttribute("src");result.hidden=true;download.hidden=true;placeholder.hidden=false;$("bg-result-note").textContent="Transparent PNG output";const controls=$("bg-output-controls");if(controls)controls.hidden=true;}
 function choose(f){if(!f)return;if(!["image/jpeg","image/png","image/webp"].includes(f.type)){say("Choose a JPG, PNG or WebP image.");return;}if(f.size>8*1024*1024){say("Image is larger than 8 MB. Choose a smaller photo.");return;}if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(f);selected=f;original.src=sourceUrl;preview.hidden=false;drop.hidden=true;run.disabled=false;reset.disabled=false;clearResult();say("Image ready. Select Remove background to continue.");}
 file.addEventListener("change",()=>choose(file.files?.[0]));drop.addEventListener("click",()=>file.click());
 ["dragover","dragenter"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("dragover");}));
 ["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove("dragover");}));
 drop.addEventListener("drop",e=>choose(e.dataTransfer?.files?.[0]));
 $("bg-remove").addEventListener("click",()=>{if(!busy)file.click();});
 reset.addEventListener("click",()=>{if(busy)return;selected=null;file.value="";if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=null;original.removeAttribute("src");preview.hidden=true;drop.hidden=false;run.disabled=true;reset.disabled=true;clearResult();say("");});
 async function loadWithRetry(loader,label){
  let last;
  for(let i=0;i<3;i++){try{return await loader();}catch(e){last=e;const m=e?.message||String(e);if(i===2||!/429|too many requests|rate.?limit|network|fetch failed|502|503|504|timeout/i.test(m))throw e;status.textContent=label+" temporarily busy. Retrying…";await wait([1500,3500][i]);}}
  throw last||new Error("Could not load the AI model.");
 }
 async function getModel(){
  if(!modelPromise)modelPromise=(async()=>{
   const adapter=globalThis.navigator?.gpu?await navigator.gpu.requestAdapter().catch(()=>null):null;
   if(adapter){
    status.textContent="Loading BiRefNet Lite · about 94 MB on first use…";
    try{
     const [model,processor]=await Promise.all([
      loadWithRetry(()=>AutoModel.from_pretrained("studioludens/birefnet-lite-512",{dtype:"fp16",device:"webgpu",progress_callback:p=>{if(p.status)status.textContent=p.status.replace(/_/g," ");if(typeof p.progress==="number"){const n=Math.max(0,Math.min(100,Math.round(p.progress)));percent.textContent=n+"%";bar.style.width=n+"%";}}}),"BiRefNet download"),
      loadWithRetry(()=>AutoProcessor.from_pretrained("studioludens/birefnet-lite-512"),"Image processor")
     ]);
     return {kind:"birefnet",model,processor};
    }catch(e){status.textContent="This device could not start BiRefNet. Switching to the lightweight portrait fallback…";}
   }else status.textContent="WebGPU is unavailable. Loading the lightweight portrait fallback…";
   try{
    status.textContent="Loading ISNet General INT8 · CPU compatibility mode…";
    const model=await loadWithRetry(()=>pipeline("background-removal","xrds/isnet-general-onnx-int8",{device:"wasm",dtype:"q8",progress_callback:p=>{if(p.status)status.textContent=p.status.replace(/_/g," ");if(typeof p.progress==="number"){const n=Math.max(0,Math.min(100,Math.round(p.progress)));percent.textContent=n+"%";bar.style.width=n+"%";}}}),"ISNet model download");
    return {kind:"isnet",model};
   }catch(isnetError){
    status.textContent="This browser cannot run the general model. Loading the portrait-only fallback…";
    const model=await loadWithRetry(()=>pipeline("background-removal","onnx-community/modnet-webnn",{dtype:"q8",progress_callback:p=>{if(p.status)status.textContent=p.status.replace(/_/g," ");if(typeof p.progress==="number"){const n=Math.max(0,Math.min(100,Math.round(p.progress)));percent.textContent=n+"%";bar.style.width=n+"%";}}}),"Portrait fallback download");
    return {kind:"modnet",model};
   }
  })();
  try{return await modelPromise;}catch(e){modelPromise=null;throw e;}
 }
 function canvasBlob(canvas){
  return new Promise((resolve,reject)=>{
   if(canvas&&typeof canvas.convertToBlob==="function"){canvas.convertToBlob({type:"image/png"}).then(resolve,reject);return;}
   if(canvas&&typeof canvas.toBlob==="function"){canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG export returned an empty file.")),"image/png");return;}
   if(canvas&&typeof canvas.toDataURL==="function"){try{fetch(canvas.toDataURL("image/png")).then(r=>r.blob()).then(resolve,reject);return;}catch(e){reject(e);return;}}
   reject(new Error("This browser cannot export PNG. Update Chrome and try again."));
  });
 }

 async function renderOutput(){
  if(!cutoutBitmap)return;
  const version=++renderVersion,mode=$("bg-output-mode")?.value||"transparent",color=$("bg-custom-color")?.value||"#ffffff";
  const canvas=document.createElement("canvas");canvas.width=cutoutBitmap.width;canvas.height=cutoutBitmap.height;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Could not prepare the selected background.");
  if(mode==="green"||mode==="white"||mode==="custom"){ctx.fillStyle=mode==="green"?"#00ff00":mode==="white"?"#ffffff":color;ctx.fillRect(0,0,canvas.width,canvas.height);}
  ctx.drawImage(cutoutBitmap,0,0);
  const blob=await canvasBlob(canvas);canvas.width=0;canvas.height=0;
  if(version!==renderVersion)return;
  if(resultUrl)URL.revokeObjectURL(resultUrl);
  resultUrl=URL.createObjectURL(blob);result.src=resultUrl;result.hidden=false;placeholder.hidden=true;download.href=resultUrl;download.hidden=false;
  const labels={transparent:"Transparent PNG",green:"Green screen PNG · #00FF00",white:"White background PNG",custom:"Custom background PNG"};
  $("bg-result-note").textContent=labels[mode]+" · "+cutoutBitmap.width+" × "+cutoutBitmap.height+" · "+Math.round(blob.size/1024)+" KB";
  download.download="zhatpat-"+(mode==="transparent"?"transparent":mode==="green"?"green-screen":mode==="white"?"white-background":"custom-background")+".png";
 }
 const outputMode=$("bg-output-mode"),customColor=$("bg-custom-color"),customWrap=$("bg-custom-wrap");
 if(outputMode)outputMode.addEventListener("change",()=>{if(customWrap)customWrap.hidden=outputMode.value!=="custom";renderOutput().catch(e=>say(e.message||"Could not update the preview."));});
 if(customColor)customColor.addEventListener("input",()=>{if(outputMode?.value==="custom")renderOutput().catch(e=>say(e.message||"Could not update the preview."));});

 async function runBiRefNet(bundle,bitmap,w,h){
  const input=document.createElement("canvas");input.width=w;input.height=h;
  const ic=input.getContext("2d");if(!ic)throw new Error("Could not prepare this image on the device.");
  ic.drawImage(bitmap,0,0,w,h);
  const image=RawImage.fromCanvas(input);let pixel_values,output,logits;
  try{
   ({pixel_values}=await bundle.processor(image));
   output=await bundle.model({input_image:pixel_values});
   logits=output?.logits;
   const dims=logits?.dims||[];
   const values=logits?.data;
   if(!values||values.length!==512*512)throw new Error("BiRefNet returned an unexpected mask. Please retry with another image.");
   const mask=document.createElement("canvas");mask.width=512;mask.height=512;
   const mc=mask.getContext("2d");if(!mc)throw new Error("Could not create the AI mask.");
   const data=mc.createImageData(512,512);
   for(let i=0;i<262144;i++){const v=Math.max(-30,Math.min(30,values[i]));const raw=1/(1+Math.exp(-v));const t=Math.max(0,Math.min(1,(raw-0.38)/0.24));const a=Math.round((t*t*(3-2*t))*255),p=i*4;data.data[p]=255;data.data[p+1]=255;data.data[p+2]=255;data.data[p+3]=a;}
   mc.putImageData(data,0,0);
   const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
   const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Could not create the transparent result.");
   ctx.drawImage(bitmap,0,0,w,h);ctx.globalCompositeOperation="destination-in";ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(mask,0,0,w,h);ctx.globalCompositeOperation="source-over";
   mask.width=0;mask.height=0;input.width=0;input.height=0;
   return canvas;
  }finally{pixel_values?.dispose?.();logits?.dispose?.();}
 }
 async function runModnet(bundle,bitmap,w,h){
  const input=document.createElement("canvas");input.width=w;input.height=h;
  const ctx=input.getContext("2d");if(!ctx)throw new Error("Could not prepare the portrait.");
  ctx.drawImage(bitmap,0,0,w,h);
  const output=await bundle.model(RawImage.fromCanvas(input));const rgba=Array.isArray(output)?output[0]:output;
  if(!rgba||typeof rgba.toCanvas!=="function")throw new Error("The compatibility model returned an invalid result.");
  const mask=rgba.toCanvas(),canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const out=canvas.getContext("2d");if(!out)throw new Error("Could not create the transparent result.");
  out.drawImage(bitmap,0,0,w,h);out.globalCompositeOperation="destination-in";out.drawImage(mask,0,0,w,h);out.globalCompositeOperation="source-over";
  input.width=0;input.height=0;if(mask&&"width" in mask){mask.width=0;mask.height=0;}return canvas;
 }
 run.addEventListener("click",async()=>{
  if(!selected||busy)return;busy=true;run.disabled=true;reset.disabled=true;file.disabled=true;progress.hidden=false;bar.style.width="0%";percent.textContent="0%";status.textContent="Loading AI model…";say("Preparing browser AI. Your image stays on this device.");
  let bitmap=null,canvas=null;
  try{
   const bundle=await getModel();bitmap=await createImageBitmap(selected);
   if(bitmap.width*bitmap.height>24000000)throw new Error("Image is too large for safe processing. Maximum supported size is 24 megapixels.");
   const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height),Math.sqrt(6000000/(bitmap.width*bitmap.height)));
   const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
   status.textContent=bundle.kind==="birefnet"?"Removing background with BiRefNet Lite…":bundle.kind==="isnet"?"Removing background with ISNet General…":"Removing portrait background…";
   canvas=bundle.kind==="birefnet"?await runBiRefNet(bundle,bitmap,w,h):await runModnet(bundle,bitmap,w,h);
   const cutoutBlob=await canvasBlob(canvas);if(!cutoutBlob||cutoutBlob.size<100)throw new Error("The PNG result is empty. Please try another photo.");
   cutoutBitmap?.close?.();cutoutBitmap=await createImageBitmap(cutoutBlob);
   const controls=$("bg-output-controls");if(controls)controls.hidden=false;
   if(outputMode)outputMode.value="transparent";if(customWrap)customWrap.hidden=true;
   await renderOutput();
   status.textContent="Background removed";percent.textContent="100%";bar.style.width="100%";
   say(bundle.kind==="birefnet"?"Done with BiRefNet Lite. Review the edges and download your transparent PNG.":bundle.kind==="isnet"?"Done with ISNet General (CPU mode). Review the edges and download your transparent PNG.":"Done in portrait compatibility mode. This last-resort fallback is designed mainly for people, not complex object cutouts.");
  }catch(e){const detail=e?.message||"Could not remove this background. Try a smaller image or update Chrome.";say(/429|too many requests|rate.?limit/i.test(detail)?"Hugging Face is temporarily limiting model downloads. Wait a little and retry; downloaded files may be reused from browser cache.":detail);status.textContent="Could not complete";percent.textContent="";bar.style.width="0%";}
  finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}busy=false;run.disabled=!selected;reset.disabled=!selected;file.disabled=false;}
 });
 window.addEventListener("beforeunload",()=>{renderVersion++;cutoutBitmap?.close?.();if(sourceUrl)URL.revokeObjectURL(sourceUrl);if(resultUrl)URL.revokeObjectURL(resultUrl);});
})();