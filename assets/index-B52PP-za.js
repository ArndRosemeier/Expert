var ge=Object.defineProperty;var fe=(r,e,t)=>e in r?ge(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var f=(r,e,t)=>fe(r,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))o(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const a of i.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&o(a)}).observe(document,{childList:!0,subtree:!0});function t(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function o(n){if(n.ep)return;n.ep=!0;const i=t(n);fetch(n.href,i)}})();class X{constructor(e,t){f(this,"apiKey");f(this,"apiUrl","https://openrouter.ai/api/v1/chat/completions");f(this,"modelPurposeMap",{});this.apiKey=e,t&&(this.modelPurposeMap=t)}setModelPurpose(e,t){this.modelPurposeMap[e]=t}getModelForPurpose(e){return this.modelPurposeMap[e]}async chat(e,t){var s,u,m;const o=this.getModelForPurpose(e);if(!o)throw new Error(`No model configured for purpose: ${e}`);const n={model:o,messages:[{role:"user",content:t}]};return((m=(u=(s=(await this.sendMessage(n)).choices)==null?void 0:s[0])==null?void 0:u.message)==null?void 0:m.content)??""}async sendMessage(e){const t=await fetch(this.apiUrl,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(e)});if(!t.ok)throw new Error(`OpenRouter API error: ${t.status} ${t.statusText}`);return t.json()}async fetchModels(){const e=await fetch("https://openrouter.ai/api/v1/models",{headers:{Authorization:`Bearer ${this.apiKey}`}});if(!e.ok)throw new Error(`OpenRouter API error: ${e.status} ${e.statusText}`);return(await e.json()).data}}const J="openrouter_api_key",Y="openrouter_model_purposes",j=[{key:"creator",label:"Creator"},{key:"rating",label:"Rating"},{key:"editor",label:"Editor"}];function G(r){const e=[];if(r.prompt){const t=parseFloat(r.prompt);if(!isNaN(t)){const o=t*1e6;e.push(`Input: $${o.toLocaleString(void 0,{maximumFractionDigits:2})} per million tokens`)}}if(r.completion){const t=parseFloat(r.completion);if(!isNaN(t)){const o=t*1e6;e.push(`Output: $${o.toLocaleString(void 0,{maximumFractionDigits:2})} per million tokens`)}}return e}class ye{constructor(e,t,o,n){f(this,"onSelect");f(this,"closeModal");f(this,"apiKey","");f(this,"models",[]);f(this,"loading",!1);f(this,"error",null);f(this,"fetched",!1);f(this,"selectedModels",{});f(this,"root",null);this.onSelect=e,this.closeModal=t,o&&(this.apiKey=o),n&&(this.selectedModels={...n}),this.loadFromStorage(),this.apiKey&&!this.fetched&&this.fetchModels()}render(e){this.root=e,this.update()}update(){if(!this.root)return;this.root.innerHTML="";const e=document.createElement("div");e.className="model-selector-container",e.style.width="100%",e.style.padding="2vw 2vw 2vw 2vw",e.style.background="rgba(255,255,255,0.95)",e.style.borderRadius="1.5rem",e.style.boxShadow="0 4px 32px 0 rgba(0,0,0,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.08)",e.style.display="flex",e.style.flexDirection="column",e.style.gap="1.5rem",e.style.boxSizing="border-box";const t=document.createElement("h2");t.textContent="Configure OpenRouter Models",t.style.fontSize="1.5rem",t.style.fontWeight="bold",t.style.marginBottom="0.5rem",t.style.textAlign="center",t.style.letterSpacing="0.01em",t.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",t.style.color="white",t.style.borderRadius="1rem",t.style.padding="0.75rem 0",t.style.boxShadow="0 2px 8px 0 rgba(59,130,246,0.10)",e.appendChild(t);const o=document.createElement("div");o.style.display="flex",o.style.flexDirection="column",o.style.gap="0.5rem",o.style.marginBottom="0.5rem";const n=document.createElement("input");n.type="password",n.placeholder="Enter OpenRouter API Key",n.value=this.apiKey,n.style.padding="0.75rem 1rem",n.style.border="1.5px solid #d1d5db",n.style.borderRadius="0.75rem",n.style.fontSize="1rem",n.style.background="#f9fafb",n.style.transition="border-color 0.2s",n.addEventListener("focus",()=>{n.style.borderColor="#3b82f6"}),n.addEventListener("blur",()=>{n.style.borderColor="#d1d5db"}),n.addEventListener("input",s=>{this.apiKey=s.target.value,this.saveToStorage()}),o.appendChild(n);const i=document.createElement("div");i.innerHTML="<strong>Info:</strong> Your API key and model selections are stored in your browser's localStorage. Anyone with access to this browser profile can view them.",i.style.fontSize="0.85rem",i.style.color="#b45309",i.style.background="#fef3c7",i.style.borderRadius="0.5rem",i.style.padding="0.5rem 0.75rem",o.appendChild(i);const a=document.createElement("button");if(a.textContent=this.loading?"Fetching...":"Fetch Models",a.disabled=this.loading||!this.apiKey,a.style.padding="0.75rem 1rem",a.style.background=this.loading||!this.apiKey?"#93c5fd":"linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",a.style.color="white",a.style.fontWeight="bold",a.style.border="none",a.style.borderRadius="0.75rem",a.style.fontSize="1rem",a.style.cursor=this.loading||!this.apiKey?"not-allowed":"pointer",a.style.transition="background 0.2s",a.addEventListener("mouseenter",()=>{a.disabled||(a.style.background="linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)")}),a.addEventListener("mouseleave",()=>{a.disabled||(a.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)")}),a.addEventListener("click",()=>this.fetchModels()),o.appendChild(a),e.appendChild(o),this.error){const s=document.createElement("p");s.textContent=`Error: ${this.error}`,s.style.color="#dc2626",s.style.background="#fee2e2",s.style.borderRadius="0.5rem",s.style.padding="0.5rem 0.75rem",s.style.fontWeight="bold",e.appendChild(s)}if(this.fetched&&!this.loading&&!this.error&&this.models.length>0){const s=document.createElement("div");s.style.display="grid",s.style.gridTemplateColumns="repeat(2, minmax(0, 1fr))",s.style.gap="1.5rem",s.style.width="100%",s.style.boxSizing="border-box",s.style.margin="0 auto",s.style.alignItems="stretch",s.style.justifyItems="stretch",s.style.maxWidth="100%",s.style.padding="0",s.style.gridTemplateRows="auto auto",s.style.gridAutoRows="1fr",s.style.gridAutoFlow="row",j.forEach(p=>{const c=document.createElement("div");c.style.background="#f3f4f6",c.style.border="1.5px solid #d1d5db",c.style.borderRadius="1rem",c.style.padding="1rem 1.25rem",c.style.boxShadow="0 1px 4px 0 rgba(0,0,0,0.04)",c.style.display="flex",c.style.flexDirection="column",c.style.gap="0.5rem",c.style.height="100%";const g=document.createElement("div");g.textContent=`${p.label} Model`,g.style.fontWeight="bold",g.style.marginBottom="0.25rem",c.appendChild(g);const d=document.createElement("select");d.style.padding="0.5rem 1rem",d.style.border="1.5px solid #d1d5db",d.style.borderRadius="0.75rem",d.style.fontSize="1rem",d.style.background="#fff",d.style.transition="border-color 0.2s",d.addEventListener("focus",()=>{d.style.borderColor="#3b82f6"}),d.addEventListener("blur",()=>{d.style.borderColor="#d1d5db"});const C=document.createElement("option");C.value="",C.disabled=!0,C.textContent="Select a model...",d.appendChild(C),this.models.forEach(S=>{const h=document.createElement("option");h.value=S.id,h.textContent=S.name,d.appendChild(h)});const E=this.models.find(S=>S.id===this.selectedModels[p.key]);d.value=E?E.id:"";let w=document.createElement("div"),y;E?(w.textContent=E.description,w.style.fontSize="0.95rem",w.style.color="#374151",w.style.marginTop="0.25rem",c.appendChild(w),E.pricing&&(y=document.createElement("ul"),y.style.listStyle="disc inside",y.style.marginLeft="1.5rem",y.style.marginTop="0.5rem",G(E.pricing).forEach(S=>{const h=document.createElement("li");h.textContent=S,h.style.fontSize="0.9rem",h.style.color="#2563eb",y&&y.appendChild(h)}),c.appendChild(y))):(w.textContent="",c.appendChild(w)),d.addEventListener("change",S=>{this.selectedModels[p.key]=S.target.value,this.saveToStorage();const h=this.models.find(L=>L.id===this.selectedModels[p.key]);w.textContent=h?h.description:"",y&&y.remove(),h&&h.pricing&&(y=document.createElement("ul"),y.style.listStyle="disc inside",y.style.marginLeft="1.5rem",y.style.marginTop="0.5rem",G(h.pricing).forEach(L=>{const b=document.createElement("li");b.textContent=L,b.style.fontSize="0.9rem",b.style.color="#2563eb",y&&y.appendChild(b)}),c.appendChild(y))}),c.appendChild(d),s.appendChild(c)}),e.appendChild(s);const u=document.createElement("div");u.style.display="flex",u.style.justifyContent="flex-end",u.style.gap="1rem",u.style.marginTop="1.5rem";const m=document.createElement("button");m.textContent="Save and Close",m.style.padding="0.75rem 1.5rem",m.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",m.style.color="white",m.style.fontWeight="bold",m.style.border="none",m.style.borderRadius="0.75rem",m.style.fontSize="1rem",m.style.cursor="pointer",m.addEventListener("click",()=>{this.onSelect(this.selectedModels),this.closeModal()}),u.appendChild(m),e.appendChild(u)}this.root.appendChild(e)}async fetchModels(){this.loading=!0,this.error=null,this.fetched=!1,this.update();try{const e=new X(this.apiKey);this.models=await e.fetchModels();const t=new Set(this.models.map(o=>o.id));for(const o of j)this.selectedModels[o.key]&&!t.has(this.selectedModels[o.key])&&(this.selectedModels[o.key]="");this.fetched=!0}catch(e){this.error=e.message}finally{this.loading=!1,this.update()}}loadFromStorage(){if(!this.apiKey){const e=localStorage.getItem(J);e&&(this.apiKey=e)}if(Object.keys(this.selectedModels).length===0){const e=localStorage.getItem(Y);if(e)try{this.selectedModels=JSON.parse(e)}catch{}}}saveToStorage(){localStorage.setItem(J,this.apiKey),localStorage.setItem(Y,JSON.stringify(this.selectedModels))}areAllModelsSelected(){return j.every(e=>this.selectedModels[e.key]&&this.selectedModels[e.key]!=="")}setSelectedModels(e){this.selectedModels={...e},this.saveToStorage(),this.update()}getSelectedModels(){return this.selectedModels}getApiKey(){return this.apiKey}}const W="expert_app_prompts",T={creator_initial:`
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
    `.trim()},he={creator_initial:["prompt","criteria"],creator:["prompt","lastResponse","editorAdvice","criteria"],rater:["originalPrompt","response","criterion","goal"],editor:["response","ratings"]};class be{constructor(e,t){f(this,"prompts");f(this,"onSave");f(this,"root");this.root=e,this.onSave=t,this.prompts=this.loadFromStorage(),this.render()}loadFromStorage(){const e=localStorage.getItem(W);return e?{...T,...JSON.parse(e)}:{...T}}saveToStorage(){localStorage.setItem(W,JSON.stringify(this.prompts)),this.onSave(this.prompts),console.log("Prompts saved.")}revertToDefaults(){confirm("Are you sure you want to revert all prompts to their default values? Any unsaved changes will be lost.")&&(this.prompts={...T},this.render())}getPrompts(){return this.prompts}render(){this.root.innerHTML=`
            <style>
                .prompt-editor { margin-bottom: 1.5rem; }
                .prompt-editor label { font-weight: bold; display: block; margin-bottom: 0.25rem; }
                .prompt-editor textarea { width: 100%; min-height: 200px; font-family: monospace; }
                .placeholders { font-size: 0.8rem; font-style: italic; margin-bottom: 0.5rem; color: #555; }
                .placeholders code { background-color: #eee; padding: 2px 4px; border-radius: 3px; }
            </style>
            <h2>Configure Prompts</h2>
            <p>Edit the templates used by the LLM agents.</p>
        `,Object.keys(this.prompts).forEach(n=>{const i=n,a=document.createElement("div");a.className="prompt-editor";const s=document.createElement("label");s.textContent=`${i.replace("_"," ").replace(/\b\w/g,p=>p.toUpperCase())} Prompt Template`;const u=document.createElement("div");u.className="placeholders",u.innerHTML=`Available placeholders: ${he[i].map(p=>`<code>{{${p}}}</code>`).join(", ")}`;const m=document.createElement("textarea");m.value=this.prompts[i],m.addEventListener("input",()=>{this.prompts[i]=m.value}),a.appendChild(s),a.appendChild(u),a.appendChild(m),this.root.appendChild(a)});const e=document.createElement("div");e.style.marginTop="1.5rem",e.style.display="flex",e.style.gap="1rem";const t=document.createElement("button");t.textContent="Save and Close",t.addEventListener("click",()=>this.saveToStorage()),e.appendChild(t);const o=document.createElement("button");o.textContent="Revert to Default",o.addEventListener("click",()=>this.revertToDefaults()),e.appendChild(o),this.root.appendChild(e)}}class Z{constructor(e,t){f(this,"client");f(this,"prompts");f(this,"stopRequested",!1);this.client=e,this.prompts=t||{...T}}requestStop(){this.stopRequested=!0}async runLoop(e,t){this.stopRequested=!1;const{prompt:o,criteria:n,maxIterations:i}=e,a=[];let s="",u=!1;const m=3;for(let p=0;p<i&&!this.stopRequested;p++){const c=this.createCreatorPrompt(o,n,p>0?a:void 0);s=await this.client.chat("creator",c);const g={prompt:c,response:s};if(a.push({iteration:p+1,type:"creator",payload:g}),t==null||t({type:"creator",payload:g,iteration:p+1,maxIterations:i,step:1,totalStepsInIteration:m}),this.stopRequested)break;const d=[];let C=!0;for(const b of n){if(this.stopRequested)break;const $=this.createRatingPrompt(s,b,o),me=await this.client.chat("rating",$),q=this.parseRatingResponse(me,b);d.push(q),q.score<b.goal&&(C=!1)}if(this.stopRequested)break;const w={ratings:d.map((b,$)=>({criterion:n[$].name,goal:n[$].goal,score:b.score,justification:b.justification}))};if(a.push({iteration:p+1,type:"rating",payload:w}),t==null||t({type:"rating",payload:w,iteration:p+1,maxIterations:i,step:2,totalStepsInIteration:m}),C){u=!0;break}if(this.stopRequested)break;const y=d.filter(b=>b.score<b.goal),S=this.createEditorPrompt(s,y),h=await this.client.chat("editor",S),L={prompt:S,advice:h};a.push({iteration:p+1,type:"editor",payload:L}),t==null||t({type:"editor",payload:L,iteration:p+1,maxIterations:i,step:3,totalStepsInIteration:m})}return{finalResponse:s,history:a,iterations:a.filter(p=>p.type==="creator").length,success:u}}createCreatorPrompt(e,t,o){var p,c;const n=g=>{const d=g.indexOf(".");return d>0?g.substring(0,d):g},i=t.map(g=>n(g.name)).join("\\n- ");if(!o)return this.prompts.creator_initial.replace("{{prompt}}",e).replace("{{criteria}}",i);const a=o.filter(g=>g.type==="editor").pop(),s=o.filter(g=>g.type==="creator").pop(),u=((p=a==null?void 0:a.payload)==null?void 0:p.advice)||"No advice was given.",m=(c=s==null?void 0:s.payload)==null?void 0:c.response;return this.prompts.creator.replace("{{prompt}}",e).replace("{{lastResponse}}",m||"").replace("{{editorAdvice}}",u).replace("{{criteria}}",i)}createRatingPrompt(e,t,o){return this.prompts.rater.replace("{{originalPrompt}}",o).replace("{{response}}",e).replace("{{criterion}}",t.name).replace("{{goal}}",String(t.goal))}parseRatingResponse(e,t){let o=1,n=`Could not parse rater response. Raw response: 
---
${e}`;try{let i=null;const a=e.match(/```json\s*(\{[\s\S]*?\})\s*```/);if(a&&a[1])i=a[1];else{const s=e.indexOf("{"),u=e.lastIndexOf("}");s!==-1&&u!==-1&&u>s&&(i=e.substring(s,u+1))}if(i){const s=JSON.parse(i);typeof s.score=="number"&&(o=s.score),typeof s.justification=="string"&&(n=s.justification)}}catch(i){console.warn("Could not parse rating response as JSON, using fallback.",{response:e,error:i})}return{criterion:t.name,goal:t.goal,score:o,justification:n}}createEditorPrompt(e,t){return this.prompts.editor.replace("{{response}}",e).replace("{{ratings}}",JSON.stringify(t,null,2))}}const D="expert_app_settings_profiles",K="expert_app_last_used_profile";function ve(r){return typeof r!="object"||r===null?!1:Object.values(r).every(e=>typeof e=="object"&&e!==null&&"prompt"in e&&typeof e.prompt=="string"&&"criteria"in e&&Array.isArray(e.criteria)&&"maxIterations"in e&&typeof e.maxIterations=="number"&&"selectedModels"in e&&typeof e.selectedModels=="object"&&e.selectedModels!==null)}class xe{constructor(){f(this,"profiles",{});f(this,"lastUsedProfileName",null);this.loadProfiles(),this.lastUsedProfileName=localStorage.getItem(K)}loadProfiles(){const e=localStorage.getItem(D);if(e)try{const t=JSON.parse(e);ve(t)?this.profiles=t:(console.warn("Invalid settings profiles found in localStorage. Ignoring."),this.profiles={})}catch(t){console.error("Failed to parse settings profiles from localStorage",t),this.profiles={}}}getProfileNames(){return Object.keys(this.profiles)}getProfile(e){return this.profiles[e]}saveProfile(e,t){if(!e)throw new Error("Profile name cannot be empty.");this.profiles[e]=t,localStorage.setItem(D,JSON.stringify(this.profiles)),this.setLastUsedProfile(e)}deleteProfile(e){delete this.profiles[e],localStorage.setItem(D,JSON.stringify(this.profiles)),this.lastUsedProfileName===e&&(localStorage.removeItem(K),this.lastUsedProfileName=null)}getLastUsedProfile(){if(this.lastUsedProfileName)return this.getProfile(this.lastUsedProfileName);const e=this.getProfileNames();return e.length>0?this.getProfile(e[0]):void 0}getLastUsedProfileName(){if(this.lastUsedProfileName&&this.profiles[this.lastUsedProfileName])return this.lastUsedProfileName;const e=this.getProfileNames();return e.length>0?e[0]:null}setLastUsedProfile(e){this.lastUsedProfileName=e,localStorage.setItem(K,e)}}function l(r){const e=document.getElementById(r);if(!e)throw new Error(`Could not find element with id: ${r}`);return e}const A=l("initial-setup"),O=l("main-app"),ee=l("configure-models-btn"),te=l("configure-prompts-btn"),k=l("modal-container"),re=l("modal-content"),M=l("prompt-modal-container"),oe=l("prompt-modal-content");if(!A||!O||!ee||!k||!re||!te||!M||!oe)throw new Error("Could not find required DOM elements");let B=null,x=null,V={},P=null,v=null,F={...T},R=[],N=0;const ne=[{name:"Clarity & Conciseness. The writing is direct, easy to understand, and avoids unnecessary words or filler phrases.",goal:8},{name:"Natural & Authentic Tone. The language sounds human and authentic. It avoids being overly formal, academic, or robotic.",goal:9},{name:"Engaging Flow. The text is interesting and holds the reader's attention. Sentences and paragraphs transition smoothly.",goal:8},{name:"Varied Sentence Structure. The length and structure of sentences are varied to create a pleasing rhythm, avoiding monotony.",goal:7},{name:"Subtlety (Show, Don't Tell). The writing implies emotions and ideas through description and action rather than stating them directly. It avoids being on-the-nose.",goal:8},{name:"Avoids AI Clichés. The text avoids common AI phrases like 'In conclusion,' 'It's important to note,' 'delve into,' or 'tapestry of...'",goal:9},{name:"Understated Language. The prose avoids overly dramatic, sensational, or grandiose language. The tone is measured and appropriate.",goal:9},{name:"Specificity & Concrete Detail. The writing uses specific, concrete details and examples rather than vague generalities.",goal:8},{name:"Original Phrasing. The text avoids common idioms and clichés, opting for more original ways to express ideas.",goal:7},{name:"Human-like Naming. When applicable, any names for people, places, or concepts are creative and feel natural. Avoid common AI-generated names like 'Elara' or 'Lyra.'",goal:8}];function we(){k&&(k.style.display="flex")}function z(){k&&(k.style.display="none")}function Se(){M&&(M.style.display="flex")}function ie(){M&&(M.style.display="none")}function H(r){console.log("Reconfiguring core services with models:",r),V=r;const e=x==null?void 0:x.getApiKey();e&&(B=new X(e,V),P=new Z(B,F),console.log("OpenRouter client and Orchestrator configured."))}function Ee(r){H(r),z(),A.style.display!=="none"&&(se(),A.style.display="none",O.style.display="block")}function Ce(r){F=r,B&&(P=new Z(B,F)),ie()}function se(){var r,e,t,o,n,i,a,s,u,m,p;O.innerHTML=`
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
    `,(r=document.getElementById("settings-save-btn"))==null||r.addEventListener("click",Ae),(e=document.getElementById("settings-delete-btn"))==null||e.addEventListener("click",$e),(t=document.getElementById("settings-profile-select"))==null||t.addEventListener("change",Oe),(o=document.getElementById("add-criterion-btn"))==null||o.addEventListener("click",()=>{const c=document.getElementById("criteria-list");if(!c)return;const g=de();c.appendChild(g);const d=g.querySelector("textarea");d==null||d.focus()}),(n=document.getElementById("copy-criteria-btn"))==null||n.addEventListener("click",Re),(i=document.getElementById("paste-criteria-btn"))==null||i.addEventListener("click",Ne),(a=document.getElementById("default-criteria-btn"))==null||a.addEventListener("click",Te),(s=document.getElementById("criteria-list"))==null||s.addEventListener("click",c=>{var g;c.target.classList.contains("remove-criterion-btn")&&((g=c.target.closest(".criterion"))==null||g.remove())}),(u=document.getElementById("start-loop-btn"))==null||u.addEventListener("click",Ie),(m=document.getElementById("stop-loop-btn"))==null||m.addEventListener("click",()=>{P&&P.requestStop()}),(p=l("iteration-slider"))==null||p.addEventListener("input",c=>{const g=c.target;N=parseInt(g.value,10),le(N)}),ue(),I().length===0&&U(ne)}function Q(){this.style.height="auto",this.style.height=this.scrollHeight+"px"}function _(r){const e=r.indexOf(".");return e>0?r.substring(0,e):r}function I(){const r=document.querySelectorAll("#criteria-list .criterion"),e=[];return r.forEach(t=>{const o=t.querySelector("textarea"),n=t.querySelector('input[type="number"]');let i="";document.activeElement===o?i=o.value:i=o.dataset.fullText||o.value,i.trim()&&(n!=null&&n.value)&&e.push({name:i.trim(),goal:parseInt(n.value,10)})}),e}function ke(r){return r>=8?"#10b981":r>=5?"#f59e0b":"#ef4444"}function ae(r){return`
        <ul class="rating-list">
            ${r.map(e=>`
                <li class="rating-item">
                    <div class="rating-header">
                        <span class="rating-name">${_(e.criterion)} (Goal: ${e.goal})</span>
                        <span class="rating-score" style="color: ${ke(e.score)}">
                            ${e.score} / 10
                        </span>
                    </div>
                    <p class="rating-reasoning">${(e.justification||"No reasoning provided.").replace(/\n/g,"<br>")}</p>
                </li>
            `).join("")}
        </ul>
    `}function Me(r){return Array.isArray(r)&&r.every(e=>typeof e=="object"&&e!==null&&"name"in e&&typeof e.name=="string"&&"goal"in e&&typeof e.goal=="number")}function Le(r){let e=-1,t=1/0;const o=[...new Set(r.map(n=>n.iteration))];for(const n of o){const i=r.find(u=>u.iteration===n&&u.type==="rating");if(!i)continue;const s=i.payload.ratings.reduce((u,m)=>{const p=m.goal-m.score;return u+(p>0?p:0)},0);s<t&&(t=s,e=n)}return e>0?e:o.pop()||1}function le(r){if(R.length===0)return;const e=R.filter(d=>d.iteration===r),t=e.find(d=>d.type==="creator"),o=e.find(d=>d.type==="rating"),n=e.find(d=>d.type==="editor"),i=l("live-response-container"),a=l("ratings-container"),s=l("editor-advice-container"),u=l("live-response"),m=l("ratings"),p=l("editor-advice");t?(i.style.display="block",u.innerHTML=t.payload.response.replace(/\n/g,"<br>")):i.style.display="none",o?(a.style.display="block",m.innerHTML=ae(o.payload.ratings)):a.style.display="none",n?(s.style.display="block",p.innerHTML=n.payload.advice.replace(/\n/g,"<br>")):s.style.display="none";const c=l("iteration-label"),g=l("iteration-slider");c.textContent=`${r} / ${g.max}`}function Pe(r){const{type:e,payload:t,iteration:o,maxIterations:n,step:i,totalStepsInIteration:a}=r,s=l("iteration-progress-bar"),u=l("step-progress-bar"),m=o/n*100,p=i/a*100;s.style.width=`${m}%`,s.textContent=`Iteration: ${o} / ${n}`;const c=e.charAt(0).toUpperCase()+e.slice(1);if(u.style.width=`${p}%`,u.textContent=`Step: ${i} of ${a} (${c})`,e==="creator"){const g=l("live-response-container"),d=l("live-response");g.style.display="block",d.innerHTML=t.response.replace(/\n/g,"<br>")}else if(e==="rating"){const g=l("ratings-container"),d=l("ratings");console.log("Received ratings payload for rendering:",JSON.stringify(t.ratings,null,2)),g.style.display="block",d.innerHTML=ae(t.ratings)}else if(e==="editor"){const g=l("editor-advice-container"),d=l("editor-advice");g.style.display="block",d.innerHTML=t.advice.replace(/\n/g,"<br>")}}async function Ie(){if(!P){alert("Please configure models first.");return}R=[],N=0,l("history-controls").style.display="none";const r=l("prompt"),e=I();if(!r.value.trim()){alert("Please enter a prompt before starting the loop.");return}if(e.length===0){alert("Please define at least one quality criterion before starting the loop.");return}const t=l("max-iterations"),o={prompt:r.value,criteria:e,maxIterations:parseInt(t.value,10)||5},n=l("start-loop-btn"),i=l("stop-loop-btn");n.style.display="none",i.style.display="inline-block";const a=l("progress-container"),s=l("iteration-progress-bar"),u=l("step-progress-bar");a.style.display="block",s.style.width="0%",s.textContent="Starting...",u.style.width="0%",u.textContent="";const m=l("results-container"),p=l("final-result-container");Array.from(m.children).forEach(c=>c.style.display="none"),p.style.display="block",p.innerHTML="Looping...";try{const c=await P.runLoop(o,Pe);p.style.display="none",R=c.history;const g=c.iterations;if(g>0){let d=g;c.success||(d=Le(R),console.log(`Loop failed. Showing best iteration: ${d}`));const C=l("history-controls"),E=l("iteration-slider");C.style.display="block",E.max=String(g),E.value=String(d),N=d,le(N)}else p.style.display="block",p.innerHTML="<p>The loop did not run any iterations.</p>"}catch(c){p.style.display="block",p.innerHTML=`<p style="color: red;">Error: ${c}</p>`,console.error(c)}finally{n.style.display="inline-block",i.style.display="none",l("progress-container").style.display="none"}}function U(r){const e=l("criteria-list");e.innerHTML="",r.forEach(t=>{const o=de(t);e.appendChild(o)})}function de(r){var n;const e=document.createElement("div");e.className="criterion",e.innerHTML=`
        <textarea placeholder="Criterion Name. Description..." rows="1"></textarea>
        <input type="number" min="1" max="10" placeholder="Goal">
        <button class="remove-criterion-btn" title="Remove">&times;</button>
    `;const t=e.querySelector("textarea"),o=e.querySelector('input[type="number"]');return r&&(t.value=_(r.name),t.dataset.fullText=r.name,o.value=String(r.goal)),t.addEventListener("focus",()=>{t.value=t.dataset.fullText||"",Q.call(t)}),t.addEventListener("blur",()=>{const i=t.value.trim();i?(t.dataset.fullText=i,t.value=_(i)):(delete t.dataset.fullText,t.value=""),t.style.height="auto"}),t.addEventListener("input",Q),t.addEventListener("keydown",i=>{i.key==="Enter"&&!i.shiftKey&&(i.preventDefault(),i.target.blur())}),(n=e.querySelector(".remove-criterion-btn"))==null||n.addEventListener("click",()=>e.remove()),e}function Te(){const r=I(),e=new Map;r.forEach(o=>e.set(o.name,o)),ne.forEach(o=>e.set(o.name,o));const t=Array.from(e.values());U(t),alert("Default criteria loaded and merged!")}async function Re(){const r=I();if(r.length===0){alert("No criteria to copy.");return}try{await navigator.clipboard.writeText(JSON.stringify(r,null,2)),alert("Criteria copied to clipboard!")}catch(e){console.error("Failed to copy criteria: ",e),alert("Failed to copy criteria to clipboard.")}}async function Ne(){try{const r=await navigator.clipboard.readText(),e=JSON.parse(r);if(!Me(e))throw new Error("Clipboard does not contain a valid criteria array.");const t=I(),o=new Map;t.forEach(i=>o.set(i.name,i)),e.forEach(i=>o.set(i.name,i));const n=Array.from(o.values());U(n),alert("Criteria pasted and merged!")}catch(r){console.error("Failed to paste criteria: ",r),alert("Failed to paste criteria. Please make sure the clipboard contains a valid JSON array of criteria.")}}function ce(r){l("prompt").value=r.prompt,l("max-iterations").value=String(r.maxIterations),U(r.criteria)}function pe(){if(!v)return;const r=l("settings-profile-select"),e=v.getLastUsedProfileName();r.innerHTML="";const t=v.getProfileNames();if(t.length===0){r.innerHTML="<option disabled>No profiles saved</option>";return}t.forEach(o=>{const n=document.createElement("option");n.value=o,n.textContent=o,o===e&&(n.selected=!0),r.appendChild(n)})}function Ae(){if(!v||!x)return;const r=l("settings-profile-name");let e=r.value.trim();if(!e){const i=l("settings-profile-select").value;if(i&&confirm(`No new profile name entered. Do you want to overwrite the selected profile "${i}"?`))e=i;else return}const t={prompt:l("prompt").value,maxIterations:parseInt(l("max-iterations").value,10),criteria:I(),selectedModels:x.getSelectedModels()};v.saveProfile(e,t),r.value="",pe();const o=l("settings-profile-select");o.value=e}function Oe(r){if(!v||!x)return;const e=r.target;if(!e)return;const t=e.value,o=v.getProfile(t);o&&(ce(o),x.setSelectedModels(o.selectedModels),H(o.selectedModels),v.setLastUsedProfile(t))}function $e(){if(!v)return;const e=l("settings-profile-select").value;e&&confirm(`Are you sure you want to delete the "${e}" profile?`)&&(v.deleteProfile(e),ue())}function ue(){if(!v)return;const r=v.getLastUsedProfile();r&&ce(r),pe()}ee.addEventListener("click",we);te.addEventListener("click",Se);k.addEventListener("click",r=>{r.target===k&&z()});M.addEventListener("click",r=>{r.target===M&&ie()});x=new ye(Ee,z);x.render(re);new be(oe,Ce);v=new xe;const Be=x.getApiKey(),Ue=x.areAllModelsSelected();Be&&Ue?(console.log("Models already configured, showing main app."),H(x.getSelectedModels()),se(),A.style.display="none",O.style.display="block"):(O.style.display="none",A.style.display="block");console.log("Application initialized.");
