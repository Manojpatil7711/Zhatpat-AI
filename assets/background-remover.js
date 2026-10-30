import { pipeline, env } from "https://esm.sh/@huggingface/transformers@3.7.2";
(() => {
  const $=id=>document.getElementById(id);
  const file=$("bg-file"),drop=$("bg-drop"),original=$("bg-original"),preview=$("bg-preview-area"),run=$("bg-process"),reset=$("bg-reset"),result=$("bg-result"),placeholder=$("bg-placeholder"),download=$("bg-download"),message=$("bg-message"),progress=$("bg-progress"),status=$("bg-status"),percent=$("bg-percent"),bar=$("bg-bar");
  let selected=null,sourceUrl=null,resultUrl=null,modelPromise=null,busy=false;
  if(!file||!drop||!run)return;
  env.allowLocalModels=false;env.useBrowserCache=true;
  function say(text){message.textContent=text;}
  function cleanResult(){if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;result.removeAttribute("src");result.hidden=true;download.hidden=true;placeholder.hidden=false;$("bg-result-note").textContent="Transparent PNG output";}
  function choose(f){
    if(!f)return;
    if(!["image/jpeg","image/png","image/webp"].includes(f.type)){say("Choose a JPG, PNG or WebP image.");return;}
    if(f.size>8*1024*1024){say("Image is larger than 8 MB. Choose a smaller photo.");return;}
    if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(f);selected=f;original.src=sourceUrl;preview.hidden=false;drop.hidden=true;run.disabled=false;reset.disabled=false;cleanResult();say("Image ready. Select Remove background to continue.");
  }
  file.addEventListener("change",()=>choose(file.files&&file.files[0]));
  drop.addEventListener("click",()=>file.click());
  ["dragover","dragenter"].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add("dragover");}));
  ["dragleave","drop"].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove("dragover");}));
  drop.addEventListener("drop",e=>choose(e.dataTransfer&&e.dataTransfer.files[0]));
  $("bg-remove").addEventListener("click",()=>{if(busy)return;file.click();});
  reset.addEventListener("click",()=>{if(busy)return;selected=null;file.value="";if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=null;original.removeAttribute("src");preview.hidden=true;drop.hidden=false;run.disabled=true;reset.disabled=true;cleanResult();say("");});
  async function getModel(){
    if(!modelPromise){
      modelPromise=pipeline("background-removal","onnx-community/modnet-webnn",{dtype:"q8",progress_callback:p=>{
        if(p.status)status.textContent=p.status.replace(/_/g," ");
        if(typeof p.progress==="number"){const n=Math.max(0,Math.min(100,Math.round(p.progress)));percent.textContent=n+"%";bar.style.width=n+"%";}
      }});
    }
    try{return await modelPromise;}catch(error){modelPromise=null;throw error;}
  }
  run.addEventListener("click",async()=>{
    if(!selected||busy)return;
    busy=true;run.disabled=true;reset.disabled=true;file.disabled=true;progress.hidden=false;bar.style.width="0%";percent.textContent="0%";status.textContent="Loading AI model…";say("Preparing browser AI. The first run may take longer while model files download.");
    try{
      const model=await getModel();status.textContent="Analysing portrait…";percent.textContent="";bar.style.width="100%";
      const bitmap=await createImageBitmap(selected);
      if(bitmap.width*bitmap.height>48000000){bitmap.close();throw new Error("This image is too large for safe browser processing. Choose a smaller image.");}
      const scale=Math.min(1,3000/Math.max(bitmap.width,bitmap.height),Math.sqrt(12000000/(bitmap.width*bitmap.height)));
      const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
      const output=await model([sourceUrl]);
      const mask=Array.isArray(output)?output[0]:output;
      if(!mask||typeof mask.toCanvas!=="function"){bitmap.close();throw new Error("The model returned an invalid mask. Try another portrait.");}
      const maskCanvas=mask.toCanvas();
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d",{willReadFrequently:true});
      context.drawImage(bitmap,0,0,width,height);bitmap.close();
      const pixels=context.getImageData(0,0,width,height);
      const matte=document.createElement("canvas");matte.width=width;matte.height=height;
      const matteContext=matte.getContext("2d",{willReadFrequently:true});
      matteContext.drawImage(maskCanvas,0,0,width,height);
      const maskPixels=matteContext.getImageData(0,0,width,height).data;
      for(let i=0;i<width*height;i++)pixels.data[i*4+3]=maskPixels[i*4];
      context.putImageData(pixels,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!blob)throw new Error("Could not create a transparent PNG in this browser.");
      resultUrl=URL.createObjectURL(blob);result.src=resultUrl;result.hidden=false;placeholder.hidden=true;download.href=resultUrl;download.hidden=false;$("bg-result-note").textContent="Ready · "+Math.round(blob.size/1024)+" KB";
      status.textContent="Background removed";percent.textContent="100%";bar.style.width="100%";say("Finished. Review the transparent result and download your PNG.");
    }catch(error){
      say(error&&error.message?error.message:"Could not remove this background. Try a smaller portrait or the latest Chrome.");
      status.textContent="Could not complete";percent.textContent="";bar.style.width="0%";
    }finally{busy=false;run.disabled=!selected;reset.disabled=!selected;file.disabled=false;}
  });
  window.addEventListener("beforeunload",()=>{if(sourceUrl)URL.revokeObjectURL(sourceUrl);if(resultUrl)URL.revokeObjectURL(resultUrl);});
})();