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
      const output=await model([sourceUrl]);
      const image=Array.isArray(output)?output[0]:output;
      if(!image)throw new Error("The model returned no image. Try another portrait.");
      let blob;
      if(typeof image.toBlob==="function")blob=await image.toBlob();
      else if(image.data&&image.width&&image.height){
        const canvas=document.createElement("canvas");canvas.width=image.width;canvas.height=image.height;
        const context=canvas.getContext("2d");const pixels=context.createImageData(image.width,image.height);pixels.data.set(image.data);context.putImageData(pixels,0,0);
        blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
      }
      if(!blob)throw new Error("Could not create a PNG result in this browser.");
      resultUrl=URL.createObjectURL(blob);result.src=resultUrl;result.hidden=false;placeholder.hidden=true;download.href=resultUrl;download.hidden=false;$("bg-result-note").textContent="Ready · "+Math.round(blob.size/1024)+" KB";
      status.textContent="Background removed";percent.textContent="100%";bar.style.width="100%";say("Finished. Review the transparent result and download your PNG.");
    }catch(error){
      say(error&&error.message?error.message:"Could not remove this background. Try a smaller portrait or the latest Chrome.");
      status.textContent="Could not complete";percent.textContent="";bar.style.width="0%";
    }finally{busy=false;run.disabled=!selected;reset.disabled=!selected;file.disabled=false;}
  });
  window.addEventListener("beforeunload",()=>{if(sourceUrl)URL.revokeObjectURL(sourceUrl);if(resultUrl)URL.revokeObjectURL(resultUrl);});
})();