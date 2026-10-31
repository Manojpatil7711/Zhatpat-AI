import { AutoModel, AutoProcessor, RawImage, pipeline, env } from "https://esm.sh/@huggingface/transformers@3.7.2";
(() => {
 const $=id=>document.getElementById(id);
 const file=$("bg-file"),drop=$("bg-drop"),original=$("bg-original"),preview=$("bg-preview-area"),run=$("bg-process"),reset=$("bg-reset"),result=$("bg-result"),placeholder=$("bg-placeholder"),download=$("bg-download"),message=$("bg-message"),progress=$("bg-progress"),status=$("bg-status"),percent=$("bg-percent"),bar=$("bg-bar");
 let selected=null,sourceUrl=null,resultUrl=null,modelPromise=null,busy=false;
 if(!file||!drop||!run)return;
 env.allowLocalModels=false;env.useBrowserCache=true;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const say=t=>message.textContent=t;
 function clearResult(){if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;result.removeAttribute("src");result.hidden=true;download.hidden=true;placeholder.hidden=false;$("bg-result-note").textContent="Transparent PNG output";}
 function choose(f){if(!f)return;if(!["image/jpeg","image/png","image/webp"].includes(f.type)){say("Choose a JPG, PNG or WebP image.");return;}if(f.size>8*1024*1024){say("Image is larger than 8 MB. Choose a smaller photo.");return;}if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(f);selected=f;original.src=sourceUrl;preview.hidden=false;drop.hidden=true;run.disabled=false;reset.disabled=false;clearResult();say("Image ready. Select Remove background to continue.");}
 file.addEventListener("change",()=>choose(file.files?.[0]));drop.addEventListener("click",()=>file.click());
 ["dragover","dragenter"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("dragover");}));
 ["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove("dragover");}));
 drop.addEventListener("drop",e=>choose(e.dataTransfer?.files?.[0]));
 $("bg-remove").addEventListener("click",()=>{if(!busy)file.click();});
 reset.addEventListener("click",()=>{if(busy)return;selected=null;file.value="";if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=null;original.removeAttribute("src");preview.hidden=true;drop.hidden=false;run.disabled=true;reset.disabled=true;clearResult();say("");});
 async function getModel(){
  if(!modelPromise)modelPromise=(async()=>{
   const adapter=globalThis.navigator?.gpu?await navigator.gpu.requestAdapter().catch(()=>null):null;
   if(adapter){
    status.textContent="Loading BiRefNet Lite (about 94 MB, first use only)…";
    try{
     const [model,processor]=await Promise.all([
      AutoModel.from_pretrained("studioludens/birefnet-lite-512",{dtype:"fp16",device:"webgpu",progress_callback:p=>{if(p.status)status.textContent=p.status.replace(/_/g," ");if(typeof p.progress==="number"){percent.textContent=Math.round(p.progress)+"%";bar.style.width=Math.round(p.progress)+"%";}}}),
      AutoProcessor.from_pretrained("studioludens/birefnet-lite-512")
     ]);
     return {kind:"birefnet",model,processor};
    }catch(e){status.textContent="This device could not initialise WebGPU. Switching to portrait compatibility mode…";}
   }else status.textContent="No WebGPU adapter found. Loading portrait compatibility mode…";
   const model=await pipeline("background-removal","onnx-community/modnet-webnn",{dtype:"q8",progress_callback:p=>{if(p.status)status.textContent=p.status.replace(/_/g," ");}});
   return {kind:"modnet",model};
  })();
  try{return await modelPromise;}catch(e){modelPromise=null;throw e;}
 }
 function toPng(canvas){return new Promise((resolve,reject)=>{if(typeof canvas.convertToBlob==="function")canvas.convertToBlob({type:"image/png"}).then(resolve,reject);else if(typeof canvas.toBlob==="function")canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG export failed. Please try again.")),"image/png");else reject(new Error("This browser cannot export PNG. Update Chrome and retry."));});}
 async function birefnet(bundle,bitmap,w,h){
  const input=document.createElement("canvas");input.width=w;input.height=h;const ic=input.getContext("2d");if(!ic)throw new Error("Could not prepare image on this device.");ic.drawImage(bitmap,0,0,w,h);
  const image=RawImage.fromCanvas(input);const {pixel_values}=await bundle.processor(image);let output;
  try{output=await bundle.model({input_image:pixel_values});}finally{pixel_values?.dispose?.();}
  const logits=output?.logits;if(!logits?.data||logits.data.length<262144)throw new Error("BiRefNet returned an invalid alpha mask.");
  const mask=document.createElement("canvas");mask.width=512;mask.height=512;const mc=mask.getContext("2d");const data=mc.createImageData(512,512);
  for(let i=0;i<262144;i++){const v=Math.max(-30,Math.min(30,logits.data[i]));const a=Math.round((1/(1+Math.exp(-v)))*255),p=i*4;data.data[p]=255;data.data[p+1]=255;data.data[p+2]=255;data.data[p+3]=a;}
  mc.putImageData(data,0,0);logits.dispose?.();
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d");if(!ctx)throw new Error("Could not create output image.");ctx.drawImage(bitmap,0,0,w,h);ctx.globalCompositeOperation="destination-in";ctx.drawImage(mask,0,0,w,h);ctx.globalCompositeOperation="source-over";
  input.width=0;input.height=0;mask.width=0;mask.height=0;return canvas;
 }
 async function modnet(bundle,bitmap,w,h){
  const input=document.createElement("canvas");input.width=w;input.height=h;const ctx=input.getContext("2d");ctx.drawImage(bitmap,0,0,w,h);
  const output=await bundle.model(RawImage.fromCanvas(input));const rgba=Array.isArray(output)?output[0]:output;if(!rgba?.toCanvas)throw new Error("Portrait model returned an invalid result.");
  const mask=rgba.toCanvas(),canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const out=canvas.getContext("2d");out.drawImage(bitmap,0,0,w,h);out.globalCompositeOperation="destination-in";out.drawImage(mask,0,0,w,h);out.globalCompositeOperation="source-over";input.width=0;input.height=0;if("width" in mask){mask.width=0;mask.height=0;}return canvas;
 }
 run.addEventListener("click",async()=>{
  if(!selected||busy)return;busy=true;run.disabled=true;reset.disabled=true;file.disabled=true;progress.hidden=false;bar.style.width="0%";percent.textContent="0%";status.textContent="Loading AI model…";say("Preparing browser AI. First use downloads the model to this device.");
  let bitmap=null,canvas=null;
  try{
   const bundle=await getModel();bitmap=await createImageBitmap(selected);if(bitmap.width*bitmap.height>24000000)throw new Error("Image is too large. Maximum supported size is 24 megapixels.");
   const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height),Math.sqrt(6000000/(bitmap.width*bitmap.height)));const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
   status.textContent=bundle.kind==="birefnet"?"Separating foreground with BiRefNet…":"Removing portrait background…";
   canvas=bundle.kind==="birefnet"?await birefnet(bundle,bitmap,w,h):await modnet(bundle,bitmap,w,h);
   const blob=await toPng(canvas);if(!blob||blob.size<100)throw new Error("The PNG result is empty. Try another image.");
   resultUrl=URL.createObjectURL(blob);result.src=resultUrl;result.hidden=false;placeholder.hidden=true;download.href=resultUrl;download.hidden=false;$("bg-result-note").textContent="Transparent PNG · "+w+" × "+h+" · "+Math.round(blob.size/1024)+" KB";
   status.textContent="Background removed";percent.textContent="100%";bar.style.width="100%";
   say(bundle.kind==="birefnet"?"Done with BiRefNet Lite. Check the edges and download your transparent PNG.":"Done in portrait compatibility mode. This fallback is designed mainly for people, not complex object cutouts.");
  }catch(e){const detail=e?.message||"Could not remove this background. Try a smaller image or update Chrome.";say(/429|too many requests|rate.?limit/i.test(detail)?"Hugging Face is temporarily limiting model downloads. Wait a little and retry; browser cache may reuse downloaded files.":detail);status.textContent="Could not complete";percent.textContent="";bar.style.width="0%";}
  finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}busy=false;run.disabled=!selected;reset.disabled=!selected;file.disabled=false;}
 });
 window.addEventListener("beforeunload",()=>{if(sourceUrl)URL.revokeObjectURL(sourceUrl);if(resultUrl)URL.revokeObjectURL(resultUrl);});
})();