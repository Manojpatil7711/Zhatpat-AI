(() => {
  const input=document.getElementById("tool-search");
  const cards=[...document.querySelectorAll(".premium-tool-card")];
  const filters=[...document.querySelectorAll(".filter-chip")];
  const empty=document.getElementById("no-results");
  if(!input||!cards.length)return;
  let active="all";
  function update(){
    const q=input.value.trim().toLowerCase();
    let count=0;
    cards.forEach(card=>{
      const category=card.dataset.category||"";
      const text=(card.dataset.search+" "+card.textContent).toLowerCase();
      const available=card.classList.contains("live-card");
      const matchesText=!q||text.includes(q);
      const matchesFilter=active==="all"||(active==="available"&&available)||(active==="image"&&category==="image")||(active==="video"&&category==="video");
      const show=matchesText&&matchesFilter;
      card.hidden=!show;
      if(show)count++;
    });
    if(empty)empty.hidden=count>0;
  }
  filters.forEach(button=>button.addEventListener("click",()=>{
    active=button.dataset.filter||"all";
    filters.forEach(item=>item.classList.toggle("active",item===button));
    update();
  }));
  input.addEventListener("input",update);
  document.addEventListener("keydown",event=>{
    if(event.key==="/"&&!event.ctrlKey&&!event.metaKey&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName)){
      event.preventDefault();input.focus();
    }
    if(event.key==="Escape"&&document.activeElement===input){input.value="";input.blur();update();}
  });
  update();
})();