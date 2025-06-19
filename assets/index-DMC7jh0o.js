var ce=Object.defineProperty;var pe=(r,e,t)=>e in r?ce(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var f=(r,e,t)=>pe(r,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))o(i);new MutationObserver(i=>{for(const n of i)if(n.type==="childList")for(const a of n.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&o(a)}).observe(document,{childList:!0,subtree:!0});function t(i){const n={};return i.integrity&&(n.integrity=i.integrity),i.referrerPolicy&&(n.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?n.credentials="include":i.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function o(i){if(i.ep)return;i.ep=!0;const n=t(i);fetch(i.href,n)}})();class W{constructor(e,t){f(this,"apiKey");f(this,"apiUrl","https://openrouter.ai/api/v1/chat/completions");f(this,"modelPurposeMap",{});this.apiKey=e,t&&(this.modelPurposeMap=t)}setModelPurpose(e,t){this.modelPurposeMap[e]=t}getModelForPurpose(e){return this.modelPurposeMap[e]}async chat(e,t){var s,p,m;const o=this.getModelForPurpose(e);if(!o)throw new Error(`No model configured for purpose: ${e}`);const i={model:o,messages:[{role:"user",content:t}]};return((m=(p=(s=(await this.sendMessage(i)).choices)==null?void 0:s[0])==null?void 0:p.message)==null?void 0:m.content)??""}async sendMessage(e){const t=await fetch(this.apiUrl,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(e)});if(!t.ok)throw new Error(`OpenRouter API error: ${t.status} ${t.statusText}`);return t.json()}async fetchModels(){const e=await fetch("https://openrouter.ai/api/v1/models",{headers:{Authorization:`Bearer ${this.apiKey}`}});if(!e.ok)throw new Error(`OpenRouter API error: ${e.status} ${e.statusText}`);return(await e.json()).data}}const D="openrouter_api_key",q="openrouter_model_purposes",U=[{key:"creator",label:"Creator"},{key:"rating",label:"Rating"},{key:"editor",label:"Editor"}];function J(r){const e=[];if(r.prompt){const t=parseFloat(r.prompt);if(!isNaN(t)){const o=t*1e6;e.push(`Input: $${o.toLocaleString(void 0,{maximumFractionDigits:2})} per million tokens`)}}if(r.completion){const t=parseFloat(r.completion);if(!isNaN(t)){const o=t*1e6;e.push(`Output: $${o.toLocaleString(void 0,{maximumFractionDigits:2})} per million tokens`)}}return e}class me{constructor(e,t,o,i){f(this,"onSelect");f(this,"closeModal");f(this,"apiKey","");f(this,"models",[]);f(this,"loading",!1);f(this,"error",null);f(this,"fetched",!1);f(this,"selectedModels",{});f(this,"root",null);this.onSelect=e,this.closeModal=t,o&&(this.apiKey=o),i&&(this.selectedModels={...i}),this.loadFromStorage(),this.apiKey&&!this.fetched&&this.fetchModels()}render(e){this.root=e,this.update()}update(){if(!this.root)return;this.root.innerHTML="";const e=document.createElement("div");e.className="model-selector-container",e.style.width="100%",e.style.padding="2vw 2vw 2vw 2vw",e.style.background="rgba(255,255,255,0.95)",e.style.borderRadius="1.5rem",e.style.boxShadow="0 4px 32px 0 rgba(0,0,0,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.08)",e.style.display="flex",e.style.flexDirection="column",e.style.gap="1.5rem",e.style.boxSizing="border-box";const t=document.createElement("h2");t.textContent="Configure OpenRouter Models",t.style.fontSize="1.5rem",t.style.fontWeight="bold",t.style.marginBottom="0.5rem",t.style.textAlign="center",t.style.letterSpacing="0.01em",t.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",t.style.color="white",t.style.borderRadius="1rem",t.style.padding="0.75rem 0",t.style.boxShadow="0 2px 8px 0 rgba(59,130,246,0.10)",e.appendChild(t);const o=document.createElement("div");o.style.display="flex",o.style.flexDirection="column",o.style.gap="0.5rem",o.style.marginBottom="0.5rem";const i=document.createElement("input");i.type="password",i.placeholder="Enter OpenRouter API Key",i.value=this.apiKey,i.style.padding="0.75rem 1rem",i.style.border="1.5px solid #d1d5db",i.style.borderRadius="0.75rem",i.style.fontSize="1rem",i.style.background="#f9fafb",i.style.transition="border-color 0.2s",i.addEventListener("focus",()=>{i.style.borderColor="#3b82f6"}),i.addEventListener("blur",()=>{i.style.borderColor="#d1d5db"}),i.addEventListener("input",s=>{this.apiKey=s.target.value,this.saveToStorage()}),o.appendChild(i);const n=document.createElement("div");n.innerHTML="<strong>Info:</strong> Your API key and model selections are stored in your browser's localStorage. Anyone with access to this browser profile can view them.",n.style.fontSize="0.85rem",n.style.color="#b45309",n.style.background="#fef3c7",n.style.borderRadius="0.5rem",n.style.padding="0.5rem 0.75rem",o.appendChild(n);const a=document.createElement("button");if(a.textContent=this.loading?"Fetching...":"Fetch Models",a.disabled=this.loading||!this.apiKey,a.style.padding="0.75rem 1rem",a.style.background=this.loading||!this.apiKey?"#93c5fd":"linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",a.style.color="white",a.style.fontWeight="bold",a.style.border="none",a.style.borderRadius="0.75rem",a.style.fontSize="1rem",a.style.cursor=this.loading||!this.apiKey?"not-allowed":"pointer",a.style.transition="background 0.2s",a.addEventListener("mouseenter",()=>{a.disabled||(a.style.background="linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)")}),a.addEventListener("mouseleave",()=>{a.disabled||(a.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)")}),a.addEventListener("click",()=>this.fetchModels()),o.appendChild(a),e.appendChild(o),this.error){const s=document.createElement("p");s.textContent=`Error: ${this.error}`,s.style.color="#dc2626",s.style.background="#fee2e2",s.style.borderRadius="0.5rem",s.style.padding="0.5rem 0.75rem",s.style.fontWeight="bold",e.appendChild(s)}if(this.fetched&&!this.loading&&!this.error&&this.models.length>0){const s=document.createElement("div");s.style.display="grid",s.style.gridTemplateColumns="repeat(2, minmax(0, 1fr))",s.style.gap="1.5rem",s.style.width="100%",s.style.boxSizing="border-box",s.style.margin="0 auto",s.style.alignItems="stretch",s.style.justifyItems="stretch",s.style.maxWidth="100%",s.style.padding="0",s.style.gridTemplateRows="auto auto",s.style.gridAutoRows="1fr",s.style.gridAutoFlow="row",U.forEach(c=>{const l=document.createElement("div");l.style.background="#f3f4f6",l.style.border="1.5px solid #d1d5db",l.style.borderRadius="1rem",l.style.padding="1rem 1.25rem",l.style.boxShadow="0 1px 4px 0 rgba(0,0,0,0.04)",l.style.display="flex",l.style.flexDirection="column",l.style.gap="0.5rem",l.style.height="100%";const g=document.createElement("div");g.textContent=`${c.label} Model`,g.style.fontWeight="bold",g.style.marginBottom="0.25rem",l.appendChild(g);const u=document.createElement("select");u.style.padding="0.5rem 1rem",u.style.border="1.5px solid #d1d5db",u.style.borderRadius="0.75rem",u.style.fontSize="1rem",u.style.background="#fff",u.style.transition="border-color 0.2s",u.addEventListener("focus",()=>{u.style.borderColor="#3b82f6"}),u.addEventListener("blur",()=>{u.style.borderColor="#d1d5db"});const E=document.createElement("option");E.value="",E.disabled=!0,E.textContent="Select a model...",u.appendChild(E),this.models.forEach(S=>{const h=document.createElement("option");h.value=S.id,h.textContent=S.name,u.appendChild(h)});const C=this.models.find(S=>S.id===this.selectedModels[c.key]);u.value=C?C.id:"";let w=document.createElement("div"),y;C?(w.textContent=C.description,w.style.fontSize="0.95rem",w.style.color="#374151",w.style.marginTop="0.25rem",l.appendChild(w),C.pricing&&(y=document.createElement("ul"),y.style.listStyle="disc inside",y.style.marginLeft="1.5rem",y.style.marginTop="0.5rem",J(C.pricing).forEach(S=>{const h=document.createElement("li");h.textContent=S,h.style.fontSize="0.9rem",h.style.color="#2563eb",y&&y.appendChild(h)}),l.appendChild(y))):(w.textContent="",l.appendChild(w)),u.addEventListener("change",S=>{this.selectedModels[c.key]=S.target.value,this.saveToStorage();const h=this.models.find(P=>P.id===this.selectedModels[c.key]);w.textContent=h?h.description:"",y&&y.remove(),h&&h.pricing&&(y=document.createElement("ul"),y.style.listStyle="disc inside",y.style.marginLeft="1.5rem",y.style.marginTop="0.5rem",J(h.pricing).forEach(P=>{const b=document.createElement("li");b.textContent=P,b.style.fontSize="0.9rem",b.style.color="#2563eb",y&&y.appendChild(b)}),l.appendChild(y))}),l.appendChild(u),s.appendChild(l)}),e.appendChild(s);const p=document.createElement("div");p.style.display="flex",p.style.justifyContent="flex-end",p.style.gap="1rem",p.style.marginTop="1.5rem";const m=document.createElement("button");m.textContent="Save and Close",m.style.padding="0.75rem 1.5rem",m.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",m.style.color="white",m.style.fontWeight="bold",m.style.border="none",m.style.borderRadius="0.75rem",m.style.fontSize="1rem",m.style.cursor="pointer",m.addEventListener("click",()=>{this.onSelect(this.selectedModels),this.closeModal()}),p.appendChild(m),e.appendChild(p)}this.root.appendChild(e)}async fetchModels(){this.loading=!0,this.error=null,this.fetched=!1,this.update();try{const e=new W(this.apiKey);this.models=await e.fetchModels();const t=new Set(this.models.map(o=>o.id));for(const o of U)this.selectedModels[o.key]&&!t.has(this.selectedModels[o.key])&&(this.selectedModels[o.key]="");this.fetched=!0}catch(e){this.error=e.message}finally{this.loading=!1,this.update()}}loadFromStorage(){if(!this.apiKey){const e=localStorage.getItem(D);e&&(this.apiKey=e)}if(Object.keys(this.selectedModels).length===0){const e=localStorage.getItem(q);if(e)try{this.selectedModels=JSON.parse(e)}catch{}}}saveToStorage(){localStorage.setItem(D,this.apiKey),localStorage.setItem(q,JSON.stringify(this.selectedModels))}areAllModelsSelected(){return U.every(e=>this.selectedModels[e.key]&&this.selectedModels[e.key]!=="")}setSelectedModels(e){this.selectedModels={...e},this.saveToStorage(),this.update()}getSelectedModels(){return this.selectedModels}getApiKey(){return this.apiKey}}const G="expert_app_prompts",I={creator_initial:`
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
        The user's original prompt was: "{{originalPrompt}}".
        
        Here is a response generated for that prompt: "{{response}}"
        
        Please rate this response on the single criterion of "{{criterion}}".
        The goal is to score at least {{goal}} out of 10.
        
        Provide your response as a JSON object with two keys:
        - "score": A number from 1 to 10.
        - "justification": A brief explanation for your score.

        Example: {"score": 8, "justification": "The response is clear and well-structured."}
    `.trim(),editor:`
        A response was generated: "{{response}}"
        It was rated against several criteria:
        {{ratings}}

        Please provide concise, actionable advice for the Creator LLM on how to improve the response to better meet the rating goals.
        Focus on what needs to change.
    `.trim()},ue={creator_initial:["prompt","criteria"],creator:["prompt","lastResponse","editorAdvice","criteria"],rater:["originalPrompt","response","criterion","goal"],editor:["response","ratings"]};class ge{constructor(e,t){f(this,"prompts");f(this,"onSave");f(this,"root");this.root=e,this.onSave=t,this.prompts=this.loadFromStorage(),this.render()}loadFromStorage(){const e=localStorage.getItem(G);return e?{...I,...JSON.parse(e)}:{...I}}saveToStorage(){localStorage.setItem(G,JSON.stringify(this.prompts)),this.onSave(this.prompts),console.log("Prompts saved.")}revertToDefaults(){confirm("Are you sure you want to revert all prompts to their default values? Any unsaved changes will be lost.")&&(this.prompts={...I},this.render())}getPrompts(){return this.prompts}render(){this.root.innerHTML=`
            <style>
                .prompt-editor { margin-bottom: 1.5rem; }
                .prompt-editor label { font-weight: bold; display: block; margin-bottom: 0.25rem; }
                .prompt-editor textarea { width: 100%; min-height: 200px; font-family: monospace; }
                .placeholders { font-size: 0.8rem; font-style: italic; margin-bottom: 0.5rem; color: #555; }
                .placeholders code { background-color: #eee; padding: 2px 4px; border-radius: 3px; }
            </style>
            <h2>Configure Prompts</h2>
            <p>Edit the templates used by the LLM agents.</p>
        `,Object.keys(this.prompts).forEach(i=>{const n=i,a=document.createElement("div");a.className="prompt-editor";const s=document.createElement("label");s.textContent=`${n.replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase())} Prompt Template`;const p=document.createElement("div");p.className="placeholders",p.innerHTML=`Available placeholders: ${ue[n].map(c=>`<code>{{${c}}}</code>`).join(", ")}`;const m=document.createElement("textarea");m.value=this.prompts[n],m.addEventListener("input",()=>{this.prompts[n]=m.value}),a.appendChild(s),a.appendChild(p),a.appendChild(m),this.root.appendChild(a)});const e=document.createElement("div");e.style.marginTop="1.5rem",e.style.display="flex",e.style.gap="1rem";const t=document.createElement("button");t.textContent="Save and Close",t.addEventListener("click",()=>this.saveToStorage()),e.appendChild(t);const o=document.createElement("button");o.textContent="Revert to Default",o.addEventListener("click",()=>this.revertToDefaults()),e.appendChild(o),this.root.appendChild(e)}}class V{constructor(e,t){f(this,"client");f(this,"prompts");f(this,"stopRequested",!1);this.client=e,this.prompts=t||{...I}}requestStop(){this.stopRequested=!0}async runLoop(e,t){this.stopRequested=!1;const{prompt:o,criteria:i,maxIterations:n}=e,a=[];let s="",p=!1;const m=3;for(let c=0;c<n&&!this.stopRequested;c++){const l=this.createCreatorPrompt(o,i,c>0?a:void 0);s=await this.client.chat("creator",l);const g={prompt:l,response:s};if(a.push({iteration:c+1,type:"creator",payload:g}),t==null||t({type:"creator",payload:g,iteration:c+1,maxIterations:n,step:1,totalStepsInIteration:m}),this.stopRequested)break;const u=[];let E=!0;for(const b of i){if(this.stopRequested)break;const A=this.createRatingPrompt(s,b,o),de=await this.client.chat("rating",A),z=this.parseRatingResponse(de,b);u.push(z),z.score<b.goal&&(E=!1)}if(this.stopRequested)break;const w={ratings:u.map((b,A)=>({criterion:i[A].name,goal:i[A].goal,score:b.score,justification:b.justification}))};if(a.push({iteration:c+1,type:"rating",payload:w}),t==null||t({type:"rating",payload:w,iteration:c+1,maxIterations:n,step:2,totalStepsInIteration:m}),E){p=!0;break}if(this.stopRequested)break;const y=u.filter(b=>b.score<b.goal),S=this.createEditorPrompt(s,y),h=await this.client.chat("editor",S),P={prompt:S,advice:h};a.push({iteration:c+1,type:"editor",payload:P}),t==null||t({type:"editor",payload:P,iteration:c+1,maxIterations:n,step:3,totalStepsInIteration:m})}return{finalResponse:s,history:a,iterations:a.filter(c=>c.type==="creator").length,success:p}}createCreatorPrompt(e,t,o){var m,c;const i=t.map(l=>l.name).join("\\n- ");if(!o)return this.prompts.creator_initial.replace("{{prompt}}",e).replace("{{criteria}}",i);const n=o.filter(l=>l.type==="editor").pop(),a=o.filter(l=>l.type==="creator").pop(),s=((m=n==null?void 0:n.payload)==null?void 0:m.advice)||"No advice was given.",p=(c=a==null?void 0:a.payload)==null?void 0:c.response;return this.prompts.creator.replace("{{prompt}}",e).replace("{{lastResponse}}",p||"").replace("{{editorAdvice}}",s).replace("{{criteria}}",i)}createRatingPrompt(e,t,o){return this.prompts.rater.replace("{{originalPrompt}}",o).replace("{{response}}",e).replace("{{criterion}}",t.name).replace("{{goal}}",String(t.goal))}parseRatingResponse(e,t){let o=1,i=`Could not parse rater response. Raw response: 
---
${e}`;try{let n=null;const a=e.match(/```json\s*(\{[\s\S]*?\})\s*```/);if(a&&a[1])n=a[1];else{const s=e.indexOf("{"),p=e.lastIndexOf("}");s!==-1&&p!==-1&&p>s&&(n=e.substring(s,p+1))}if(n){const s=JSON.parse(n);typeof s.score=="number"&&(o=s.score),typeof s.justification=="string"&&(i=s.justification)}}catch(n){console.warn("Could not parse rating response as JSON, using fallback.",{response:e,error:n})}return{criterion:t.name,goal:t.goal,score:o,justification:i}}createEditorPrompt(e,t){return this.prompts.editor.replace("{{response}}",e).replace("{{ratings}}",JSON.stringify(t,null,2))}}const j="expert_app_settings_profiles",F="expert_app_last_used_profile";function fe(r){return typeof r!="object"||r===null?!1:Object.values(r).every(e=>typeof e=="object"&&e!==null&&"prompt"in e&&typeof e.prompt=="string"&&"criteria"in e&&Array.isArray(e.criteria)&&"maxIterations"in e&&typeof e.maxIterations=="number"&&"selectedModels"in e&&typeof e.selectedModels=="object"&&e.selectedModels!==null)}class ye{constructor(){f(this,"profiles",{});f(this,"lastUsedProfileName",null);this.loadProfiles(),this.lastUsedProfileName=localStorage.getItem(F)}loadProfiles(){const e=localStorage.getItem(j);if(e)try{const t=JSON.parse(e);fe(t)?this.profiles=t:(console.warn("Invalid settings profiles found in localStorage. Ignoring."),this.profiles={})}catch(t){console.error("Failed to parse settings profiles from localStorage",t),this.profiles={}}}getProfileNames(){return Object.keys(this.profiles)}getProfile(e){return this.profiles[e]}saveProfile(e,t){if(!e)throw new Error("Profile name cannot be empty.");this.profiles[e]=t,localStorage.setItem(j,JSON.stringify(this.profiles)),this.setLastUsedProfile(e)}deleteProfile(e){delete this.profiles[e],localStorage.setItem(j,JSON.stringify(this.profiles)),this.lastUsedProfileName===e&&(localStorage.removeItem(F),this.lastUsedProfileName=null)}getLastUsedProfile(){if(this.lastUsedProfileName)return this.getProfile(this.lastUsedProfileName);const e=this.getProfileNames();return e.length>0?this.getProfile(e[0]):void 0}getLastUsedProfileName(){if(this.lastUsedProfileName&&this.profiles[this.lastUsedProfileName])return this.lastUsedProfileName;const e=this.getProfileNames();return e.length>0?e[0]:null}setLastUsedProfile(e){this.lastUsedProfileName=e,localStorage.setItem(F,e)}}function d(r){const e=document.getElementById(r);if(!e)throw new Error(`Could not find element with id: ${r}`);return e}const T=d("initial-setup"),O=d("main-app"),Q=d("configure-models-btn"),X=d("configure-prompts-btn"),k=d("modal-container"),Z=d("modal-content"),M=d("prompt-modal-container"),ee=d("prompt-modal-content");if(!T||!O||!Q||!k||!Z||!X||!M||!ee)throw new Error("Could not find required DOM elements");let $=null,x=null,Y={},L=null,v=null,K={...I},R=[],N=0;function he(){k&&(k.style.display="flex")}function _(){k&&(k.style.display="none")}function be(){M&&(M.style.display="flex")}function te(){M&&(M.style.display="none")}function H(r){console.log("Reconfiguring core services with models:",r),Y=r;const e=x==null?void 0:x.getApiKey();e&&($=new W(e,Y),L=new V($,K),console.log("OpenRouter client and Orchestrator configured."))}function ve(r){H(r),_(),T.style.display!=="none"&&(re(),T.style.display="none",O.style.display="block")}function xe(r){K=r,$&&(L=new V($,K)),te()}function re(){var r,e,t,o,i,n,a,s,p,m;O.innerHTML=`
        <style>
            :root {
                --primary-color: #4f46e5;
                --primary-hover: #4338ca;
                --secondary-color: #6b7280;
                --border-color: #d1d5db;
                --input-bg: #fff;
                --bg-subtle: #f9fafb;
            }

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

            .criterion { display: flex; gap: 0.75rem; margin-bottom: 0.75rem; align-items: center; }
            .criterion input[type="text"] { flex-grow: 1; }
            .criterion input[type="number"] { max-width: 80px; }

            .button {
                display: inline-block;
                padding: 0.75rem 1.25rem;
                border-radius: 8px;
                font-weight: 500;
                text-align: center;
                border: 1px solid transparent;
                transition: all 0.2s;
            }
            .button-primary { background-color: var(--primary-color); color: white; }
            .button-primary:hover { background-color: var(--primary-hover); }
            
            .button-secondary { background-color: white; color: var(--secondary-color); border-color: var(--border-color); }
            .button-secondary:hover { background-color: var(--bg-subtle); }

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
                <div id="criteria-list">
                    <div class="criterion">
                        <input type="text" value="Clarity" placeholder="Criterion Name">
                        <input type="number" value="8" min="1" max="10" placeholder="Goal">
                        <button class="remove-criterion-btn" title="Remove">&times;</button>
                    </div>
                    <div class="criterion">
                        <input type="text" value="Friendliness" placeholder="Criterion Name">
                        <input type="number" value="9" min="1" max="10" placeholder="Goal">
                        <button class="remove-criterion-btn" title="Remove">&times;</button>
                    </div>
                </div>
                <div class="criteria-actions">
                    <button id="add-criterion-btn" class="button button-secondary">Add Criterion</button>
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
    `,(r=document.getElementById("settings-save-btn"))==null||r.addEventListener("click",Le),(e=document.getElementById("settings-delete-btn"))==null||e.addEventListener("click",Re),(t=document.getElementById("settings-profile-select"))==null||t.addEventListener("change",Ie),(o=document.getElementById("add-criterion-btn"))==null||o.addEventListener("click",()=>{var g;const c=document.getElementById("criteria-list"),l=document.createElement("div");l.className="criterion",l.innerHTML=`
            <input type="text" placeholder="Criterion Name">
            <input type="number" min="1" max="10" placeholder="Goal">
            <button class="remove-criterion-btn" title="Remove">&times;</button>
        `,(g=l.querySelector(".remove-criterion-btn"))==null||g.addEventListener("click",()=>l.remove()),c==null||c.appendChild(l)}),(i=document.getElementById("copy-criteria-btn"))==null||i.addEventListener("click",Me),(n=document.getElementById("paste-criteria-btn"))==null||n.addEventListener("click",Pe),(a=document.getElementById("criteria-list"))==null||a.addEventListener("click",c=>{var l;c.target.classList.contains("remove-criterion-btn")&&((l=c.target.closest(".criterion"))==null||l.remove())}),(s=document.getElementById("start-loop-btn"))==null||s.addEventListener("click",ke),(p=document.getElementById("stop-loop-btn"))==null||p.addEventListener("click",()=>{L&&L.requestStop()}),(m=d("iteration-slider"))==null||m.addEventListener("input",c=>{const l=c.target;N=parseInt(l.value,10),ie(N)}),le()}function B(){const r=document.querySelectorAll("#criteria-list .criterion"),e=[];return r.forEach(t=>{const o=t.querySelector('input[type="text"]'),i=t.querySelector('input[type="number"]');o!=null&&o.value&&(i!=null&&i.value)&&e.push({name:o.value,goal:parseInt(i.value,10)})}),e}function we(r){return r>=8?"#10b981":r>=5?"#f59e0b":"#ef4444"}function oe(r){return`
        <ul class="rating-list">
            ${r.map(e=>`
                <li class="rating-item">
                    <div class="rating-header">
                        <span class="rating-name">${e.criterion} (Goal: ${e.goal})</span>
                        <span class="rating-score" style="color: ${we(e.score)}">
                            ${e.score} / 10
                        </span>
                    </div>
                    <p class="rating-reasoning">${(e.justification||"No reasoning provided.").replace(/\n/g,"<br>")}</p>
                </li>
            `).join("")}
        </ul>
    `}function Se(r){return Array.isArray(r)&&r.every(e=>typeof e=="object"&&e!==null&&"name"in e&&typeof e.name=="string"&&"goal"in e&&typeof e.goal=="number")}function Ce(r){let e=-1,t=1/0;const o=[...new Set(r.map(i=>i.iteration))];for(const i of o){const n=r.find(p=>p.iteration===i&&p.type==="rating");if(!n)continue;const s=n.payload.ratings.reduce((p,m)=>{const c=m.goal-m.score;return p+(c>0?c:0)},0);s<t&&(t=s,e=i)}return e>0?e:o.pop()||1}function ie(r){if(R.length===0)return;const e=R.filter(u=>u.iteration===r),t=e.find(u=>u.type==="creator"),o=e.find(u=>u.type==="rating"),i=e.find(u=>u.type==="editor"),n=d("live-response-container"),a=d("ratings-container"),s=d("editor-advice-container"),p=d("live-response"),m=d("ratings"),c=d("editor-advice");t?(n.style.display="block",p.innerHTML=t.payload.response.replace(/\n/g,"<br>")):n.style.display="none",o?(a.style.display="block",m.innerHTML=oe(o.payload.ratings)):a.style.display="none",i?(s.style.display="block",c.innerHTML=i.payload.advice.replace(/\n/g,"<br>")):s.style.display="none";const l=d("iteration-label"),g=d("iteration-slider");l.textContent=`${r} / ${g.max}`}function Ee(r){const{type:e,payload:t,iteration:o,maxIterations:i,step:n,totalStepsInIteration:a}=r,s=d("iteration-progress-bar"),p=d("step-progress-bar"),m=o/i*100,c=n/a*100;s.style.width=`${m}%`,s.textContent=`Iteration: ${o} / ${i}`;const l=e.charAt(0).toUpperCase()+e.slice(1);if(p.style.width=`${c}%`,p.textContent=`Step: ${n} of ${a} (${l})`,e==="creator"){const g=d("live-response-container"),u=d("live-response");g.style.display="block",u.innerHTML=t.response.replace(/\n/g,"<br>")}else if(e==="rating"){const g=d("ratings-container"),u=d("ratings");console.log("Received ratings payload for rendering:",JSON.stringify(t.ratings,null,2)),g.style.display="block",u.innerHTML=oe(t.ratings)}else if(e==="editor"){const g=d("editor-advice-container"),u=d("editor-advice");g.style.display="block",u.innerHTML=t.advice.replace(/\n/g,"<br>")}}async function ke(){if(!L){alert("Please configure models first.");return}R=[],N=0,d("history-controls").style.display="none";const r=d("prompt"),e=B();if(!r.value.trim()){alert("Please enter a prompt before starting the loop.");return}if(e.length===0){alert("Please define at least one quality criterion before starting the loop.");return}const t=d("max-iterations"),o={prompt:r.value,criteria:e,maxIterations:parseInt(t.value,10)||5},i=d("start-loop-btn"),n=d("stop-loop-btn");i.style.display="none",n.style.display="inline-block";const a=d("progress-container"),s=d("iteration-progress-bar"),p=d("step-progress-bar");a.style.display="block",s.style.width="0%",s.textContent="Starting...",p.style.width="0%",p.textContent="";const m=d("results-container"),c=d("final-result-container");Array.from(m.children).forEach(l=>l.style.display="none"),c.style.display="block",c.innerHTML="Looping...";try{const l=await L.runLoop(o,Ee);c.style.display="none",R=l.history;const g=l.iterations;if(g>0){let u=g;l.success||(u=Ce(R),console.log(`Loop failed. Showing best iteration: ${u}`));const E=d("history-controls"),C=d("iteration-slider");E.style.display="block",C.max=String(g),C.value=String(u),N=u,ie(N)}else c.style.display="block",c.innerHTML="<p>The loop did not run any iterations.</p>"}catch(l){c.style.display="block",c.innerHTML=`<p style="color: red;">Error: ${l}</p>`,console.error(l)}finally{i.style.display="inline-block",n.style.display="none",d("progress-container").style.display="none"}}function ne(r){const e=d("criteria-list");e.innerHTML="",r.forEach(t=>{const o=document.createElement("div");o.className="criterion",o.innerHTML=`
            <input type="text" value="${t.name}" placeholder="Criterion Name">
            <input type="number" value="${t.goal}" min="1" max="10" placeholder="Goal (1-10)">
            <button class="remove-criterion-btn" title="Remove">&times;</button>
        `,e.appendChild(o)})}async function Me(){const r=B();if(r.length===0){alert("No criteria to copy.");return}try{await navigator.clipboard.writeText(JSON.stringify(r,null,2)),alert("Criteria copied to clipboard!")}catch(e){console.error("Failed to copy criteria: ",e),alert("Failed to copy criteria to clipboard.")}}async function Pe(){try{const r=await navigator.clipboard.readText(),e=JSON.parse(r);if(!Se(e))throw new Error("Clipboard does not contain a valid criteria array.");const t=B(),o=new Map;t.forEach(n=>o.set(n.name,n)),e.forEach(n=>o.set(n.name,n));const i=Array.from(o.values());ne(i),alert("Criteria pasted and merged!")}catch(r){console.error("Failed to paste criteria: ",r),alert("Failed to paste criteria. Please make sure the clipboard contains a valid JSON array of criteria.")}}function se(r){d("prompt").value=r.prompt,d("max-iterations").value=String(r.maxIterations),ne(r.criteria)}function ae(){if(!v)return;const r=d("settings-profile-select"),e=v.getLastUsedProfileName();r.innerHTML="";const t=v.getProfileNames();if(t.length===0){r.innerHTML="<option disabled>No profiles saved</option>";return}t.forEach(o=>{const i=document.createElement("option");i.value=o,i.textContent=o,o===e&&(i.selected=!0),r.appendChild(i)})}function Le(){if(!v||!x)return;const r=d("settings-profile-name");let e=r.value.trim();if(!e){const n=d("settings-profile-select").value;if(n&&confirm(`No new profile name entered. Do you want to overwrite the selected profile "${n}"?`))e=n;else return}const t={prompt:d("prompt").value,maxIterations:parseInt(d("max-iterations").value,10),criteria:B(),selectedModels:x.getSelectedModels()};v.saveProfile(e,t),r.value="",ae();const o=d("settings-profile-select");o.value=e}function Ie(r){if(!v||!x)return;const e=r.target;if(!e)return;const t=e.value,o=v.getProfile(t);o&&(se(o),x.setSelectedModels(o.selectedModels),H(o.selectedModels),v.setLastUsedProfile(t))}function Re(){if(!v)return;const e=d("settings-profile-select").value;e&&confirm(`Are you sure you want to delete the "${e}" profile?`)&&(v.deleteProfile(e),le())}function le(){if(!v)return;const r=v.getLastUsedProfile();r&&se(r),ae()}Q.addEventListener("click",he);X.addEventListener("click",be);k.addEventListener("click",r=>{r.target===k&&_()});M.addEventListener("click",r=>{r.target===M&&te()});x=new me(ve,_);x.render(Z);new ge(ee,xe);v=new ye;const Ne=x.getApiKey(),Te=x.areAllModelsSelected();Ne&&Te?(console.log("Models already configured, showing main app."),H(x.getSelectedModels()),re(),T.style.display="none",O.style.display="block"):(O.style.display="none",T.style.display="block");console.log("Application initialized.");
