var ne=Object.defineProperty;var ae=(r,e,t)=>e in r?ne(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var g=(r,e,t)=>ae(r,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))o(i);new MutationObserver(i=>{for(const n of i)if(n.type==="childList")for(const a of n.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&o(a)}).observe(document,{childList:!0,subtree:!0});function t(i){const n={};return i.integrity&&(n.integrity=i.integrity),i.referrerPolicy&&(n.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?n.credentials="include":i.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function o(i){if(i.ep)return;i.ep=!0;const n=t(i);fetch(i.href,n)}})();class G{constructor(e,t){g(this,"apiKey");g(this,"apiUrl","https://openrouter.ai/api/v1/chat/completions");g(this,"modelPurposeMap",{});this.apiKey=e,t&&(this.modelPurposeMap=t)}setModelPurpose(e,t){this.modelPurposeMap[e]=t}getModelForPurpose(e){return this.modelPurposeMap[e]}async chat(e,t){var s,m,c;const o=this.getModelForPurpose(e);if(!o)throw new Error(`No model configured for purpose: ${e}`);const i={model:o,messages:[{role:"user",content:t}]};return((c=(m=(s=(await this.sendMessage(i)).choices)==null?void 0:s[0])==null?void 0:m.message)==null?void 0:c.content)??""}async sendMessage(e){const t=await fetch(this.apiUrl,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify(e)});if(!t.ok)throw new Error(`OpenRouter API error: ${t.status} ${t.statusText}`);return t.json()}async fetchModels(){const e=await fetch("https://openrouter.ai/api/v1/models",{headers:{Authorization:`Bearer ${this.apiKey}`}});if(!e.ok)throw new Error(`OpenRouter API error: ${e.status} ${e.statusText}`);return(await e.json()).data}}const z="openrouter_api_key",H="openrouter_model_purposes",$=[{key:"creator",label:"Creator"},{key:"rating",label:"Rating"},{key:"editor",label:"Editor"}];function q(r){const e=[];if(r.prompt){const t=parseFloat(r.prompt);if(!isNaN(t)){const o=t*1e6;e.push(`Input: $${o.toLocaleString(void 0,{maximumFractionDigits:2})} per million tokens`)}}if(r.completion){const t=parseFloat(r.completion);if(!isNaN(t)){const o=t*1e6;e.push(`Output: $${o.toLocaleString(void 0,{maximumFractionDigits:2})} per million tokens`)}}return e}class le{constructor(e,t,o,i){g(this,"onSelect");g(this,"closeModal");g(this,"apiKey","");g(this,"models",[]);g(this,"loading",!1);g(this,"error",null);g(this,"fetched",!1);g(this,"selectedModels",{});g(this,"root",null);this.onSelect=e,this.closeModal=t,o&&(this.apiKey=o),i&&(this.selectedModels={...i}),this.loadFromStorage(),this.apiKey&&!this.fetched&&this.fetchModels()}render(e){this.root=e,this.update()}update(){if(!this.root)return;this.root.innerHTML="";const e=document.createElement("div");e.className="model-selector-container",e.style.width="100%",e.style.padding="2vw 2vw 2vw 2vw",e.style.background="rgba(255,255,255,0.95)",e.style.borderRadius="1.5rem",e.style.boxShadow="0 4px 32px 0 rgba(0,0,0,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.08)",e.style.display="flex",e.style.flexDirection="column",e.style.gap="1.5rem",e.style.boxSizing="border-box";const t=document.createElement("h2");t.textContent="Configure OpenRouter Models",t.style.fontSize="1.5rem",t.style.fontWeight="bold",t.style.marginBottom="0.5rem",t.style.textAlign="center",t.style.letterSpacing="0.01em",t.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",t.style.color="white",t.style.borderRadius="1rem",t.style.padding="0.75rem 0",t.style.boxShadow="0 2px 8px 0 rgba(59,130,246,0.10)",e.appendChild(t);const o=document.createElement("div");o.style.display="flex",o.style.flexDirection="column",o.style.gap="0.5rem",o.style.marginBottom="0.5rem";const i=document.createElement("input");i.type="password",i.placeholder="Enter OpenRouter API Key",i.value=this.apiKey,i.style.padding="0.75rem 1rem",i.style.border="1.5px solid #d1d5db",i.style.borderRadius="0.75rem",i.style.fontSize="1rem",i.style.background="#f9fafb",i.style.transition="border-color 0.2s",i.addEventListener("focus",()=>{i.style.borderColor="#3b82f6"}),i.addEventListener("blur",()=>{i.style.borderColor="#d1d5db"}),i.addEventListener("input",s=>{this.apiKey=s.target.value,this.saveToStorage()}),o.appendChild(i);const n=document.createElement("div");n.innerHTML="<strong>Info:</strong> Your API key and model selections are stored in your browser's localStorage. Anyone with access to this browser profile can view them.",n.style.fontSize="0.85rem",n.style.color="#b45309",n.style.background="#fef3c7",n.style.borderRadius="0.5rem",n.style.padding="0.5rem 0.75rem",o.appendChild(n);const a=document.createElement("button");if(a.textContent=this.loading?"Fetching...":"Fetch Models",a.disabled=this.loading||!this.apiKey,a.style.padding="0.75rem 1rem",a.style.background=this.loading||!this.apiKey?"#93c5fd":"linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",a.style.color="white",a.style.fontWeight="bold",a.style.border="none",a.style.borderRadius="0.75rem",a.style.fontSize="1rem",a.style.cursor=this.loading||!this.apiKey?"not-allowed":"pointer",a.style.transition="background 0.2s",a.addEventListener("mouseenter",()=>{a.disabled||(a.style.background="linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)")}),a.addEventListener("mouseleave",()=>{a.disabled||(a.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)")}),a.addEventListener("click",()=>this.fetchModels()),o.appendChild(a),e.appendChild(o),this.error){const s=document.createElement("p");s.textContent=`Error: ${this.error}`,s.style.color="#dc2626",s.style.background="#fee2e2",s.style.borderRadius="0.5rem",s.style.padding="0.5rem 0.75rem",s.style.fontWeight="bold",e.appendChild(s)}if(this.fetched&&!this.loading&&!this.error&&this.models.length>0){const s=document.createElement("div");s.style.display="grid",s.style.gridTemplateColumns="repeat(2, minmax(0, 1fr))",s.style.gap="1.5rem",s.style.width="100%",s.style.boxSizing="border-box",s.style.margin="0 auto",s.style.alignItems="stretch",s.style.justifyItems="stretch",s.style.maxWidth="100%",s.style.padding="0",s.style.gridTemplateRows="auto auto",s.style.gridAutoRows="1fr",s.style.gridAutoFlow="row",$.forEach(l=>{const d=document.createElement("div");d.style.background="#f3f4f6",d.style.border="1.5px solid #d1d5db",d.style.borderRadius="1rem",d.style.padding="1rem 1.25rem",d.style.boxShadow="0 1px 4px 0 rgba(0,0,0,0.04)",d.style.display="flex",d.style.flexDirection="column",d.style.gap="0.5rem",d.style.height="100%";const h=document.createElement("div");h.textContent=`${l.label} Model`,h.style.fontWeight="bold",h.style.marginBottom="0.25rem",d.appendChild(h);const u=document.createElement("select");u.style.padding="0.5rem 1rem",u.style.border="1.5px solid #d1d5db",u.style.borderRadius="0.75rem",u.style.fontSize="1rem",u.style.background="#fff",u.style.transition="border-color 0.2s",u.addEventListener("focus",()=>{u.style.borderColor="#3b82f6"}),u.addEventListener("blur",()=>{u.style.borderColor="#d1d5db"});const E=document.createElement("option");E.value="",E.disabled=!0,E.textContent="Select a model...",u.appendChild(E),this.models.forEach(S=>{const y=document.createElement("option");y.value=S.id,y.textContent=S.name,u.appendChild(y)});const C=this.models.find(S=>S.id===this.selectedModels[l.key]);u.value=C?C.id:"";let w=document.createElement("div"),f;C?(w.textContent=C.description,w.style.fontSize="0.95rem",w.style.color="#374151",w.style.marginTop="0.25rem",d.appendChild(w),C.pricing&&(f=document.createElement("ul"),f.style.listStyle="disc inside",f.style.marginLeft="1.5rem",f.style.marginTop="0.5rem",q(C.pricing).forEach(S=>{const y=document.createElement("li");y.textContent=S,y.style.fontSize="0.9rem",y.style.color="#2563eb",f&&f.appendChild(y)}),d.appendChild(f))):(w.textContent="",d.appendChild(w)),u.addEventListener("change",S=>{this.selectedModels[l.key]=S.target.value,this.saveToStorage();const y=this.models.find(P=>P.id===this.selectedModels[l.key]);w.textContent=y?y.description:"",f&&f.remove(),y&&y.pricing&&(f=document.createElement("ul"),f.style.listStyle="disc inside",f.style.marginLeft="1.5rem",f.style.marginTop="0.5rem",q(y.pricing).forEach(P=>{const b=document.createElement("li");b.textContent=P,b.style.fontSize="0.9rem",b.style.color="#2563eb",f&&f.appendChild(b)}),d.appendChild(f))}),d.appendChild(u),s.appendChild(d)}),e.appendChild(s);const m=document.createElement("div");m.style.display="flex",m.style.justifyContent="flex-end",m.style.gap="1rem",m.style.marginTop="1.5rem";const c=document.createElement("button");c.textContent="Save and Close",c.style.padding="0.75rem 1.5rem",c.style.background="linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)",c.style.color="white",c.style.fontWeight="bold",c.style.border="none",c.style.borderRadius="0.75rem",c.style.fontSize="1rem",c.style.cursor="pointer",c.addEventListener("click",()=>{this.onSelect(this.selectedModels),this.closeModal()}),m.appendChild(c),e.appendChild(m)}this.root.appendChild(e)}async fetchModels(){this.loading=!0,this.error=null,this.fetched=!1,this.update();try{const e=new G(this.apiKey);this.models=await e.fetchModels();const t=new Set(this.models.map(o=>o.id));for(const o of $)this.selectedModels[o.key]&&!t.has(this.selectedModels[o.key])&&(this.selectedModels[o.key]="");this.fetched=!0}catch(e){this.error=e.message}finally{this.loading=!1,this.update()}}loadFromStorage(){if(!this.apiKey){const e=localStorage.getItem(z);e&&(this.apiKey=e)}if(Object.keys(this.selectedModels).length===0){const e=localStorage.getItem(H);if(e)try{this.selectedModels=JSON.parse(e)}catch{}}}saveToStorage(){localStorage.setItem(z,this.apiKey),localStorage.setItem(H,JSON.stringify(this.selectedModels))}areAllModelsSelected(){return $.every(e=>this.selectedModels[e.key]&&this.selectedModels[e.key]!=="")}setSelectedModels(e){this.selectedModels={...e},this.saveToStorage(),this.update()}getSelectedModels(){return this.selectedModels}getApiKey(){return this.apiKey}}const D="expert_app_prompts",I={creator_initial:`
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
    `.trim()},de={creator_initial:["prompt","criteria"],creator:["prompt","lastResponse","editorAdvice","criteria"],rater:["originalPrompt","response","criterion","goal"],editor:["response","ratings"]};class ce{constructor(e,t){g(this,"prompts");g(this,"onSave");g(this,"root");this.root=e,this.onSave=t,this.prompts=this.loadFromStorage(),this.render()}loadFromStorage(){const e=localStorage.getItem(D);return e?{...I,...JSON.parse(e)}:{...I}}saveToStorage(){localStorage.setItem(D,JSON.stringify(this.prompts)),this.onSave(this.prompts),console.log("Prompts saved.")}revertToDefaults(){confirm("Are you sure you want to revert all prompts to their default values? Any unsaved changes will be lost.")&&(this.prompts={...I},this.render())}getPrompts(){return this.prompts}render(){this.root.innerHTML=`
            <style>
                .prompt-editor { margin-bottom: 1.5rem; }
                .prompt-editor label { font-weight: bold; display: block; margin-bottom: 0.25rem; }
                .prompt-editor textarea { width: 100%; min-height: 200px; font-family: monospace; }
                .placeholders { font-size: 0.8rem; font-style: italic; margin-bottom: 0.5rem; color: #555; }
                .placeholders code { background-color: #eee; padding: 2px 4px; border-radius: 3px; }
            </style>
            <h2>Configure Prompts</h2>
            <p>Edit the templates used by the LLM agents.</p>
        `,Object.keys(this.prompts).forEach(i=>{const n=i,a=document.createElement("div");a.className="prompt-editor";const s=document.createElement("label");s.textContent=`${n.replace("_"," ").replace(/\b\w/g,l=>l.toUpperCase())} Prompt Template`;const m=document.createElement("div");m.className="placeholders",m.innerHTML=`Available placeholders: ${de[n].map(l=>`<code>{{${l}}}</code>`).join(", ")}`;const c=document.createElement("textarea");c.value=this.prompts[n],c.addEventListener("input",()=>{this.prompts[n]=c.value}),a.appendChild(s),a.appendChild(m),a.appendChild(c),this.root.appendChild(a)});const e=document.createElement("div");e.style.marginTop="1.5rem",e.style.display="flex",e.style.gap="1rem";const t=document.createElement("button");t.textContent="Save and Close",t.addEventListener("click",()=>this.saveToStorage()),e.appendChild(t);const o=document.createElement("button");o.textContent="Revert to Default",o.addEventListener("click",()=>this.revertToDefaults()),e.appendChild(o),this.root.appendChild(e)}}class Y{constructor(e,t){g(this,"client");g(this,"prompts");g(this,"stopRequested",!1);this.client=e,this.prompts=t||{...I}}requestStop(){this.stopRequested=!0}async runLoop(e,t){this.stopRequested=!1;const{prompt:o,criteria:i,maxIterations:n}=e,a=[];let s="",m=!1;const c=3;for(let l=0;l<n&&!this.stopRequested;l++){const d=this.createCreatorPrompt(o,i,l>0?a:void 0);s=await this.client.chat("creator",d);const h={prompt:d,response:s};if(a.push({iteration:l+1,type:"creator",payload:h}),t==null||t({type:"creator",payload:h,iteration:l+1,maxIterations:n,step:1,totalStepsInIteration:c}),this.stopRequested)break;const u=[];let E=!0;for(const b of i){if(this.stopRequested)break;const T=this.createRatingPrompt(s,b,o),se=await this.client.chat("rating",T),U=this.parseRatingResponse(se,b);u.push(U),U.score<b.goal&&(E=!1)}if(this.stopRequested)break;const w={ratings:u.map((b,T)=>({criterion:i[T].name,goal:i[T].goal,score:b.score,justification:b.justification}))};if(a.push({iteration:l+1,type:"rating",payload:w}),t==null||t({type:"rating",payload:w,iteration:l+1,maxIterations:n,step:2,totalStepsInIteration:c}),E){m=!0;break}if(this.stopRequested)break;const f=u.filter(b=>b.score<b.goal),S=this.createEditorPrompt(s,f),y=await this.client.chat("editor",S),P={prompt:S,advice:y};a.push({iteration:l+1,type:"editor",payload:P}),t==null||t({type:"editor",payload:P,iteration:l+1,maxIterations:n,step:3,totalStepsInIteration:c})}return{finalResponse:s,history:a,iterations:a.filter(l=>l.type==="creator").length,success:m}}createCreatorPrompt(e,t,o){var c,l;const i=t.map(d=>d.name).join("\\n- ");if(!o)return this.prompts.creator_initial.replace("{{prompt}}",e).replace("{{criteria}}",i);const n=o.filter(d=>d.type==="editor").pop(),a=o.filter(d=>d.type==="creator").pop(),s=((c=n==null?void 0:n.payload)==null?void 0:c.advice)||"No advice was given.",m=(l=a==null?void 0:a.payload)==null?void 0:l.response;return this.prompts.creator.replace("{{prompt}}",e).replace("{{lastResponse}}",m||"").replace("{{editorAdvice}}",s).replace("{{criteria}}",i)}createRatingPrompt(e,t,o){return this.prompts.rater.replace("{{originalPrompt}}",o).replace("{{response}}",e).replace("{{criterion}}",t.name).replace("{{goal}}",String(t.goal))}parseRatingResponse(e,t){let o=1,i="Could not parse rater response.";try{let n=null;const a=e.match(/```json\s*(\{[\s\S]*?\})\s*```/);if(a&&a[1])n=a[1];else{const s=e.indexOf("{"),m=e.lastIndexOf("}");s!==-1&&m!==-1&&m>s&&(n=e.substring(s,m+1))}if(n){const s=JSON.parse(n);typeof s.score=="number"&&(o=s.score),typeof s.justification=="string"&&(i=s.justification)}}catch(n){console.warn("Could not parse rating response as JSON, using fallback.",{response:e,error:n})}return{criterion:t.name,goal:t.goal,score:o,justification:i}}createEditorPrompt(e,t){return this.prompts.editor.replace("{{response}}",e).replace("{{ratings}}",JSON.stringify(t,null,2))}}const B="expert_app_settings_profiles",j="expert_app_last_used_profile";function pe(r){return typeof r!="object"||r===null?!1:Object.values(r).every(e=>typeof e=="object"&&e!==null&&"prompt"in e&&typeof e.prompt=="string"&&"criteria"in e&&Array.isArray(e.criteria)&&"maxIterations"in e&&typeof e.maxIterations=="number"&&"selectedModels"in e&&typeof e.selectedModels=="object"&&e.selectedModels!==null)}class me{constructor(){g(this,"profiles",{});g(this,"lastUsedProfileName",null);this.loadProfiles(),this.lastUsedProfileName=localStorage.getItem(j)}loadProfiles(){const e=localStorage.getItem(B);if(e)try{const t=JSON.parse(e);pe(t)?this.profiles=t:(console.warn("Invalid settings profiles found in localStorage. Ignoring."),this.profiles={})}catch(t){console.error("Failed to parse settings profiles from localStorage",t),this.profiles={}}}getProfileNames(){return Object.keys(this.profiles)}getProfile(e){return this.profiles[e]}saveProfile(e,t){if(!e)throw new Error("Profile name cannot be empty.");this.profiles[e]=t,localStorage.setItem(B,JSON.stringify(this.profiles)),this.setLastUsedProfile(e)}deleteProfile(e){delete this.profiles[e],localStorage.setItem(B,JSON.stringify(this.profiles)),this.lastUsedProfileName===e&&(localStorage.removeItem(j),this.lastUsedProfileName=null)}getLastUsedProfile(){if(this.lastUsedProfileName)return this.getProfile(this.lastUsedProfileName);const e=this.getProfileNames();return e.length>0?this.getProfile(e[0]):void 0}getLastUsedProfileName(){if(this.lastUsedProfileName&&this.profiles[this.lastUsedProfileName])return this.lastUsedProfileName;const e=this.getProfileNames();return e.length>0?e[0]:null}setLastUsedProfile(e){this.lastUsedProfileName=e,localStorage.setItem(j,e)}}function p(r){const e=document.getElementById(r);if(!e)throw new Error(`Could not find element with id: ${r}`);return e}const R=p("initial-setup"),N=p("main-app"),W=p("configure-models-btn"),Q=p("configure-prompts-btn"),k=p("modal-container"),V=p("modal-content"),M=p("prompt-modal-container"),X=p("prompt-modal-content");if(!R||!N||!W||!k||!V||!Q||!M||!X)throw new Error("Could not find required DOM elements");let O=null,x=null,J={},L=null,v=null,F={...I};function ue(){k&&(k.style.display="flex")}function K(){k&&(k.style.display="none")}function ge(){M&&(M.style.display="flex")}function Z(){M&&(M.style.display="none")}function _(r){console.log("Reconfiguring core services with models:",r),J=r;const e=x==null?void 0:x.getApiKey();e&&(O=new G(e,J),L=new Y(O,F),console.log("OpenRouter client and Orchestrator configured."))}function fe(r){_(r),K(),R.style.display!=="none"&&(ee(),R.style.display="none",N.style.display="block")}function ye(r){F=r,O&&(L=new Y(O,F)),Z()}function ee(){var r,e,t,o,i,n,a,s,m;N.innerHTML=`
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
    `,(r=document.getElementById("settings-save-btn"))==null||r.addEventListener("click",Ce),(e=document.getElementById("settings-delete-btn"))==null||e.addEventListener("click",Me),(t=document.getElementById("settings-profile-select"))==null||t.addEventListener("change",ke),(o=document.getElementById("add-criterion-btn"))==null||o.addEventListener("click",()=>{var d;const c=document.getElementById("criteria-list"),l=document.createElement("div");l.className="criterion",l.innerHTML=`
            <input type="text" placeholder="Criterion Name">
            <input type="number" min="1" max="10" placeholder="Goal">
            <button class="remove-criterion-btn" title="Remove">&times;</button>
        `,(d=l.querySelector(".remove-criterion-btn"))==null||d.addEventListener("click",()=>l.remove()),c==null||c.appendChild(l)}),(i=document.getElementById("copy-criteria-btn"))==null||i.addEventListener("click",Se),(n=document.getElementById("paste-criteria-btn"))==null||n.addEventListener("click",Ee),(a=document.getElementById("criteria-list"))==null||a.addEventListener("click",c=>{var l;c.target.classList.contains("remove-criterion-btn")&&((l=c.target.closest(".criterion"))==null||l.remove())}),(s=document.getElementById("start-loop-btn"))==null||s.addEventListener("click",we),(m=document.getElementById("stop-loop-btn"))==null||m.addEventListener("click",()=>{L&&L.requestStop()}),ie()}function A(){const r=document.querySelectorAll("#criteria-list .criterion"),e=[];return r.forEach(t=>{const o=t.querySelector('input[type="text"]'),i=t.querySelector('input[type="number"]');o!=null&&o.value&&(i!=null&&i.value)&&e.push({name:o.value,goal:parseInt(i.value,10)})}),e}function he(r){return r>=8?"#10b981":r>=5?"#f59e0b":"#ef4444"}function be(r){return`
        <ul class="rating-list">
            ${r.map(e=>`
                <li class="rating-item">
                    <div class="rating-header">
                        <span class="rating-name">${e.criterion} (Goal: ${e.goal})</span>
                        <span class="rating-score" style="color: ${he(e.score)}">
                            ${e.score} / 10
                        </span>
                    </div>
                    <p class="rating-reasoning">${(e.justification||"No reasoning provided.").replace(/\n/g,"<br>")}</p>
                </li>
            `).join("")}
        </ul>
    `}function ve(r){return Array.isArray(r)&&r.every(e=>typeof e=="object"&&e!==null&&"name"in e&&typeof e.name=="string"&&"goal"in e&&typeof e.goal=="number")}function xe(r){const{type:e,payload:t,iteration:o,maxIterations:i,step:n,totalStepsInIteration:a}=r,s=p("iteration-progress-bar"),m=p("step-progress-bar"),c=o/i*100,l=n/a*100;s.style.width=`${c}%`,s.textContent=`Iteration: ${o} / ${i}`;const d=e.charAt(0).toUpperCase()+e.slice(1);if(m.style.width=`${l}%`,m.textContent=`Step: ${n} of ${a} (${d})`,e==="creator"){const h=p("live-response-container"),u=p("live-response");h.style.display="block",u.innerHTML=t.response.replace(/\n/g,"<br>")}else if(e==="rating"){const h=p("ratings-container"),u=p("ratings");console.log("Received ratings payload for rendering:",JSON.stringify(t.ratings,null,2)),h.style.display="block",u.innerHTML=be(t.ratings)}else if(e==="editor"){const h=p("editor-advice-container"),u=p("editor-advice");h.style.display="block",u.innerHTML=t.advice.replace(/\n/g,"<br>")}}async function we(){if(!L){alert("Please configure models first.");return}const r=p("prompt"),e=A(),t=p("max-iterations"),o={prompt:r.value,criteria:e,maxIterations:parseInt(t.value,10)||5},i=p("start-loop-btn"),n=p("stop-loop-btn");i.style.display="none",n.style.display="inline-block";const a=p("progress-container"),s=p("iteration-progress-bar"),m=p("step-progress-bar");a.style.display="block",s.style.width="0%",s.textContent="Starting...",m.style.width="0%",m.textContent="";const c=p("results-container"),l=p("final-result-container");Array.from(c.children).forEach(d=>d.style.display="none"),l.style.display="block",l.innerHTML="Looping...";try{const d=await L.runLoop(o,xe),h=d.success?"#10b981":"#f59e0b";l.style.display="block",l.innerHTML=`
            <div class="response-block">
                <h3 style="color: ${h};">Loop Finished (Success: ${d.success})</h3>
                <p>Total Iterations: ${d.iterations}</p>
            </div>

            <div class="response-block response-creator">
                <h3>Final Response:</h3>
                <p>${d.finalResponse.replace(/\n/g,"<br>")}</p>
            </div>
            
            <div class="response-block">
                <h3>Full History:</h3>
                <pre>${JSON.stringify(d.history,null,2)}</pre>
            </div>
        `}catch(d){l.style.display="block",l.innerHTML=`<p style="color: red;">Error: ${d}</p>`,console.error(d)}finally{i.style.display="inline-block",n.style.display="none",p("progress-container").style.display="none"}}function te(r){const e=p("criteria-list");e.innerHTML="",r.forEach(t=>{const o=document.createElement("div");o.className="criterion",o.innerHTML=`
            <input type="text" value="${t.name}" placeholder="Criterion Name">
            <input type="number" value="${t.goal}" min="1" max="10" placeholder="Goal (1-10)">
            <button class="remove-criterion-btn" title="Remove">&times;</button>
        `,e.appendChild(o)})}async function Se(){const r=A();if(r.length===0){alert("No criteria to copy.");return}try{await navigator.clipboard.writeText(JSON.stringify(r,null,2)),alert("Criteria copied to clipboard!")}catch(e){console.error("Failed to copy criteria: ",e),alert("Failed to copy criteria to clipboard.")}}async function Ee(){try{const r=await navigator.clipboard.readText(),e=JSON.parse(r);if(!ve(e))throw new Error("Clipboard does not contain a valid criteria array.");const t=A(),o=new Map;t.forEach(n=>o.set(n.name,n)),e.forEach(n=>o.set(n.name,n));const i=Array.from(o.values());te(i),alert("Criteria pasted and merged!")}catch(r){console.error("Failed to paste criteria: ",r),alert("Failed to paste criteria. Please make sure the clipboard contains a valid JSON array of criteria.")}}function re(r){p("prompt").value=r.prompt,p("max-iterations").value=String(r.maxIterations),te(r.criteria)}function oe(){if(!v)return;const r=p("settings-profile-select"),e=v.getLastUsedProfileName();r.innerHTML="";const t=v.getProfileNames();if(t.length===0){r.innerHTML="<option disabled>No profiles saved</option>";return}t.forEach(o=>{const i=document.createElement("option");i.value=o,i.textContent=o,o===e&&(i.selected=!0),r.appendChild(i)})}function Ce(){if(!v||!x)return;const r=p("settings-profile-name"),e=r.value;if(!e){alert("Please enter a name for the settings profile.");return}const t={prompt:p("prompt").value,maxIterations:parseInt(p("max-iterations").value,10),criteria:A(),selectedModels:x.getSelectedModels()};v.saveProfile(e,t),r.value="",oe()}function ke(r){if(!v||!x)return;const e=r.target;if(!e)return;const t=e.value,o=v.getProfile(t);o&&(re(o),x.setSelectedModels(o.selectedModels),_(o.selectedModels),v.setLastUsedProfile(t))}function Me(){if(!v)return;const e=p("settings-profile-select").value;e&&confirm(`Are you sure you want to delete the "${e}" profile?`)&&(v.deleteProfile(e),ie())}function ie(){if(!v)return;const r=v.getLastUsedProfile();r&&re(r),oe()}W.addEventListener("click",ue);Q.addEventListener("click",ge);k.addEventListener("click",r=>{r.target===k&&K()});M.addEventListener("click",r=>{r.target===M&&Z()});x=new le(fe,K);x.render(V);new ce(X,ye);v=new me;const Pe=x.getApiKey(),Le=x.areAllModelsSelected();Pe&&Le?(console.log("Models already configured, showing main app."),_(x.getSelectedModels()),ee(),R.style.display="none",N.style.display="block"):(N.style.display="none",R.style.display="block");console.log("Application initialized.");
