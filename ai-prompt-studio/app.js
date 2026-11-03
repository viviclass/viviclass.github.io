(function () {
"use strict";
const mode = document.body.dataset.mode === "video" ? "video" : "image";
const isVideo = mode === "video";
const LIB = {
 identity:["AI 生活導演","AI 講師","個人品牌講師","咖啡店老闆","房仲顧問","保險顧問","健身教練","美業老師","餐飲品牌主理人","品牌代言人"],
 industry:["AI 教學","個人品牌","咖啡廳","房地產","保險","健身","醫美","美業","電商","餐飲","精品品牌"],
 scene:["粉色科技攝影棚","明亮教學空間","門市","辦公室","展間","房屋展示間","健身房","工作室","餐廳","街景","商業空間","品牌展示空間"],
 action:["看鏡頭自然口播","微笑看鏡頭","介紹商品","操作設備","展示商品","走路","整理文件","與客戶互動","示範教學"],
 product:["HowAI 影片創作","AI 教學課程","課程服務","咖啡","手沖咖啡","保單","精選房源","房屋銷售","保養品","健身方案","品牌顧問服務","精品商品"],
 style:["粉色時尚品牌廣告","高級商業廣告","品牌形象","電影感","自然光","專業乾淨","現代簡約","未來極簡","精品品牌感"],
 ratio:["9:16","16:9","4:5","1:1"]
};
const LABEL = {identity:"人物身份",industry:"產業類型",scene:"場景",action:"人物動作",product:"商品／服務",style:"風格／氛圍",ratio:"畫面比例"};
const KEYS = Object.keys(LABEL);
const GENDERS = [{value:"reference",label:"依上傳照片（預設）"},{value:"male",label:"男生"},{value:"female",label:"女生"}];
const PRESETS = [
{id:"vivi",name:"🌸 ViVi｜AI 生活導演",data:{gender:"female",identity:"AI 生活導演",industry:"AI 教學",scene:"粉色科技攝影棚",action:"看鏡頭自然口播",product:"HowAI 影片創作",style:"粉色時尚品牌廣告",ratio:"9:16",extra:"以本人上傳照片為唯一身分參考；延續照片中真實的棕色長波浪髮、粉色西裝、花朵耳環與銀色愛心項鍊。保持真實五官、膚色、年齡感，不過度美化。"},speech:["用 HowAI，把生活拍成光！一張照片，也能拍出品牌感！","跟著 ViVi，把生活拍成光！一張照片，開啟你的創作！","用 AI，替生活留一點光。讓每個靈感變成好作品！"]},
{id:"course",name:"🎓 ViVi｜課程招生",data:{gender:"female",identity:"AI 講師 ViVi",industry:"AI 教學",scene:"明亮教學空間",action:"看鏡頭介紹 AI 影片課程",product:"HowAI 影片創作課程",style:"奶油粉與玫瑰粉、明亮親切的商業廣告",ratio:"9:16",extra:"講師面向鏡頭，教學介面有設計感但避免亂碼，人物始終為主角。"},speech:["不會拍影片，也能先從一張照片開始。跟著 ViVi 學 AI！","用 HowAI，從一張照片開始，把創意做成自己的影片！","沒學過 AI 也可以！跟著 ViVi，一起做出第一支短片！"]},
{id:"life",name:"💗 ViVi｜生活故事",data:{gender:"female",identity:"三寶媽 ViVi、AI 生活導演",industry:"個人品牌",scene:"溫暖明亮的居家創作工作室",action:"面對鏡頭自然分享生活",product:"AI 生活創作",style:"奶油粉、溫暖自然光、親切生活紀錄感",ratio:"9:16",extra:"有溫暖真實的生活感，不加入未經提供的家庭成員；保留本人照片真實面貌。"},speech:["白天是 AI 生活導演，晚上是三寶媽。用 AI，替生活留一點光。","把日常的小靈感，慢慢拍成光。這就是我的 AI 生活。","跟著 ViVi，把生活拍成光。每張照片，都有自己的故事！"]},
{id:"vivi_male",name:"🧑‍💼 男性版｜AI 生活導演",data:{gender:"male",identity:"AI 生活導演",industry:"AI 教學",scene:"粉白科技攝影棚",action:"看鏡頭自然口播",product:"HowAI 影片創作",style:"專業時尚品牌廣告、奶油粉與白色柔光",ratio:"9:16",extra:"以學員本人上傳的男性照片為唯一人物參考，保留真實臉型、五官比例、膚色、髮型、年齡感、服裝與原有配件。延續薇光 AI 課堂的粉白品牌感；不可套用 ViVi 女性範本的長波浪髮、花朵耳環與項鍊。"},speech:["用 HowAI，把生活拍成光！一張照片，也能拍出品牌感！","你的品牌短片，從一張照片開始。跟我一起試試！","一張照片，也能拍出專業品牌感！用 HowAI 開始創作！"]},
{id:"lecturer",name:"👩‍🏫 個人品牌講師",data:{identity:"個人品牌講師",industry:"個人品牌",scene:"專業明亮的創作者工作室",action:"看鏡頭介紹課程",product:"課程服務",style:"專業乾淨、自然光、品牌形象",ratio:"9:16",extra:"呈現親切可信的講師個人形象。"}},
{id:"luxury",name:"💎 精品代言",data:{identity:"品牌代言人",industry:"精品品牌",scene:"品牌展示空間",action:"看鏡頭展示商品",product:"精品商品",style:"高級商業廣告、精品品牌感",ratio:"4:5",extra:"精緻展示台與攝影棚燈光襯托人物。"}},
{id:"cafe",name:"☕ 咖啡店老闆",data:{identity:"咖啡店老闆",industry:"咖啡廳",scene:"木質咖啡廳門市",action:"看鏡頭介紹咖啡",product:"手沖咖啡",style:"溫暖自然光、電影感",ratio:"9:16",extra:"保留咖啡職人的自然動作，咖啡杯與器具造型一致。"}},
{id:"realtor",name:"🏠 房仲顧問",data:{identity:"房仲顧問",industry:"房地產",scene:"房屋展示間",action:"介紹房屋特色",product:"精選房源",style:"專業乾淨、高級房產形象",ratio:"9:16",extra:"自然呈現房屋空間，不虛構價格和屋況。"}},
{id:"beauty",name:"💄 美業老師",data:{identity:"美業老師",industry:"美業",scene:"明亮的美學工作室",action:"看鏡頭展示保養品",product:"保養品",style:"柔和自然光、精緻品牌感",ratio:"9:16",extra:"避免誇大產品功效，重視人物自然膚質。"}},
{id:"fitness",name:"💪 健身教練",data:{identity:"健身教練",industry:"健身",scene:"現代健身房",action:"自然介紹訓練課程",product:"健身方案",style:"活力專業、清晰電影感",ratio:"9:16",extra:"人物姿態正確自然，不誇大健身效果。"}},
{id:"insurance",name:"🤝 保險顧問",data:{identity:"保險顧問",industry:"保險",scene:"乾淨的商務辦公室",action:"看鏡頭介紹服務",product:"保單",style:"專業可信、現代簡約",ratio:"9:16",extra:"不虛構保障條款、保費或保證收益。"}}
];
let activePreset = "vivi";
let variant = 0;
let speechMode = "auto";
const inputs = {};
const speechInfo = {node:null,counter:null};
const root = document.getElementById("app");

function el(tag, cls, text) {
 const o = document.createElement(tag);
 if(cls) o.className = cls;
 if(text !== undefined) o.textContent = text;
 return o;
}
function addButton(parent, text, cls, fn) {
 const b=el("button",cls||"btn",text);b.type="button";b.addEventListener("click",fn);parent.appendChild(b);return b;
}
function fieldValue(key) {
 const p=inputs[key];return (p.custom.value.trim() || p.select.value.trim() || "").trim();
}
function values() {
 const obj={};KEYS.forEach(k=>obj[k]=fieldValue(k));obj.gender=inputs.gender.value;obj.extra=(inputs.extra.value||"").trim();return obj;
}
function setValues(data) {
 KEYS.forEach(k=>{
   const value=data[k]||"";
   if(LIB[k].includes(value)){inputs[k].select.value=value;inputs[k].custom.value="";}
   else {inputs[k].select.value="";inputs[k].custom.value=value;}
 });
 inputs.extra.value=data.extra||"";
 inputs.gender.value=GENDERS.some(o=>o.value===data.gender)?data.gender:"reference";
}
function markActive() {
 document.querySelectorAll(".preset").forEach(btn=>btn.classList.toggle("active",btn.dataset.id===activePreset));
}
function applyPreset(id) {
 const p=PRESETS.find(x=>x.id===id);if(!p)return;
 activePreset=id;variant=0;speechMode="auto";setValues(p.data);markActive();refreshSpeech(true);renderOutput();
}
function escapeValue(v,defaultVal) {return v||defaultVal;}
function speechChoices(data) {
 const preset=PRESETS.find(p=>p.id===activePreset);
 if(preset&&preset.speech)return preset.speech;
 const identity=escapeValue(data.identity,"品牌主角");
 const industry=data.industry;
 const scene=escapeValue(data.scene,"這個空間");
 const prod=escapeValue(data.product,"專業服務");
 if(/咖啡/.test(industry)||/咖啡/.test(identity))
   return ["來到"+scene+"，一起感受"+prod+"的迷人香氣！","每一杯"+prod+"，都有我們用心準備的好味道。","喜歡咖啡嗎？今天帶你認識這份"+prod+"的溫度！"];
 if(/房地產|房仲|房屋/.test(industry+identity))
   return ["帶你走進"+scene+"，看看"+prod+"的精彩之處！","找到理想的家，就從了解這份"+prod+"開始！","我是"+identity+"，今天帶你看看理想生活的模樣！"];
 if(/美業|醫美|保養|美容/.test(industry+identity))
   return ["好的日常保養，從找到適合自己的"+prod+"開始。","歡迎來到"+scene+"，一起認識日常美感！","我是"+identity+"，今天跟你分享"+prod+"的小細節！"];
 if(/健身/.test(industry+identity))
   return ["從今天開始，用"+prod+"，一起練出更好的習慣！","我是"+identity+"，陪你從適合自己的訓練開始！","來到"+scene+"，讓每次運動都成為進步的開始！"];
 if(/保險/.test(industry+identity))
   return ["我是"+identity+"，陪你了解適合自己的保障規劃。","關於"+prod+"，我們一起把重要細節看清楚！","從了解需求開始，讓保障規劃更踏實。"];
 if(/AI|教學|講師|課程/.test(industry+identity))
   return ["用"+prod+"，把想法一步步變成自己的作品！","我是"+identity+"，帶你從一個簡單的創意開始！","在"+scene+"，跟我一起探索"+prod+"的創作樂趣！"];
 if(/精品|電商|品牌/.test(industry+identity))
   return ["這次帶你看看"+prod+"，感受細節裡的品牌魅力！","從設計到呈現，"+prod+"都有值得細看的地方！","歡迎來到"+scene+"，一起感受品牌的質感！"];
 return ["我是"+identity+"，今天帶你認識"+prod+"！","走進"+scene+"，一起看看"+prod+"的精彩！","從"+prod+"開始，打造屬於自己的品牌感！"];
}
function selectedSpeech() {
 const candidates=speechChoices(values());return candidates[variant % candidates.length];
}
function updateCount() {
 if(!speechInfo.counter||!speechInfo.node)return;
 const t=speechInfo.node.value.trim();
 const count=Array.from(t).length;
 speechInfo.counter.textContent="目前 "+count+" 字元（含標點與英文字母）；10 秒影片請試播確認語速。"+(count>38?" ⚠️ 台詞可能偏長，建議精簡。":"");
}
function refreshSpeech(force) {
 if(!isVideo||!speechInfo.node)return;
 if(force||speechMode==="auto"){speechInfo.node.value=selectedSpeech();updateCount();}
}
function setCustom() {activePreset="";variant=0;markActive();if(speechMode==="auto")refreshSpeech(true);renderOutput();}
function genderInstruction(gender) {
 if(gender==="male")return "人物呈現設定：男生。以實際上傳的男性人物照片為唯一身份依據，保持原本的五官、髮型與穿著，不套用女性專屬造型或配件，也不可換臉。";
 if(gender==="female")return "人物呈現設定：女生。以實際上傳的女性人物照片為唯一身份依據，保持原本的五官、髮型與穿著，不套用男性專屬造型或配件，也不可換臉。";
 return "人物呈現設定：依上傳照片為準，不預設性別，不擅自更改照片中人物的外貌特徵、服飾或身份。";
}
function voiceInstruction(gender) {
 if(gender==="male")return "使用自然清楚的成年男性聲線，以台灣標準華語口播。";
 if(gender==="female")return "使用自然清楚的成年女性聲線，以台灣標準華語口播。";
 return "使用自然清楚的成年人物聲線，以台灣標準華語口播；未指定聲線性別，不要擅自強制套用男聲或女聲。";
}
function imagePrompt(d) {
 return ["【薇光 AI 課堂｜人物商業主視覺】","",
 "請使用上傳的成年人物照片作為唯一人物身份參考，保留真實臉型、五官比例、膚色、髮型與年齡感，不換臉、不幼化、不過度美化失真。","",
 "生成一張 "+escapeValue(d.ratio,"9:16")+" 比例的高質感商業品牌主視覺。",
 "人物身份："+escapeValue(d.identity,"品牌主角")+"；產業："+escapeValue(d.industry,"個人品牌")+"。",
 genderInstruction(d.gender),
 "場景："+escapeValue(d.scene,"明亮的商業空間")+"。",
 "人物姿態與動作："+escapeValue(d.action,"自然看向鏡頭")+"。",
 "商品或服務："+escapeValue(d.product,"品牌服務")+"。",
 "整體視覺風格："+escapeValue(d.style,"高級商業廣告")+"。","",
 "人物始終是畫面主角；商品與空間元素襯托品牌定位，不搶走人物焦點。光影細緻、真實材質、構圖乾淨有層次，清楚呈現品牌感與商業攝影質感。",
 "為後續 10 秒圖生影片保留穩定的人像五官、完整頭部與適當文字安全區。避免不明 Logo、亂碼文字、手指變形與不合理道具。",
 d.extra?"\n【自訂補充】\n"+d.extra:""
 ].filter(Boolean).join("\n");
}
function videoPrompt(d,speech) {
 const p=escapeValue(d.product,"商品或服務");
 const scene=escapeValue(d.scene,"專業場景");
 const action=escapeValue(d.action,"自然看向鏡頭並介紹服務");
 const style=escapeValue(d.style,"高級商業廣告");
 return ["【薇光 AI 課堂｜10 秒人物口播商業短片】","",
 "使用上傳圖片作為影片首幀及唯一人物身份參考；保持臉型、五官比例、膚色、髮型、年齡感、服裝與整體氣質一致。不可換臉、幼化或突然更換人物。","",
 "生成 10 秒、"+escapeValue(d.ratio,"9:16")+" 比例的人物品牌短片。",
 "人物身份："+escapeValue(d.identity,"品牌主角")+"；產業："+escapeValue(d.industry,"個人品牌")+"。",
 genderInstruction(d.gender),
 "場景："+scene+"；動作："+action+"。",
 "展示商品／服務："+p+"；視覺風格："+style+"。","",
 "【人物親自口播｜逐字照念】",
 "「"+speech+"」",
 voiceInstruction(d.gender)+"由畫面人物本人開口說話，嘴型與語音同步；不是畫外旁白。不得新增台詞或自行修改。說話時背景音樂降低音量，不要用轉場遮住口型。","",
 "【0–1 秒｜登場】",
 "以中近景建立主角，人物面向鏡頭，"+scene+"的光線及空間層次柔和展開。","",
 "【1–4 秒｜口播前段】",
 "人物自然開始指定口播，鏡頭緩緩推近；嘴型清楚、眼神穩定，搭配符合「"+action+"」的輕微自然手勢。","",
 "【4–7 秒｜口播後段與品牌展示】",
 "人物持續說話，"+p+"以同框道具、背景展示或柔和視覺元素呈現；鏡頭輕微側移，但不要離開說話者的正面臉部。","",
 "【7–8 秒｜完整收尾】",
 "完成全部指定台詞並自然微笑。若台詞未說完，優先保障口播完整，避免提前切鏡或裁掉最後一句。","",
 "【8–10 秒｜英雄視角定格】",
 "口播完成後才進行柔和光影轉場；回到人物與"+p+"及"+scene+"共同構成的品牌英雄視角。最後 1 秒保持穩定清晰，作為封面定格。","",
 "【整體要求】",
 "人物一致、口型自然、聲音與嘴型同步、"+style+"、商業質感。可有輕快背景音樂與精緻轉場音效，但不能搶過人聲。避免亂碼字幕、未授權品牌標誌、無關特效及過度科幻。",
 d.extra?"\n【自訂補充】\n"+d.extra:""
 ].filter(Boolean).join("\n");
}
function renderOutput() {
 const d=values();const result=isVideo?videoPrompt(d,speechInfo.node.value.trim()||selectedSpeech()):imagePrompt(d);
 document.getElementById("prompt-output").value=result;
}
async function copyOutput() {
 const text=document.getElementById("prompt-output").value;
 try {
  if(navigator.clipboard&&window.isSecureContext) await navigator.clipboard.writeText(text);
  else {const ta=document.getElementById("prompt-output");ta.focus();ta.select();if(!document.execCommand("copy"))throw Error("copy");}
  status("已複製完整提示詞。");
 } catch(e){status("自動複製失敗，請長按輸出文字選取複製。");}
}
function downloadOutput() {
 const data=document.getElementById("prompt-output").value;
 const blob=new Blob(["\ufeff",data],{type:"text/plain;charset=utf-8"});
 const url=URL.createObjectURL(blob);const a=el("a");a.href=url;a.download=isVideo?"ViVi_10秒影片口播提示詞.txt":"ViVi_圖片提示詞.txt";
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);status("已準備 TXT 下載。");
}
function status(t) {document.getElementById("status").textContent=t;}
function transfer() {
 const d=values();const query=encodeURIComponent(JSON.stringify(d));window.location.href="../video/?data="+query;
}
function render() {
 const wrap=el("main","wrap");root.appendChild(wrap);
 const hero=el("header","hero");wrap.appendChild(hero);
 hero.appendChild(el("div","eyebrow","ViVi 老師・薇光 AI 課堂"));
 hero.appendChild(el("h1","",isVideo?"🎬 10 秒口播影片提示詞產生器":"🖼️ 人物商業圖片提示詞產生器"));
 hero.appendChild(el("p","",isVideo?"先選人物設定，再選素材與口播，產出 10 秒影片提示詞。依行業自動換口播及男女聲線設定。":"先選男生、女生或依照片，再填七個欄位完成商業主視覺提示詞。也能一鍵帶入影片頁。"));
 const presets=el("section","card presets");wrap.appendChild(presets);
 presets.appendChild(el("h2","","✨ 一鍵帶入參考範例"));
 presets.appendChild(el("p","","薇光品牌範例包含 ViVi 女性版及男性版，其他是常見學員產業；選完仍可修改所有欄位。"));
 const pgrid=el("div","preset-grid");presets.appendChild(pgrid);
 PRESETS.forEach(p=>{const b=addButton(pgrid,p.name,"preset",()=>applyPreset(p.id));b.dataset.id=p.id;});
 const main=el("section","main");wrap.appendChild(main);
 const form=el("div","card form-card");main.appendChild(form);
 form.appendChild(el("h2","","① 選素材或自行填寫"));
 form.appendChild(el("p","sub","先選人物呈現，接著使用原本七個素材庫欄位；右側可自由輸入，手動輸入優先套用。"));
 const genderField=el("div","field");form.appendChild(genderField);
 genderField.appendChild(el("label","","人物呈現（新增選填）"));
 const genderSelect=el("select");genderSelect.setAttribute("aria-label","人物呈現：依照片、男生或女生");
 GENDERS.forEach(g=>{const o=el("option","",g.label);o.value=g.value;genderSelect.appendChild(o);});
 genderField.appendChild(genderSelect);
 genderField.appendChild(el("span","hint","依照片最通用；選男生或女生時，圖片會保留本人外貌，影片會使用對應的自然成年聲線。"));
 inputs.gender=genderSelect;
 genderSelect.addEventListener("change",()=>{
   const extra=inputs.extra.value;
   if(genderSelect.value==="male" && extra.includes("棕色長波浪髮、粉色西裝、花朵耳環")) {
     inputs.extra.value="以學員本人上傳的男性照片為唯一人物參考，保留真實五官、髮型、服裝及配件，不套用女性範本的長髮或花朵耳環。保留薇光 AI 課堂的粉白品牌視覺。";
   }
   if(genderSelect.value==="female" && extra.includes("以學員本人上傳的男性照片")) {
     inputs.extra.value="以學員本人上傳的女性照片為唯一人物參考，保留真實五官、髮型、服裝及配件，不套用其他範本的固定造型。保留薇光 AI 課堂的粉白品牌視覺。";
   }
   setCustom();
 });
 KEYS.forEach(key=>{
   const field=el("div","field");form.appendChild(field);
   const label=el("label","",LABEL[key]);field.appendChild(label);
   const box=el("div","inputs");field.appendChild(box);
   const sel=el("select");const first=el("option","","請從素材庫選擇");first.value="";sel.appendChild(first);
   LIB[key].forEach(s=>{const o=el("option","",s);o.value=s;sel.appendChild(o);});
   const custom=el("input");custom.type="text";custom.placeholder="自行輸入"+LABEL[key]+"（可留空）";
   box.appendChild(sel);box.appendChild(custom);inputs[key]={select:sel,custom:custom};
   sel.addEventListener("change",()=>{custom.value="";setCustom();});
   custom.addEventListener("input",setCustom);
 });
 const extraField=el("div","field");form.appendChild(extraField);
 extraField.appendChild(el("label","","補充文字／自訂要求（選填）"));
 inputs.extra=el("textarea");inputs.extra.placeholder="例如：人物站在品牌燈箱前、柔光感、不要產生文字或標誌…";extraField.appendChild(inputs.extra);inputs.extra.addEventListener("input",setCustom);
 if(isVideo) {
  const speech=el("div","speech");form.appendChild(speech);
  speech.appendChild(el("h3","","② 人物口播台詞（可修改）"));
  speech.appendChild(el("small","","依照前面選擇的行業、人物與商品，自動產生不同台詞；手動修改後不會被覆蓋。"));
  speechInfo.node=el("textarea");speechInfo.node.placeholder="自行輸入口播，例如：用 HowAI，把生活拍成光！";speech.appendChild(speechInfo.node);
  speechInfo.node.addEventListener("input",()=>{speechMode="manual";updateCount();renderOutput();});
  speechInfo.counter=el("div","count");speech.appendChild(speechInfo.counter);
  const row=el("div","actions");speech.appendChild(row);
  addButton(row,"🔄 換一句","btn",()=>{speechMode="auto";variant++;refreshSpeech(true);renderOutput();});
  addButton(row,"✨ 依選項重新產生","btn",()=>{activePreset="";speechMode="auto";variant=0;markActive();refreshSpeech(true);renderOutput();});
  addButton(row,"🌸 ViVi 預設台詞","btn",()=>{speechMode="manual";speechInfo.node.value=PRESETS[0].speech[0];updateCount();renderOutput();});
 }
 const output=el("div","card output-card");main.appendChild(output);
 output.appendChild(el("h2","",isVideo?"③ 完整 10 秒影片提示詞":"② 完整圖片提示詞"));
 output.appendChild(el("p","sub","可直接編輯產出文字，再複製貼到生成工具。"));
 const textarea=el("textarea","output");textarea.id="prompt-output";textarea.setAttribute("aria-label","完整提示詞輸出");output.appendChild(textarea);
 const actions=el("div","actions");output.appendChild(actions);
 addButton(actions,"✨ 重新生成提示詞","btn primary",renderOutput);
 addButton(actions,"📋 一鍵複製","btn secondary",copyOutput);
 addButton(actions,"⬇️ 下載 TXT","btn",downloadOutput);
 if(!isVideo) addButton(actions,"🎬 帶入影片提示詞","btn",transfer);
 const note=el("div","tip",isVideo?"生成工具必須支援人物口播與聲畫同步。台詞能否完整說完，請依所用模型試播確認；本工具不會直接生成影片。":"請在圖像生成工具另外上傳本人照片；本頁不會上傳照片，也不會直接產生圖片。");output.appendChild(note);
 const statusNode=el("div","status");statusNode.id="status";statusNode.setAttribute("aria-live","polite");output.appendChild(statusNode);
 const footer=el("footer","footer","用 AI，替生活留一點光。｜薇光 AI 課堂");wrap.appendChild(footer);
}
render();
let imported=false;
if(isVideo) {
 try {const raw=new URLSearchParams(location.search).get("data");if(raw){const d=JSON.parse(raw);if(d&&typeof d==="object"){activePreset="";setValues(d);imported=true;}}} catch(e) {}
}
if(!imported) applyPreset("vivi");
else {markActive();refreshSpeech(true);renderOutput();}
})();