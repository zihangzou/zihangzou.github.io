"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const fmt = new Intl.NumberFormat("en-US", {maximumFractionDigits: 0});
  let snapshot = null;
  const count = n => Number.isFinite(n) && n >= 0 ? fmt.format(n) : "—";
  const titles = {
    "/": "Homepage",
    "/papers/neural-plagiarism/": "Neural Plagiarism",
    "/papers/anti-neuron-watermarking/": "Anti-Neuron Watermarking",
    "/papers/lawful-autonomous-driving/": "Lawful Autonomous Driving",
    "/papers/adversarial-mixup/": "Adversarial Mix-up",
    "/papers/vehicle-dynamics-pothole-mitigation/": "Pothole-Hazard Mitigation",
    "/papers/personalized-collision-warning/": "Personalized Collision Warning",
    "/papers/crash-risk-analysis/": "Crash Risk Analysis"
  };
  function node(tag, text, cls) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  function message(text, error = false) {
    $("notice").textContent = text;
    $("notice").hidden = !text;
    $("notice").setAttribute("role", error ? "alert" : "status");
  }
  function ranks(id, rows, kind) {
    const root = $(id); root.replaceChildren();
    if (!rows || !rows.length) {root.append(node("p", snapshot?.status === "ready" ? "No recorded activity in this period." : "Waiting for data.", "empty"));return;}
    const max = Math.max(1, ...rows.map(r => r.views));
    for (const row of rows) {
      const item = node("div", undefined, "rank-row");
      const label = node("div", undefined, "rank-label");
      label.append(node("span", kind === "pages" ? (titles[row.label] || row.label) : row.label));
      if (kind === "pages" && titles[row.label]) label.append(node("div", row.label, "rank-sub"));
      const bar = node("div", undefined, "rank-bar");
      bar.style.width = `${Math.max(0, Math.min(100, row.views / max * 100))}%`;
      label.append(bar);item.append(label, node("span", count(row.views), "rank-value"));root.append(item);
    }
  }
  function chart(rows) {
    $("chart").replaceChildren();$("daily").replaceChildren();
    if (!rows || !rows.length) {$("chart").append(node("p", "Traffic will appear after Cloudflare is connected.", "empty"));return;}
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 960 250");svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Daily page views and visits. Exact values are in the daily numbers table below.");
    const make = (tag, attrs, text) => {const e = document.createElementNS(ns,tag);for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;svg.append(e);return e;};
    const max = Math.max(1,...rows.flatMap(r=>[r.views,r.visits]));
    for(let i=0;i<5;i++) {const y=208-i*46;make("line",{x1:56,x2:948,y1:y,y2:y,stroke:"#323b4d"});make("text",{x:44,y:y+4,fill:"#98a7c2","font-size":11,"text-anchor":"end"},count(max*i/4));}
    const step = 880 / rows.length, width = Math.min(20, step*.3);
    rows.forEach((r,i)=>{
      const x=60+step*i+step/2;
      for(const [field,offset,color] of [["views",-width,"#86a6ff"],["visits",2,"#63c7b6"]]) {
        const h=r[field]/max*184,rect=make("rect",{x:x+offset,y:208-h,width:Math.max(1,width-2),height:h,fill:color,rx:2});
        const title=document.createElementNS(ns,"title");title.textContent=`${r.date}: ${count(r[field])} ${field}`;rect.append(title);
      }
      if(i===0||i===rows.length-1||i%Math.max(1,Math.ceil(rows.length/7))===0)make("text",{x,y:234,fill:"#98a7c2","font-size":11,"text-anchor":"middle"},r.date.slice(5));
      const tr=node("tr");tr.append(node("td",r.date),node("td",count(r.views)),node("td",count(r.visits)));$("daily").append(tr);
    });
    $("chart").append(svg);
  }
  function validate(d) {
    if(d.schema_version!==1 || d.site!=="zihangzou.github.io" || !["ready","not_configured"].includes(d.status))throw new Error("Unsupported analytics snapshot.");
    if(d.status!=="ready")return;
    if(!Number.isFinite(Date.parse(d.updated_at)))throw new Error("Invalid snapshot timestamp.");
    for(const key of ["1","7","30"]) {
      const w=d.windows?.[key];if(!w || !Array.isArray(w.daily))throw new Error("Incomplete analytics snapshot.");
      if(typeof w.start!=="string"||typeof w.end!=="string"||!Number.isFinite(Date.parse(w.start))||!Number.isFinite(Date.parse(w.end))||w.daily.some(r=>typeof r.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)))throw new Error("Invalid period.");
      for(const n of [w.views,w.visits,w.neural_views,...w.daily.flatMap(r=>[r.views,r.visits])])if(!Number.isFinite(n)||n<0)throw new Error("Invalid metric.");
      for(const group of ["pages","countries","referrers","devices"])if(!Array.isArray(w[group]) || w[group].some(r=>typeof r.label!=="string"||!Number.isFinite(r.views)||r.views<0))throw new Error("Invalid breakdown.");
    }
  }
  function render() {
    const ready=snapshot?.status==="ready",w=ready?snapshot.windows[$("range").value]:null;
    $("connection").textContent=ready?"Connected":"Awaiting setup";$("connection").className=`badge ${ready?"ready":"pending"}`;
    $("updated").textContent=ready?`Updated ${new Date(snapshot.updated_at).toLocaleString()} · scheduled every 6 hours`:"No analytics snapshot has been collected yet.";
    $("period").textContent=w?`${w.start.slice(0,10)} — ${w.end.slice(0,10)} · UTC · includes today so far`:"Visitor activity across the academic website.";
    $("views").textContent=count(w?.views);$("visits").textContent=count(w?.visits);$("country-count").textContent=w?count(w.countries.filter(r=>r.label!=="Unknown").length):"—";$("neural-views").textContent=count(w?.neural_views);
    const stale=ready && Date.now()-Date.parse(snapshot.updated_at)>24*60*60*1000;
    message(!ready?"Waiting for Cloudflare setup. Connect the tracking snippet and the read-only analytics credentials to begin collecting real statistics.":stale?"This snapshot is over 24 hours old. Check the Update usage statistics workflow for sync errors.":w.views===0?"Cloudflare returned no recorded page views for this period. New tracking can take time to appear.":"");
    chart(w?.daily);ranks("page-rows",w?.pages,"pages");ranks("country-rows",w?.countries);ranks("referrer-rows",w?.referrers);ranks("device-rows",w?.devices);
  }
  async function load() {
    $("refresh").disabled=true;
    try {
      const response=await fetch(`/usage-data.json?t=${Date.now()}`,{cache:"no-store",credentials:"omit"});
      if(!response.ok)throw new Error(`Snapshot request failed (${response.status}).`);
      const data=await response.json();validate(data);snapshot=data;render();
    } catch(error) {
      if(snapshot)render();else {snapshot={status:"not_configured"};render();}
      $("connection").textContent="Sync unavailable";$("connection").className="badge pending";
      message("Unable to load the latest statistics. " + (snapshot.status==="ready"?"Showing the last loaded snapshot.":"No data is being displayed."),true);
    } finally {$("refresh").disabled=false;}
  }
  $("range").addEventListener("change",()=>{if(snapshot)render();});$("refresh").addEventListener("click",load);load();
})();
