import CryptoJS from "crypto-js";
import * as csso from "csso";
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import he from "he";
import beautify from "js-beautify";
import * as yaml from "js-yaml";
import Papa from "papaparse";
import QRCode from "qrcode";
import { format as formatSql } from "sql-formatter";
import { minify as terserMinify } from "terser";
import xmlFormatter from "xml-formatter";

const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text"});
const builder=new XMLBuilder({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",format:true});
const ok=(output,meta={})=>({ok:true,output,...meta}); const fail=e=>({ok:false,output:e instanceof Error?e.message:String(e)});
const xmlDoc=input=>{const d=new DOMParser().parseFromString(input,"application/xml");const e=d.querySelector("parsererror");if(e)throw new Error(e.textContent.trim().replace(/\s+/g," "));return d;};
const esc=s=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
const unesc=s=>s.replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&quot;",'"').replaceAll("&apos;","'").replaceAll("&amp;","&");
const je=s=>s.replaceAll("\\","\\\\").replaceAll("\r","\\r").replaceAll("\n","\\n").replaceAll("\t","\\t").replaceAll('"','\\"');
const ju=s=>s.replace(/\\r/g,"\r").replace(/\\n/g,"\n").replace(/\\t/g,"\t").replace(/\\"/g,'"').replace(/\\\\/g,"\\");
const b64e=s=>{const b=new TextEncoder().encode(s);let x="";b.forEach(v=>x+=String.fromCharCode(v));return btoa(x)}; const b64d=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s+/g,"")),c=>c.charCodeAt(0)));
const luhn=v=>{const d=v.replace(/\D/g,"");let sum=0,alt=false;for(let i=d.length-1;i>=0;i--){let n=+d[i];if(alt){n*=2;if(n>9)n-=9}sum+=n;alt=!alt}return d.length>=12&&sum%10===0};
const htmlIssues=input=>{const voids=new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]),s=[],issues=[];let m,re=/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g;while((m=re.exec(input))){const f=m[0],t=m[1].toLowerCase();if(f.startsWith("<!")||voids.has(t)||f.endsWith("/>"))continue;if(f.startsWith("</")){const ex=s.pop();if(ex!==t)issues.push(`Unexpected </${t}>${ex?`; expected </${ex}>`:""}.`)}else s.push(t)}while(s.length)issues.push(`Missing closing tag </${s.pop()}>.`);return issues};
const mimes={".json":"application/json",".xml":"application/xml",".html":"text/html",".css":"text/css",".js":"text/javascript",".txt":"text/plain",".csv":"text/csv",".yaml":"application/yaml",".yml":"application/yaml",".pdf":"application/pdf",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".zip":"application/zip"};
const entities=[["&amp;","&","Ampersand"],["&lt;","<","Less-than"],["&gt;",">","Greater-than"],["&quot;",'"',"Quotation mark"],["&copy;","©","Copyright"],["&reg;","®","Registered"]];
const locales=[["Indonesia","id-ID","id","Asia/Jakarta","IDR"],["English (US)","en-US","en","America/New_York","USD"],["English (UK)","en-GB","en","Europe/London","GBP"],["Arabic (Saudi Arabia)","ar-SA","ar","Asia/Riyadh","SAR"],["Malay (Malaysia)","ms-MY","ms","Asia/Kuala_Lumpur","MYR"],["Japanese","ja-JP","ja","Asia/Tokyo","JPY"]];
const lorem="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere, neque at consequat facilisis, justo augue pellentesque sapien, vitae interdum lectus nibh sed erat.";

export async function runTool(tool,input,o={}){try{switch(tool.id){
case"json-formatter":return ok(JSON.stringify(JSON.parse(input),null,+o.spaces||2));
case"xml-formatter":if(XMLValidator.validate(input)!==true)throw new Error("Invalid XML.");return ok(xmlFormatter(input,{indentation:"  ",collapseContent:true}));
case"html-formatter":return ok(beautify.html(input,{indent_size:2,wrap_line_length:100,preserve_newlines:true}));
case"sql-formatter":return ok(formatSql(input,{language:"sql",keywordCase:o.keywordCase||"upper",tabWidth:2}));
case"xml-validator":{const r=XMLValidator.validate(input);return r===true?ok("✓ Valid XML",{validation:"valid"}):ok(`✗ Invalid XML\n${r.err.msg}`,{validation:"invalid"})}
case"json-validator":try{JSON.parse(input);return ok("✓ Valid JSON",{validation:"valid"})}catch(e){return ok(`✗ Invalid JSON\n${e.message}`,{validation:"invalid"})}
case"html-validator":{const x=htmlIssues(input);return x.length?ok(x.join("\n"),{validation:"invalid"}):ok("✓ No common structural issues found.",{validation:"valid"})}
case"xpath-tester":{const d=xmlDoc(input),r=d.evaluate(o.expression||"//*",d,null,XPathResult.ANY_TYPE,null),a=[];let n;while((n=r.iterateNext?.()))a.push(new XMLSerializer().serializeToString(n));return ok(a.join("\n\n")||"(no matches)")}
case"card-validator":{const v=luhn(input);return ok(v?"✓ Luhn valid":"✗ Luhn invalid",{validation:v?"valid":"invalid"})}
case"regex-tester":case"java-regex-tester":{const flags=tool.id==="regex-tester"?(o.flags||"g"):"g",re=new RegExp(o.pattern||"",flags.includes("g")?flags:flags+"g"),m=[...input.matchAll(re)];return ok(`${m.length} match(es)\n\n${m.map((x,i)=>`#${i+1} @ ${x.index}\n${x[0]}`).join("\n\n")}`)}
case"cron-generator":{const f=input.trim().split(/\s+/);if(![6,7].includes(f.length))throw new Error("Quartz cron requires 6 or 7 fields.");return ok(["Seconds","Minutes","Hours","Day of month","Month","Day of week","Year"].slice(0,f.length).map((x,i)=>`${x}: ${f[i]}`).join("\n"))}
case"xsd-generator":return ok(`<?xml version="1.0"?><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="${xmlDoc(input).documentElement.nodeName}" type="xs:string"/></xs:schema>`);
case"xslt-transformer":{if(typeof XSLTProcessor==="undefined")throw new Error("XSLT is not supported by this browser.");const p=new XSLTProcessor();p.importStylesheet(xmlDoc(o.stylesheet||""));const f=p.transformToFragment(xmlDoc(input),document),c=document.createElement("div");c.appendChild(f);return ok(c.innerHTML||c.textContent)}
case"xml-json":if(XMLValidator.validate(input)!==true)throw new Error("Invalid XML.");return ok(JSON.stringify(parser.parse(input),null,2));
case"json-xml":return ok(builder.build(JSON.parse(input)));
case"csv-json":{const r=Papa.parse(input,{header:true,skipEmptyLines:true});if(r.errors.length)throw new Error(r.errors[0].message);return ok(JSON.stringify(r.data,null,2))}
case"csv-xml":{const r=Papa.parse(input,{header:true,skipEmptyLines:true});return ok(`<records>\n${r.data.map(row=>`  <record>\n${Object.entries(row).map(([k,v])=>`    <${k}>${esc(String(v))}</${k}>`).join("\n")}\n  </record>`).join("\n")}\n</records>`)}
case"yaml-json":return ok(JSON.stringify(yaml.load(input),null,2)); case"json-yaml":return ok(yaml.dump(JSON.parse(input),{noRefs:true}));
case"epoch-date":if(o.mode==="date-to-epoch"){const ms=Date.parse(input);if(Number.isNaN(ms))throw new Error("Could not parse date.");return ok(String(Math.floor(ms/1000)))}else{let n=+input;if(String(Math.trunc(n)).length<=10)n*=1000;return ok(new Date(n).toISOString())}
case"url-codec":return ok(o.mode==="decode"?decodeURIComponent(input):encodeURIComponent(input)); case"base64":return ok(o.mode==="decode"?b64d(input):b64e(input));
case"file-encoding":{const b=new TextEncoder().encode(input);return ok(`UTF-8 bytes: ${b.length}\n\n${[...b].map(x=>x.toString(16).padStart(2,"0")).join(" ")}`)}
case"message-digest":{const m={MD5:CryptoJS.MD5,SHA1:CryptoJS.SHA1,SHA256:CryptoJS.SHA256,SHA384:CryptoJS.SHA384,SHA512:CryptoJS.SHA512};return ok(m[o.algorithm||"SHA256"](input).toString())}
case"hmac":{const m={MD5:CryptoJS.HmacMD5,SHA1:CryptoJS.HmacSHA1,SHA256:CryptoJS.HmacSHA256,SHA384:CryptoJS.HmacSHA384,SHA512:CryptoJS.HmacSHA512};return ok(m[o.algorithm||"SHA256"](input,o.key||"").toString())}
case"qr-code":return ok(await QRCode.toDataURL(input||" ",{width:512,margin:2}),{outputType:"image"});
case"js-beautifier":return ok(beautify.js(input,{indent_size:2})); case"js-minifier":{const r=await terserMinify(input);return ok(r.code||"")} case"css-beautifier":return ok(beautify.css(input,{indent_size:2})); case"css-minifier":return ok(csso.minify(input).css);
case"string-utils":if(o.mode==="uppercase")return ok(input.toUpperCase());if(o.mode==="lowercase")return ok(input.toLowerCase());if(o.mode==="titlecase")return ok(input.toLowerCase().replace(/\b\p{L}/gu,c=>c.toUpperCase()));if(o.mode==="reverse")return ok([...input].reverse().join(""));if(o.mode==="sort-lines")return ok(input.split(/\r?\n/).sort().join("\n"));if(o.mode==="unique-lines")return ok([...new Set(input.split(/\r?\n/))].join("\n"));return ok(`Characters: ${[...input].length}\nWords: ${input.trim()?input.trim().split(/\s+/).length:0}\nLines: ${input?input.split(/\r?\n/).length:0}`);
case"html-escape":return ok(o.mode==="unescape"?he.decode(input):he.encode(input,{useNamedReferences:true})); case"xml-escape":return ok(o.mode==="unescape"?unesc(input):esc(input)); case"java-escape":return ok(o.mode==="unescape"?ju(input):je(input)); case"js-escape":case"json-escape":return ok(o.mode==="unescape"?JSON.parse(`"${input}"`):JSON.stringify(input).slice(1,-1)); case"csv-escape":return ok(o.mode==="unescape"?String(Papa.parse(input).data?.[0]?.[0]??""):/[",\n\r]/.test(input)?`"${input.replaceAll('"','""')}"`:input); case"sql-escape":return ok(o.mode==="unescape"?input.replaceAll("''","'"):input.replaceAll("'","''"));
case"lorem":return ok(Array.from({length:Math.max(1,Math.min(20,+o.count||3))},()=>lorem).join("\n\n"));
case"mime-types":{const q=input.trim().toLowerCase();return ok(Object.entries(mimes).filter(([e,t])=>!q||e.includes(q)||t.includes(q)).map(([e,t])=>`${e.padEnd(8)} ${t}`).join("\n")||"No match.")}
case"html-entities":return ok(entities.map(r=>r.join("  ")).join("\n")); case"url-parser":{const u=new URL(input.trim());return ok(JSON.stringify({href:u.href,protocol:u.protocol,host:u.host,pathname:u.pathname,query:Object.fromEntries(u.searchParams),hash:u.hash},null,2))} case"i18n-reference":return ok(["Name | Locale | Language | Timezone | Currency","--- | --- | --- | --- | ---",...locales.map(r=>r.join(" | "))].join("\n")); default:throw new Error("Tool engine not implemented.")}}
catch(e){return fail(e)}}
