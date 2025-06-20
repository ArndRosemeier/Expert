var fe=Object.defineProperty;var he=(r,e,t)=>e in r?fe(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var h=(r,e,t)=>he(r,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))o(i);new MutationObserver(i=>{for(const n of i)if(n.type==="childList")for(const a of n.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&o(a)}).observe(document,{childList:!0,subtree:!0});function t(i){const n={};return i.integrity&&(n.integrity=i.integrity),i.referrerPolicy&&(n.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?n.credentials="include":i.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function o(i){if(i.ep)return;i.ep=!0;const n=t(i);fetch(i.href,n)}})();class X{constructor(e,t){h(this,"apiKey");h(this,"apiUrl","https://openrouter.ai/api/v1/chat/completions");h(this,"modelPurposeMap",{});this.apiKey=e,t&&(this.modelPurposeMap=t)}setModelPurpose(e,t){this.modelPurposeMap[e]=t}getModelForPurpose(e){return this.modelPurposeMap[e]}async chat(e,t){var s,p,u;const o=this.getModelForPurpose(e);if(!o)throw new Error(`No model configured for purpose: ${e}`);const i={model:o,messages:[{role:"user",content:t}]};return((u=(p=(s=(await this.sendMessage(i)).choices)==null?void 0:s[0])==null?void 0:p.message)==null?void 0:u.content)??""}async sendMessage(e){const t=await fetch(this.apiUrl,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(e)});if(!t.ok)throw new Error(`OpenRouter API error: ${t.status} ${t.statusText}`);return t.json()}async fetchModels(){const e=await fetch("https://openrouter.ai/api/v1/models",{headers:{Authorization:`Bearer ${this.apiKey}`}});if(!e.ok)throw new Error(`OpenRouter API error: ${e.status} ${e.statusText}`);return(await e.json()).data}}const Y="openrouter_api_key",j="openrouter_model_purposes",$=[{key:"creator",label:"Creator"},{key:"rating",label:"Rating"},{key:"editor",label:"Editor"}];function G(r){const e=[];if(r.prompt){const t=parseFloat(r.prompt);if(!isNaN(t)){const o=t*1e6;e.push(`Input: $${o.toLocaleString(void 0,{maximumFractionDigits:2})} per million tokens`)}}if(r.completion){const t=parseFloat(r.completion);if(!isNaN(t)){const o=t*1e6;e.push(`Output: $${o.toLocaleString(void 0,{maximumFractionDigits:2})} per million tokens`)}}return e}class ye{constructor(e,t){h(this,"onSelect");h(this,"closeModal");h(this,"apiKey","");h(this,"models",[]);h(this,"loading",!1);h(this,"error",null);h(this,"fetched",!1);h(this,"selectedModels",{});h(this,"root",null);this.onSelect=e,this.closeModal=t,this.loadFromStorage(),this.apiKey&&!this.fetched&&this.fetchModels()}render(e){this.root=e,this.update()}update(){if(!this.root)return;this.root.innerHTML="";const e=document.createElement("div");e.className="model-selector-container",e.style.width="100%",e.style.padding="2vw 2vw 2vw 2vw",e.style.background="rgba(255,255,255,0.95)",e.style.borderRadius="1.5rem",e.style.boxShadow="0 4px 32px 0 rgba(0,0,0,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.08)",e.style.display="flex",e.style.flexDirection="column",e.style.gap="1.5rem",e.style.boxSizing="border-box";const t=document.createElement("h2");t.textContent="Configure OpenRouter Models",t.style.fontSize="1.5rem",t.style.fontWeight="bold",t.style.marginBottom="0.5rem",t.style.textAlign="center",t.style.letterSpacing="0.01em",t.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",t.style.color="white",t.style.borderRadius="1rem",t.style.padding="0.75rem 0",t.style.boxShadow="0 2px 8px 0 rgba(59,130,246,0.10)",e.appendChild(t);const o=document.createElement("div");o.style.display="flex",o.style.flexDirection="column",o.style.gap="0.5rem",o.style.marginBottom="0.5rem";const i=document.createElement("input");i.type="password",i.placeholder="Enter OpenRouter API Key",i.value=this.apiKey,i.style.padding="0.75rem 1rem",i.style.border="1.5px solid #d1d5db",i.style.borderRadius="0.75rem",i.style.fontSize="1rem",i.style.background="#f9fafb",i.style.transition="border-color 0.2s",i.addEventListener("focus",()=>{i.style.borderColor="#3b82f6"}),i.addEventListener("blur",()=>{i.style.borderColor="#d1d5db"}),i.addEventListener("input",s=>{this.apiKey=s.target.value,this.saveToStorage(),this.update()}),o.appendChild(i);const n=document.createElement("div");n.innerHTML="<strong>Info:</strong> Your API key and model selections are stored in your browser's localStorage. Anyone with access to this browser profile can view them.",n.style.fontSize="0.85rem",n.style.color="#b45309",n.style.background="#fef3c7",n.style.borderRadius="0.5rem",n.style.padding="0.5rem 0.75rem",o.appendChild(n);const a=document.createElement("button");if(a.textContent=this.loading?"Fetching...":"Fetch Models",a.disabled=this.loading||!this.apiKey,a.style.padding="0.75rem 1rem",a.style.background=this.loading||!this.apiKey?"#93c5fd":"linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",a.style.color="white",a.style.fontWeight="bold",a.style.border="none",a.style.borderRadius="0.75rem",a.style.fontSize="1rem",a.style.cursor=this.loading||!this.apiKey?"not-allowed":"pointer",a.style.transition="background 0.2s",a.addEventListener("mouseenter",()=>{a.disabled||(a.style.background="linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)")}),a.addEventListener("mouseleave",()=>{a.disabled||(a.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)")}),a.addEventListener("click",()=>this.fetchModels()),o.appendChild(a),e.appendChild(o),this.error){const s=document.createElement("p");s.textContent=`Error: ${this.error}`,s.style.color="#dc2626",s.style.background="#fee2e2",s.style.borderRadius="0.5rem",s.style.padding="0.5rem 0.75rem",s.style.fontWeight="bold",e.appendChild(s)}if(this.fetched&&!this.loading&&!this.error&&this.models.length>0){const s=document.createElement("div");s.style.display="grid",s.style.gridTemplateColumns="repeat(2, minmax(0, 1fr))",s.style.gap="1.5rem",s.style.width="100%",s.style.boxSizing="border-box",s.style.margin="0 auto",s.style.alignItems="stretch",s.style.justifyItems="stretch",s.style.maxWidth="100%",s.style.padding="0",s.style.gridTemplateRows="auto auto",s.style.gridAutoRows="1fr",s.style.gridAutoFlow="row",$.forEach(m=>{const d=document.createElement("div");d.style.background="#f3f4f6",d.style.border="1.5px solid #d1d5db",d.style.borderRadius="1rem",d.style.padding="1rem 1.25rem",d.style.boxShadow="0 1px 4px 0 rgba(0,0,0,0.04)",d.style.display="flex",d.style.flexDirection="column",d.style.gap="0.5rem",d.style.height="100%";const C=document.createElement("div");C.textContent=`${m.label} Model`,C.style.fontWeight="bold",C.style.marginBottom="0.25rem",d.appendChild(C);const y=document.createElement("select");y.style.padding="0.5rem 1rem",y.style.border="1.5px solid #d1d5db",y.style.borderRadius="0.75rem",y.style.fontSize="1rem",y.style.background="#fff",y.style.transition="border-color 0.2s",y.addEventListener("focus",()=>{y.style.borderColor="#3b82f6"}),y.addEventListener("blur",()=>{y.style.borderColor="#d1d5db"});const M=document.createElement("option");M.value="",M.disabled=!0,M.textContent="Select a model...",y.appendChild(M),this.models.forEach(S=>{const f=document.createElement("option");f.value=S.id,f.textContent=S.name,y.appendChild(f)});const E=this.models.find(S=>S.id===this.selectedModels[m.key]);y.value=E?E.id:"";let w=document.createElement("div"),b;E?(w.textContent=E.description,w.style.fontSize="0.95rem",w.style.color="#374151",w.style.marginTop="0.25rem",d.appendChild(w),E.pricing&&(b=document.createElement("ul"),b.style.listStyle="disc inside",b.style.marginLeft="1.5rem",b.style.marginTop="0.5rem",G(E.pricing).forEach(S=>{const f=document.createElement("li");f.textContent=S,f.style.fontSize="0.9rem",f.style.color="#2563eb",b&&b.appendChild(f)}),d.appendChild(b))):(w.textContent="",d.appendChild(w)),y.addEventListener("change",S=>{this.selectedModels[m.key]=S.target.value;const f=this.models.find(k=>k.id===this.selectedModels[m.key]);w.textContent=f?f.description:"",b&&(b.innerHTML="",f&&f.pricing&&G(f.pricing).forEach(k=>{const P=document.createElement("li");P.textContent=k,P.style.fontSize="0.9rem",P.style.color="#2563eb",b==null||b.appendChild(P)})),this.update()}),d.appendChild(y),E&&b&&d.appendChild(b),s.appendChild(d)}),e.appendChild(s);const p=document.createElement("div");p.style.display="flex",p.style.justifyContent="flex-end",p.style.gap="1rem",p.style.marginTop="1.5rem";const u=document.createElement("button");u.textContent="Cancel",u.disabled=!this.isSavedConfigValid(),u.addEventListener("click",()=>{this.closeModal()}),p.appendChild(u);const c=document.createElement("button"),g=this.areAllModelsSelected();c.textContent="Save and Close",c.disabled=!g,c.addEventListener("click",()=>{this.areAllModelsSelected()&&(this.saveToStorage(),this.onSelect(this.selectedModels))}),p.appendChild(c),e.appendChild(p)}this.root.appendChild(e)}async fetchModels(){this.loading=!0,this.error=null,this.fetched=!1,this.update();try{const e=new X(this.apiKey);this.models=await e.fetchModels();const t=new Set(this.models.map(o=>o.id));for(const o of $)this.selectedModels[o.key]&&!t.has(this.selectedModels[o.key])&&(this.selectedModels[o.key]="");this.fetched=!0}catch(e){this.error=e.message}finally{this.loading=!1,this.update()}}loadFromStorage(){const e=localStorage.getItem(Y);e&&(this.apiKey=e);const t=localStorage.getItem(j);if(t)try{this.selectedModels=JSON.parse(t)}catch{}}saveToStorage(){localStorage.setItem(Y,this.apiKey),localStorage.setItem(j,JSON.stringify(this.selectedModels))}areAllModelsSelected(){return $.every(e=>this.selectedModels[e.key]&&this.selectedModels[e.key]!=="")}setSelectedModels(e){this.selectedModels={...e},this.saveToStorage(),this.update()}getSelectedModels(){return this.selectedModels}getApiKey(){return this.apiKey}isSavedConfigValid(){const e=localStorage.getItem(j);if(!e)return!1;try{const t=JSON.parse(e);return $.every(o=>t[o.key])}catch{return!1}}}const W="expert_app_prompts",R={creator_initial:`
        Your task is to respond to the following user prompt: "{{prompt}}"

        Your response will be rated on the following criteria:
        - {{criteria}}

        Please generate a high-quality response that addresses these criteria.
    `.trim(),creator:`
        The user's original prompt was: "{{prompt}}".
        Your last response was: "{{lastResponse}}".
        It received feedback and the editor provided the following advice to improve it: "{{editorAdvice}}".

        Please generate a new response, incorporating the editor's advice. Remember, your response will be rated on these criteria:
        - {{criteria}}
    `.trim(),rater:`
        You are a rating agent. Your response MUST be a single, valid JSON object and nothing else. Do not include any text before or after the JSON.

        The user's original prompt was: "{{originalPrompt}}".
        
        Here is a response generated for that prompt: "{{response}}"
        
        Please rate this response on the single criterion of "{{criterion}}".
        The goal is to score at least {{goal}} out of 10.
        
        Provide your response as a JSON object with two keys:
        - "score": A number from 1 to 10.
        - "justification": A brief explanation for your score, written in a neutral, objective tone.

        Example: {"score": 8, "justification": "The response is clear and well-structured."}
    `.trim(),editor:`
        A response was generated: "{{response}}"
        It was rated against several criteria:
        {{ratings}}

        Please provide concise, actionable advice for the Creator LLM on how to improve the response to better meet the rating goals.
        Focus on what needs to change.
    `.trim()},be={creator_initial:["prompt","criteria"],creator:["prompt","lastResponse","editorAdvice","criteria"],rater:["originalPrompt","response","criterion","goal"],editor:["response","ratings"]};class ve{constructor(e,t){h(this,"prompts");h(this,"onSave");h(this,"root");this.root=e,this.onSave=t,this.prompts=this.loadFromStorage(),this.render()}loadFromStorage(){const e=localStorage.getItem(W);return e?{...R,...JSON.parse(e)}:{...R}}saveToStorage(){localStorage.setItem(W,JSON.stringify(this.prompts)),this.onSave(this.prompts),console.log("Prompts saved.")}revertToDefaults(){confirm("Are you sure you want to revert all prompts to their default values? Any unsaved changes will be lost.")&&(this.prompts={...R},this.render())}getPrompts(){return this.prompts}render(){this.root.innerHTML=`
            <style>
                .prompt-editor { margin-bottom: 1.5rem; }
                .prompt-editor label { font-weight: bold; display: block; margin-bottom: 0.25rem; }
                .prompt-editor textarea { width: 100%; min-height: 200px; font-family: monospace; }
                .placeholders { font-size: 0.8rem; font-style: italic; margin-bottom: 0.5rem; color: #555; }
                .placeholders code { background-color: #eee; padding: 2px 4px; border-radius: 3px; }
            </style>
            <h2>Configure Prompts</h2>
            <p>Edit the templates used by the LLM agents.</p>
        `,Object.keys(this.prompts).forEach(i=>{const n=i,a=document.createElement("div");a.className="prompt-editor";const s=document.createElement("label");s.textContent=`${n.replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase())} Prompt Template`;const p=document.createElement("div");p.className="placeholders",p.innerHTML=`Available placeholders: ${be[n].map(c=>`<code>{{${c}}}</code>`).join(", ")}`;const u=document.createElement("textarea");u.value=this.prompts[n],u.addEventListener("input",()=>{this.prompts[n]=u.value}),a.appendChild(s),a.appendChild(p),a.appendChild(u),this.root.appendChild(a)});const e=document.createElement("div");e.style.marginTop="1.5rem",e.style.display="flex",e.style.gap="1rem";const t=document.createElement("button");t.textContent="Save and Close",t.addEventListener("click",()=>this.saveToStorage()),e.appendChild(t);const o=document.createElement("button");o.textContent="Revert to Default",o.addEventListener("click",()=>this.revertToDefaults()),e.appendChild(o),this.root.appendChild(e)}}class Z{constructor(e,t){h(this,"client");h(this,"prompts");h(this,"stopRequested",!1);this.client=e,this.prompts=t||{...R}}requestStop(){this.stopRequested=!0}async runLoop(e,t){this.stopRequested=!1;const{prompt:o,criteria:i,maxIterations:n}=e,a=[];let s="",p=!1;const u=3;for(let c=0;c<n&&!this.stopRequested;c++){const g=this.createCreatorPrompt(o,i,c>0?a:void 0);s=await this.client.chat("creator",g);const m={prompt:g,response:s};if(a.push({iteration:c+1,type:"creator",payload:m}),t==null||t({type:"creator",payload:m,iteration:c+1,maxIterations:n,step:1,totalStepsInIteration:u}),this.stopRequested)break;const d=[];let C=!0;for(const f of i){if(this.stopRequested)break;const k=this.createRatingPrompt(s,f,o),P=await this.client.chat("rating",k),J=this.parseRatingResponse(P,f);d.push(J),J.score<f.goal&&(C=!1)}if(this.stopRequested)break;const M={ratings:d.map((f,k)=>({criterion:i[k].name,goal:i[k].goal,score:f.score,justification:f.justification}))};if(a.push({iteration:c+1,type:"rating",payload:M}),t==null||t({type:"rating",payload:M,iteration:c+1,maxIterations:n,step:2,totalStepsInIteration:u}),C){p=!0;break}if(this.stopRequested)break;const E=d.filter(f=>f.score<f.goal),w=this.createEditorPrompt(s,E),b=await this.client.chat("editor",w),S={prompt:w,advice:b};a.push({iteration:c+1,type:"editor",payload:S}),t==null||t({type:"editor",payload:S,iteration:c+1,maxIterations:n,step:3,totalStepsInIteration:u})}return{finalResponse:s,history:a,iterations:a.filter(c=>c.type==="creator").length,success:p}}createCreatorPrompt(e,t,o){var c,g;const i=m=>{const d=m.indexOf(".");return d>0?m.substring(0,d):m},n=t.map(m=>i(m.name)).join("\\n- ");if(!o)return this.prompts.creator_initial.replace("{{prompt}}",e).replace("{{criteria}}",n);const a=o.filter(m=>m.type==="editor").pop(),s=o.filter(m=>m.type==="creator").pop(),p=((c=a==null?void 0:a.payload)==null?void 0:c.advice)||"No advice was given.",u=(g=s==null?void 0:s.payload)==null?void 0:g.response;return this.prompts.creator.replace("{{prompt}}",e).replace("{{lastResponse}}",u||"").replace("{{editorAdvice}}",p).replace("{{criteria}}",n)}createRatingPrompt(e,t,o){return this.prompts.rater.replace("{{originalPrompt}}",o).replace("{{response}}",e).replace("{{criterion}}",t.name).replace("{{goal}}",String(t.goal))}parseRatingResponse(e,t){let o=1,i=`Could not parse rater response. Raw response: 
---
${e}`;try{let n=null;const a=e.match(/```json\s*(\{[\s\S]*?\})\s*```/);if(a&&a[1])n=a[1];else{const s=e.indexOf("{"),p=e.lastIndexOf("}");s!==-1&&p!==-1&&p>s&&(n=e.substring(s,p+1))}if(n){const s=JSON.parse(n);typeof s.score=="number"&&(o=s.score),typeof s.justification=="string"&&(i=s.justification)}}catch(n){console.warn("Could not parse rating response as JSON, using fallback.",{response:e,error:n})}return{criterion:t.name,goal:t.goal,score:o,justification:i}}createEditorPrompt(e,t){return this.prompts.editor.replace("{{response}}",e).replace("{{ratings}}",JSON.stringify(t,null,2))}}const D="expert_app_settings_profiles",F="expert_app_last_used_profile";function xe(r){return typeof r!="object"||r===null?!1:Object.values(r).every(e=>typeof e=="object"&&e!==null&&"prompt"in e&&typeof e.prompt=="string"&&"criteria"in e&&Array.isArray(e.criteria)&&"maxIterations"in e&&typeof e.maxIterations=="number"&&"selectedModels"in e&&typeof e.selectedModels=="object"&&e.selectedModels!==null)}class we{constructor(){h(this,"profiles",{});h(this,"lastUsedProfileName",null);this.loadProfiles(),this.lastUsedProfileName=localStorage.getItem(F)}loadProfiles(){const e=localStorage.getItem(D);if(e)try{const t=JSON.parse(e);xe(t)?this.profiles=t:(console.warn("Invalid settings profiles found in localStorage. Ignoring."),this.profiles={})}catch(t){console.error("Failed to parse settings profiles from localStorage",t),this.profiles={}}}getProfileNames(){return Object.keys(this.profiles)}getProfile(e){return this.profiles[e]}saveProfile(e,t){if(!e)throw new Error("Profile name cannot be empty.");this.profiles[e]=t,localStorage.setItem(D,JSON.stringify(this.profiles)),this.setLastUsedProfile(e)}deleteProfile(e){delete this.profiles[e],localStorage.setItem(D,JSON.stringify(this.profiles)),this.lastUsedProfileName===e&&(localStorage.removeItem(F),this.lastUsedProfileName=null)}getLastUsedProfile(){if(this.lastUsedProfileName)return this.getProfile(this.lastUsedProfileName);const e=this.getProfileNames();return e.length>0?this.getProfile(e[0]):void 0}getLastUsedProfileName(){if(this.lastUsedProfileName&&this.profiles[this.lastUsedProfileName])return this.lastUsedProfileName;const e=this.getProfileNames();return e.length>0?e[0]:null}setLastUsedProfile(e){this.lastUsedProfileName=e,localStorage.setItem(F,e)}}const Se=new URLSearchParams(window.location.search);Se.get("clean")==="true"&&(console.log("Clean start requested. Clearing local storage..."),localStorage.removeItem("openrouter_api_key"),localStorage.removeItem("openrouter_model_purposes"),localStorage.removeItem("expert_app_prompts"),localStorage.removeItem("expert_app_settings_profiles"),localStorage.removeItem("expert_app_settings_last_profile"),window.location.href=window.location.pathname);function l(r){const e=document.getElementById(r);if(!e)throw new Error(`Could not find element with id: ${r}`);return e}const O=l("main-app"),ee=l("configure-models-btn"),te=l("configure-prompts-btn"),_=l("modal-container"),re=l("modal-content"),L=l("prompt-modal-container"),oe=l("prompt-modal-content");if(!O||!ee||!_||!re||!te||!L||!oe)throw new Error("Could not find required DOM elements");let B=null,v=null,V={},I=null,x=null,K={...R},A=[],N=0,H=!1;const ne=[{name:"Clarity & Conciseness. The writing is direct, easy to understand, and avoids unnecessary words or filler phrases.",goal:8},{name:"Natural & Authentic Tone. The language sounds human and authentic. It avoids being overly formal, academic, or robotic.",goal:9},{name:"Engaging Flow. The text is interesting and holds the reader's attention. Sentences and paragraphs transition smoothly.",goal:8},{name:"Varied Sentence Structure. The length and structure of sentences are varied to create a pleasing rhythm, avoiding monotony.",goal:7},{name:"Subtlety (Show, Don't Tell). The writing implies emotions and ideas through description and action rather than stating them directly. It avoids being on-the-nose.",goal:8},{name:"Avoids AI Clichés. The text avoids common AI phrases like 'In conclusion,' 'It's important to note,' 'delve into,' or 'tapestry of...'",goal:9},{name:"Understated Language. The prose avoids overly dramatic, sensational, or grandiose language. The tone is measured and appropriate.",goal:9},{name:"Specificity & Concrete Detail. The writing uses specific, concrete details and examples rather than vague generalities.",goal:8},{name:"Original Phrasing. The text avoids common idioms and clichés, opting for more original ways to express ideas.",goal:7},{name:"Human-like Naming. When applicable, any names for people, places, or concepts are creative and feel natural. Avoid common AI-generated names like 'Elara' or 'Lyra.'",goal:8}];function ie(){_&&v&&(v.loadFromStorage(),v.update(),_.style.display="flex")}function se(){_&&(_.style.display="none")}function Ce(){L&&(L.style.display="flex")}function ae(){L&&(L.style.display="none")}function q(r){console.log("Reconfiguring core services with models:",r),V=r;const e=v==null?void 0:v.getApiKey();e&&(B=new X(e,V),I=new Z(B,K),console.log("OpenRouter client and Orchestrator configured."))}function Ee(r){q(r),se(),H||(le(),O.style.display="block",H=!0)}function ke(r){K=r,B&&(I=new Z(B,K)),ae()}function le(){var r,e,t,o,i,n,a,s,p,u,c;O.innerHTML=`
        <style>
            .grid-container {
                display: grid;
                grid-template-columns: 1fr 2fr;
                gap: 2rem;
            }

            .control-panel {
                background-color: white;
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06);
            }

            .results-panel {
                background-color: transparent;
            }

            h2, h3 {
                font-weight: 600;
                color: #111827;
                margin-top: 0;
            }
            h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1.5rem; }
            h3 { font-size: 1.125rem; margin-bottom: 1rem; }

            label {
                font-weight: 500;
                margin-bottom: 0.5rem;
                display: block;
            }

            input[type="text"], input[type="number"], textarea, select {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                transition: border-color 0.2s, box-shadow 0.2s;
                box-sizing: border-box;
            }
            input[type="text"]:focus, input[type="number"]:focus, textarea:focus, select:focus {
                outline: none;
                border-color: var(--primary-color);
                box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
            }
            textarea#prompt {
                min-height: 150px;
                resize: vertical;
            }
            .criterion textarea {
                flex-grow: 1;
                resize: none;
                overflow-y: hidden;
                line-height: 1.5;
                padding-top: 0.6rem;
                padding-bottom: 0.6rem;
            }

            .criterion { display: flex; gap: 0.75rem; margin-bottom: 0.75rem; align-items: center !important; }
            .criterion input[type="number"] { max-width: 80px; }

            .remove-criterion-btn {
                background: none;
                border: none;
                color: var(--secondary-color);
                font-size: 1.25rem;
                padding: 0.25rem;
                line-height: 1;
            }
            .remove-criterion-btn:hover { color: #dc2626; }

            .settings-bar { display: flex; gap: 0.75rem; margin-bottom: 1.5rem; align-items: center; }
            .settings-bar input { flex-grow: 1; }
            
            .criteria-actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
            
            hr { border: none; border-top: 1px solid var(--border-color); margin: 1.5rem 0; }

            .response-block {
                padding: 1.5rem;
                border-radius: 12px;
                margin-top: 1rem;
                border: 1px solid;
                box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);
            }
            .response-block h3 { margin-top: 0; }
            .response-block pre { white-space: pre-wrap; word-break: break-all; background-color: var(--bg-subtle); padding: 1rem; border-radius: 8px; }

            .response-creator { background-color: #eff6ff; border-color: #bfdbfe; }
            .response-rater { background-color: #fefce8; border-color: #fde68a; }
            .response-editor { background-color: #faf5ff; border-color: #e9d5ff; }
            
            #final-result-container { margin-top: 1rem; }

            #history-controls {
                display: none; /* Hidden by default */
                padding: 1rem;
                background-color: var(--bg-subtle);
                border-radius: 12px;
                margin-top: 1rem;
                border: 1px solid var(--border-color);
            }
            #history-controls label {
                font-weight: 500;
                margin-right: 1rem;
            }
            #history-controls input[type="range"] {
                width: 200px;
                vertical-align: middle;
            }

            .progress-container {
                margin-top: 1rem;
                display: none; /* Hidden by default */
            }
            .progress-bar-wrapper {
                background-color: var(--bg-subtle);
                border-radius: 8px;
                padding: 3px;
                margin-bottom: 0.5rem;
            }
            .progress-bar {
                background-color: var(--primary-color);
                height: 20px;
                border-radius: 6px;
                transition: width 0.3s ease-in-out;
                text-align: center;
                color: white;
                font-size: 0.8rem;
                line-height: 20px;
                font-weight: 500;
            }

            .rating-list { list-style: none; padding: 0; margin: 0; }
            .rating-item { padding: 1rem 0; border-bottom: 1px solid var(--border-color); }
            .rating-item:first-child { padding-top: 0; }
            .rating-item:last-child { border-bottom: none; padding-bottom: 0; }
            .rating-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
            .rating-name { font-weight: 600; color: #374151; }
            .rating-score { font-weight: 700; font-size: 1.25rem; }
            .rating-reasoning { margin: 0; color: var(--secondary-color); font-size: 0.875rem; }

        </style>
        
        <div class="grid-container">
            <div class="control-panel">
                <h2>Settings & Controls</h2>

                <div class="settings-bar">
                    <select id="settings-profile-select"></select>
                    <input type="text" id="settings-profile-name" placeholder="New Profile Name"/>
                    <button id="settings-save-btn" class="button button-secondary">Save</button>
                    <button id="settings-delete-btn" class="button button-secondary">Delete</button>
                </div>
        
                <div>
                    <label for="prompt">Your Prompt:</label>
                    <textarea id="prompt"></textarea>
                </div>
                
                <hr>

                <h3>Quality Criteria</h3>
                <div id="criteria-list"></div>
                <div class="criteria-actions">
                    <button id="add-criterion-btn" class="button button-secondary">Add Criterion</button>
                    <button id="default-criteria-btn" class="button button-secondary">Load Defaults</button>
                    <button id="copy-criteria-btn" class="button button-secondary">Copy</button>
                    <button id="paste-criteria-btn" class="button button-secondary">Paste</button>
                </div>
                
                <hr>
        
                <div>
                    <label for="max-iterations">Max Iterations:</label>
                    <input type="number" id="max-iterations" min="1" max="20" value="5" style="max-width: 100px;">
                </div>
                
                <hr>

                <button id="start-loop-btn" class="button button-primary" style="width: 100%;">Start Loop</button>
                <button id="stop-loop-btn" class="button button-primary" style="display: none; width: 100%; background-color: #dc2626;">Stop Loop</button>
                
                <div id="progress-container" class="progress-container">
                    <div class="progress-bar-wrapper">
                        <div id="iteration-progress-bar" class="progress-bar" style="width: 0%;"></div>
                    </div>
                    <div class="progress-bar-wrapper">
                        <div id="step-progress-bar" class="progress-bar" style="width: 0%;"></div>
                    </div>
                </div>
            </div>
            
            <div class="results-panel">
                <div id="history-controls">
                    <label for="iteration-slider">View Iteration:</label>
                    <span id="iteration-label">1 / 1</span>
                    <input type="range" id="iteration-slider" min="1" max="1" value="1">
                </div>
                <div id="results-container">
                    <div id="live-response-container" class="response-block response-creator" style="display: none;">
                        <h3>Live Response</h3>
                        <p id="live-response"></p>
                    </div>
                    <div id="ratings-container" class="response-block response-rater" style="display: none;">
                        <h3>Latest Ratings</h3>
                        <div id="ratings"></div>
                    </div>
                    <div id="editor-advice-container" class="response-block response-editor" style="display: none;">
                        <h3>Editor's Advice</h3>
                        <p id="editor-advice"></p>
                    </div>
                    <div id="final-result-container"></div>
                </div>
            </div>
        </div>
    `,(r=document.getElementById("settings-save-btn"))==null||r.addEventListener("click",Oe),(e=document.getElementById("settings-delete-btn"))==null||e.addEventListener("click",$e),(t=document.getElementById("settings-profile-select"))==null||t.addEventListener("change",_e),(o=document.getElementById("add-criterion-btn"))==null||o.addEventListener("click",()=>{const g=document.getElementById("criteria-list");if(!g)return;const m=pe();g.appendChild(m);const d=m.querySelector("textarea");d==null||d.focus()}),(i=document.getElementById("copy-criteria-btn"))==null||i.addEventListener("click",Ae),(n=document.getElementById("paste-criteria-btn"))==null||n.addEventListener("click",Ne),(a=document.getElementById("default-criteria-btn"))==null||a.addEventListener("click",Re),(s=document.getElementById("criteria-list"))==null||s.addEventListener("click",g=>{var m;g.target.classList.contains("remove-criterion-btn")&&((m=g.target.closest(".criterion"))==null||m.remove())}),(p=document.getElementById("start-loop-btn"))==null||p.addEventListener("click",Te),(u=document.getElementById("stop-loop-btn"))==null||u.addEventListener("click",()=>{I&&I.requestStop()}),(c=l("iteration-slider"))==null||c.addEventListener("input",g=>{const m=g.target;N=parseInt(m.value,10),ce(N)}),ge(),T().length===0&&U(ne)}function Q(){this.style.height="auto",this.style.height=this.scrollHeight+"px"}function z(r){const e=r.indexOf(".");return e>0?r.substring(0,e):r}function T(){const r=document.querySelectorAll("#criteria-list .criterion"),e=[];return r.forEach(t=>{const o=t.querySelector("textarea"),i=t.querySelector('input[type="number"]');let n="";document.activeElement===o?n=o.value:n=o.dataset.fullText||o.value,n.trim()&&(i!=null&&i.value)&&e.push({name:n.trim(),goal:parseInt(i.value,10)})}),e}function Me(r){return r>=8?"#10b981":r>=5?"#f59e0b":"#ef4444"}function de(r){return`
        <ul class="rating-list">
            ${r.map(e=>`
                <li class="rating-item">
                    <div class="rating-header">
                        <span class="rating-name">${z(e.criterion)} (Goal: ${e.goal})</span>
                        <span class="rating-score" style="color: ${Me(e.score)}">
                            ${e.score} / 10
                        </span>
                    </div>
                    <p class="rating-reasoning">${(e.justification||"No reasoning provided.").replace(/\n/g,"<br>")}</p>
                </li>
            `).join("")}
        </ul>
    `}function Le(r){return Array.isArray(r)&&r.every(e=>typeof e=="object"&&e!==null&&"name"in e&&typeof e.name=="string"&&"goal"in e&&typeof e.goal=="number")}function Pe(r){let e=-1,t=1/0;const o=[...new Set(r.map(i=>i.iteration))];for(const i of o){const n=r.find(p=>p.iteration===i&&p.type==="rating");if(!n)continue;const s=n.payload.ratings.reduce((p,u)=>{const c=u.goal-u.score;return p+(c>0?c:0)},0);s<t&&(t=s,e=i)}return e>0?e:o.pop()||1}function ce(r){if(A.length===0)return;const e=A.filter(d=>d.iteration===r),t=e.find(d=>d.type==="creator"),o=e.find(d=>d.type==="rating"),i=e.find(d=>d.type==="editor"),n=l("live-response-container"),a=l("ratings-container"),s=l("editor-advice-container"),p=l("live-response"),u=l("ratings"),c=l("editor-advice");t?(n.style.display="block",p.innerHTML=t.payload.response.replace(/\n/g,"<br>")):n.style.display="none",o?(a.style.display="block",u.innerHTML=de(o.payload.ratings)):a.style.display="none",i?(s.style.display="block",c.innerHTML=i.payload.advice.replace(/\n/g,"<br>")):s.style.display="none";const g=l("iteration-label"),m=l("iteration-slider");g.textContent=`${r} / ${m.max}`}function Ie(r){const{type:e,payload:t,iteration:o,maxIterations:i,step:n,totalStepsInIteration:a}=r,s=l("iteration-progress-bar"),p=l("step-progress-bar"),u=o/i*100,c=n/a*100;s.style.width=`${u}%`,s.textContent=`Iteration: ${o} / ${i}`;const g=e.charAt(0).toUpperCase()+e.slice(1);if(p.style.width=`${c}%`,p.textContent=`Step: ${n} of ${a} (${g})`,e==="creator"){const m=l("live-response-container"),d=l("live-response");m.style.display="block",d.innerHTML=t.response.replace(/\n/g,"<br>")}else if(e==="rating"){const m=l("ratings-container"),d=l("ratings");console.log("Received ratings payload for rendering:",JSON.stringify(t.ratings,null,2)),m.style.display="block",d.innerHTML=de(t.ratings)}else if(e==="editor"){const m=l("editor-advice-container"),d=l("editor-advice");m.style.display="block",d.innerHTML=t.advice.replace(/\n/g,"<br>")}}async function Te(){if(!I){alert("Please configure models first.");return}A=[],N=0,l("history-controls").style.display="none";const r=l("prompt"),e=T();if(!r.value.trim()){alert("Please enter a prompt before starting the loop.");return}if(e.length===0){alert("Please define at least one quality criterion before starting the loop.");return}const t=l("max-iterations"),o={prompt:r.value,criteria:e,maxIterations:parseInt(t.value,10)||5},i=l("start-loop-btn"),n=l("stop-loop-btn");i.style.display="none",n.style.display="inline-block";const a=l("progress-container"),s=l("iteration-progress-bar"),p=l("step-progress-bar");a.style.display="block",s.style.width="0%",s.textContent="Starting...",p.style.width="0%",p.textContent="";const u=l("results-container"),c=l("final-result-container");Array.from(u.children).forEach(g=>g.style.display="none"),c.style.display="block",c.innerHTML="Looping...";try{const g=await I.runLoop(o,Ie);c.style.display="none",A=g.history;const m=g.iterations;if(m>0){let d=m;g.success||(d=Pe(A),console.log(`Loop failed. Showing best iteration: ${d}`));const C=l("history-controls"),y=l("iteration-slider");C.style.display="block",y.max=String(m),y.value=String(d),N=d,ce(N)}else c.style.display="block",c.innerHTML="<p>The loop did not run any iterations.</p>"}catch(g){c.style.display="block",c.innerHTML=`<p style="color: red;">Error: ${g}</p>`,console.error(g)}finally{i.style.display="inline-block",n.style.display="none",l("progress-container").style.display="none"}}function U(r){const e=l("criteria-list");e.innerHTML="",r.forEach(t=>{const o=pe(t);e.appendChild(o)})}function pe(r){var i;const e=document.createElement("div");e.className="criterion",e.innerHTML=`
        <textarea placeholder="Criterion Name. Description..." rows="1"></textarea>
        <input type="number" min="1" max="10" placeholder="Goal">
        <button class="remove-criterion-btn" title="Remove">&times;</button>
    `;const t=e.querySelector("textarea"),o=e.querySelector('input[type="number"]');return r&&(t.value=z(r.name),t.dataset.fullText=r.name,o.value=String(r.goal)),t.addEventListener("focus",()=>{t.value=t.dataset.fullText||"",Q.call(t)}),t.addEventListener("blur",()=>{const n=t.value.trim();n?(t.dataset.fullText=n,t.value=z(n)):(delete t.dataset.fullText,t.value=""),t.style.height="auto"}),t.addEventListener("input",Q),t.addEventListener("keydown",n=>{n.key==="Enter"&&!n.shiftKey&&(n.preventDefault(),n.target.blur())}),(i=e.querySelector(".remove-criterion-btn"))==null||i.addEventListener("click",()=>e.remove()),e}function Re(){const r=T(),e=new Map;r.forEach(o=>e.set(o.name,o)),ne.forEach(o=>e.set(o.name,o));const t=Array.from(e.values());U(t),alert("Default criteria loaded and merged!")}async function Ae(){const r=T();if(r.length===0){alert("No criteria to copy.");return}try{await navigator.clipboard.writeText(JSON.stringify(r,null,2)),alert("Criteria copied to clipboard!")}catch(e){console.error("Failed to copy criteria: ",e),alert("Failed to copy criteria to clipboard.")}}async function Ne(){try{const r=await navigator.clipboard.readText(),e=JSON.parse(r);if(!Le(e))throw new Error("Clipboard does not contain a valid criteria array.");const t=T(),o=new Map;t.forEach(n=>o.set(n.name,n)),e.forEach(n=>o.set(n.name,n));const i=Array.from(o.values());U(i),alert("Criteria pasted and merged!")}catch(r){console.error("Failed to paste criteria: ",r),alert("Failed to paste criteria. Please make sure the clipboard contains a valid JSON array of criteria.")}}function me(r){l("prompt").value=r.prompt,l("max-iterations").value=String(r.maxIterations),U(r.criteria)}function ue(){if(!x)return;const r=l("settings-profile-select"),e=x.getLastUsedProfileName();r.innerHTML="";const t=x.getProfileNames();if(t.length===0){r.innerHTML="<option disabled>No profiles saved</option>";return}t.forEach(o=>{const i=document.createElement("option");i.value=o,i.textContent=o,o===e&&(i.selected=!0),r.appendChild(i)})}function Oe(){if(!x||!v)return;const r=l("settings-profile-name");let e=r.value.trim();if(!e){const n=l("settings-profile-select").value;if(n&&confirm(`No new profile name entered. Do you want to overwrite the selected profile "${n}"?`))e=n;else return}const t={prompt:l("prompt").value,maxIterations:parseInt(l("max-iterations").value,10),criteria:T(),selectedModels:v.getSelectedModels()};x.saveProfile(e,t),r.value="",ue();const o=l("settings-profile-select");o.value=e}function _e(r){if(!x||!v)return;const e=r.target;if(!e)return;const t=e.value,o=x.getProfile(t);o&&(me(o),v.setSelectedModels(o.selectedModels),q(o.selectedModels),x.setLastUsedProfile(t))}function $e(){if(!x)return;const e=l("settings-profile-select").value;e&&confirm(`Are you sure you want to delete the "${e}" profile?`)&&(x.deleteProfile(e),ge())}function ge(){if(!x)return;const r=x.getLastUsedProfile();r&&me(r),ue()}ee.addEventListener("click",ie);te.addEventListener("click",Ce);L.addEventListener("click",r=>{r.target===L&&ae()});v=new ye(Ee,se);v.render(re);new ve(oe,ke);x=new we;const Be=v.getApiKey(),Ue=v.areAllModelsSelected();Be&&Ue?(console.log("Models already configured, showing main app."),q(v.getSelectedModels()),le(),O.style.display="block",H=!0):(O.style.display="none",ie());console.log("Application initialized.");
