function at(o){let t=atob(o),e=t.length,n=new Uint8Array(e);for(let s=0;s<e;s++)n[s]=t.charCodeAt(s);return n}function $e(o){typeof o=="string"&&(o=new TextEncoder().encode(o));let t="",e=o.byteLength;for(let n=0;n<e;n++)t+=String.fromCharCode(o[n]);return btoa(t)}var Gn=new Uint8Array(16);var Ae=class{constructor(t="",e=1e3){this.prefix=t;this.maxCaptureSize=e;this.prefix=t,this.originalConsole={log:console.log.bind(console),info:console.info.bind(console),warn:console.warn.bind(console),error:console.error.bind(console),debug:console.debug.bind(console)},this.patchConsole()}originalConsole;logBuffer=[];patchConsole(){let t=e=>(...n)=>{let s=this.prefix?[this.prefix,...n]:n;this.originalConsole[e](...s),this.captureLog(e,n)};console.log=t("log"),console.info=t("info"),console.warn=t("warn"),console.error=t("error"),console.debug=t("debug")}captureLog(t,e){let n={level:t,timestamp:Date.now(),message:e.map(s=>{if(typeof s=="string")return s;try{return JSON.stringify(s)}catch{return String(s)}}).join(" ")};this.logBuffer.push(n),this.logBuffer.length>this.maxCaptureSize&&this.logBuffer.shift()}async postToServer(t,e){if(this.logBuffer.length>0){let s=[...this.logBuffer];this.logBuffer=[];try{if(!(await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(s.map(l=>({...l,source:e})))})).ok)throw new Error("Failed to post logs to server")}catch(r){console.warn("Could not post logs to server",r.message),this.logBuffer.unshift(...s)}}}},lt;function ct(o=""){return lt=new Ae(o),lt}var ce=o=>{throw new Error("Not initialized yet")},Te=typeof window>"u"&&typeof globalThis.WebSocketPair>"u",Be=new Map,Me=0;Te&&(globalThis.syscall=async(o,...t)=>await new Promise((e,n)=>{Me++,Be.set(Me,{resolve:e,reject:n}),ce({type:"sys",id:Me,name:o,args:t})}));function ft(o,t,e){Te&&(ce=e,self.addEventListener("message",n=>{(async()=>{let s=n.data;switch(s.type){case"inv":{let r=o[s.name];if(!r)throw new Error(`Function not loaded: ${s.name}`);try{let l=await Promise.resolve(r(...s.args||[]));ce({type:"invr",id:s.id,result:l})}catch(l){console.error("An exception was thrown as a result of invoking function",s.name,"error:",l.message),ce({type:"invr",id:s.id,error:l.message})}}break;case"sysr":{let r=s.id,l=Be.get(r);if(!l)throw Error("Invalid request id");Be.delete(r),s.error?l.reject(new Error(s.error)):l.resolve(s.result)}break}})().catch(console.error)}),ce({type:"manifest",manifest:t}),ct(`[${t.name} plug]`))}async function xn(o,t){if(typeof o!="string"){let e=new Uint8Array(await o.arrayBuffer()),n=e.length>0?$e(e):void 0;t={method:o.method,headers:Object.fromEntries(o.headers.entries()),base64Body:n},o=o.url}return syscall("sandboxFetch.fetch",o,t)}globalThis.nativeFetch=globalThis.fetch;function En(){globalThis.fetch=async(o,t)=>{let e=t?.body?$e(new Uint8Array(await new Response(t.body).arrayBuffer())):void 0,n=await xn(o,t&&{method:t.method,headers:t.headers,base64Body:e});return new Response(n.base64Body?at(n.base64Body):null,{status:n.status,headers:n.headers})}}Te&&En();function kn(o){return o!==null?{comment:o,variations:[]}:{variations:[]}}function Sn(o,t,e,n,s){let r={move:o,variations:s};return t&&(r.suffix=t),e&&(r.nag=e),n!==null&&(r.comment=n),r}function Cn(...o){let[t,...e]=o,n=t;for(let s of e)s!==null&&(n.variations=[s,...s.variations],s.variations=[],n=s);return t}function $n(o,t){if(t.marker&&t.marker.comment){let e=t.root;for(;;){let n=e.variations[0];if(!n){e.comment=t.marker.comment;break}e=n}}return{headers:o,root:t.root,result:(t.marker&&t.marker.result)??void 0}}function An(o,t){function e(){this.constructor=o}e.prototype=t.prototype,o.prototype=new e}function ie(o,t,e,n){var s=Error.call(this,o);return Object.setPrototypeOf&&Object.setPrototypeOf(s,ie.prototype),s.expected=t,s.found=e,s.location=n,s.name="SyntaxError",s}An(ie,Error);function Pe(o,t,e){return e=e||" ",o.length>t?o:(t-=o.length,e+=e.repeat(t),o+e.slice(0,t))}ie.prototype.format=function(o){var t="Error: "+this.message;if(this.location){var e=null,n;for(n=0;n<o.length;n++)if(o[n].source===this.location.source){e=o[n].text.split(/\r\n|\n|\r/g);break}var s=this.location.start,r=this.location.source&&typeof this.location.source.offset=="function"?this.location.source.offset(s):s,l=this.location.source+":"+r.line+":"+r.column;if(e){var h=this.location.end,u=Pe("",r.line.toString().length," "),g=e[s.line-1],p=s.line===h.line?h.column:g.length+1,b=p-s.column||1;t+=`
 --> `+l+`
`+u+` |
`+r.line+" | "+g+`
`+u+" | "+Pe("",s.column-1," ")+Pe("",b,"^")}else t+=`
 at `+l}return t};ie.buildMessage=function(o,t){var e={literal:function(g){return'"'+s(g.text)+'"'},class:function(g){var p=g.parts.map(function(b){return Array.isArray(b)?r(b[0])+"-"+r(b[1]):r(b)});return"["+(g.inverted?"^":"")+p.join("")+"]"},any:function(){return"any character"},end:function(){return"end of input"},other:function(g){return g.description}};function n(g){return g.charCodeAt(0).toString(16).toUpperCase()}function s(g){return g.replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\0/g,"\\0").replace(/\t/g,"\\t").replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/[\x00-\x0F]/g,function(p){return"\\x0"+n(p)}).replace(/[\x10-\x1F\x7F-\x9F]/g,function(p){return"\\x"+n(p)})}function r(g){return g.replace(/\\/g,"\\\\").replace(/\]/g,"\\]").replace(/\^/g,"\\^").replace(/-/g,"\\-").replace(/\0/g,"\\0").replace(/\t/g,"\\t").replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/[\x00-\x0F]/g,function(p){return"\\x0"+n(p)}).replace(/[\x10-\x1F\x7F-\x9F]/g,function(p){return"\\x"+n(p)})}function l(g){return e[g.type](g)}function h(g){var p=g.map(l),b,d;if(p.sort(),p.length>0){for(b=1,d=1;b<p.length;b++)p[b-1]!==p[b]&&(p[d]=p[b],d++);p.length=d}switch(p.length){case 1:return p[0];case 2:return p[0]+" or "+p[1];default:return p.slice(0,-1).join(", ")+", or "+p[p.length-1]}}function u(g){return g?'"'+s(g)+'"':"end of input"}return"Expected "+h(o)+" but "+u(t)+" found."};function Mn(o,t){t=t!==void 0?t:{};var e={},n=t.grammarSource,s={pgn:tt},r=tt,l="[",h='"',u="]",g=".",p="O-O-O",b="O-O",d="0-0-0",v="0-0",w="$",S="{",$="}",I=";",oe="(",ee=")",ue="1-0",Q="0-1",W="1/2-1/2",ke="*",R=/^[a-zA-Z]/,D=/^[^"]/,te=/^[0-9]/,pe=/^[.]/,ae=/^[a-zA-Z1-8\-=]/,O=/^[+#]/,ne=/^[!?]/,J=/^[^}]/,Ue=/^[^\r\n]/,We=/^[ \t\r\n]/,xt=z("tag pair"),Et=B("[",!1),He=B('"',!1),kt=B("]",!1),St=z("tag name"),Se=U([["a","z"],["A","Z"]],!1,!1),Ct=z("tag value"),je=U(['"'],!0,!1),$t=z("move number"),ge=U([["0","9"]],!1,!1),At=B(".",!1),Ge=U(["."],!1,!1),Mt=z("standard algebraic notation"),Bt=B("O-O-O",!1),Tt=B("O-O",!1),Pt=B("0-0-0",!1),It=B("0-0",!1),Ve=U([["a","z"],["A","Z"],["1","8"],"-","="],!1,!1),qt=U(["+","#"],!1,!1),Lt=z("suffix annotation"),Qe=U(["!","?"],!1,!1),Nt=z("NAG"),Ft=B("$",!1),Rt=z("brace comment"),Ot=B("{",!1),Je=U(["}"],!0,!1),zt=B("}",!1),Kt=z("rest of line comment"),Dt=B(";",!1),Ye=U(["\r",`
`],!0,!1),Ut=z("variation"),Wt=B("(",!1),Ht=B(")",!1),jt=z("game termination marker"),Gt=B("1-0",!1),Vt=B("0-1",!1),Qt=B("1/2-1/2",!1),Jt=B("*",!1),Yt=z("whitespace"),Ze=U([" ","	","\r",`
`],!1,!1),Zt=function(i,c){return $n(i,c)},Xt=function(i){return Object.fromEntries(i)},en=function(i,c){return[i,c]},tn=function(i,c){return{root:i,marker:c}},nn=function(i,c){return Cn(kn(i),...c.flat())},sn=function(i,c,f,y,x){return Sn(i,c,f,y,x)},rn=function(i){return i},on=function(i){return i.replace(/[\r\n]+/g," ")},an=function(i){return i.trim()},ln=function(i){return i},cn=function(i,c){return{result:i,comment:c}},a=t.peg$currPos|0,se=[{line:1,column:1}],K=a,me=t.peg$maxFailExpected||[],m=t.peg$silentFails|0,le;if(t.startRule){if(!(t.startRule in s))throw new Error(`Can't start parsing from rule "`+t.startRule+'".');r=s[t.startRule]}function B(i,c){return{type:"literal",text:i,ignoreCase:c}}function U(i,c,f){return{type:"class",parts:i,inverted:c,ignoreCase:f}}function fn(){return{type:"end"}}function z(i){return{type:"other",description:i}}function Xe(i){var c=se[i],f;if(c)return c;if(i>=se.length)f=se.length-1;else for(f=i;!se[--f];);for(c=se[f],c={line:c.line,column:c.column};f<i;)o.charCodeAt(f)===10?(c.line++,c.column=1):c.column++,f++;return se[i]=c,c}function et(i,c,f){var y=Xe(i),x=Xe(c),C={source:n,start:{offset:i,line:y.line,column:y.column},end:{offset:c,line:x.line,column:x.column}};return C}function _(i){a<K||(a>K&&(K=a,me=[]),me.push(i))}function hn(i,c,f){return new ie(ie.buildMessage(i,c),i,c,f)}function tt(){var i,c,f;return i=a,c=dn(),f=gn(),i=Zt(c,f),i}function dn(){var i,c,f;for(i=a,c=[],f=nt();f!==e;)c.push(f),f=nt();return f=L(),i=Xt(c),i}function nt(){var i,c,f,y,x,C,Y;return m++,i=a,L(),o.charCodeAt(a)===91?(c=l,a++):(c=e,m===0&&_(Et)),c!==e?(L(),f=un(),f!==e?(L(),o.charCodeAt(a)===34?(y=h,a++):(y=e,m===0&&_(He)),y!==e?(x=pn(),o.charCodeAt(a)===34?(C=h,a++):(C=e,m===0&&_(He)),C!==e?(L(),o.charCodeAt(a)===93?(Y=u,a++):(Y=e,m===0&&_(kt)),Y!==e?i=en(f,x):(a=i,i=e)):(a=i,i=e)):(a=i,i=e)):(a=i,i=e)):(a=i,i=e),m--,i===e&&m===0&&_(xt),i}function un(){var i,c,f;if(m++,i=a,c=[],f=o.charAt(a),R.test(f)?a++:(f=e,m===0&&_(Se)),f!==e)for(;f!==e;)c.push(f),f=o.charAt(a),R.test(f)?a++:(f=e,m===0&&_(Se));else c=e;return c!==e?i=o.substring(i,a):i=c,m--,i===e&&(c=e,m===0&&_(St)),i}function pn(){var i,c,f;for(m++,i=a,c=[],f=o.charAt(a),D.test(f)?a++:(f=e,m===0&&_(je));f!==e;)c.push(f),f=o.charAt(a),D.test(f)?a++:(f=e,m===0&&_(je));return i=o.substring(i,a),m--,c=e,m===0&&_(Ct),i}function gn(){var i,c,f;return i=a,c=st(),L(),f=wn(),f===e&&(f=null),L(),i=tn(c,f),i}function st(){var i,c,f,y;for(i=a,c=Ce(),c===e&&(c=null),f=[],y=rt();y!==e;)f.push(y),y=rt();return i=nn(c,f),i}function rt(){var i,c,f,y,x,C,Y,ve;if(i=a,L(),mn(),L(),c=vn(),c!==e){for(f=bn(),f===e&&(f=null),y=[],x=it();x!==e;)y.push(x),x=it();for(x=L(),C=Ce(),C===e&&(C=null),Y=[],ve=ot();ve!==e;)Y.push(ve),ve=ot();i=sn(c,f,y,C,Y)}else a=i,i=e;return i}function mn(){var i,c,f,y,x,C;for(m++,i=a,c=[],f=o.charAt(a),te.test(f)?a++:(f=e,m===0&&_(ge));f!==e;)c.push(f),f=o.charAt(a),te.test(f)?a++:(f=e,m===0&&_(ge));if(o.charCodeAt(a)===46?(f=g,a++):(f=e,m===0&&_(At)),f!==e){for(y=L(),x=[],C=o.charAt(a),pe.test(C)?a++:(C=e,m===0&&_(Ge));C!==e;)x.push(C),C=o.charAt(a),pe.test(C)?a++:(C=e,m===0&&_(Ge));c=[c,f,y,x],i=c}else a=i,i=e;return m--,i===e&&(c=e,m===0&&_($t)),i}function vn(){var i,c,f,y,x,C;if(m++,i=a,c=a,o.substr(a,5)===p?(f=p,a+=5):(f=e,m===0&&_(Bt)),f===e&&(o.substr(a,3)===b?(f=b,a+=3):(f=e,m===0&&_(Tt)),f===e&&(o.substr(a,5)===d?(f=d,a+=5):(f=e,m===0&&_(Pt)),f===e&&(o.substr(a,3)===v?(f=v,a+=3):(f=e,m===0&&_(It)),f===e))))if(f=a,y=o.charAt(a),R.test(y)?a++:(y=e,m===0&&_(Se)),y!==e){if(x=[],C=o.charAt(a),ae.test(C)?a++:(C=e,m===0&&_(Ve)),C!==e)for(;C!==e;)x.push(C),C=o.charAt(a),ae.test(C)?a++:(C=e,m===0&&_(Ve));else x=e;x!==e?(y=[y,x],f=y):(a=f,f=e)}else a=f,f=e;return f!==e?(y=o.charAt(a),O.test(y)?a++:(y=e,m===0&&_(qt)),y===e&&(y=null),f=[f,y],c=f):(a=c,c=e),c!==e?i=o.substring(i,a):i=c,m--,i===e&&(c=e,m===0&&_(Mt)),i}function bn(){var i,c,f;for(m++,i=a,c=[],f=o.charAt(a),ne.test(f)?a++:(f=e,m===0&&_(Qe));f!==e;)c.push(f),c.length>=2?f=e:(f=o.charAt(a),ne.test(f)?a++:(f=e,m===0&&_(Qe)));return c.length<1?(a=i,i=e):i=c,m--,i===e&&(c=e,m===0&&_(Lt)),i}function it(){var i,c,f,y,x;if(m++,i=a,L(),o.charCodeAt(a)===36?(c=w,a++):(c=e,m===0&&_(Ft)),c!==e){if(f=a,y=[],x=o.charAt(a),te.test(x)?a++:(x=e,m===0&&_(ge)),x!==e)for(;x!==e;)y.push(x),x=o.charAt(a),te.test(x)?a++:(x=e,m===0&&_(ge));else y=e;y!==e?f=o.substring(f,a):f=y,f!==e?i=rn(f):(a=i,i=e)}else a=i,i=e;return m--,i===e&&m===0&&_(Nt),i}function Ce(){var i;return i=_n(),i===e&&(i=yn()),i}function _n(){var i,c,f,y,x;if(m++,i=a,o.charCodeAt(a)===123?(c=S,a++):(c=e,m===0&&_(Ot)),c!==e){for(f=a,y=[],x=o.charAt(a),J.test(x)?a++:(x=e,m===0&&_(Je));x!==e;)y.push(x),x=o.charAt(a),J.test(x)?a++:(x=e,m===0&&_(Je));f=o.substring(f,a),o.charCodeAt(a)===125?(y=$,a++):(y=e,m===0&&_(zt)),y!==e?i=on(f):(a=i,i=e)}else a=i,i=e;return m--,i===e&&(c=e,m===0&&_(Rt)),i}function yn(){var i,c,f,y,x;if(m++,i=a,o.charCodeAt(a)===59?(c=I,a++):(c=e,m===0&&_(Dt)),c!==e){for(f=a,y=[],x=o.charAt(a),Ue.test(x)?a++:(x=e,m===0&&_(Ye));x!==e;)y.push(x),x=o.charAt(a),Ue.test(x)?a++:(x=e,m===0&&_(Ye));f=o.substring(f,a),i=an(f)}else a=i,i=e;return m--,i===e&&(c=e,m===0&&_(Kt)),i}function ot(){var i,c,f,y;return m++,i=a,L(),o.charCodeAt(a)===40?(c=oe,a++):(c=e,m===0&&_(Wt)),c!==e?(f=st(),f!==e?(L(),o.charCodeAt(a)===41?(y=ee,a++):(y=e,m===0&&_(Ht)),y!==e?i=ln(f):(a=i,i=e)):(a=i,i=e)):(a=i,i=e),m--,i===e&&m===0&&_(Ut),i}function wn(){var i,c,f;return m++,i=a,o.substr(a,3)===ue?(c=ue,a+=3):(c=e,m===0&&_(Gt)),c===e&&(o.substr(a,3)===Q?(c=Q,a+=3):(c=e,m===0&&_(Vt)),c===e&&(o.substr(a,7)===W?(c=W,a+=7):(c=e,m===0&&_(Qt)),c===e&&(o.charCodeAt(a)===42?(c=ke,a++):(c=e,m===0&&_(Jt))))),c!==e?(L(),f=Ce(),f===e&&(f=null),i=cn(c,f)):(a=i,i=e),m--,i===e&&(c=e,m===0&&_(jt)),i}function L(){var i,c;for(m++,i=[],c=o.charAt(a),We.test(c)?a++:(c=e,m===0&&_(Ze));c!==e;)i.push(c),c=o.charAt(a),We.test(c)?a++:(c=e,m===0&&_(Ze));return m--,c=e,m===0&&_(Yt),i}if(le=r(),t.peg$library)return{peg$result:le,peg$currPos:a,peg$FAILED:e,peg$maxFailExpected:me,peg$maxFailPos:K};if(le!==e&&a===o.length)return le;throw le!==e&&a<o.length&&_(fn()),hn(me,K<o.length?o.charAt(K):null,K<o.length?et(K,K+1):et(K,K))}var _e=0xffffffffffffffffn;function Ie(o,t){return(o<<t|o>>64n-t)&0xffffffffffffffffn}function ht(o,t){return o*t&_e}function Bn(o){return function(){let t=BigInt(o&_e),e=BigInt(o>>64n&_e),n=ht(Ie(ht(t,5n),7n),9n);return e^=t,t=(Ie(t,24n)^e^e<<16n)&_e,e=Ie(e,37n),o=e<<64n|t,n}}var we=Bn(0xa187eb39cdcaed8f31c4b365b102e01en),Tn=Array.from({length:2},()=>Array.from({length:6},()=>Array.from({length:128},()=>we()))),Pn=Array.from({length:8},()=>we()),In=Array.from({length:16},()=>we()),qe=we(),q="w",F="b",A="p",Oe="n",ye="b",he="r",V="q",M="k",Le="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",re=class{color;from;to;piece;captured;promotion;flags;san;lan;before;after;constructor(t,e){let{color:n,piece:s,from:r,to:l,flags:h,captured:u,promotion:g}=e,p=T(r),b=T(l);this.color=n,this.piece=s,this.from=p,this.to=b,this.san=t._moveToSan(e,t._moves({legal:!0})),this.lan=p+b,this.before=t.fen(),t._makeMove(e),this.after=t.fen(),t._undoMove(),this.flags="";for(let d in k)k[d]&h&&(this.flags+=Z[d]);u&&(this.captured=u),g&&(this.promotion=g,this.lan+=g)}isCapture(){return this.flags.indexOf(Z.CAPTURE)>-1}isPromotion(){return this.flags.indexOf(Z.PROMOTION)>-1}isEnPassant(){return this.flags.indexOf(Z.EP_CAPTURE)>-1}isKingsideCastle(){return this.flags.indexOf(Z.KSIDE_CASTLE)>-1}isQueensideCastle(){return this.flags.indexOf(Z.QSIDE_CASTLE)>-1}isBigPawn(){return this.flags.indexOf(Z.BIG_PAWN)>-1}},P=-1,Z={NORMAL:"n",CAPTURE:"c",BIG_PAWN:"b",EP_CAPTURE:"e",PROMOTION:"p",KSIDE_CASTLE:"k",QSIDE_CASTLE:"q",NULL_MOVE:"-"};var k={NORMAL:1,CAPTURE:2,BIG_PAWN:4,EP_CAPTURE:8,PROMOTION:16,KSIDE_CASTLE:32,QSIDE_CASTLE:64,NULL_MOVE:128},ze={Event:"?",Site:"?",Date:"????.??.??",Round:"?",White:"?",Black:"?",Result:"*"},qn={WhiteTitle:null,BlackTitle:null,WhiteElo:null,BlackElo:null,WhiteUSCF:null,BlackUSCF:null,WhiteNA:null,BlackNA:null,WhiteType:null,BlackType:null,EventDate:null,EventSponsor:null,Section:null,Stage:null,Board:null,Opening:null,Variation:null,SubVariation:null,ECO:null,NIC:null,Time:null,UTCTime:null,UTCDate:null,TimeControl:null,SetUp:null,FEN:null,Termination:null,Annotator:null,Mode:null,PlyCount:null},Ln={...ze,...qn},E={a8:0,b8:1,c8:2,d8:3,e8:4,f8:5,g8:6,h8:7,a7:16,b7:17,c7:18,d7:19,e7:20,f7:21,g7:22,h7:23,a6:32,b6:33,c6:34,d6:35,e6:36,f6:37,g6:38,h6:39,a5:48,b5:49,c5:50,d5:51,e5:52,f5:53,g5:54,h5:55,a4:64,b4:65,c4:66,d4:67,e4:68,f4:69,g4:70,h4:71,a3:80,b3:81,c3:82,d3:83,e3:84,f3:85,g3:86,h3:87,a2:96,b2:97,c2:98,d2:99,e2:100,f2:101,g2:102,h2:103,a1:112,b1:113,c1:114,d1:115,e1:116,f1:117,g1:118,h1:119},Ne={b:[16,32,17,15],w:[-16,-32,-17,-15]},dt={n:[-18,-33,-31,-14,18,33,31,14],b:[-17,-15,17,15],r:[-16,1,16,-1],q:[-17,-16,-15,1,17,16,15,-1],k:[-17,-16,-15,1,17,16,15,-1]},Nn=[20,0,0,0,0,0,0,24,0,0,0,0,0,0,20,0,0,20,0,0,0,0,0,24,0,0,0,0,0,20,0,0,0,0,20,0,0,0,0,24,0,0,0,0,20,0,0,0,0,0,0,20,0,0,0,24,0,0,0,20,0,0,0,0,0,0,0,0,20,0,0,24,0,0,20,0,0,0,0,0,0,0,0,0,0,20,2,24,2,20,0,0,0,0,0,0,0,0,0,0,0,2,53,56,53,2,0,0,0,0,0,0,24,24,24,24,24,24,56,0,56,24,24,24,24,24,24,0,0,0,0,0,0,2,53,56,53,2,0,0,0,0,0,0,0,0,0,0,0,20,2,24,2,20,0,0,0,0,0,0,0,0,0,0,20,0,0,24,0,0,20,0,0,0,0,0,0,0,0,20,0,0,0,24,0,0,0,20,0,0,0,0,0,0,20,0,0,0,0,24,0,0,0,0,20,0,0,0,0,20,0,0,0,0,0,24,0,0,0,0,0,20,0,0,20,0,0,0,0,0,0,24,0,0,0,0,0,0,20],Fn=[17,0,0,0,0,0,0,16,0,0,0,0,0,0,15,0,0,17,0,0,0,0,0,16,0,0,0,0,0,15,0,0,0,0,17,0,0,0,0,16,0,0,0,0,15,0,0,0,0,0,0,17,0,0,0,16,0,0,0,15,0,0,0,0,0,0,0,0,17,0,0,16,0,0,15,0,0,0,0,0,0,0,0,0,0,17,0,16,0,15,0,0,0,0,0,0,0,0,0,0,0,0,17,16,15,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,-1,-1,-1,-1,-1,-1,-1,0,0,0,0,0,0,0,-15,-16,-17,0,0,0,0,0,0,0,0,0,0,0,0,-15,0,-16,0,-17,0,0,0,0,0,0,0,0,0,0,-15,0,0,-16,0,0,-17,0,0,0,0,0,0,0,0,-15,0,0,0,-16,0,0,0,-17,0,0,0,0,0,0,-15,0,0,0,0,-16,0,0,0,0,-17,0,0,0,0,-15,0,0,0,0,0,-16,0,0,0,0,0,-17,0,0,-15,0,0,0,0,0,0,-16,0,0,0,0,0,0,-17],Rn={p:1,n:2,b:4,r:8,q:16,k:32},On="pnbrqkPNBRQK",ut=[Oe,ye,he,V],zn=7,Kn=6,Dn=1,Un=0,be={[M]:k.KSIDE_CASTLE,[V]:k.QSIDE_CASTLE},j={w:[{square:E.a1,flag:k.QSIDE_CASTLE},{square:E.h1,flag:k.KSIDE_CASTLE}],b:[{square:E.a8,flag:k.QSIDE_CASTLE},{square:E.h8,flag:k.KSIDE_CASTLE}]},Wn={b:Dn,w:Kn},Fe="--";function X(o){return o>>4}function de(o){return o&15}function gt(o){return"0123456789".indexOf(o)!==-1}function T(o){let t=de(o),e=X(o);return"abcdefgh".substring(t,t+1)+"87654321".substring(e,e+1)}function fe(o){return o===q?F:q}function Hn(o){let t=o.split(/\s+/);if(t.length!==6)return{ok:!1,error:"Invalid FEN: must contain six space-delimited fields"};let e=parseInt(t[5],10);if(isNaN(e)||e<=0)return{ok:!1,error:"Invalid FEN: move number must be a positive integer"};let n=parseInt(t[4],10);if(isNaN(n)||n<0)return{ok:!1,error:"Invalid FEN: half move counter number must be a non-negative integer"};if(!/^(-|[abcdefgh][36])$/.test(t[3]))return{ok:!1,error:"Invalid FEN: en-passant square is invalid"};if(/[^kKqQ-]/.test(t[2]))return{ok:!1,error:"Invalid FEN: castling availability is invalid"};if(!/^(w|b)$/.test(t[1]))return{ok:!1,error:"Invalid FEN: side-to-move is invalid"};let s=t[0].split("/");if(s.length!==8)return{ok:!1,error:"Invalid FEN: piece data does not contain 8 '/'-delimited rows"};for(let l=0;l<s.length;l++){let h=0,u=!1;for(let g=0;g<s[l].length;g++)if(gt(s[l][g])){if(u)return{ok:!1,error:"Invalid FEN: piece data is invalid (consecutive number)"};h+=parseInt(s[l][g],10),u=!0}else{if(!/^[prnbqkPRNBQK]$/.test(s[l][g]))return{ok:!1,error:"Invalid FEN: piece data is invalid (invalid piece)"};h+=1,u=!1}if(h!==8)return{ok:!1,error:"Invalid FEN: piece data is invalid (too many squares in rank)"}}if(t[3][1]=="3"&&t[1]=="w"||t[3][1]=="6"&&t[1]=="b")return{ok:!1,error:"Invalid FEN: illegal en-passant square"};let r=[{color:"white",regex:/K/g},{color:"black",regex:/k/g}];for(let{color:l,regex:h}of r){if(!h.test(t[0]))return{ok:!1,error:`Invalid FEN: missing ${l} king`};if((t[0].match(h)||[]).length>1)return{ok:!1,error:`Invalid FEN: too many ${l} kings`}}return Array.from(s[0]+s[7]).some(l=>l.toUpperCase()==="P")?{ok:!1,error:"Invalid FEN: some pawns are on the edge rows"}:{ok:!0}}function jn(o,t){let e=o.from,n=o.to,s=o.piece,r=0,l=0,h=0;for(let u=0,g=t.length;u<g;u++){let p=t[u].from,b=t[u].to,d=t[u].piece;s===d&&e!==p&&n===b&&(r++,X(e)===X(p)&&l++,de(e)===de(p)&&h++)}return r>0?l>0&&h>0?T(e):h>0?T(e).charAt(1):T(e).charAt(0):""}function G(o,t,e,n,s,r=void 0,l=k.NORMAL){let h=X(n);if(s===A&&(h===zn||h===Un))for(let u=0;u<ut.length;u++){let g=ut[u];o.push({color:t,from:e,to:n,piece:s,captured:r,promotion:g,flags:l|k.PROMOTION})}else o.push({color:t,from:e,to:n,piece:s,captured:r,flags:l})}function pt(o){let t=o.charAt(0);return t>="a"&&t<="h"?o.match(/[a-h]\d.*[a-h]\d/)?void 0:A:(t=t.toLowerCase(),t==="o"?M:t)}function Re(o){return o.replace(/=/,"").replace(/[+#]?[?!]*$/,"")}var H=class{_board=new Array(128);_turn=q;_header={};_kings={w:P,b:P};_epSquare=-1;_halfMoves=0;_moveNumber=0;_history=[];_comments={};_castling={w:0,b:0};_hash=0n;_positionCount=new Map;constructor(t=Le,{skipValidation:e=!1}={}){this.load(t,{skipValidation:e})}clear({preserveHeaders:t=!1}={}){this._board=new Array(128),this._kings={w:P,b:P},this._turn=q,this._castling={w:0,b:0},this._epSquare=P,this._halfMoves=0,this._moveNumber=1,this._history=[],this._comments={},this._header=t?this._header:{...Ln},this._hash=this._computeHash(),this._positionCount=new Map,this._header.SetUp=null,this._header.FEN=null}load(t,{skipValidation:e=!1,preserveHeaders:n=!1}={}){let s=t.split(/\s+/);if(s.length>=2&&s.length<6){let h=["-","-","0","1"];t=s.concat(h.slice(-(6-s.length))).join(" ")}if(s=t.split(/\s+/),!e){let{ok:h,error:u}=Hn(t);if(!h)throw new Error(u)}let r=s[0],l=0;this.clear({preserveHeaders:n});for(let h=0;h<r.length;h++){let u=r.charAt(h);if(u==="/")l+=8;else if(gt(u))l+=parseInt(u,10);else{let g=u<"a"?q:F;this._put({type:u.toLowerCase(),color:g},T(l)),l++}}this._turn=s[1],s[2].indexOf("K")>-1&&(this._castling.w|=k.KSIDE_CASTLE),s[2].indexOf("Q")>-1&&(this._castling.w|=k.QSIDE_CASTLE),s[2].indexOf("k")>-1&&(this._castling.b|=k.KSIDE_CASTLE),s[2].indexOf("q")>-1&&(this._castling.b|=k.QSIDE_CASTLE),this._epSquare=s[3]==="-"?P:E[s[3]],this._halfMoves=parseInt(s[4],10),this._moveNumber=parseInt(s[5],10),this._hash=this._computeHash(),this._updateSetup(t),this._incPositionCount()}fen({forceEnpassantSquare:t=!1}={}){let e=0,n="";for(let l=E.a8;l<=E.h1;l++){if(this._board[l]){e>0&&(n+=e,e=0);let{color:h,type:u}=this._board[l];n+=h===q?u.toUpperCase():u.toLowerCase()}else e++;l+1&136&&(e>0&&(n+=e),l!==E.h1&&(n+="/"),e=0,l+=8)}let s="";this._castling[q]&k.KSIDE_CASTLE&&(s+="K"),this._castling[q]&k.QSIDE_CASTLE&&(s+="Q"),this._castling[F]&k.KSIDE_CASTLE&&(s+="k"),this._castling[F]&k.QSIDE_CASTLE&&(s+="q"),s=s||"-";let r="-";if(this._epSquare!==P)if(t)r=T(this._epSquare);else{let l=this._epSquare+(this._turn===q?16:-16),h=[l+1,l-1];for(let u of h){if(u&136)continue;let g=this._turn;if(this._board[u]?.color===g&&this._board[u]?.type===A){this._makeMove({color:g,from:u,to:this._epSquare,piece:A,captured:A,flags:k.EP_CAPTURE});let p=!this._isKingAttacked(g);if(this._undoMove(),p){r=T(this._epSquare);break}}}}return[n,this._turn,s,r,this._halfMoves,this._moveNumber].join(" ")}_pieceKey(t){if(!this._board[t])return 0n;let{color:e,type:n}=this._board[t],s={w:0,b:1}[e],r={p:0,n:1,b:2,r:3,q:4,k:5}[n];return Tn[s][r][t]}_epKey(){return this._epSquare===P?0n:Pn[this._epSquare&7]}_castlingKey(){let t=this._castling.w>>5|this._castling.b>>3;return In[t]}_computeHash(){let t=0n;for(let e=E.a8;e<=E.h1;e++){if(e&136){e+=7;continue}this._board[e]&&(t^=this._pieceKey(e))}return t^=this._epKey(),t^=this._castlingKey(),this._turn==="b"&&(t^=qe),t}_updateSetup(t){this._history.length>0||(t!==Le?(this._header.SetUp="1",this._header.FEN=t):(this._header.SetUp=null,this._header.FEN=null))}reset(){this.load(Le)}get(t){return this._board[E[t]]}findPiece(t){let e=[];for(let n=E.a8;n<=E.h1;n++){if(n&136){n+=7;continue}!this._board[n]||this._board[n]?.color!==t.color||this._board[n].color===t.color&&this._board[n].type===t.type&&e.push(T(n))}return e}put({type:t,color:e},n){return this._put({type:t,color:e},n)?(this._updateCastlingRights(),this._updateEnPassantSquare(),this._updateSetup(this.fen()),!0):!1}_set(t,e){this._hash^=this._pieceKey(t),this._board[t]=e,this._hash^=this._pieceKey(t)}_put({type:t,color:e},n){if(On.indexOf(t.toLowerCase())===-1||!(n in E))return!1;let s=E[n];if(t==M&&!(this._kings[e]==P||this._kings[e]==s))return!1;let r=this._board[s];return r&&r.type===M&&(this._kings[r.color]=P),this._set(s,{type:t,color:e}),t===M&&(this._kings[e]=s),!0}_clear(t){this._hash^=this._pieceKey(t),delete this._board[t]}remove(t){let e=this.get(t);return this._clear(E[t]),e&&e.type===M&&(this._kings[e.color]=P),this._updateCastlingRights(),this._updateEnPassantSquare(),this._updateSetup(this.fen()),e}_updateCastlingRights(){this._hash^=this._castlingKey();let t=this._board[E.e1]?.type===M&&this._board[E.e1]?.color===q,e=this._board[E.e8]?.type===M&&this._board[E.e8]?.color===F;(!t||this._board[E.a1]?.type!==he||this._board[E.a1]?.color!==q)&&(this._castling.w&=-65),(!t||this._board[E.h1]?.type!==he||this._board[E.h1]?.color!==q)&&(this._castling.w&=-33),(!e||this._board[E.a8]?.type!==he||this._board[E.a8]?.color!==F)&&(this._castling.b&=-65),(!e||this._board[E.h8]?.type!==he||this._board[E.h8]?.color!==F)&&(this._castling.b&=-33),this._hash^=this._castlingKey()}_updateEnPassantSquare(){if(this._epSquare===P)return;let t=this._epSquare+(this._turn===q?-16:16),e=this._epSquare+(this._turn===q?16:-16),n=[e+1,e-1];if(this._board[t]!==null||this._board[this._epSquare]!==null||this._board[e]?.color!==fe(this._turn)||this._board[e]?.type!==A){this._hash^=this._epKey(),this._epSquare=P;return}let s=r=>!(r&136)&&this._board[r]?.color===this._turn&&this._board[r]?.type===A;n.some(s)||(this._hash^=this._epKey(),this._epSquare=P)}_attacked(t,e,n){let s=[];for(let r=E.a8;r<=E.h1;r++){if(r&136){r+=7;continue}if(this._board[r]===void 0||this._board[r].color!==t)continue;let l=this._board[r],h=r-e;if(h===0)continue;let u=h+119;if(Nn[u]&Rn[l.type]){if(l.type===A){if(h>0&&l.color===q||h<=0&&l.color===F)if(n)s.push(T(r));else return!0;continue}if(l.type==="n"||l.type==="k")if(n){s.push(T(r));continue}else return!0;let g=Fn[u],p=r+g,b=!1;for(;p!==e;){if(this._board[p]!=null){b=!0;break}p+=g}if(!b)if(n){s.push(T(r));continue}else return!0}}return n?s:!1}attackers(t,e){return e?this._attacked(e,E[t],!0):this._attacked(this._turn,E[t],!0)}_isKingAttacked(t){let e=this._kings[t];return e===-1?!1:this._attacked(fe(t),e)}hash(){return this._hash.toString(16)}isAttacked(t,e){return this._attacked(e,E[t])}isCheck(){return this._isKingAttacked(this._turn)}inCheck(){return this.isCheck()}isCheckmate(){return this.isCheck()&&this._moves().length===0}isStalemate(){return!this.isCheck()&&this._moves().length===0}isInsufficientMaterial(){let t={b:0,n:0,r:0,q:0,k:0,p:0},e=[],n=0,s=0;for(let r=E.a8;r<=E.h1;r++){if(s=(s+1)%2,r&136){r+=7;continue}let l=this._board[r];l&&(t[l.type]=l.type in t?t[l.type]+1:1,l.type===ye&&e.push(s),n++)}if(n===2)return!0;if(n===3&&(t[ye]===1||t[Oe]===1))return!0;if(n===t[ye]+2){let r=0,l=e.length;for(let h=0;h<l;h++)r+=e[h];if(r===0||r===l)return!0}return!1}isThreefoldRepetition(){return this._getPositionCount(this._hash)>=3}isDrawByFiftyMoves(){return this._halfMoves>=100}isDraw(){return this.isDrawByFiftyMoves()||this.isStalemate()||this.isInsufficientMaterial()||this.isThreefoldRepetition()}isGameOver(){return this.isCheckmate()||this.isDraw()}moves({verbose:t=!1,square:e=void 0,piece:n=void 0}={}){let s=this._moves({square:e,piece:n});return t?s.map(r=>new re(this,r)):s.map(r=>this._moveToSan(r,s))}_moves({legal:t=!0,piece:e=void 0,square:n=void 0}={}){let s=n?n.toLowerCase():void 0,r=e?.toLowerCase(),l=[],h=this._turn,u=fe(h),g=E.a8,p=E.h1,b=!1;if(s)if(s in E)g=p=E[s],b=!0;else return[];for(let v=g;v<=p;v++){if(v&136){v+=7;continue}if(!this._board[v]||this._board[v].color===u)continue;let{type:w}=this._board[v],S;if(w===A){if(r&&r!==w)continue;S=v+Ne[h][0],this._board[S]||(G(l,h,v,S,A),S=v+Ne[h][1],Wn[h]===X(v)&&!this._board[S]&&G(l,h,v,S,A,void 0,k.BIG_PAWN));for(let $=2;$<4;$++)S=v+Ne[h][$],!(S&136)&&(this._board[S]?.color===u?G(l,h,v,S,A,this._board[S].type,k.CAPTURE):S===this._epSquare&&G(l,h,v,S,A,A,k.EP_CAPTURE))}else{if(r&&r!==w)continue;for(let $=0,I=dt[w].length;$<I;$++){let oe=dt[w][$];for(S=v;S+=oe,!(S&136);){if(!this._board[S])G(l,h,v,S,w);else{if(this._board[S].color===h)break;G(l,h,v,S,w,this._board[S].type,k.CAPTURE);break}if(w===Oe||w===M)break}}}}if((r===void 0||r===M)&&(!b||p===this._kings[h])){if(this._castling[h]&k.KSIDE_CASTLE){let v=this._kings[h],w=v+2;!this._board[v+1]&&!this._board[w]&&!this._attacked(u,this._kings[h])&&!this._attacked(u,v+1)&&!this._attacked(u,w)&&G(l,h,this._kings[h],w,M,void 0,k.KSIDE_CASTLE)}if(this._castling[h]&k.QSIDE_CASTLE){let v=this._kings[h],w=v-2;!this._board[v-1]&&!this._board[v-2]&&!this._board[v-3]&&!this._attacked(u,this._kings[h])&&!this._attacked(u,v-1)&&!this._attacked(u,w)&&G(l,h,this._kings[h],w,M,void 0,k.QSIDE_CASTLE)}}if(!t||this._kings[h]===-1)return l;let d=[];for(let v=0,w=l.length;v<w;v++)this._makeMove(l[v]),this._isKingAttacked(h)||d.push(l[v]),this._undoMove();return d}move(t,{strict:e=!1}={}){let n=null;if(typeof t=="string")n=this._moveFromSan(t,e);else if(t===null)n=this._moveFromSan(Fe,e);else if(typeof t=="object"){let r=this._moves();for(let l=0,h=r.length;l<h;l++)if(t.from===T(r[l].from)&&t.to===T(r[l].to)&&(!("promotion"in r[l])||t.promotion===r[l].promotion)){n=r[l];break}}if(!n)throw typeof t=="string"?new Error(`Invalid move: ${t}`):new Error(`Invalid move: ${JSON.stringify(t)}`);if(this.isCheck()&&n.flags&k.NULL_MOVE)throw new Error("Null move not allowed when in check");let s=new re(this,n);return this._makeMove(n),this._incPositionCount(),s}_push(t){this._history.push({move:t,kings:{b:this._kings.b,w:this._kings.w},turn:this._turn,castling:{b:this._castling.b,w:this._castling.w},epSquare:this._epSquare,halfMoves:this._halfMoves,moveNumber:this._moveNumber})}_movePiece(t,e){this._hash^=this._pieceKey(t),this._board[e]=this._board[t],delete this._board[t],this._hash^=this._pieceKey(e)}_makeMove(t){let e=this._turn,n=fe(e);if(this._push(t),t.flags&k.NULL_MOVE){e===F&&this._moveNumber++,this._halfMoves++,this._turn=n,this._epSquare=P;return}if(this._hash^=this._epKey(),this._hash^=this._castlingKey(),t.captured&&(this._hash^=this._pieceKey(t.to)),this._movePiece(t.from,t.to),t.flags&k.EP_CAPTURE&&(this._turn===F?this._clear(t.to-16):this._clear(t.to+16)),t.promotion&&(this._clear(t.to),this._set(t.to,{type:t.promotion,color:e})),this._board[t.to].type===M){if(this._kings[e]=t.to,t.flags&k.KSIDE_CASTLE){let s=t.to-1,r=t.to+1;this._movePiece(r,s)}else if(t.flags&k.QSIDE_CASTLE){let s=t.to+1,r=t.to-2;this._movePiece(r,s)}this._castling[e]=0}if(this._castling[e]){for(let s=0,r=j[e].length;s<r;s++)if(t.from===j[e][s].square&&this._castling[e]&j[e][s].flag){this._castling[e]^=j[e][s].flag;break}}if(this._castling[n]){for(let s=0,r=j[n].length;s<r;s++)if(t.to===j[n][s].square&&this._castling[n]&j[n][s].flag){this._castling[n]^=j[n][s].flag;break}}if(this._hash^=this._castlingKey(),t.flags&k.BIG_PAWN){let s;e===F?s=t.to-16:s=t.to+16,!(t.to-1&136)&&this._board[t.to-1]?.type===A&&this._board[t.to-1]?.color===n||!(t.to+1&136)&&this._board[t.to+1]?.type===A&&this._board[t.to+1]?.color===n?(this._epSquare=s,this._hash^=this._epKey()):this._epSquare=P}else this._epSquare=P;t.piece===A?this._halfMoves=0:t.flags&(k.CAPTURE|k.EP_CAPTURE)?this._halfMoves=0:this._halfMoves++,e===F&&this._moveNumber++,this._turn=n,this._hash^=qe}undo(){let t=this._hash,e=this._undoMove();if(e){let n=new re(this,e);return this._decPositionCount(t),n}return null}_undoMove(){let t=this._history.pop();if(t===void 0)return null;this._hash^=this._epKey(),this._hash^=this._castlingKey();let e=t.move;this._kings=t.kings,this._turn=t.turn,this._castling=t.castling,this._epSquare=t.epSquare,this._halfMoves=t.halfMoves,this._moveNumber=t.moveNumber,this._hash^=this._epKey(),this._hash^=this._castlingKey(),this._hash^=qe;let n=this._turn,s=fe(n);if(e.flags&k.NULL_MOVE)return e;if(this._movePiece(e.to,e.from),e.piece&&(this._clear(e.from),this._set(e.from,{type:e.piece,color:n})),e.captured)if(e.flags&k.EP_CAPTURE){let r;n===F?r=e.to-16:r=e.to+16,this._set(r,{type:A,color:s})}else this._set(e.to,{type:e.captured,color:s});if(e.flags&(k.KSIDE_CASTLE|k.QSIDE_CASTLE)){let r,l;e.flags&k.KSIDE_CASTLE?(r=e.to+1,l=e.to-1):(r=e.to-2,l=e.to+1),this._movePiece(l,r)}return e}pgn({newline:t=`
`,maxWidth:e=0}={}){let n=[],s=!1;for(let d in this._header)this._header[d]&&n.push(`[${d} "${this._header[d]}"]`+t),s=!0;s&&this._history.length&&n.push(t);let r=d=>{let v=this._comments[this.fen()];if(typeof v<"u"){let w=d.length>0?" ":"";d=`${d}${w}{${v}}`}return d},l=[];for(;this._history.length>0;)l.push(this._undoMove());let h=[],u="";for(l.length===0&&h.push(r(""));l.length>0;){u=r(u);let d=l.pop();if(!d)break;if(!this._history.length&&d.color==="b"){let v=`${this._moveNumber}. ...`;u=u?`${u} ${v}`:v}else d.color==="w"&&(u.length&&h.push(u),u=this._moveNumber+".");u=u+" "+this._moveToSan(d,this._moves({legal:!0})),this._makeMove(d)}if(u.length&&h.push(r(u)),h.push(this._header.Result||"*"),e===0)return n.join("")+h.join(" ");let g=function(){return n.length>0&&n[n.length-1]===" "?(n.pop(),!0):!1},p=function(d,v){for(let w of v.split(" "))if(w){if(d+w.length>e){for(;g();)d--;n.push(t),d=0}n.push(w),d+=w.length,n.push(" "),d++}return g()&&d--,d},b=0;for(let d=0;d<h.length;d++){if(b+h[d].length>e&&h[d].includes("{")){b=p(b,h[d]);continue}b+h[d].length>e&&d!==0?(n[n.length-1]===" "&&n.pop(),n.push(t),b=0):d!==0&&(n.push(" "),b++),n.push(h[d]),b+=h[d].length}return n.join("")}header(...t){for(let e=0;e<t.length;e+=2)typeof t[e]=="string"&&typeof t[e+1]=="string"&&(this._header[t[e]]=t[e+1]);return this._header}setHeader(t,e){return this._header[t]=e??ze[t]??null,this.getHeaders()}removeHeader(t){return t in this._header?(this._header[t]=ze[t]||null,!0):!1}getHeaders(){let t={};for(let[e,n]of Object.entries(this._header))n!==null&&(t[e]=n);return t}loadPgn(t,{strict:e=!1,newlineChar:n=`\r?
`}={}){n!==`\r?
`&&(t=t.replace(new RegExp(n,"g"),`
`));let s=Mn(t);this.reset();let r=s.headers,l="";for(let g in r)g.toLowerCase()==="fen"&&(l=r[g]),this.header(g,r[g]);if(!e)l&&this.load(l,{preserveHeaders:!0});else if(r.SetUp==="1"){if(!("FEN"in r))throw new Error("Invalid PGN: FEN tag must be supplied with SetUp tag");this.load(r.FEN,{preserveHeaders:!0})}let h=s.root;for(;h;){if(h.move){let g=this._moveFromSan(h.move,e);if(g==null)throw new Error(`Invalid move in PGN: ${h.move}`);this._makeMove(g),this._incPositionCount()}h.comment!==void 0&&(this._comments[this.fen()]=h.comment),h=h.variations[0]}let u=s.result;u&&Object.keys(this._header).length&&this._header.Result!==u&&this.setHeader("Result",u)}_moveToSan(t,e){let n="";if(t.flags&k.KSIDE_CASTLE)n="O-O";else if(t.flags&k.QSIDE_CASTLE)n="O-O-O";else{if(t.flags&k.NULL_MOVE)return Fe;if(t.piece!==A){let s=jn(t,e);n+=t.piece.toUpperCase()+s}t.flags&(k.CAPTURE|k.EP_CAPTURE)&&(t.piece===A&&(n+=T(t.from)[0]),n+="x"),n+=T(t.to),t.promotion&&(n+="="+t.promotion.toUpperCase())}return this._makeMove(t),this.isCheck()&&(this.isCheckmate()?n+="#":n+="+"),this._undoMove(),n}_moveFromSan(t,e=!1){let n=Re(t);if(e||(n==="0-0"?n="O-O":n==="0-0-0"&&(n="O-O-O")),n==Fe)return{color:this._turn,from:0,to:0,piece:"k",flags:k.NULL_MOVE};let s=pt(n),r=this._moves({legal:!0,piece:s});for(let d=0,v=r.length;d<v;d++)if(n===Re(this._moveToSan(r[d],r)))return r[d];if(e)return null;let l,h,u,g,p,b=!1;if(h=n.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/),h?(l=h[1],u=h[2],g=h[3],p=h[4],u.length==1&&(b=!0)):(h=n.match(/([pnbrqkPNBRQK])?([a-h]?[1-8]?)x?-?([a-h][1-8])([qrbnQRBN])?/),h&&(l=h[1],u=h[2],g=h[3],p=h[4],u.length==1&&(b=!0))),s=pt(n),r=this._moves({legal:!0,piece:l||s}),!g)return null;for(let d=0,v=r.length;d<v;d++)if(u){if((!l||l.toLowerCase()==r[d].piece)&&E[u]==r[d].from&&E[g]==r[d].to&&(!p||p.toLowerCase()==r[d].promotion))return r[d];if(b){let w=T(r[d].from);if((!l||l.toLowerCase()==r[d].piece)&&E[g]==r[d].to&&(u==w[0]||u==w[1])&&(!p||p.toLowerCase()==r[d].promotion))return r[d]}}else if(n===Re(this._moveToSan(r[d],r)).replace("x",""))return r[d];return null}ascii(){let t=`   +------------------------+
`;for(let e=E.a8;e<=E.h1;e++){if(de(e)===0&&(t+=" "+"87654321"[X(e)]+" |"),this._board[e]){let n=this._board[e].type,r=this._board[e].color===q?n.toUpperCase():n.toLowerCase();t+=" "+r+" "}else t+=" . ";e+1&136&&(t+=`|
`,e+=8)}return t+=`   +------------------------+
`,t+="     a  b  c  d  e  f  g  h",t}perft(t){let e=this._moves({legal:!1}),n=0,s=this._turn;for(let r=0,l=e.length;r<l;r++)this._makeMove(e[r]),this._isKingAttacked(s)||(t-1>0?n+=this.perft(t-1):n++),this._undoMove();return n}setTurn(t){return this._turn==t?!1:(this.move("--"),!0)}turn(){return this._turn}board(){let t=[],e=[];for(let n=E.a8;n<=E.h1;n++)this._board[n]==null?e.push(null):e.push({square:T(n),type:this._board[n].type,color:this._board[n].color}),n+1&136&&(t.push(e),e=[],n+=8);return t}squareColor(t){if(t in E){let e=E[t];return(X(e)+de(e))%2===0?"light":"dark"}return null}history({verbose:t=!1}={}){let e=[],n=[];for(;this._history.length>0;)e.push(this._undoMove());for(;;){let s=e.pop();if(!s)break;t?n.push(new re(this,s)):n.push(this._moveToSan(s,this._moves())),this._makeMove(s)}return n}_getPositionCount(t){return this._positionCount.get(t)??0}_incPositionCount(){this._positionCount.set(this._hash,(this._positionCount.get(this._hash)??0)+1)}_decPositionCount(t){let e=this._positionCount.get(t)??0;e===1?this._positionCount.delete(t):this._positionCount.set(t,e-1)}_pruneComments(){let t=[],e={},n=s=>{s in this._comments&&(e[s]=this._comments[s])};for(;this._history.length>0;)t.push(this._undoMove());for(n(this.fen());;){let s=t.pop();if(!s)break;this._makeMove(s),n(this.fen())}this._comments=e}getComment(){return this._comments[this.fen()]}setComment(t){this._comments[this.fen()]=t.replace("{","[").replace("}","]")}deleteComment(){return this.removeComment()}removeComment(){let t=this._comments[this.fen()];return delete this._comments[this.fen()],t}getComments(){return this._pruneComments(),Object.keys(this._comments).map(t=>({fen:t,comment:this._comments[t]}))}deleteComments(){return this.removeComments()}removeComments(){return this._pruneComments(),Object.keys(this._comments).map(t=>{let e=this._comments[t];return delete this._comments[t],{fen:t,comment:e}})}setCastlingRights(t,e){for(let s of[M,V])e[s]!==void 0&&(e[s]?this._castling[t]|=be[s]:this._castling[t]&=~be[s]);this._updateCastlingRights();let n=this.getCastlingRights(t);return(e[M]===void 0||e[M]===n[M])&&(e[V]===void 0||e[V]===n[V])}getCastlingRights(t){return{[M]:(this._castling[t]&be[M])!==0,[V]:(this._castling[t]&be[V])!==0}}moveNumber(){return this._moveNumber}};var xe={wK:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0-1.7-1.3-3-3-3s-3 1.3-3 3c-1.5 3 3 10.5 3 10.5" fill="#fff"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V23v-2c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7z" fill="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"/></g></svg>',wQ:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm17 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15L14 11v14l-7-11 2 12z" fill="#fff"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" fill="#fff"/><path d="M11 38.5a35 35 1 0 0 23 0" fill="none"/><path d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0"/></g></svg>',wR:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zm3-3v-4.5h21V36H12zm2-4.5V14l-2-2v-3h5v3h3V9h4v3h3V9h5v3l-2 2v17.5H14z" fill="#fff"/><path d="M14 29.5v-13h17v13H14z" fill="#fff"/><path d="M14 16.5h17m-17 13h17M11 14h23M9 36h27"/></g></svg>',wB:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#fff"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke-linejoin="miter"/><path d="M24.7 13.3c3.5 1 5.8 4.7 4.8 8.7-.5 2-1.8 3.6-3.5 4.5"/></g></svg>',wN:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.693 1.94-1.5 1.5-.807-.44-.457-1.74-.5-3 .1-1.5 1-2 2.5-3 2.5-1.5 6-1.5 9-5 2-2.5 2-3 3.5-3.5z" fill="#fff"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.5-11a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#000"/><path d="M24.55 10.4s-1.8 2.4-3.55 2.4c-1.75 0-3.5-2.4-3.5-2.4"/></g></svg>',wP:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><path d="M22.5 9c-2.76 0-5 2.24-5 5 0 1.65.8 3.11 2.04 4-3.04 1.25-5.04 4.25-5.04 8 0 1.13.27 2.2.75 3.16-1.43.49-2.45 1.82-2.45 3.34 0 1.06.51 2 1.31 2.59-.68.56-1.11 1.43-1.11 2.41 0 1.93 1.57 3.5 3.5 3.5h12c1.93 0 3.5-1.57 3.5-3.5 0-.98-.43-1.85-1.11-2.41.8-.59 1.31-1.53 1.31-2.59 0-1.52-1.02-2.85-2.45-3.34.48-.96.75-2.03.75-3.16 0-3.75-2-6.75-5.04-8 1.24-.89 2.04-2.35 2.04-4 0-2.76-2.24-5-5-5z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',bK:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0-1.7-1.3-3-3-3s-3 1.3-3 3c-1.5 3 3 10.5 3 10.5" fill="#262626"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V23v-2c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7z" fill="#262626"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="#fff"/></g></svg>',bQ:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm17 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" fill="#262626"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15L14 11v14l-7-11 2 12z" fill="#262626"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" fill="#262626"/><path d="M11 38.5a35 35 1 0 0 23 0" stroke="#fff" fill="none"/><path d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0" stroke="#fff"/></g></svg>',bR:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zm3-3v-4.5h21V36H12zm2-4.5V14l-2-2v-3h5v3h3V9h4v3h3V9h5v3l-2 2v17.5H14z" fill="#262626"/><path d="M14 29.5v-13h17v13H14z" fill="#262626"/><path d="M14 16.5h17m-17 13h17M11 14h23M9 36h27" stroke="#fff"/></g></svg>',bB:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#262626"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.46 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#fff" stroke-linejoin="miter"/><path d="M24.7 13.3c3.5 1 5.8 4.7 4.8 8.7-.5 2-1.8 3.6-3.5 4.5" stroke="#fff"/></g></svg>',bN:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#262626"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.693 1.94-1.5 1.5-.807-.44-.457-1.74-.5-3 .1-1.5 1-2 2.5-3 2.5-1.5 6-1.5 9-5 2-2.5 2-3 3.5-3.5z" fill="#262626"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.5-11a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="#fff"/><path d="M24.55 10.4s-1.8 2.4-3.55 2.4c-1.75 0-3.5-2.4-3.5-2.4" stroke="#fff"/></g></svg>',bP:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%"><path d="M22.5 9c-2.76 0-5 2.24-5 5 0 1.65.8 3.11 2.04 4-3.04 1.25-5.04 4.25-5.04 8 0 1.13.27 2.2.75 3.16-1.43.49-2.45 1.82-2.45 3.34 0 1.06.51 2 1.31 2.59-.68.56-1.11 1.43-1.11 2.41 0 1.93 1.57 3.5 3.5 3.5h12c1.93 0 3.5-1.57 3.5-3.5 0-.98-.43-1.85-1.11-2.41.8-.59 1.31-1.53 1.31-2.59 0-1.52-1.02-2.85-2.45-3.34.48-.96.75-2.03.75-3.16 0-3.75-2-6.75-5.04-8 1.24-.89 2.04-2.35 2.04-4 0-2.76-2.24-5-5-5z" fill="#262626" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'},Ee=`
:root {
  --sq-light: #f0d9b5;
  --sq-dark: #b58863;
  --sq-select: rgba(20, 85, 30, 0.5);
  --sq-highlight: rgba(255, 255, 0, 0.45);
  --sq-dest: rgba(20, 85, 30, 0.3);
  --board-border: #78350f;
  --bg-panel: var(--sidebar-background, #1e293b);
  --text-main: var(--text-color, #f1f5f9);
  --text-muted: #94a3b8;
  --btn-bg: #334155;
  --btn-hover: #475569;
  --btn-active: #2563eb;
  --accent: #38bdf8;
}

[data-theme="light"] {
  --sq-light: #f0d9b5;
  --sq-dark: #b58863;
  --bg-panel: #f8fafc;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --btn-bg: #e2e8f0;
  --btn-hover: #cbd5e1;
  --btn-active: #2563eb;
}

html, body {
  margin: 0;
  padding: 0;
  overflow: hidden !important;
  background: transparent;
}

* {
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.chessnote-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--bg-panel);
  color: var(--text-main);
  padding: 14px;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  max-width: 100%;
  margin: 0;
}

.chessnote-layout {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-start;
}

.chessnote-board-container {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: stretch;
}

/* Evaluation Bar */
.chess-eval-bar-wrapper {
  width: 22px;
  height: 360px;
  background: #262626;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  flex-direction: column-reverse;
  position: relative;
  border: 1px solid rgba(148, 163, 184, 0.3);
}

.chess-eval-bar-fill {
  background: #ffffff;
  width: 100%;
  height: 50%;
  transition: height 0.3s ease-out;
}

.chess-eval-bar-text {
  position: absolute;
  top: 4px;
  left: 0;
  right: 0;
  font-size: 10px;
  font-weight: 800;
  text-align: center;
  color: #0f172a;
  z-index: 5;
  pointer-events: none;
}

.chessnote-board-wrapper {
  position: relative;
  width: 360px;
  height: 360px;
  flex-shrink: 0;
  user-select: none;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.chess-board {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  width: 100%;
  height: 100%;
  position: relative;
}

.chess-sq {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.chess-sq.light { background-color: var(--sq-light); }
.chess-sq.dark { background-color: var(--sq-dark); }
.chess-sq.selected { background-color: var(--sq-select) !important; }
.chess-sq.highlight { background-color: var(--sq-highlight) !important; }

.chess-sq.dest::after {
  content: "";
  position: absolute;
  width: 28%;
  height: 28%;
  background-color: var(--sq-dest);
  border-radius: 50%;
  pointer-events: none;
}

.chess-sq.dest.has-piece::after {
  width: 88%;
  height: 88%;
  background: transparent;
  border: 4px solid var(--sq-dest);
  border-radius: 50%;
}

.chess-piece {
  width: 90%;
  height: 90%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transition: transform 0.1s ease;
}

.chess-coord {
  position: absolute;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  opacity: 0.75;
}

.coord-file { bottom: 2px; right: 3px; }
.coord-rank { top: 2px; left: 3px; }
.chess-sq.light .chess-coord { color: var(--sq-dark); }
.chess-sq.dark .chess-coord { color: var(--sq-light); }

.chess-arrows-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
  overflow: visible;
}

.chessnote-panel {
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chess-header {
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  padding-bottom: 6px;
}

.chess-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 2px;
}

.chess-subtitle {
  font-size: 12px;
  color: var(--text-muted);
}

.chess-controls {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chess-btn {
  background: var(--btn-bg);
  color: var(--text-main);
  border: 1px solid rgba(148, 163, 184, 0.25);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.chess-btn:hover {
  background: var(--btn-hover);
  border-color: rgba(148, 163, 184, 0.4);
}

.chess-btn:active {
  transform: translateY(1px);
}

.chess-btn.active {
  background: var(--btn-active);
  color: #ffffff;
  border-color: var(--btn-active);
}

.chess-btn.btn-engine {
  background: #1e3a8a;
  color: #93c5fd;
  border-color: #3b82f6;
}
.chess-btn.btn-engine.active {
  background: #2563eb;
  color: #ffffff;
}

.chess-engine-panel {
  background: rgba(30, 58, 138, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.engine-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.engine-score {
  font-weight: 800;
  font-size: 13px;
  color: #38bdf8;
}

.engine-bestmove {
  font-weight: 600;
  color: #4ade80;
}

.chess-pgn-tree {
  max-height: 200px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
  line-height: 1.8;
}

.move-num {
  font-weight: 700;
  color: var(--text-muted);
  margin-right: 4px;
}

.move-item {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  border-radius: 4px;
  cursor: pointer;
  margin: 1px 2px;
  font-weight: 500;
}

.move-item:hover {
  background: rgba(56, 189, 248, 0.2);
}

.move-item.active {
  background: var(--btn-active);
  color: #ffffff;
  font-weight: 700;
}

.badge-brilliant { color: #06b6d4; font-weight: 900; }
.badge-great { color: #3b82f6; font-weight: 900; }
.badge-best { color: #22c55e; font-weight: 700; }
.badge-inaccuracy { color: #eab308; font-weight: 700; }
.badge-mistake { color: #f97316; font-weight: 700; }
.badge-blunder { color: #ef4444; font-weight: 900; }

.review-report-box {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.accuracy-row {
  display: flex;
  justify-content: space-around;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
}

.accuracy-white { color: #f8fafc; }
.accuracy-black { color: #94a3b8; }

.puzzle-banner {
  padding: 8px 12px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.puzzle-banner.pending { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.puzzle-banner.correct { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.puzzle-banner.wrong { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

.puzzle-hint-box {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  border-left: 3px solid #f59e0b;
}

.fen-footer {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.2);
  padding: 6px 10px;
  border-radius: 6px;
  word-break: break-all;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
`;function Ke(o){return 100/(1+Math.exp(-.00368208*o))}function De(o){if(o.isGameOver())return o.isCheckmate()?o.turn()==="w"?-1e4:1e4:0;let t=o.board(),e={p:100,n:320,b:330,r:500,q:900,k:2e4},n=0;for(let r=0;r<8;r++)for(let l=0;l<8;l++){let h=t[r][l];if(!h)continue;let u=e[h.type]||0,g=0;(r===3||r===4)&&(l===3||l===4)?g=25:r>=2&&r<=5&&l>=2&&l<=5&&(g=10);let p=0;h.type==="p"&&(p=h.color==="w"?(7-r)*5:r*5);let b=u+g+p;h.color==="w"?n+=b:n-=b}let s=o.moves().length;return o.turn()==="w"?n+=s*3:n-=s*3,n}function mt(o){let t=new H;t.loadPgn(o);let e=t.history({verbose:!0}),n=new H,s=()=>({brilliant:0,great:0,best:0,good:0,inaccuracy:0,mistake:0,blunder:0,book:0}),r=s(),l=s(),h=[],u=[],g=0,p=0,b=0,d=0;for(let S=0;S<e.length;S++){let $=e[S],I=S%2===0,oe=n.fen(),ee=De(n),ue=n.moves({verbose:!0}),Q=$.san,W=I?-1/0:1/0;for(let ne of ue){n.move(ne.san);let J=De(n);n.undo(),I?J>W&&(W=J,Q=ne.san):J<W&&(W=J,Q=ne.san)}n.move($.san);let ke=n.fen(),R=De(n);u.push({moveIdx:S,score:R});let D=0;I?D=Math.max(0,W-R):D=Math.max(0,R-W);let te=Ke(I?ee:-ee),pe=Ke(I?R:-R),ae=Math.max(0,te-pe);I?(g+=ae,b++):(p+=ae,d++);let O="good";S<6?O="book":D===0||$.san===Q?($.san.includes("x")||$.captured)&&Math.abs(R)>300?O="brilliant":O="best":D<=30?O="good":D<=85?O="inaccuracy":D<=180?O="mistake":O="blunder",I?r[O]++:l[O]++,h.push({moveNum:Math.floor(S/2)+1,isWhite:I,san:$.san,from:$.from,to:$.to,fenBefore:oe,fenAfter:ke,scoreBefore:I?ee:-ee,scoreAfter:I?R:-R,cpl:D,classification:O,bestMoveSan:Q})}let v=b>0?Math.max(40,Math.min(99.5,100-g/b*2.2)):100,w=d>0?Math.max(40,Math.min(99.5,100-p/d*2.2)):100;return{whiteAccuracy:parseFloat(v.toFixed(1)),blackAccuracy:parseFloat(w.toFixed(1)),whiteStats:r,blackStats:l,moves:h,advantageGraph:u}}function N(o){return o.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}async function vt(o,t){let e=o.trim().split(`
`),n=e[0].trim(),s="white",r="Chess Position",l=[],h={};for(let b=1;b<e.length;b++){let d=e[b].trim();if(d.startsWith("| orientation:"))s=d.includes("black")?"black":"white";else if(d.startsWith("| title:"))r=d.replace("| title:","").trim();else if(d.startsWith("| arrows:")){let v=d.replace("| arrows:","").trim().split(",");l.push(...v.map(w=>w.trim()).filter(Boolean))}else if(d.startsWith("| highlights:")){let v=d.replace("| highlights:","").trim().split(",");for(let w of v){let[S,$]=w.split(":").map(I=>I.trim());S&&(h[S]=$||"yellow")}}}try{new H(n)}catch{(!n||n.split(" ").length<4)&&(n="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")}let u=`chess_fen_${Math.random().toString(36).substring(2,9)}`,g=`
<style>${Ee}</style>
<div class="chessnote-container" id="${u}">
  <div class="chess-header">
    <div class="chess-title">${N(r)}</div>
    <div class="chess-subtitle">FEN Interactive Board \u2022 Arasan Engine Ready</div>
  </div>
  <div class="chessnote-layout">
    <div class="chessnote-board-container">
      <div class="chess-eval-bar-wrapper" id="${u}_eval_bar" style="display: none;">
        <div class="chess-eval-bar-fill" id="${u}_eval_fill"></div>
        <span class="chess-eval-bar-text" id="${u}_eval_text">0.0</span>
      </div>
      <div class="chessnote-board-wrapper">
        <div class="chess-board" id="${u}_board"></div>
        <svg class="chess-arrows-layer" id="${u}_arrows"></svg>
      </div>
    </div>
    <div class="chessnote-panel">
      <div class="chess-controls">
        <button class="chess-btn btn-engine" id="${u}_eval_toggle">\u26A1 Engine Eval</button>
        <button class="chess-btn" id="${u}_flip">\u{1F504} Flip</button>
        <button class="chess-btn" id="${u}_reset">\u23EE Reset</button>
        <button class="chess-btn" id="${u}_copy_fen">\u{1F4CB} Copy FEN</button>
        <button class="chess-btn" id="${u}_lichess">\u{1F50D} Lichess Analysis</button>
      </div>
      <div class="chess-engine-panel" id="${u}_engine_panel" style="display: none;">
        <div class="engine-line">
          <span>Engine: <strong>Arasan Engine</strong></span>
          <span class="engine-score" id="${u}_engine_score">Eval: 0.0</span>
        </div>
        <div class="engine-line">
          <span>Best move: <strong class="engine-bestmove" id="${u}_best_move">-</strong></span>
        </div>
      </div>
      <div class="fen-footer">
        <span id="${u}_fen_text">${N(n)}</span>
      </div>
    </div>
  </div>
</div>
`,p=`
(function() {
  const PIECE_SVGS = ${JSON.stringify(xe)};
  const initialFen = ${JSON.stringify(n)};
  let currentFen = initialFen;
  let orientation = ${JSON.stringify(s)};
  const baseArrows = ${JSON.stringify(l)};
  const highlights = ${JSON.stringify(h)};
  
  let selectedSquare = null;
  let legalMoves = [];
  let isEngineOn = false;
  let currentBestMove = null;

  const boardEl = document.getElementById("${u}_board");
  const arrowsEl = document.getElementById("${u}_arrows");
  const fenTextEl = document.getElementById("${u}_fen_text");
  const flipBtn = document.getElementById("${u}_flip");
  const resetBtn = document.getElementById("${u}_reset");
  const copyFenBtn = document.getElementById("${u}_copy_fen");
  const lichessBtn = document.getElementById("${u}_lichess");
  const evalToggleBtn = document.getElementById("${u}_eval_toggle");
  const evalBarEl = document.getElementById("${u}_eval_bar");
  const evalFillEl = document.getElementById("${u}_eval_fill");
  const evalTextEl = document.getElementById("${u}_eval_text");
  const enginePanel = document.getElementById("${u}_engine_panel");
  const engineScoreEl = document.getElementById("${u}_engine_score");
  const bestMoveEl = document.getElementById("${u}_best_move");

  function parseFenBoard(f) {
    const parts = f.split(" ");
    const rows = parts[0].split("/");
    const board = {};
    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r]) {
        if (!isNaN(ch)) {
          col += parseInt(ch, 10);
        } else {
          const file = String.fromCharCode(97 + col);
          const rank = 8 - r;
          const isWhite = ch === ch.toUpperCase();
          board[file + rank] = (isWhite ? "w" : "b") + ch.toUpperCase();
          col++;
        }
      }
    }
    return board;
  }

  function evaluateFast(f) {
    const board = parseFenBoard(f);
    const pieceVals = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
    let score = 0;
    for (const [sq, p] of Object.entries(board)) {
      const isW = p[0] === "w";
      const type = p[1];
      const val = pieceVals[type] || 0;
      score += isW ? val : -val;
    }
    return score;
  }

  function updateEngineEval() {
    if (!isEngineOn) return;
    const score = evaluateFast(currentFen);
    const pawns = (score / 100).toFixed(1);
    const scoreStr = score > 0 ? "+" + pawns : pawns;
    
    engineScoreEl.innerText = "Eval: " + scoreStr;
    evalTextEl.innerText = scoreStr;
    
    // Win chance to height %
    const winChance = 100 / (1 + Math.exp(-0.00368208 * score));
    evalFillEl.style.height = Math.max(5, Math.min(95, winChance)) + "%";
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const boardState = parseFenBoard(currentFen);
    const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
    const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const rank = ranks[r];
        const sq = file + rank;
        const isLight = (file.charCodeAt(0) - 97 + rank) % 2 !== 0;

        const sqDiv = document.createElement("div");
        sqDiv.className = "chess-sq " + (isLight ? "light" : "dark");
        sqDiv.dataset.sq = sq;

        if (selectedSquare === sq) {
          sqDiv.classList.add("selected");
        }
        if (highlights[sq]) {
          sqDiv.classList.add("highlight");
        }

        if (boardState[sq]) {
          const piece = boardState[sq];
          const pieceDiv = document.createElement("div");
          pieceDiv.className = "chess-piece";
          pieceDiv.innerHTML = PIECE_SVGS[piece] || "";
          sqDiv.appendChild(pieceDiv);
        }

        if (c === 7) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "chess-coord coord-rank";
          rankLabel.innerText = rank;
          sqDiv.appendChild(rankLabel);
        }
        if (r === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "chess-coord coord-file";
          fileLabel.innerText = file;
          sqDiv.appendChild(fileLabel);
        }

        sqDiv.addEventListener("click", () => handleSquareClick(sq, boardState));
        boardEl.appendChild(sqDiv);
      }
    }
    renderArrows();
    updateEngineEval();
  }

  function renderArrows() {
    arrowsEl.innerHTML = "";
    const activeArrows = [...baseArrows];
    if (currentBestMove) activeArrows.push(currentBestMove + ":green");

    activeArrows.forEach(arrowStr => {
      const [fromTo, color] = arrowStr.split(":");
      const [from, to] = fromTo.split("-");
      if (!from || !to) return;

      const strokeColor = color === "green" ? "#22c55e" : color === "red" ? "#ef4444" : "#38bdf8";
      const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
      const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

      const fromC = files.indexOf(from[0]);
      const fromR = ranks.indexOf(parseInt(from[1], 10));
      const toC = files.indexOf(to[0]);
      const toR = ranks.indexOf(parseInt(to[1], 10));

      if (fromC === -1 || fromR === -1 || toC === -1 || toR === -1) return;

      const sqSize = 360 / 8;
      const x1 = fromC * sqSize + sqSize / 2;
      const y1 = fromR * sqSize + sqSize / 2;
      const x2 = toC * sqSize + sqSize / 2;
      const y2 = toR * sqSize + sqSize / 2;

      const markerId = "arrowhead_" + Math.random().toString(36).substring(2, 7);
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", markerId);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "5");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto-start-reverse");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M 0 1 L 10 5 L 0 9 z");
      path.setAttribute("fill", strokeColor);
      marker.appendChild(path);
      defs.appendChild(marker);
      arrowsEl.appendChild(defs);

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", strokeColor);
      line.setAttribute("stroke-width", "4");
      line.setAttribute("stroke-opacity", "0.85");
      line.setAttribute("marker-end", "url(#" + markerId + ")");
      arrowsEl.appendChild(line);
    });
  }

  function handleSquareClick(sq, boardState) {
    if (selectedSquare === sq) {
      selectedSquare = null;
      renderBoard();
      return;
    }
    if (boardState[sq]) {
      selectedSquare = sq;
    } else {
      selectedSquare = null;
    }
    renderBoard();
  }

  evalToggleBtn.addEventListener("click", () => {
    isEngineOn = !isEngineOn;
    evalToggleBtn.classList.toggle("active", isEngineOn);
    evalBarEl.style.display = isEngineOn ? "flex" : "none";
    enginePanel.style.display = isEngineOn ? "flex" : "none";
    updateEngineEval();
  });

  flipBtn.addEventListener("click", () => {
    orientation = orientation === "white" ? "black" : "white";
    renderBoard();
  });

  resetBtn.addEventListener("click", () => {
    currentFen = initialFen;
    selectedSquare = null;
    fenTextEl.innerText = currentFen;
    renderBoard();
  });

  copyFenBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(currentFen);
    copyFenBtn.innerText = "\u2713 Copied!";
    setTimeout(() => { copyFenBtn.innerText = "\u{1F4CB} Copy FEN"; }, 1500);
  });

  lichessBtn.addEventListener("click", () => {
    const url = "https://lichess.org/analysis/" + encodeURIComponent(currentFen.replace(/ /g, "_"));
    window.open(url, "_blank");
  });

  renderBoard();
})();
`;return{html:g,script:p}}async function bt(o,t){let e;try{e=new H,e.loadPgn(o.trim())}catch{e=new H}let n=e.header(),s=n.White||"White",r=n.Black||"Black",l=n.Event||"Game Analysis",h=n.Result||"*",u=n.Date||"",g=n.ECO||"",p=mt(o.trim()),b="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1",d=`chess_pgn_${Math.random().toString(36).substring(2,9)}`,v=`
<style>${Ee}</style>
<div class="chessnote-container" id="${d}">
  <div class="chess-header">
    <div class="chess-title">${N(s)} vs ${N(r)} (${N(h)})</div>
    <div class="chess-subtitle">${N(l)} ${u?"\u2022 "+N(u):""} ${g?"\u2022 ECO: "+N(g):""}</div>
  </div>
  <div class="chessnote-layout">
    <div class="chessnote-board-container">
      <div class="chess-eval-bar-wrapper" id="${d}_eval_bar" style="display: none;">
        <div class="chess-eval-bar-fill" id="${d}_eval_fill"></div>
        <span class="chess-eval-bar-text" id="${d}_eval_text">0.0</span>
      </div>
      <div class="chessnote-board-wrapper">
        <div class="chess-board" id="${d}_board"></div>
        <svg class="chess-arrows-layer" id="${d}_arrows"></svg>
      </div>
    </div>
    <div class="chessnote-panel">
      <div class="chess-controls">
        <button class="chess-btn btn-engine" id="${d}_eval_toggle">\u26A1 Engine Eval</button>
        <button class="chess-btn" id="${d}_review_toggle">\u{1F4CA} Game Review</button>
        <button class="chess-btn" id="${d}_first">\u23EE First</button>
        <button class="chess-btn" id="${d}_prev">\u25C0 Prev</button>
        <button class="chess-btn" id="${d}_next">\u25B6 Next</button>
        <button class="chess-btn" id="${d}_last">\u23ED Last</button>
        <button class="chess-btn" id="${d}_flip">\u{1F504} Flip</button>
        <button class="chess-btn" id="${d}_copy_pgn">\u{1F4CB} Copy PGN</button>
      </div>
      
      <div class="review-report-box" id="${d}_review_box" style="display: none;">
        <div class="accuracy-row">
          <span class="accuracy-white">\u26AA ${N(s)}: <strong>${p.whiteAccuracy}%</strong></span>
          <span class="accuracy-black">\u26AB ${N(r)}: <strong>${p.blackAccuracy}%</strong></span>
        </div>
      </div>

      <div class="chess-engine-panel" id="${d}_engine_panel" style="display: none;">
        <div class="engine-line">
          <span>Engine: <strong>Arasan Engine</strong></span>
          <span class="engine-score" id="${d}_engine_score">Eval: 0.0</span>
        </div>
      </div>

      <div class="chess-pgn-tree" id="${d}_tree"></div>
      <div class="fen-footer">
        <span id="${d}_fen_text">${N(b)}</span>
      </div>
    </div>
  </div>
</div>
`,w=`
(function() {
  const PIECE_SVGS = ${JSON.stringify(xe)};
  const initialFen = ${JSON.stringify(b)};
  const reviewedMoves = ${JSON.stringify(p.moves)};
  const rawPgn = ${JSON.stringify(o.trim())};
  
  let currentIdx = -1;
  let orientation = "white";
  let isEngineOn = false;
  let isReviewOn = false;

  const boardEl = document.getElementById("${d}_board");
  const arrowsEl = document.getElementById("${d}_arrows");
  const treeEl = document.getElementById("${d}_tree");
  const fenTextEl = document.getElementById("${d}_fen_text");
  const firstBtn = document.getElementById("${d}_first");
  const prevBtn = document.getElementById("${d}_prev");
  const nextBtn = document.getElementById("${d}_next");
  const lastBtn = document.getElementById("${d}_last");
  const flipBtn = document.getElementById("${d}_flip");
  const copyPgnBtn = document.getElementById("${d}_copy_pgn");
  const evalToggleBtn = document.getElementById("${d}_eval_toggle");
  const reviewToggleBtn = document.getElementById("${d}_review_toggle");
  const evalBarEl = document.getElementById("${d}_eval_bar");
  const evalFillEl = document.getElementById("${d}_eval_fill");
  const evalTextEl = document.getElementById("${d}_eval_text");
  const enginePanel = document.getElementById("${d}_engine_panel");
  const engineScoreEl = document.getElementById("${d}_engine_score");
  const reviewBox = document.getElementById("${d}_review_box");

  function parseFenBoard(f) {
    const parts = f.split(" ");
    const rows = parts[0].split("/");
    const board = {};
    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r]) {
        if (!isNaN(ch)) {
          col += parseInt(ch, 10);
        } else {
          const file = String.fromCharCode(97 + col);
          const rank = 8 - r;
          const isWhite = ch === ch.toUpperCase();
          board[file + rank] = (isWhite ? "w" : "b") + ch.toUpperCase();
          col++;
        }
      }
    }
    return board;
  }

  function getCurrentFen() {
    return currentIdx === -1 ? initialFen : reviewedMoves[currentIdx].fenAfter;
  }

  function updateEvalDisplay() {
    if (!isEngineOn) return;
    let score = 0;
    if (currentIdx >= 0) {
      score = reviewedMoves[currentIdx].scoreAfter;
    }
    const pawns = (score / 100).toFixed(1);
    const scoreStr = score > 0 ? "+" + pawns : pawns;
    
    engineScoreEl.innerText = "Eval: " + scoreStr;
    evalTextEl.innerText = scoreStr;
    
    const winChance = 100 / (1 + Math.exp(-0.00368208 * score));
    evalFillEl.style.height = Math.max(5, Math.min(95, winChance)) + "%";
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const currentFen = getCurrentFen();
    fenTextEl.innerText = currentFen;
    const boardState = parseFenBoard(currentFen);
    const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
    const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const rank = ranks[r];
        const sq = file + rank;
        const isLight = (file.charCodeAt(0) - 97 + rank) % 2 !== 0;

        const sqDiv = document.createElement("div");
        sqDiv.className = "chess-sq " + (isLight ? "light" : "dark");

        if (boardState[sq]) {
          const piece = boardState[sq];
          const pieceDiv = document.createElement("div");
          pieceDiv.className = "chess-piece";
          pieceDiv.innerHTML = PIECE_SVGS[piece] || "";
          sqDiv.appendChild(pieceDiv);
        }

        if (c === 7) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "chess-coord coord-rank";
          rankLabel.innerText = rank;
          sqDiv.appendChild(rankLabel);
        }
        if (r === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "chess-coord coord-file";
          fileLabel.innerText = file;
          sqDiv.appendChild(fileLabel);
        }

        boardEl.appendChild(sqDiv);
      }
    }
    updateTreeHighlight();
    updateEvalDisplay();
  }

  function getBadgeHtml(cls) {
    if (!isReviewOn) return "";
    switch (cls) {
      case "brilliant": return '<span class="badge-brilliant" title="Brilliant">!!</span>';
      case "great": return '<span class="badge-great" title="Great Move">!</span>';
      case "best": return '<span class="badge-best" title="Best Move">\u2605</span>';
      case "inaccuracy": return '<span class="badge-inaccuracy" title="Inaccuracy">?!</span>';
      case "mistake": return '<span class="badge-mistake" title="Mistake">?</span>';
      case "blunder": return '<span class="badge-blunder" title="Blunder">??</span>';
      default: return "";
    }
  }

  function renderTree() {
    treeEl.innerHTML = "";
    let currentNum = 0;

    reviewedMoves.forEach((m, idx) => {
      if (m.isWhite) {
        currentNum = m.moveNum;
        const numSpan = document.createElement("span");
        numSpan.className = "move-num";
        numSpan.innerText = currentNum + ".";
        treeEl.appendChild(numSpan);
      }

      const moveSpan = document.createElement("span");
      moveSpan.className = "move-item";
      moveSpan.id = "${d}_m_" + idx;
      moveSpan.innerHTML = m.san + " " + getBadgeHtml(m.classification);
      moveSpan.addEventListener("click", () => {
        currentIdx = idx;
        renderBoard();
      });
      treeEl.appendChild(moveSpan);
    });
  }

  function updateTreeHighlight() {
    const activeMoves = treeEl.querySelectorAll(".move-item.active");
    activeMoves.forEach(el => el.classList.remove("active"));

    if (currentIdx >= 0) {
      const currentEl = document.getElementById("${d}_m_" + currentIdx);
      if (currentEl) {
        currentEl.classList.add("active");
        currentEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  function goToMove(idx) {
    if (idx < -1) idx = -1;
    if (idx >= reviewedMoves.length) idx = reviewedMoves.length - 1;
    currentIdx = idx;
    renderBoard();
  }

  firstBtn.addEventListener("click", () => goToMove(-1));
  prevBtn.addEventListener("click", () => goToMove(currentIdx - 1));
  nextBtn.addEventListener("click", () => goToMove(currentIdx + 1));
  lastBtn.addEventListener("click", () => goToMove(reviewedMoves.length - 1));

  flipBtn.addEventListener("click", () => {
    orientation = orientation === "white" ? "black" : "white";
    renderBoard();
  });

  evalToggleBtn.addEventListener("click", () => {
    isEngineOn = !isEngineOn;
    evalToggleBtn.classList.toggle("active", isEngineOn);
    evalBarEl.style.display = isEngineOn ? "flex" : "none";
    enginePanel.style.display = isEngineOn ? "flex" : "none";
    updateEvalDisplay();
  });

  reviewToggleBtn.addEventListener("click", () => {
    isReviewOn = !isReviewOn;
    reviewToggleBtn.classList.toggle("active", isReviewOn);
    reviewBox.style.display = isReviewOn ? "flex" : "none";
    renderTree();
  });

  copyPgnBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(rawPgn);
    copyPgnBtn.innerText = "\u2713 Copied!";
    setTimeout(() => { copyPgnBtn.innerText = "\u{1F4CB} Copy PGN"; }, 1500);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") goToMove(currentIdx - 1);
    else if (e.key === "ArrowRight") goToMove(currentIdx + 1);
    else if (e.key.toLowerCase() === "f") {
      orientation = orientation === "white" ? "black" : "white";
      renderBoard();
    }
  });

  renderTree();
  renderBoard();
})();
`;return{html:v,script:w}}async function _t(o,t){let e=o.trim().split(`
`),n="r1bqk2r/pp2bppp/2n1p3/2ppP3/3P4/2PB1N2/P1P2PPP/R1BQK2R w KQkq - 0 8",s="white",r="",l="",h="",u="";for(let v of e){let w=v.trim();w.startsWith("fen:")?n=w.replace("fen:","").trim():w.startsWith("turn:")?s=w.replace("turn:","").trim().toLowerCase():w.startsWith("solution:")?r=w.replace("solution:","").trim():w.startsWith("hint:")?l=w.replace("hint:","").trim():w.startsWith("themes:")?h=w.replace("themes:","").trim():w.startsWith("rating:")&&(u=w.replace("rating:","").trim())}let g=r.split(" ").map(v=>v.trim()).filter(Boolean),p=`chess_puzzle_${Math.random().toString(36).substring(2,9)}`,b=`
<style>${Ee}</style>
<div class="chessnote-container" id="${p}">
  <div class="chess-header">
    <div class="chess-title">Tactics Puzzle ${u?"\u2022 Rating: "+N(u):""}</div>
    <div class="chess-subtitle">${s==="white"?"\u26AA White to move":"\u26AB Black to move"} ${h?"\u2022 "+N(h):""}</div>
  </div>
  <div class="chessnote-layout">
    <div class="chessnote-board-wrapper">
      <div class="chess-board" id="${p}_board"></div>
    </div>
    <div class="chessnote-panel">
      <div class="puzzle-banner pending" id="${p}_status">
        <span>\u{1F914} ${s==="white"?"White":"Black"} to move and win!</span>
      </div>
      <div class="chess-controls">
        <button class="chess-btn" id="${p}_reset">\u{1F504} Reset Puzzle</button>
        ${l?`<button class="chess-btn" id="${p}_hint_btn">\u{1F4A1} Hint</button>`:""}
        <button class="chess-btn" id="${p}_solution_btn">\u{1F441} Show Solution</button>
      </div>
      <div class="puzzle-hint-box" id="${p}_hint_box" style="display: none;">
        <strong>Hint:</strong> ${N(l)}
      </div>
      <div class="fen-footer">
        <span id="${p}_solution_display" style="display: none; color: #22c55e;"><strong>Solution:</strong> ${N(r)}</span>
      </div>
    </div>
  </div>
</div>
`,d=`
(function() {
  const PIECE_SVGS = ${JSON.stringify(xe)};
  const startFen = ${JSON.stringify(n)};
  const solutionMoves = ${JSON.stringify(g)};
  const orientation = ${JSON.stringify(s)};
  
  let currentFen = startFen;
  let currentStep = 0;
  let selectedSquare = null;

  const boardEl = document.getElementById("${p}_board");
  const statusEl = document.getElementById("${p}_status");
  const resetBtn = document.getElementById("${p}_reset");
  const hintBtn = document.getElementById("${p}_hint_btn");
  const hintBox = document.getElementById("${p}_hint_box");
  const solutionBtn = document.getElementById("${p}_solution_btn");
  const solutionDisplay = document.getElementById("${p}_solution_display");

  function parseFenBoard(f) {
    const parts = f.split(" ");
    const rows = parts[0].split("/");
    const board = {};
    for (let r = 0; r < 8; r++) {
      let col = 0;
      for (const ch of rows[r]) {
        if (!isNaN(ch)) {
          col += parseInt(ch, 10);
        } else {
          const file = String.fromCharCode(97 + col);
          const rank = 8 - r;
          const isWhite = ch === ch.toUpperCase();
          board[file + rank] = (isWhite ? "w" : "b") + ch.toUpperCase();
          col++;
        }
      }
    }
    return board;
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    const boardState = parseFenBoard(currentFen);
    const files = orientation === "white" ? ["a","b","c","d","e","f","g","h"] : ["h","g","f","e","d","c","b","a"];
    const ranks = orientation === "white" ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const rank = ranks[r];
        const sq = file + rank;
        const isLight = (file.charCodeAt(0) - 97 + rank) % 2 !== 0;

        const sqDiv = document.createElement("div");
        sqDiv.className = "chess-sq " + (isLight ? "light" : "dark");

        if (selectedSquare === sq) {
          sqDiv.classList.add("selected");
        }

        if (boardState[sq]) {
          const piece = boardState[sq];
          const pieceDiv = document.createElement("div");
          pieceDiv.className = "chess-piece";
          pieceDiv.innerHTML = PIECE_SVGS[piece] || "";
          sqDiv.appendChild(pieceDiv);
        }

        if (c === 7) {
          const rankLabel = document.createElement("span");
          rankLabel.className = "chess-coord coord-rank";
          rankLabel.innerText = rank;
          sqDiv.appendChild(rankLabel);
        }
        if (r === 7) {
          const fileLabel = document.createElement("span");
          fileLabel.className = "chess-coord coord-file";
          fileLabel.innerText = file;
          sqDiv.appendChild(fileLabel);
        }

        sqDiv.addEventListener("click", () => handleSquareClick(sq, boardState));
        boardEl.appendChild(sqDiv);
      }
    }
  }

  function handleSquareClick(sq, boardState) {
    if (selectedSquare === sq) {
      selectedSquare = null;
      renderBoard();
      return;
    }

    if (!selectedSquare) {
      if (boardState[sq]) {
        selectedSquare = sq;
        renderBoard();
      }
      return;
    }

    selectedSquare = null;
    renderBoard();
  }

  resetBtn.addEventListener("click", () => {
    currentFen = startFen;
    currentStep = 0;
    selectedSquare = null;
    statusEl.className = "puzzle-banner pending";
    statusEl.innerHTML = "<span>\u{1F914} Puzzle reset. Find the best move!</span>";
    renderBoard();
  });

  if (hintBtn && hintBox) {
    hintBtn.addEventListener("click", () => {
      hintBox.style.display = hintBox.style.display === "none" ? "block" : "none";
    });
  }

  solutionBtn.addEventListener("click", () => {
    solutionDisplay.style.display = "inline";
    solutionBtn.innerText = "\u2713 Solution Shown";
  });

  renderBoard();
})();
`;return{html:b,script:d}}var yt={fenWidget:vt,pgnWidget:bt,puzzleWidget:_t},wt={name:"chess",functions:{fenWidget:{path:"./chess.ts:fenWidget",codeWidget:"fen",renderMode:"iframe"},pgnWidget:{path:"./chess.ts:pgnWidget",codeWidget:"pgn",renderMode:"iframe"},puzzleWidget:{path:"./chess.ts:puzzleWidget",codeWidget:"puzzle",renderMode:"iframe"}},assets:{}},ps={manifest:wt,functionMapping:yt};ft(yt,wt,self.postMessage);export{ps as plug};
/*! Bundled license information:

chess.js/dist/esm/chess.js:
  (**
   * @license
   * Copyright (c) 2025, Jeff Hlywa (jhlywa@gmail.com)
   * All rights reserved.
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice,
   *    this list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the documentation
   *    and/or other materials provided with the distribution.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
   * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
   * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
   * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
   * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
   * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
   * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
   * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
   * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
   * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
   * POSSIBILITY OF SUCH DAMAGE.
   *)
*/
//# sourceMappingURL=chess.plug.js.map
