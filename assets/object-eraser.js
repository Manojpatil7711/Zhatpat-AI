(() => {
  const $=id=>document.getElementById(id);
  const file=$("erase-file"),drop=$("erase-drop"),editor=$("erase-editor"),imageCanvas=$("erase-image"),maskCanvas=$("erase-mask"),run=$("erase-run"),reset=$("erase-reset"),output=$("erase-output"),download=$("erase-download"),message=$("erase-message"),progress=$("erase-progress"),status=$("erase-status"),bar=$("erase-bar"),percent=$("erase-percent"),brush=$("erase-brush"),brushValue=$("erase-brush-value");
  if(!file||!drop||!run)return;
  let selected=null,bitmap=null,cvRuntime=null,cvPromise=null,busy=false,strokes=[],drawing=false,currentStroke=null,outputUrl=null;
  const maskCtx=maskCanvas.getContext("2d",{willReadFrequently:true});
  const imageCtx=imageCanvas.getContext("2d");
  function say(t){message.textContent=t;}
  function cleanOutput(){if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=null;output.removeAttribute("width");output.removeAttribute("height");output.hidden=true;download.hidden=true;$("erase-placeholder").hidden=false;}
  function clearMask(){maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);maskCtx.lineCap="round";maskCtx.lineJoin="round";strokes=[];$("erase-undo").disabled=true;}
  function paintStroke(ctx,stroke,colour){if(!stroke.points.length)return;ctx.save();ctx.strokeStyle=colour;ctx.fillStyle=colour;ctx.lineWidth=stroke.size;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(stroke.points[0].x,stroke.points[0].y);for(let i=1;i<stroke.points.length;i++)ctx.lineTo(stroke.points[i].x,stroke.points[i].y);if(stroke.points.length===1){ctx.arc(stroke.points[0].x,stroke.points[0].y,stroke.size/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();ctx.restore();}
  function redrawMask(){maskCtx.clearRect(0,0,maskCanvas.width,maskCanvas.height);for(const stroke of strokes)paintStroke(maskCtx,stroke,"rgba(255,255,255,1)");$("erase-undo").disabled=!strokes.length;}
  function redrawOverlay(){const overlay=$("erase-overlay");if(!overlay)return;const ctx=overlay.getContext("2d");ctx.clearRect(0,0,overlay.width,overlay.height);for(const stroke of strokes)paintStroke(ctx,stroke,"rgba(255,65,105,.48)");}
  function setBrush(){const v=Number(brush.value);brushValue.textContent=v+" px";maskCtx.lineWidth=v;}
  function setCanvasSize(w,h){imageCanvas.width=maskCanvas.width=w;imageCanvas.height=maskCanvas.height=h;const overlay=document.createElement("canvas");overlay.id="erase-overlay";overlay.width=w;overlay.height=h;overlay.setAttribute("aria-hidden","true");maskCanvas.parentNode.insertBefore(overlay,maskCanvas);maskCanvas.style.display="none";maskCanvas.style.pointerEvents="none";maskCanvas=overlay;maskCtx=overlay.getContext("2d",{willReadFrequently:true});}
  function choose(f){
    if(!f)return;if(!["image/jpeg","image/png","image/webp"].includes(f.type)){say("Choose a JPG, PNG or WebP image.");return;}if(f.size>8*1024*1024){say("Image is larger than 8 MB. Choose a smaller photo.");return;}
    if(bitmap)bitmap.close();cleanOutput();selected=f;const reader=new FileReader();reader.onload=async()=>{try{const next=await createImageBitmap(f);if(next.width*next.height>36000000){next.close();say("This image is too large for safe mobile processing. Choose a smaller image.");return;}bitmap=next;const scale=Math.min(1,1800/Math.max(next.width,next.height),Math.sqrt(8000000/(next.width*next.height)));const w=Math.max(1,Math.round(next.width*scale)),h=Math.max(1,Math.round(next.height*scale));imageCanvas.width=w;imageCanvas.height=h;imageCtx.drawImage(next,0,0,w,h);maskCanvas.width=w;maskCanvas.height=h;maskCanvas.style.display="block";maskCtx=maskCanvas.getContext("2d",{willReadFrequently:true});maskCtx.clearRect(0,0,w,h);strokes=[];drop.hidden=true;editor.hidden=false;run.disabled=false;reset.disabled=false;$("erase-undo").disabled=true;run.focus();say("Photo ready. Paint over the unwanted object, then erase.");}catch(e){say("Could not read this image. Try another photo.");}};reader.readAsDataURL(f);
  }
  file.addEventListener("change",()=>choose(file.files&&file.files[0]));
  drop.addEventListener("click",()=>file.click());
  ["dragover","dragenter"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("dragover");}));
  ["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove("dragover");}));
  drop.addEventListener("drop",e=>choose(e.dataTransfer&&e.dataTransfer.files[0]));
  $("erase-change").addEventListener("click",()=>{if(!busy)file.click();});
  $("erase-undo").addEventListener("click",()=>{if(busy||!strokes.length)return;strokes.pop();redrawMask();});
  $("erase-clear").addEventListener("click",()=>{if(!busy){clearMask();}});
  brush.addEventListener("input",setBrush);setBrush();
  function point(e){const r=maskCanvas.getBoundingClientRect();return{x:Math.max(0,Math.min(maskCanvas.width,(e.clientX-r.left)*maskCanvas.width/r.width)),y:Math.max(0,Math.min(maskCanvas.height,(e.clientY-r.top)*maskCanvas.height/r.height))};}
  maskCanvas.addEventListener("pointerdown",e=>{if(busy||!bitmap)return;e.preventDefault();drawing=true;maskCanvas.setPointerCapture(e.pointerId);currentStroke={size:Number(brush.value),points:[point(e)]};strokes.push(currentStroke);redrawMask();});
  maskCanvas.addEventListener("pointermove",e=>{if(!drawing||!currentStroke)return;e.preventDefault();currentStroke.points.push(point(e));redrawMask();});
  function endDraw(){if(drawing){drawing=false;currentStroke=null;$("erase-undo").disabled=!strokes.length;}}
  maskCanvas.addEventListener("pointerup",endDraw);maskCanvas.addEventListener("pointercancel",endDraw);
  async function loadCV(){
    if(cvPromise)return cvPromise;
    cvPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://docs.opencv.org/4.13.0/opencv.js";script.async=true;script.onload=async()=>{try{cvRuntime=await window.cv;if(!cvRuntime||typeof cvRuntime.inpaint!=="function")throw new Error("This OpenCV build does not include the inpainting function required by this tool.");resolve(cvRuntime);}catch(e){reject(e);}};script.onerror=()=>reject(new Error("Could not load OpenCV.js. Check your internet connection and try again."));document.head.appendChild(script);});
    try{return await cvPromise;}catch(e){cvPromise=null;throw e;}
  }
  run.addEventListener("click",async()=>{
    if(!bitmap||busy)return;if(!strokes.length){say("Paint over the object you want to remove first.");return;}
    busy=true;run.disabled=true;reset.disabled=true;progress.hidden=false;status.textContent="Loading image engine…";bar.style.width="15%";percent.textContent="";
    let src=null,mask=null,dst=null,rgba=null,maskRgba=null;
    try{
      const cv=await loadCV();status.textContent="Preparing selected area…";bar.style.width="40%";
      const imageData=imageCtx.getImageData(0,0,imageCanvas.width,imageCanvas.height);
      const srcRgba=cv.matFromImageData(imageData);rgba=new cv.Mat();cv.cvtColor(srcRgba,rgba,cv.COLOR_RGBA2RGB);srcRgba.delete();src=rgba;
      const maskData=maskCtx.getImageData(0,0,maskCanvas.width,maskCanvas.height);
      maskRgba=cv.matFromImageData(maskData);mask=new cv.Mat();cv.cvtColor(maskRgba,mask,cv.COLOR_RGBA2GRAY);maskRgba.delete();maskRgba=null;
      cv.threshold(mask,mask,1,255,cv.THRESH_BINARY);
      dst=new cv.Mat();status.textContent="Removing marked object…";bar.style.width="65%";
      cv.inpaint(src,mask,dst,3,cv.INPAINT_TELEA);
      output.width=dst.cols;output.height=dst.rows;cv.imshow(output,dst);
      const blob=await new Promise(resolve=>output.toBlob(resolve,"image/png"));if(!blob)throw new Error("Could not export the edited image.");
      if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(blob);download.href=outputUrl;download.hidden=false;output.hidden=false;$("erase-placeholder").hidden=true;
      status.textContent="Finished";bar.style.width="100%";percent.textContent="100%";say("Done. Check the result; if the area looks unnatural, reduce the brush size or mark more carefully.");
    }catch(e){say(e&&e.message?e.message:"Could not erase this area. Try a smaller photo or a smaller marked region.");status.textContent="Could not complete";bar.style.width="0%";}
    finally{if(src)src.delete();if(mask)mask.delete();if(dst)dst.delete();if(rgba&&rgba!==src)rgba.delete();if(maskRgba)maskRgba.delete();busy=false;run.disabled=!bitmap;reset.disabled=!bitmap;}
  });
  reset.addEventListener("click",()=>{if(busy)return;selected=null;if(bitmap){bitmap.close();bitmap=null;}file.value="";editor.hidden=true;drop.hidden=false;run.disabled=true;reset.disabled=true;clearMask();imageCtx.clearRect(0,0,imageCanvas.width,imageCanvas.height);cleanOutput();progress.hidden=true;say("");});
  window.addEventListener("beforeunload",()=>{if(bitmap)bitmap.close();if(outputUrl)URL.revokeObjectURL(outputUrl);});
})();