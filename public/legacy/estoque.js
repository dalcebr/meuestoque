/* Estoque da Loja — interface original (JavaScript).
 * A camada de dados, login e assinatura fica em src/app/bridge.ts (TypeScript).
 * Ajustes [SaaS] feitos no código original:
 *  - idb/kvGet/kvSet: usam window.SaaS (Supabase) no lugar do IndexedDB
 *  - blobUrl e crop: aceitam fotos já salvas na nuvem (URL) além de Blob
 *  - CATALOG: o endereço /c/<loja> abre o modo catálogo
 *  - catalogUrl: devolve o link público da loja
 *  - pedidoLink: o link do pedido abre o painel em /app/
 *  - nome e botão Sair: vêm da conta logada (Supabase Auth)
 *  - saveP: respeita o limite de produtos do plano
 *  - editor de fotos: WebP com qualidade 0.9 (antes 1.0, arquivos muito maiores)
 *  - MAXF (fotos por produto) vem do plano da loja
 *  - opções de variação podem ter uma foto (o.img = índice em p.imgs); no catálogo,
 *    escolher a opção troca a foto principal
 *  - cores do catálogo: campo com o código hexadecimal (#RRGGBB) ao lado de cada
 *    seletor de cor, para colar ou digitar a cor exata
 *  - catálogo com rascunho: as edições ficam em 'catalogDraft' e só vão para o
 *    catálogo público ('catalog') ao tocar em Publicar; a prévia mostra o rascunho
 */

// Painel Início: tudo é calculado a partir dos dados reais (produtos, vendas e estoque).
var D={today:0,todayN:0,month:0,cost:0,week:[0,0,0,0,0,0,0],items:0,units:0,sCost:0,sSale:0,low:[],lowN:0,recent:[]};
var COLORS=[["#4F46E5","Índigo"],["#2563EB","Azul"],["#0891B2","Turquesa"],["#0E9F6E","Verde"],["#CA8A04","Dourado"],["#EA580C","Laranja"],["#DB2777","Rosa"],["#7C3AED","Violeta"]];
var $=function(i){return document.getElementById(i)},$$=function(sel){return document.querySelectorAll(sel)},root=document.documentElement;
/* foco acessível em <dialog>: guarda o elemento ativo e foca o primeiro campo ao abrir */
function bindDialogFocus(dlg){
  const origShow=dlg.showModal,origClose=dlg.close;
  dlg.showModal=function(){
    dlg.__prevFocus=document.activeElement;
    origShow.apply(dlg,arguments);
    const el=dlg.querySelector('input,select,textarea')||dlg.querySelector('h2');
    if(el&&el.focus)el.focus();
  };
  dlg.close=function(){
    origClose.apply(dlg,arguments);
    if(dlg.__prevFocus&&dlg.__prevFocus.focus)dlg.__prevFocus.focus();
  };
}
$$('dialog').forEach(bindDialogFocus);
var brl=function(v){return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})};
var pf=function(v){return v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%'};
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
function set(k,v){try{localStorage.setItem(k,v)}catch(e){}}
var goal=Number(get('meta'))||25000,nome=get('nome')||'';

function tick(){
  var n=new Date(),h=n.getHours();
  $('greet').textContent=(h>=5&&h<12?'Bom dia':h>=12&&h<18?'Boa tarde':'Boa noite')+', '+nome;
  var d=n.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  $('date').textContent=d.charAt(0).toUpperCase()+d.slice(1);
  $('time').textContent=n.toLocaleTimeString('pt-BR');
}
var plural=function(n,um,varios){return n.toLocaleString('pt-BR')+' '+(n===1?um:varios)};
function render(){
  var n=new Date(),dim=new Date(n.getFullYear(),n.getMonth()+1,0).getDate(),day=n.getDate(),left=dim-day+1;
  var p=goal>0?D.month/goal*100:0,rest=goal-D.month;
  $('pct').textContent=Math.round(p)+'%';
  setTimeout(function(){$('arc').style.strokeDashoffset=327*(1-Math.min(p,100)/100)},120);
  $('gSold').textContent=brl(D.month);$('gGoal').textContent=brl(goal);
  $('gHint').textContent=rest<=0?'Meta batida! Você passou '+brl(-rest)+' do objetivo.':'Faltam '+brl(rest)+'. Vendendo '+brl(rest/left)+' por dia nos próximos '+plural(left,'dia','dias')+' você chega lá.';
  $('today').textContent=brl(D.today);$('todayN').textContent=plural(D.todayN,'venda hoje','vendas hoje');
  $('month').textContent=brl(D.month);$('monthProj').textContent=D.month>0?'Neste ritmo, fecha o mês em '+brl(D.month/day*dim):'Ainda sem vendas neste mês';
  var pr=D.month-D.cost;
  $('rev').textContent=brl(D.month);$('cost').textContent=brl(D.cost);$('profit').textContent=brl(pr);$('profit').className=pr<0?'neg':'pos';
  $('margin').textContent=D.month>0?'Margem de '+pf(pr/D.month*100):'Sem vendas no mês';
  $('items').textContent=plural(D.items,'produto','produtos');$('units').textContent=plural(D.units,'unidade no total','unidades no total');
  $('sCost').textContent=brl(D.sCost);$('sSale').textContent=brl(D.sSale);$('sProfit').textContent=brl(D.sSale-D.sCost);
  $('lowCount').textContent=plural(D.lowN,'produto','produtos');
  $('low').innerHTML=D.low.length?D.low.map(function(x){return '<li><span>'+esc(x[0])+'<small>Mínimo: '+x[2]+' un.</small></span><span class="neg">'+x[1]+' un.</span></li>'}).join(''):'<li style="justify-content:center;color:var(--muted)">Nenhum produto com estoque baixo.</li>';
  $('recent').innerHTML=D.recent.length?D.recent.map(function(x){return '<li><span>'+esc(x[0])+'<small>'+x[1]+'</small></span><span>'+brl(x[2])+'</span></li>'}).join(''):'<li style="justify-content:center;color:var(--muted)">Nenhuma venda registrada ainda.</li>';
  var mx=Math.max.apply(null,D.week.concat(0));$('weekSum').textContent=brl(D.week.reduce(function(a,b){return a+b},0));
  $('bars').innerHTML=D.week.map(function(v,i){var dt=new Date(n);dt.setDate(n.getDate()-(6-i));
    return '<div class="'+(i==6?'hoje':'')+'" title="'+brl(v)+'"><i style="height:'+(mx>0?Math.max(v>0?4:2,Math.round(v/mx*78)):2)+'%"></i>'+dt.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')+'</div>'}).join('');
}
tick();setInterval(tick,1000);render();
setInterval(function(){syncSales();render();if(!$('v-reports').hidden)drawReports()},60000);
$('goProd').onclick=function(){show('products');openForm()};
$('goSale').onclick=function(){openSale()};
$('goSales').onclick=function(){show('sales')};

// Menu: gaveta no celular, barra lateral recolhível no computador
var wide=function(){return matchMedia('(min-width:1024px)').matches};
function toggleMenu(){if(wide())$('shell').classList.toggle('collapsed');else document.body.classList.toggle('open')}
$('menuBtn').onclick=toggleMenu;
$('scrim').onclick=function(){document.body.classList.remove('open')};
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.body.classList.remove('open')});
document.querySelectorAll('.nav').forEach(function(b){b.addEventListener('click',function(){document.body.classList.remove('open')})});

// Tema
$('themeBtn').onclick=function(){var t=root.getAttribute('data-theme')==='dark'?'light':'dark';root.setAttribute('data-theme',t);set('tema',t)};

// Cor principal
function setAccent(c){
  root.style.setProperty('--accent',c);
  var n=parseInt(c.slice(1),16),l=(0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255))/255;
  root.style.setProperty('--accent-ink',l>0.62?'#10131C':'#fff');
  set('cor',c);markSw();
}
function markSw(){var c=(get('cor')||'#4F46E5').toLowerCase();document.querySelectorAll('#sw button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.c.toLowerCase()===c)})}
$('sw').innerHTML=COLORS.map(function(c){return '<button type="button" data-c="'+c[0]+'" aria-label="'+c[1]+'" aria-pressed="false" style="background:'+c[0]+'"></button>'}).join('')+'<input type="color" id="custom" aria-label="Escolher outra cor" value="'+(get('cor')||'#4F46E5')+'">';
$('sw').onclick=function(e){var b=e.target.closest('button');if(b){setAccent(b.dataset.c);$('custom').value=b.dataset.c}};
$('custom').oninput=function(e){setAccent(e.target.value)};
markSw();

// Configurações e meta
var cfg=$('cfgDlg'),gd=$('goalDlg');
function updateAccountCard(){$('cfgName').textContent=nome;$('cfgAvatar').textContent=(nome.trim()[0]||'?').toUpperCase()}
function openCfg(){$('nameIn').value=nome;updateAccountCard();cfg.showModal()}
$('navCfg').onclick=openCfg;
$('nameIn').oninput=function(e){nome=e.target.value.trim()||window.SaaS.userName()||'';set('nome',nome);tick();updateAccountCard();window.SaaS.setDisplayName(nome)};
$('logoutBtn').onclick=function(){cfg.close();window.SaaS.signOut()};
document.querySelectorAll('[data-close]').forEach(function(b){b.onclick=function(){b.closest('dialog').close()}});
$('goalBtn').onclick=function(){$('goalIn').value=goal.toLocaleString('pt-BR',{minimumFractionDigits:2});gd.showModal();$('goalIn').select()};
$('goalForm').onsubmit=function(){
  var raw=$('goalIn').value.trim(),v=parseFloat(raw.indexOf(',')>=0?raw.replace(/\./g,'').replace(',','.'):(/^\d{1,3}(\.\d{3})+$/.test(raw)?raw.replace(/\./g,''):raw));
  if(v>0){goal=v;set('meta',String(v));render()}
};

/* ===== Produtos ===== */
var P=[],db,cur,MAXF=5,MAXVARS=3,URLS=new WeakMap(),FIELDS=['name','desc','cat','sku','price','cost','stock','min'];
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
/* L: SVG de imagem genérica, usado no lugar de "Sem foto" em todos os contextos */
var NOIMG_SVG='<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-3.8-3.8a2 2 0 0 0-2.8 0L3 21"/></svg>';
function sum(g){return g.opts.reduce(function(a,o){return a+o.q},0)}
/* [SaaS] armazenamento na nuvem (Supabase) — ver src/app/bridge.ts */
function idb(){return window.SaaS.ready().then(function(){db=true;var n=window.SaaS.userName();if(!CATALOG){MAXF=window.SaaS.maxPhotos()||MAXF;var fi=$('phInfo');if(fi)fi.textContent='Até '+MAXF+' fotos no seu plano. Qualquer formato de imagem; todas ficam em 1000 × 1000 px no formato WebP. A primeira é a foto principal. Você pode ligar cada foto a uma opção de variação (ex.: uma cor).'}
  if(n&&!CATALOG){nome=n;tick();if(typeof updateAccountCard==='function')updateAccountCard()}})}
function kvGet(k){return window.SaaS.kvGet(k)}
function kvSet(k,v){return window.SaaS.kvSet(k,v)}
function blobUrl(b){if(typeof b==='string')return b;if(!b)return '';var u=URLS.get(b);if(!u){u=URL.createObjectURL(b);URLS.set(b,u)}return u}
/* aviso em popup: entra na camada de cima (popover), com duração proporcional ao texto e botão × */
function toast(m){
  var t=$('toast');
  t.innerHTML=esc(m)+'<button type="button" class="toast-x" aria-label="Fechar" onclick="hideToast()">×</button>';
  t.hidden=false;
  if(t.showPopover&&!toast.shown){try{t.showPopover();toast.shown=true}catch(e){}}
  t.classList.remove('on');void t.offsetWidth;t.classList.add('on');
  clearTimeout(toast.t);clearTimeout(toast.h);
  var dur=Math.min(8000,Math.max(4000,m.length*60));
  toast.t=setTimeout(hideToast,dur);
}
function hideToast(){
  var t=$('toast');t.classList.remove('on');
  clearTimeout(toast.h);
  toast.h=setTimeout(function(){
    if(toast.shown){try{t.hidePopover()}catch(e){}toast.shown=false}
    t.hidden=true;
  },220);
}
/* Valor do estoque de um produto (k = 'cost' ou 'price'). As unidades de cada opção valem o custo/preço da
   própria opção; opção sem valor próprio, e unidades sem opção definida, valem o do produto principal. */
function stockVal(p,k){
  var f=k==='cost'?'c':'p',base=k==='cost'?(p.cost||0):p.price;
  var g=p.vars.find(function(g){return g.opts.some(function(o){return o[f]!=null})});
  if(!g)return base*p.stock;
  var tracked=0,v=0;g.opts.forEach(function(o){tracked+=o.q;v+=o.q*(o[f]!=null?o[f]:base)});
  return v+Math.max(0,p.stock-tracked)*base;
}
function syncStock(){
  D.items=P.length;D.units=P.reduce(function(a,p){return a+p.stock},0);
  D.sCost=P.reduce(function(a,p){return a+stockVal(p,'cost')},0);D.sSale=P.reduce(function(a,p){return a+stockVal(p,'price')},0);
  var low=P.filter(function(p){return p.stock<=p.min}).sort(function(a,b){return a.stock-b.stock});
  D.lowN=low.length;D.low=low.slice(0,5).map(function(p){return[p.name,p.stock,p.min]});
}
/* navegação entre telas */
function show(v){
  $('v-home').hidden=v!=='home';$('v-prod').hidden=v!=='products';$('v-stock').hidden=v!=='stock';$('v-sales').hidden=v!=='sales';$('v-clients').hidden=v!=='clients';$('v-reports').hidden=v!=='reports';$('v-catalog').hidden=v!=='catalog';
  $('title').textContent={home:'Início',products:'Produtos',stock:'Estoque',sales:'Vendas',clients:'Clientes',reports:'Relatórios',catalog:'Catálogo'}[v];
  document.querySelectorAll('.nav[data-view]').forEach(function(b){b.setAttribute('aria-current',b.dataset.view===v?'page':'false')});
  scrollTo(0,0);if(v==='products')showList();if(v==='stock')drawStock();if(v==='sales')drawSales();if(v==='clients')drawClients();if(v==='reports')drawReports();if(v==='catalog'){drawCatalogCfg();loadCatPrev()}
}
document.querySelectorAll('.nav[data-view]').forEach(function(b){b.addEventListener('click',function(){show(b.dataset.view)})});
/* lista */
function showList(){$('plist').hidden=false;$('plist').style.display='grid';$('pform').hidden=true;$('pform').style.display='none';drawList()}
function drawList(){
  var q=$('q').value.trim().toLowerCase();
  var L=P.filter(function(p){return !q||(p.name+' '+p.sku+' '+p.cat).toLowerCase().indexOf(q)>=0});
  $('psum').textContent=P.length+(P.length==1?' produto, ':' produtos, ')+P.reduce(function(a,p){return a+p.stock},0)+' unidades em estoque';
  $('pgrid').innerHTML=L.length?L.map(function(p){
    var v=p.vars.map(function(g){return esc(g.name)+': '+g.opts.map(function(o){return esc(o.n)+' '+o.q+(o.p!=null?' ('+brl(o.p)+')':'')}).join(', ')}).join(' | ');
    return '<button class="card pc" data-id="'+p.id+'">'+(p.imgs[0]?'<img alt="" src="'+blobUrl(p.imgs[0])+'">':'<div class="noimg">'+NOIMG_SVG+'</div>')+
    '<div class="b"><strong>'+esc(p.name)+'</strong><div class="pr">'+pr(p)+'</div><p class="sub '+(p.stock<=p.min?'neg':'')+'">'+p.stock+' em estoque'+(p.stock<=p.min?' (repor)':'')+'</p>'+(v?'<p class="sub">'+v+'</p>':'')+'</div></button>'}).join('')
  :'<div class="card empty" style="grid-column:1/-1">'+(P.length?'Nenhum produto encontrado para essa busca.':'Você ainda não tem produtos. Cadastre o primeiro para começar o estoque.')+'</div>';
  $('cats').innerHTML=Array.from(new Set(P.map(function(p){return p.cat}).filter(Boolean))).map(function(c){return '<option value="'+esc(c)+'">'}).join('');
}
$('q').oninput=drawList;
$('pgrid').onclick=function(e){var b=e.target.closest('.pc');if(b)openForm(P.find(function(p){return p.id===b.dataset.id}))};
$('newP').onclick=function(){openForm()};$('back').onclick=$('cancel2').onclick=showList;
/* formulário */
function openForm(p){
  cur=p?Object.assign({},p,{imgs:p.imgs.slice(),vars:p.vars.map(function(g){return{name:g.name,opts:g.opts.map(function(o){return{n:o.n,q:o.q,p:o.p==null?null:o.p,c:o.c==null?null:o.c,img:o.img==null?null:o.img}})}})}):{id:null,imgs:[],vars:[]};
  FIELDS.forEach(function(k){$('f-'+k).value=cur[k]==null?'':cur[k]});
  $('ftitle').textContent=p?'Editar produto':'Novo produto';$('delBtn').hidden=!p;$('ferr').hidden=true;
  $('plist').hidden=true;$('plist').style.display='none';$('pform').hidden=false;$('pform').style.display='grid';
  drawPh();drawVars();marg();scrollTo(0,0);
}
function marg(){var p=+$('f-price').value,c=+$('f-cost').value;$('marg').textContent=p>0&&c>0?'Lucro por unidade: '+brl(p-c)+' (margem de '+pf((p-c)/p*100)+')':''}
function pph(){var p=+$('f-price').value;return p>0?brl(p):'Preço'}
function cph(){var c=+$('f-cost').value;return c>0?brl(c):'Custo'}
$('f-price').oninput=$('f-cost').oninput=function(){marg();document.querySelectorAll('[data-k=op]').forEach(function(i){i.placeholder=pph()});document.querySelectorAll('[data-k=oc]').forEach(function(i){i.placeholder=cph()})};
function pr(p){var a=[p.price];p.vars.forEach(function(g){g.opts.forEach(function(o){if(o.p!=null)a.push(o.p)})});var mn=Math.min.apply(null,a);return(mn<Math.max.apply(null,a)?'a partir de ':'')+brl(mn)}
/* fotos */
function drawPh(){
  var h=cur.imgs.map(function(b,i){return '<div class="ph"><img alt="Foto '+(i+1)+'" src="'+blobUrl(b)+'">'+(i==0?'<span class="tag">Principal</span>':'')+'<div class="mini"><button type="button" data-a="edit" data-i="'+i+'">Editar</button>'+(i?'<button type="button" data-a="main" data-i="'+i+'">Principal</button>':'')+'<button type="button" data-a="del" data-i="'+i+'">Remover</button></div></div>'}).join('');
  if(cur.imgs.length<MAXF)h+='<div class="ph"><button type="button" class="add" data-a="add">Adicionar foto</button></div>';
  $('photos').innerHTML=h;$('phN').textContent=cur.imgs.length+' de '+MAXF;
  if(cur.vars&&cur.vars.length)drawVars(); /* [SaaS] atualiza a escolha de foto das opções */
}
/* [SaaS] foto de cada opção de variação = índice em cur.imgs; ajusta quando as fotos mudam de lugar */
function optImgs(fn){(cur.vars||[]).forEach(function(g){g.opts.forEach(function(o){if(o.img!=null)o.img=fn(o.img)})})}
function optPhotoHtml(o){
  if(!cur.imgs.length)return '<div class="ophoto"><span class="ophoto-ph">'+NOIMG_SVG+'</span><span class="sub">Adicione fotos ao produto para ligar uma delas a esta opção.</span></div>';
  var v=o.img!=null&&o.img<cur.imgs.length?o.img:null;
  return '<div class="ophoto">'+(v!=null?'<img alt="" src="'+blobUrl(cur.imgs[v])+'">':'<span class="ophoto-ph">'+NOIMG_SVG+'</span>')+
    '<label class="fld"><span>Foto desta opção</span><select data-k="oimg"><option value="">Nenhuma (mantém a foto atual)</option>'+
    cur.imgs.map(function(_,k){return '<option value="'+k+'"'+(v===k?' selected':'')+'>Foto '+(k+1)+(k===0?' (principal)':'')+'</option>'}).join('')+'</select></label></div>';
}
$('photos').onclick=async function(e){
  var a=e.target.closest('button');if(!a)return;var i=+a.dataset.i,k=a.dataset.a;
  if(k==='add')return $('file').click();
  if(k==='del'){cur.imgs.splice(i,1);optImgs(function(x){return x===i?null:x>i?x-1:x})}
  else if(k==='main'){cur.imgs.unshift(cur.imgs.splice(i,1)[0]);optImgs(function(x){return x===i?0:x<i?x+1:x})}
  else{var b=await crop(cur.imgs[i]);if(b)cur.imgs[i]=b}
  drawPh();
};
$('file').onchange=async function(e){
  var fs=Array.from(e.target.files);e.target.value='';
  if(cur.imgs.length+fs.length>MAXF)toast('Limite de '+MAXF+' fotos por produto.');
  for(var f of fs){if(cur.imgs.length>=MAXF)break;var b=await crop(f);if(b){cur.imgs.push(b);drawPh()}}
};
/* editor de recorte */
var C={V:360,H:360,ow:1000,oh:1000,rot:0,flip:1,ox:0,oy:0,s:1,cover:1,contain:1,done:true},cv=$('cv'),drag=null;
function fit(){var w=C.img.naturalWidth,h=C.img.naturalHeight;if(C.rot%2){var t=w;w=h;h=t}C.cover=Math.max(C.V/w,C.H/h);C.contain=Math.min(C.V/w,C.H/h)}
function syncZoom(){var m=C.cover*4-C.contain;$('zoom').value=m>0?(C.s-C.contain)/m*100:0}
function cdraw(x,w,h){
  var k=w/C.V,im=C.img;x.fillStyle='#fff';x.fillRect(0,0,w,h);x.save();
  x.translate(w/2+C.ox*k,h/2+C.oy*k);x.rotate(C.rot*Math.PI/2);x.scale(C.s*k*C.flip,C.s*k);
  x.imageSmoothingQuality='high';x.drawImage(im,-im.naturalWidth/2,-im.naturalHeight/2);x.restore();
}
function paint(){cdraw(cv.getContext('2d'),C.V,C.H)}
function reset(){fit();C.s=C.cover;C.ox=C.oy=0;syncZoom();paint()}
// ar = proporção largura/altura do resultado (1 = foto quadrada de produto; 2 = banner do catálogo)
function crop(src,ar){ar=ar||1;return new Promise(function(res){
  var im=new Image(),u=typeof src==='string'?src:URL.createObjectURL(src);if(typeof src==='string')im.crossOrigin='anonymous';
  im.onerror=function(){URL.revokeObjectURL(u);toast('Não foi possível abrir essa imagem. Tente converter para JPG ou PNG.');res(null)};
  im.onload=function(){C.img=im;C.rot=0;C.flip=1;C.res=res;C.u=u;C.done=false;
    C.H=Math.round(C.V/ar);cv.width=C.V;cv.height=C.H;cv.style.aspectRatio=C.V+' / '+C.H;
    C.ow=ar===1?1000:1600;C.oh=Math.round(C.ow/ar);
    $('cropT').textContent=ar===1?'Editar foto':'Editar imagem de fundo';
    $('cropInfo').textContent='Arraste para posicionar e use o zoom. O resultado é '+(ar===1?'um quadrado':'um banner')+' de '+C.ow+' × '+C.oh+' px.';
    $('cropOk').textContent=ar===1?'Usar foto':'Usar imagem';
    reset();$('cropDlg').showModal()};
  im.src=u})}
function finish(b){if(C.done)return;C.done=true;if(String(C.u).indexOf('blob:')===0)URL.revokeObjectURL(C.u);C.res(b)}
$('cropDlg').onclose=function(){finish(null)};
$('cropOk').onclick=function(){
  var o=document.createElement('canvas');o.width=C.ow;o.height=C.oh;cdraw(o.getContext('2d'),C.ow,C.oh);
  o.toBlob(function(b){
    if(b&&b.type!=='image/webp')toast('Este navegador não gera WebP. A foto foi salva em '+b.type.split('/')[1].toUpperCase()+'.');
    finish(b);$('cropDlg').close()},'image/webp',0.9); /* [SaaS] 0.9: fotos bem menores, sem perda visível */
};
$('zoom').oninput=function(){C.s=C.contain+(C.cover*4-C.contain)*$('zoom').value/100;paint()};
$('rot').onclick=function(){C.rot=(C.rot+1)%4;reset()};
$('flip').onclick=function(){C.flip*=-1;paint()};$('ctr').onclick=reset;
var ptrs=new Map(),pinch=null;
function setZoomPct(v){var z=$('zoom');z.value=Math.max(0,Math.min(100,v));z.oninput()}
cv.onpointerdown=function(e){cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size===2){var q=Array.from(ptrs.values());pinch={d:Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y),z:+$('zoom').value};drag=null}else if(ptrs.size===1)drag={x:e.clientX,y:e.clientY}};
cv.onpointermove=function(e){
  if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&ptrs.size===2){var q=Array.from(ptrs.values()),d=Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y);if(pinch.d>0)setZoomPct(pinch.z+(d/pinch.d-1)*100);return}
  if(!drag)return;var k=C.V/cv.getBoundingClientRect().width,hx=C.V/2,hy=C.H/2;
  C.ox=Math.max(-hx,Math.min(hx,C.ox+(e.clientX-drag.x)*k));C.oy=Math.max(-hy,Math.min(hy,C.oy+(e.clientY-drag.y)*k));drag={x:e.clientX,y:e.clientY};paint()};
cv.onpointerup=cv.onpointercancel=function(e){ptrs.delete(e.pointerId);pinch=null;var q=Array.from(ptrs.values());drag=q.length===1?{x:q[0].x,y:q[0].y}:null};
cv.onwheel=function(e){e.preventDefault();var z=$('zoom');z.value=Math.max(0,Math.min(100,+z.value-e.deltaY/20));z.oninput()};
/* variações pré configuradas (modelos reutilizáveis) */
var PRE=[];
function seedPre(){return[{name:'Tamanho',opts:'P,M,G,GG'},{name:'Cor',opts:'Preto,Branco,Azul,Vermelho'}].map(function(d,i){return{id:'pre'+(i+1),name:d.name,opts:d.opts.split(',').map(function(n){return{n:n}})}})}
function savePresets(){return kvSet('presets',PRE)}
function varNames(){return cur.vars.map(function(g){return g.name.trim().toLowerCase()})}
function drawPres(){
  var used=varNames(),av=PRE.filter(function(g){return used.indexOf(g.name.trim().toLowerCase())<0});
  $('preSel').innerHTML=av.length?'<option value="">Selecione…</option>'+av.map(function(g){return '<option value="'+esc(g.name)+'">'+esc(g.name)+' ('+esc(g.opts.map(function(o){return o.n}).join(', '))+')</option>'}).join(''):'<option value="">'+(PRE.length?'Todas já estão neste produto':'Nenhuma pré configurada ainda')+'</option>';
  $('preSel').disabled=$('preUse').disabled=!av.length||cur.vars.length>=MAXVARS;
  $('preList').innerHTML=PRE.map(function(g){return '<span class="pt"><b>'+esc(g.name)+'</b> <span class="tp">'+esc(g.opts.map(function(o){return o.n}).join(', '))+'</span><button type="button" class="rm" data-pre="'+esc(g.id)+'" aria-label="Excluir pré configuração">×</button></span>'}).join('');
}
function saveAsPre(g){
  var name=g.name.trim();if(!name)return toast('Dê um nome à variação antes de salvá-la.');
  var ns=g.opts.map(function(o){return o.n.trim()});
  if(!ns.length||ns.some(function(n){return !n}))return toast('Preencha o nome das opções de "'+name+'" antes de salvar.');
  var i=-1;PRE.forEach(function(x,j){if(x.name.trim().toLowerCase()===name.toLowerCase())i=j});
  var rec={id:i<0?Date.now().toString(36):PRE[i].id,name:name,opts:ns.map(function(n){return{n:n}})};
  if(i<0)PRE.push(rec);else PRE[i]=rec;
  PRE.sort(function(a,b){return a.name.localeCompare(b.name,'pt-BR')});
  savePresets().then(function(){drawPres();toast(i<0?'Variação "'+name+'" salva para reutilizar.':'Pré configuração "'+name+'" atualizada.')});
}
$('preUse').onclick=function(){
  var nm=$('preSel').value;if(!nm)return toast('Escolha uma variação pré configurada.');
  if(cur.vars.length>=MAXVARS)return toast('Máximo de '+MAXVARS+' variações por produto.');
  var g=null;PRE.forEach(function(x){if(x.name===nm)g=x});if(!g)return;
  if(varNames().indexOf(g.name.trim().toLowerCase())>=0)return toast('Este produto já tem a variação "'+g.name+'".');
  cur.vars.push({name:g.name,opts:g.opts.map(function(o){return{n:o.n,q:0,p:null,c:null}})});
  drawVars();toast('Variação "'+g.name+'" adicionada. Informe as quantidades.');
};
$('preList').onclick=function(e){
  var b=e.target.closest('button[data-pre]');if(!b)return;
  if(!b.dataset.sure){b.dataset.sure='1';b.textContent='Confirmar';b.style.width='auto';b.style.fontSize='.72rem';b.style.padding='0 8px';setTimeout(function(){if(b.isConnected){delete b.dataset.sure;b.textContent='×';b.style.width='';b.style.fontSize='';b.style.padding=''}},3000);return}
  PRE=PRE.filter(function(x){return x.id!==b.dataset.pre});
  savePresets().then(function(){drawPres();toast('Variação pré configurada excluída.')});
};
/* variações */
function drawVars(){
  $('vars').innerHTML=cur.vars.map(function(g,gi){return '<div class="vg" data-g="'+gi+'"><div class="vh"><label class="fld"><span>Nome da variação</span><input data-k="gn" value="'+esc(g.name)+'" placeholder="Ex.: Tamanho, Cor"></label><button type="button" class="btn" data-a="rg">Remover</button></div>'+
   g.opts.map(function(o,oi){return '<div class="opt" data-o="'+oi+'"><label class="fld on"><span>Opção</span><input data-k="on" value="'+esc(o.n)+'" placeholder="Ex.: M"></label><div class="oline">'+
     '<label class="fld"><span>Quantidade</span><input data-k="oq" type="number" min="0" step="1" inputmode="numeric" value="'+o.q+'"></label>'+
     '<label class="fld"><span>Preço (opcional)</span><input data-k="op" type="number" min="0" step="0.01" inputmode="decimal" value="'+(o.p==null?'':o.p)+'" placeholder="'+pph()+'"></label>'+
     '<label class="fld full"><span>Custo (opcional)</span><input data-k="oc" type="number" min="0" step="0.01" inputmode="decimal" value="'+(o.c==null?'':o.c)+'" placeholder="'+cph()+'"></label>'+
     '</div><button type="button" class="ib rm" data-a="ro" aria-label="Remover opção">×</button>'+optPhotoHtml(o)+'</div>'}).join('')+
   '<div class="vf"><button type="button" class="btn" data-a="ao">Adicionar opção</button>'+(g.opts.length?'':'<button type="button" class="btn" data-a="pm">Usar P, M, G, GG</button>')+'<button type="button" class="btn" data-a="sp">Salvar como pré configurada</button><span class="cnt" data-c></span></div></div>'}).join('');
  $('addVar').hidden=cur.vars.length>=MAXVARS;cnt();drawPres();
}
function cnt(){var s=parseInt($('f-stock').value)||0;document.querySelectorAll('.vg').forEach(function(el,i){var t=sum(cur.vars[i]),c=el.querySelector('[data-c]');c.textContent='Distribuído: '+t+' de '+s;c.classList.toggle('over',t>s)})}
$('f-stock').oninput=cnt;
$('vars').oninput=function(e){
  var t=e.target,k=t.dataset.k,g=cur.vars[+t.closest('.vg').dataset.g];if(!k)return;
  if(k==='gn')g.name=t.value;
  else{var o=g.opts[+t.closest('.opt').dataset.o];
    if(k==='on')o.n=t.value;
    else if(k==='op')o.p=t.value===''?null:Math.max(0,+t.value||0);
    else if(k==='oc')o.c=t.value===''?null:Math.max(0,+t.value||0);
    else if(k==='oimg'){o.img=t.value===''?null:+t.value;drawVars();return}
    else{o.q=Math.max(0,parseInt(t.value)||0);var ex=sum(g)-(parseInt($('f-stock').value)||0);
      if(ex>0){o.q=Math.max(0,o.q-ex);t.value=o.q;toast('A soma não pode passar do estoque do produto.')}}}
  cnt();
};
$('vars').onclick=function(e){
  var b=e.target.closest('button');if(!b)return;var gi=+b.closest('.vg').dataset.g,g=cur.vars[gi],a=b.dataset.a;
  if(a==='rg')cur.vars.splice(gi,1);else if(a==='ao')g.opts.push({n:'',q:0,p:null,c:null,img:null});
  else if(a==='pm')g.opts=['P','M','G','GG'].map(function(n){return{n:n,q:0,p:null,c:null}});
  else if(a==='sp'){saveAsPre(g);return}
  else if(a==='ro')g.opts.splice(+b.closest('.opt').dataset.o,1);
  drawVars();
};
$('addVar').onclick=function(){cur.vars.push({name:cur.vars.length?'':'Tamanho',opts:[]});drawVars()};
/* salvar e excluir */
function check(){
  if(!cur.name)return 'Informe o nome do produto.';
  if(cur.price===''||+cur.price<0)return 'Informe o valor de venda.';
  if(cur.stock===''||parseInt(cur.stock)<0)return 'Informe a quantidade em estoque.';
  var st=parseInt(cur.stock);
  if(cur.sku&&P.some(function(x){return x.id!==cur.id&&(x.sku||'').toLowerCase()===cur.sku.toLowerCase()}))return 'Já existe outro produto com o código (SKU) "'+cur.sku+'".';
  var gn=cur.vars.map(function(g){return g.name.trim().toLowerCase()}).filter(Boolean);
  if(new Set(gn).size<gn.length)return 'Há variações com o mesmo nome. Use nomes diferentes (ex.: Tamanho e Cor).';
  for(var g of cur.vars){
    if(!g.name.trim())return 'Dê um nome para cada variação (ex.: Tamanho).';
    if(!g.opts.length)return 'A variação "'+g.name+'" precisa de ao menos uma opção.';
    var ns=g.opts.map(function(o){return o.n.trim().toLowerCase()});
    if(ns.some(function(n){return !n}))return 'Preencha o nome de todas as opções de "'+g.name+'".';
    if(new Set(ns).size<ns.length)return 'Há opções repetidas em "'+g.name+'".';
    if(sum(g)>st)return 'As quantidades de "'+g.name+'" somam '+sum(g)+' e passam do estoque ('+st+').';
  }
  return '';
}
$('saveP').onclick=async function(){
  FIELDS.forEach(function(k){cur[k]=$('f-'+k).value.trim()});
  var er=check();if(!er&&!P.some(function(x){return x.id===cur.id}))er=window.SaaS.productLimitMessage(P.length); /* [SaaS] limite do plano */
  $('ferr').textContent=er;$('ferr').hidden=!er;if(er)return;
  var p={id:cur.id||Date.now().toString(36),name:cur.name,desc:cur.desc,cat:cur.cat,sku:cur.sku,price:+cur.price,cost:+cur.cost||0,stock:parseInt(cur.stock),min:parseInt(cur.min)||0,imgs:cur.imgs,
    vars:cur.vars.map(function(g){return{name:g.name.trim(),opts:g.opts.map(function(o){return{n:o.n.trim(),q:o.q,p:o.p==null?null:o.p,c:o.c==null?null:o.c,img:o.img==null||o.img>=cur.imgs.length?null:o.img}})}})};
  var i=P.findIndex(function(x){return x.id===p.id});var old=P[i];if(i<0)P.unshift(p);else P[i]=p;if(!old&&p.stock>0)logMv(p,p.stock,'in','Estoque inicial');else if(old&&old.stock!==p.stock)logMv(p,p.stock-old.stock,'adj','Ajuste no cadastro do produto');
  await Promise.all([kvSet('products',P),kvSet('moves',M)]);syncStock();render();showList();drawReports();toast('Produto salvo.');
};
$('delBtn').onclick=async function(){
  var b=$('delBtn');
  if(!b.dataset.sure){b.dataset.sure=1;b.textContent='Confirmar exclusão';setTimeout(function(){delete b.dataset.sure;b.textContent='Excluir produto'},3500);return}
  delete b.dataset.sure;b.textContent='Excluir produto';
  P=P.filter(function(x){return x.id!==cur.id});await kvSet('products',P);syncStock();render();showList();drawReports();toast('Produto excluído.');
};
idb().then(function(){return Promise.all([kvGet('products'),kvGet('moves'),kvGet('sales'),kvGet('customers'),kvGet('catalog'),kvGet('presets'),kvGet('catalogDraft')])}).then(function(r){
  if(Array.isArray(r[0]))P=r[0];
  if(Array.isArray(r[1]))M=r[1];
  if(Array.isArray(r[2]))S=r[2];
  if(Array.isArray(r[3]))CLI=r[3];
  if(r[4]&&typeof r[4]==='object')CAT=Object.assign({},CAT_DEF,r[4]);
  CAT_PUB=r[4]&&typeof r[4]==='object'?r[4]:null;
  if(r[6]&&typeof r[6]==='object'){CAT=Object.assign({},CAT_DEF,r[6]);CAT_DIRTY=JSON.stringify(r[6])!==JSON.stringify(CAT_PUB)}
  if(CATALOG){var dr=catDraftFromPanel();if(dr)CAT=Object.assign({},CAT_DEF,dr)} /* prévia: mostra o rascunho do painel */
  updatePub();
  if(Array.isArray(r[5]))PRE=r[5];else if(r[5]==null){PRE=seedPre();kvSet('presets',PRE)}
  window.__loaded=true; /* B: dados carregados — skeletons desaparecem */
  syncStock();syncSales();render();
  if(!$('v-stock').hidden)drawStock();
  if(!$('v-sales').hidden)drawSales();
  if(!$('v-clients').hidden)drawClients();
  if(!$('v-reports').hidden)drawReports();
  if(!$('v-catalog').hidden){drawCatalogCfg();loadCatPrev()}
  if(CATALOG){catReadState();drawCatalogPage()}else checkPedidoLink();
});

/* ===== Estoque ===== */
var M=[],mv={t:'in',pid:null},st={tab:'p',fp:'all',fh:'all',lim:50};
var REASONS={in:['Compra de fornecedor','Devolução de cliente','Bonificação do fornecedor','Transferência recebida','Outro'],
 out:['Venda no balcão','Perda ou avaria','Furto ou extravio','Produto vencido','Uso interno','Amostra ou brinde','Devolução ao fornecedor','Outro'],adj:['Contagem de inventário']};
var TL={in:'Entrada',out:'Saída',adj:'Ajuste'};
var sta=function(p){return p.stock<=0?['Esgotado','bad']:p.stock<=p.min?['Estoque baixo','warn']:['Em dia','']};
// Formata datas: 'rel' = tempo relativo ("há 5 min"), 'date' = só a data, padrão = data + hora.
function fmtDate(ms,mode){
  var d=new Date(ms);
  if(mode==='rel'){
    var diff=Date.now()-ms,m=Math.round(diff/60000);
    if(m<1)return'agora';if(m<60)return'há '+m+' min';var h=Math.round(m/60);if(h<24)return'há '+h+' h';return'há '+Math.round(h/24)+' d';
  }
  if(mode==='date')return d.toLocaleDateString('pt-BR');
  return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function logMv(p,d,type,reason,note,v){M.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),t:Date.now(),pid:p.id,name:p.name,type:type,d:d,after:p.stock,reason:reason,note:note||'',v:v||''});if(M.length>1500)M.length=1500}
/* estado de colapso dos dias no histórico de estoque (persistido no localStorage) */
function histDays(){try{return JSON.parse(localStorage.getItem('stock_hist_days')||'{}')}catch(e){return{}}}
function histDayOpen(day){return histDays()[day]!==false}
function histDaySet(day,open){var s=histDays();s[day]=open;try{localStorage.setItem('stock_hist_days',JSON.stringify(s))}catch(e){}}
function drawStock(){
  var low=P.filter(function(p){return p.stock>0&&p.stock<=p.min}),out=P.filter(function(p){return p.stock<=0});
  var un=P.reduce(function(a,p){return a+p.stock},0),c=P.reduce(function(a,p){return a+stockVal(p,'cost')},0),v=P.reduce(function(a,p){return a+stockVal(p,'price')},0);
  $('stTiles').innerHTML=[['Produtos',P.length],['Unidades',un.toLocaleString('pt-BR')],['Custo do estoque',brl(c)],['Valor de venda',brl(v)],['Estoque baixo',low.length],['Esgotados',out.length]].map(function(x){return '<div class="card"><h3>'+x[0]+'</h3><div class="num">'+x[1]+'</div></div>'}).join('');
  document.querySelectorAll('#sTabs button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.t===st.tab)});
  $('mvProdWrap').hidden=st.tab!=='h';
  if(st.tab==='h'){
    var fpv=$('mvProdF').value;
    $('mvProdF').innerHTML='<option value="">Todos os produtos</option>'+P.slice().sort(function(a,b){return a.name.localeCompare(b.name,'pt-BR')}).map(function(p){return '<option value="'+p.id+'">'+esc(p.name)+'</option>'}).join('');
    if(fpv&&P.some(function(x){return x.id===fpv}))$('mvProdF').value=fpv;
  }
  var F=st.tab==='p'?[['all','Todos',P.length],['low','Estoque baixo',low.length],['out','Esgotados',out.length]]:[['all','Tudo'],['in','Entradas'],['out','Saídas'],['adj','Ajustes']];
  var fc=st.tab==='p'?st.fp:st.fh;
  $('sFil').innerHTML=F.map(function(f){return '<button data-f="'+f[0]+'" aria-pressed="'+(f[0]===fc)+'">'+f[1]+(f[2]!=null?' ('+f[2]+')':'')+'</button>'}).join('');
  var q=$('sq').value.trim().toLowerCase(),h;
  if(st.tab==='p'){
    var L=P.filter(function(p){return(st.fp==='all'||(st.fp==='low'?p.stock>0&&p.stock<=p.min:p.stock<=0))&&(!q||(p.name+' '+p.sku+' '+p.cat).toLowerCase().indexOf(q)>=0)}).sort(function(a,b){return a.name.localeCompare(b.name,'pt-BR')});
    h=L.length?L.map(function(p){var s=sta(p),vr=p.vars.map(function(g){return esc(g.name)+': '+g.opts.map(function(o){return esc(o.n)+' '+o.q}).join(', ')}).join(' | ');
      return '<div class="srow">'+(p.imgs[0]?'<img alt="" src="'+blobUrl(p.imgs[0])+'">':'<div class="noimg">'+NOIMG_SVG+'</div>')+'<div><strong>'+esc(p.name)+'</strong><p class="sub">'+(p.sku?'Código '+esc(p.sku)+'. ':'')+'Mínimo: '+p.min+' un.</p>'+(vr?'<p class="sub">'+vr+'</p>':'')+'</div><div class="q"><b>'+p.stock+'</b><br><span class="pill '+s[1]+'">'+s[0]+'</span></div><div class="ac"><button class="btn sm" data-a="in" data-id="'+p.id+'">Entrada</button><button class="btn sm" data-a="out" data-id="'+p.id+'">Saída</button><button class="btn sm" data-a="adj" data-id="'+p.id+'">Contagem</button><button class="btn sm" data-a="edit" data-id="'+p.id+'">Editar produto</button></div></div>'}).join('')
    :'<div class="empty">'+(P.length?'Nenhum produto neste filtro.':'Cadastre produtos na aba Produtos para controlar o estoque aqui.')+'</div>';
  }else{
    var fpv=$('mvProdF').value;
    var H=M.filter(function(m){return(st.fh==='all'||m.type===st.fh)&&(!fpv||m.pid===fpv)&&(!q||(m.name+' '+m.reason+' '+m.note).toLowerCase().indexOf(q)>=0)});
    if(H.length){
      var shown=H.slice(0,st.lim),days={};
      shown.forEach(function(m){var day=fmtDate(m.t,'date');(days[day]=days[day]||[]).push(m)});
      h=Object.keys(days).map(function(day){
        var open=histDayOpen(day);
        var lis=days[day].map(function(m){return '<li><span><strong>'+esc(m.name)+'</strong><small>'+TL[m.type]+': '+esc(m.reason)+(m.note?' ('+esc(m.note)+')':'')+'</small>'+(m.v?'<small>'+esc(m.v)+'</small>':'')+'<small>'+fmtDate(m.t)+'</small></span><span class="'+(m.d>0?'pos':'neg')+'">'+(m.d>0?'+':'')+m.d+'<small>saldo '+m.after+'</small></span></li>'}).join('');
        return '<h4 class="mday'+(open?' open':'')+'" data-day="'+esc(day)+'" role="button" tabindex="0"><span>'+esc(day)+'</span><span class="car">'+(open?'−':'+')+'</span></h4><ul class="rows"'+(open?'':' hidden')+'>'+lis+'</ul>';
      }).join('');
      if(H.length>st.lim)h+='<button class="btn sm" id="more" style="margin-top:12px">Ver mais</button>';
    }else h='<div class="empty">Nenhuma movimentação registrada ainda.</div>';
  }
  $('sList').innerHTML=h;
}
$('sTabs').onclick=function(e){var b=e.target.closest('button');if(b){st.tab=b.dataset.t;st.lim=50;drawStock()}};
$('sFil').onclick=function(e){var b=e.target.closest('button');if(b){st[st.tab==='p'?'fp':'fh']=b.dataset.f;st.lim=50;drawStock()}};
$('sq').oninput=drawStock;
$('sList').onclick=function(e){
  var h4=e.target.closest('.mday');if(h4){var day=h4.dataset.day,open=!h4.classList.contains('open');histDaySet(day,open);h4.classList.toggle('open',open);h4.querySelector('.car').textContent=open?'−':'+';var ul=h4.nextElementSibling;if(ul)ul.hidden=!open;return}
  var b=e.target.closest('button');if(!b)return;if(b.id==='more'){st.lim+=50;return drawStock()}
  var p=P.find(function(x){return x.id===b.dataset.id});if(!p)return;
  if(b.dataset.a==='edit'){show('products');openForm(p)}else openMv(b.dataset.a,p.id);
};
$('mvProdF').onchange=function(){st.lim=50;drawStock()};
$('mvIn').onclick=function(){openMv('in')};$('mvOut').onclick=function(){openMv('out')};
/* movimentação */
function openMv(t,pid){
  if(!P.length)return toast('Cadastre um produto antes de movimentar o estoque.');
  mv.t=t;mv.pid=pid||mv.pid||P[0].id;if(!P.some(function(x){return x.id===mv.pid}))mv.pid=P[0].id;
  $('mvP').innerHTML=P.slice().sort(function(a,b){return a.name.localeCompare(b.name,'pt-BR')}).map(function(p){return '<option value="'+p.id+'">'+esc(p.name)+' ('+p.stock+' un.)</option>'}).join('');
  $('mvN').value='';$('mvErr').hidden=true;drawMv();$('mvDlg').showModal();
}
function drawMv(){
  var p=P.find(function(x){return x.id===mv.pid});$('mvP').value=mv.pid;
  document.querySelectorAll('#mvTabs button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.t===mv.t)});
  $('mvT').textContent={in:'Registrar entrada',out:'Registrar saída',adj:'Contagem de inventário'}[mv.t];
  $('mvQL').textContent={in:'Quantidade a adicionar',out:'Quantidade a retirar',adj:'Quantidade contada (novo estoque total)'}[mv.t];
  $('mvQ').value=mv.t==='adj'?p.stock:'';$('mvCur').textContent='Estoque atual: '+p.stock+' un.';
  $('mvRW').hidden=mv.t==='adj';
  $('mvR').innerHTML=REASONS[mv.t].map(function(r){return '<option>'+r+'</option>'}).join('');
  $('mvVars').innerHTML=p.vars.map(function(g,i){return '<label class="fld"><span>'+esc(g.name)+' (opcional)</span><select data-gi="'+i+'"><option value="">Não especificar</option>'+g.opts.map(function(o,j){return '<option value="'+j+'">'+esc(o.n)+' ('+o.q+' un.)</option>'}).join('')+'</select></label>'}).join('');
  mvPrev();
}
function mvPrev(){
  var p=P.find(function(x){return x.id===mv.pid}),q=parseInt($('mvQ').value),n=isNaN(q)?null:(mv.t==='in'?p.stock+q:mv.t==='out'?p.stock-q:q);
  $('mvPrev').textContent=n==null?'':'Novo estoque: '+n+' un.';$('mvPrev').classList.toggle('over',n!=null&&n<0);
}
$('mvQ').oninput=mvPrev;
$('mvP').onchange=function(){mv.pid=$('mvP').value;drawMv()};
$('mvTabs').onclick=function(e){var b=e.target.closest('button');if(b){mv.t=b.dataset.t;drawMv()}};
$('mvOk').onclick=async function(){
  var p=P.find(function(x){return x.id===mv.pid}),q=parseInt($('mvQ').value),er='',parts=[];
  var reason=mv.t==='adj'?REASONS.adj[0]:$('mvR').value,note=$('mvN').value.trim();
  if(isNaN(q)||q<0||(mv.t!=='adj'&&q<1))er='Informe a quantidade.';
  var d=mv.t==='in'?q:mv.t==='out'?-q:q-p.stock;
  if(!er&&d===0)er='Essa quantidade não altera o estoque.';
  if(!er&&p.stock+d<0)er='Estoque insuficiente: o produto tem só '+p.stock+' un.';
  if(!er&&reason==='Outro'&&!note)er='Explique o motivo no campo de observação.';
  var vars=cloneVars(p);
  if(!er)document.querySelectorAll('#mvVars select').forEach(function(sel){
    if(sel.value==='')return;var g=vars[+sel.dataset.gi],o=g.opts[+sel.value];o.q+=d;parts.push(g.name+': '+o.n);
    if(o.q<0)er='A opção "'+o.n+'" tem só '+(o.q-d)+' un.';
  });
  if(!er)vars.forEach(function(g){if(sum(g)>p.stock+d)er='Com essa movimentação, as quantidades de "'+g.name+'" passariam do estoque. Escolha a opção afetada ou ajuste as variações no cadastro do produto.'});
  $('mvErr').textContent=er;$('mvErr').hidden=!er;if(er)return;
  p.stock+=d;p.vars=vars;logMv(p,d,mv.t,reason,note,parts.join(', '));
  await Promise.all([kvSet('products',P),kvSet('moves',M)]);
  syncStock();render();drawStock();drawReports();$('mvDlg').close();
  toast('Movimentação registrada. Novo estoque de '+p.name+': '+p.stock+' un.');
};

/* ===== Vendas ===== */
var S=[],sale=null,PAYS=['Dinheiro','Cartão de crédito','Cartão de débito','Pix','Outro'],sst={period:'all',status:'all',lim:50};
function syncSales(){
  var ok=S.filter(function(s){return s.status==='ok'}),n=new Date(),y=n.getFullYear(),mo=n.getMonth(),d=n.getDate();
  var startDay=new Date(y,mo,d).getTime(),startMonth=new Date(y,mo,1).getTime();
  var td=ok.filter(function(s){return s.t>=startDay}),mt=ok.filter(function(s){return s.t>=startMonth});
  D.today=td.reduce(function(a,s){return a+s.total},0);D.todayN=td.length;
  D.month=mt.reduce(function(a,s){return a+s.total},0);D.cost=mt.reduce(function(a,s){return a+s.cost},0);
  D.week=[];
  for(var i=6;i>=0;i--){var d0=new Date(y,mo,d-i).getTime(),d1=new Date(y,mo,d-i+1).getTime();
    D.week.push(ok.filter(function(s){return s.t>=d0&&s.t<d1}).reduce(function(a,s){return a+s.total},0));}
  D.recent=ok.slice().sort(function(a,b){return b.t-a.t}).slice(0,6).map(function(s){return[s.items.map(function(it){return it.name}).join(', ')||'Venda',fmtDate(s.t,'rel'),s.total]});
}
/* listagem e filtros */
function drawSales(){
  document.querySelectorAll('#saPeriod button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.p===sst.period)});
  var cutoff=sst.period==='today'?new Date(new Date().setHours(0,0,0,0)).getTime():sst.period==='all'?0:Date.now()-(+sst.period)*86400000;
  var base=S.filter(function(s){return s.t>=cutoff});
  var q=$('saq').value.trim().toLowerCase();
  var searched=base.filter(function(s){return!q||(s.cliente+' '+s.pay+' '+s.items.map(function(it){return it.name}).join(' ')).toLowerCase().indexOf(q)>=0});
  var cOk=searched.filter(function(s){return s.status==='ok'}),cCan=searched.filter(function(s){return s.status==='cancel'});
  var F=[['all','Tudo',searched.length],['ok','Concluídas',cOk.length],['cancel','Canceladas',cCan.length]];
  $('saFil').innerHTML=F.map(function(f){return'<button data-f="'+f[0]+'" aria-pressed="'+(f[0]===sst.status)+'">'+f[1]+' ('+f[2]+')</button>'}).join('');
  var rev=cOk.reduce(function(a,s){return a+s.total},0),cost=cOk.reduce(function(a,s){return a+s.cost},0);
  $('saTiles').innerHTML=[['Vendas concluídas',cOk.length],['Faturamento',brl(rev)],['Lucro',brl(rev-cost)],['Ticket médio',cOk.length?brl(rev/cOk.length):brl(0)],['Canceladas',cCan.length]]
    .map(function(x){return'<div class="card"><h3>'+x[0]+'</h3><div class="num">'+x[1]+'</div></div>'}).join('');
  var L=sst.status==='all'?searched:(sst.status==='ok'?cOk:cCan);
  $('saList').innerHTML=L.length?L.slice(0,sst.lim).map(saleRow).join('')+(L.length>sst.lim?'<div style="text-align:center;padding:14px 0"><button class="btn sm" id="saMore">Ver mais</button></div>':'')
   :'<div class="empty">'+(S.length?'Nenhuma venda encontrada para esse filtro.':'Nenhuma venda registrada ainda. Clique em "Nova venda" para começar.')+'</div>';
}
function saleRow(s){
  var itemsHtml=s.items.map(function(it){return'<li><span>'+esc(it.name)+(it.varTxt?'<small>'+esc(it.varTxt)+'</small>':'')+'<small>'+it.qty+' un. × '+brl(it.price)+' · custo '+brl(it.cost||0)+'/un.</small></span><span>'+brl(it.qty*it.price)+'</span></li>'}).join('');
  var pill=s.status==='ok'?'<span class="pill">Concluída</span>':'<span class="pill bad">Cancelada</span>';
  var meta=[];if(s.cliente)meta.push('Cliente: '+esc(s.cliente));meta.push('Pagamento: '+esc(s.pay));if(s.desconto)meta.push('Desconto: '+brl(s.desconto));if(s.note)meta.push(esc(s.note));
  var lucro=s.total-s.cost;
  var actions=s.status==='ok'
    ?'<button class="btn sm" data-a="cancel" data-id="'+s.id+'">Cancelar venda</button><button class="btn sm danger" data-a="del" data-id="'+s.id+'">Excluir</button>'
    :'<button class="btn sm" data-a="restore" data-id="'+s.id+'">Marcar como vendida novamente</button><button class="btn sm danger" data-a="del" data-id="'+s.id+'">Excluir</button>';
  return'<div class="sale"><div class="sale-head"><div><strong>'+(s.n?'Venda #'+s.n+' · ':'')+fmtDate(s.t)+'</strong> '+pill+'<p class="sub">'+meta.join(' · ')+'</p><p class="sub">Custo: '+brl(s.cost)+' · Lucro: <span class="'+(lucro<0?'neg':'pos')+'">'+brl(lucro)+'</span></p></div><div class="q"><b>'+brl(s.total)+'</b></div></div>'+
    '<ul class="rows">'+itemsHtml+'</ul><div class="row-ac">'+actions+'</div></div>';
}
$('saPeriod').onclick=function(e){var b=e.target.closest('button');if(b){sst.period=b.dataset.p;sst.lim=50;drawSales()}};
$('saFil').onclick=function(e){var b=e.target.closest('button');if(b){sst.status=b.dataset.f;sst.lim=50;drawSales()}};
$('saq').oninput=function(){sst.lim=50;drawSales()};
$('saList').onclick=function(e){
  var b=e.target.closest('button');if(!b)return;if(b.id==='saMore'){sst.lim+=50;return drawSales()}
  var s=S.find(function(x){return x.id===b.dataset.id});if(!s)return;
  if(b.dataset.a==='cancel')return cancelSale(s);
  if(b.dataset.a==='restore')return restoreSale(s);
  if(b.dataset.a==='del')return delSale(s,b);
};
/* cancelar, reativar e excluir */
// Cópia das variações preservando TODOS os campos (nome, quantidade, preço e custo).
function cloneVars(p){return p.vars.map(function(g){return{name:g.name,opts:g.opts.map(function(o){return{n:o.n,q:o.q,p:o.p==null?null:o.p,c:o.c==null?null:o.c,img:o.img==null?null:o.img}})}})}
// Localiza a opção de uma venda no cadastro atual (pelo nome; se o nome mudou, pela posição).
function locOpt(vars,v){
  var gi=vars.findIndex(function(g){return g.name===v.g});if(gi<0)gi=v.gi;
  var g=vars[gi];if(!g)return null;
  var oi=g.opts.findIndex(function(o){return o.n===v.o});if(oi<0)oi=v.oi;
  return g.opts[oi]||null;
}
function applyStockDelta(s,sign){
  var byProd={};s.items.forEach(function(it){(byProd[it.pid]=byProd[it.pid]||[]).push(it)});
  var er='',plan={};
  Object.keys(byProd).some(function(pid){
    var p=P.find(function(x){return x.id===pid});if(!p)return false;
    var totalQ=byProd[pid].reduce(function(a,it){return a+it.qty},0);
    if(sign<0&&totalQ>p.stock){er='Estoque insuficiente para reativar "'+p.name+'": disponível '+p.stock+' un.';return true}
    var vars=cloneVars(p);
    var bad=byProd[pid].some(function(it){return it.vars.some(function(v){var o=locOpt(vars,v);if(!o)return false;o.q+=it.qty*sign;return o.q<0})});
    if(bad){er='Estoque da variação ficou insuficiente ao reativar "'+p.name+'".';return true}
    if(sign<0&&vars.some(function(g){return sum(g)>p.stock-totalQ})){er='Não foi possível reativar: ajuste as variações de "'+p.name+'" no cadastro do produto.';return true}
    plan[pid]={p:p,stock:p.stock+totalQ*sign,vars:vars,totalQ:totalQ};return false;
  });
  if(er)return er;
  Object.keys(plan).forEach(function(pid){var pl=plan[pid];pl.p.stock=pl.stock;pl.p.vars=pl.vars;
    logMv(pl.p,pl.totalQ*sign,sign>0?'in':'out',sign>0?'Cancelamento de venda':'Venda reativada',s.n?'Venda #'+s.n:'Venda de '+fmtDate(s.t));});
  return'';
}
function persistAndRefreshSales(msg){
  return Promise.all([kvSet('products',P),kvSet('moves',M),kvSet('sales',S)]).then(function(){
    syncStock();syncSales();render();drawStock();drawSales();drawReports();if(msg)toast(msg);
  });
}
function cancelSale(s){var er=applyStockDelta(s,1);if(er)return toast(er);s.status='cancel';persistAndRefreshSales('Venda cancelada e itens devolvidos ao estoque.')}
function restoreSale(s){var er=applyStockDelta(s,-1);if(er)return toast(er);s.status='ok';persistAndRefreshSales('Venda marcada como vendida novamente.')}
function delSale(s,b){
  if(!b.dataset.sure){b.dataset.sure='1';b.textContent='Confirmar exclusão';setTimeout(function(){if(b.isConnected){delete b.dataset.sure;b.textContent='Excluir'}},3500);return}
  if(s.status==='ok')applyStockDelta(s,1);
  S=S.filter(function(x){return x.id!==s.id});
  persistAndRefreshSales('Venda excluída.');
}
/* nova venda */
function cartQty(pid,fn){return sale.items.filter(function(it){return it.pid===pid&&(!fn||fn(it))}).reduce(function(a,it){return a+it.qty},0)}
function saleProd(){return P.find(function(x){return x.id===$('saP').value})}
// Opções escolhidas na tela, uma por grupo de variação (as não escolhidas ficam de fora).
function saleSel(p){
  var out=[];document.querySelectorAll('#saVars select').forEach(function(sel){
    if(sel.value==='')return;var gi=+sel.dataset.gi,oi=+sel.value;out.push({gi:gi,oi:oi,g:p.vars[gi].name,o:p.vars[gi].opts[oi].n});
  });return out;
}
// Preço e custo unitários para as opções escolhidas. A opção vale o preço/custo próprio dela; se ficou em branco
// (ou a opção não foi escolhida), vale o do produto principal. Mesma regra usada para valorizar o estoque.
function unitFor(p,sel){
  function pick(f,base){
    var gi=p.vars.findIndex(function(g){return g.opts.some(function(o){return o[f]!=null})});
    if(gi<0)return base;
    var v=sel.find(function(x){return x.gi===gi}),o=v&&p.vars[gi].opts[v.oi];
    return o&&o[f]!=null?o[f]:base;
  }
  return{price:pick('p',p.price),cost:pick('c',p.cost||0)};
}
function saleInfo(){
  var p=saleProd();if(!p)return;
  var u=unitFor(p,saleSel(p)),price=parseFloat($('saPrice').value);if(isNaN(price))price=u.price;
  $('saStock').textContent='Estoque disponível: '+Math.max(0,p.stock-cartQty(p.id))+' un.';
  $('saCostInfo').innerHTML='Custo unitário: <b>'+brl(u.cost)+'</b> · Lucro por unidade: <b class="'+(price-u.cost<0?'neg':'pos')+'">'+brl(price-u.cost)+'</b>';
}
function recalcPrice(){var p=saleProd();if(!p)return;$('saPrice').value=unitFor(p,saleSel(p)).price.toFixed(2);saleInfo()}
function drawSaleProd(){
  var p=saleProd();if(!p)return;
  $('saVars').innerHTML=p.vars.map(function(g,i){return'<label class="fld"><span>'+esc(g.name)+'</span><select data-gi="'+i+'"><option value="">Selecione uma opção</option>'+g.opts.map(function(o,j){return'<option value="'+j+'">'+esc(o.n)+' ('+o.q+' un.)</option>'}).join('')+'</select></label>'}).join('');
  recalcPrice();
}
function drawCart(){
  $('saCartWrap').hidden=!sale.items.length;
  $('saCart').innerHTML=sale.items.map(function(it,i){return'<li><span><strong>'+esc(it.name)+'</strong>'+(it.varTxt?'<small>'+esc(it.varTxt)+'</small>':'')+'<small>'+it.qty+' un. × '+brl(it.price)+' · custo '+brl(it.cost)+'/un.</small></span><span class="q">'+brl(it.qty*it.price)+'<br><button type="button" class="linerm" data-i="'+i+'">Remover</button></span></li>'}).join('');
  saleCalc();
}
function saleCalc(){
  var sub=sale.items.reduce(function(a,it){return a+it.qty*it.price},0),cost=sale.items.reduce(function(a,it){return a+it.qty*it.cost},0),desc=Math.max(0,+$('saDesc').value||0),tot=Math.max(0,sub-desc);
  $('saTotal').textContent='Total: '+brl(tot)+(desc?' (desconto de '+brl(desc)+' sobre '+brl(sub)+')':'')+(sale.items.length?' · Lucro: '+brl(tot-cost):'');
}
/* ===== código único do pedido (catálogo → WhatsApp → venda) =====
   Formato curto: ESTQ1.<id>.<produto>:<qtd>:<preço>[/<opção>/<opção>][,<produto>…]
   O preço vai em centavos na base 36 (2550 → '1yu'), então o código fica com poucos caracteres.
   Ex.: ESTQ1.K3P9X1A.m8d2f1c:2:1yu
   Também aceita o formato antigo (ESTQ1.<base64>) e o link enviado no WhatsApp. */
var PCODE='ESTQ1.';
function b36(n){return Math.round(n).toString(36)}
function un36(s){return parseInt(s,36)}
function norm(s){s=String(s==null?'':s).trim().toLowerCase();try{s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')}catch(e){}return s}
function optSafe(s){return String(s||'').replace(/[\s+/:,.|?&=#%]+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').slice(0,28)}
function optCands(on){var a=[on],b=on.replace(/_/g,' ');if(b!==on)a.push(b);return a}
function dec(s){try{return decodeURIComponent(s)}catch(e){return s}}
function newCodeId(){return(Date.now().toString(36).slice(-6)+Math.random().toString(36).slice(2,3)).toUpperCase()}
// gera o código com os itens do carrinho do catálogo
function orderCode(list){
  var id=newCodeId();
  var body=list.map(function(l){
    var p=P.find(function(x){return x.id===l.pid});if(!p)return'';
    var t=p.id+':'+l.qty+':'+b36(unitFor(p,l.vars).price*100);
    var os=(l.vars||[]).map(function(v){return optSafe(v.o)}).filter(function(x){return !!x});
    return os.length?t+'/'+os.join('/'):t;
  }).filter(function(x){return !!x}).join(',');
  return body?{id:id,code:PCODE+id+'.'+body}:null;
}
// link CURTO que leva à tela do pedido: base?p=<corpo>  (sem o prefixo "ESTQ1." e sem %XX desnecessário)
function pedidoLink(code){
  var u=location.origin+'/app/';
  if(!/^https?:/i.test(u))return '';
  var body=String(code||'').replace(/^ESTQ1\./i,'').replace(/[^A-Za-z0-9.:,/_~-]/g,function(c){return encodeURIComponent(c)});
  return body?u+'?p='+body:'';
}
// devolve o código completo (ESTQ1.…) a partir do que veio no link/campo
function fullCode(raw){
  var m=String(raw||'').match(/[?&#](?:pedido|p)=([^&#\s]+)/);
  var s=m?m[1]:(String(raw||'').match(/ESTQ1\.([^\s"'<>]+)/)||[])[1];
  if(!s){var t=String(raw||'').trim();if(t&&/^[A-Za-z0-9]+[.]/.test(t)&&t.indexOf(':')>0)s=t}
  if(!s)return '';
  s=dec(s).replace(/^ESTQ1[.=]/i,'').replace(/[.,;:)\]]+$/,'');
  return s?PCODE+s:'';
}
function parseV2(s){
  var d=s.indexOf('.');if(d<1)return null;
  var id=s.slice(0,d).toUpperCase(),items=[];
  s.slice(d+1).split(',').forEach(function(t){
    if(!t)return;
    var f=t.split('/'),pt=(f.shift()||'').split(':');
    if(pt.length<3)return;
    var c=un36(pt[2]),q=un36(pt[1]);
    items.push({pid:pt[0],nm:'',qty:isNaN(q)||q<1?1:q,price:isNaN(c)?null:c/100,opts:f.map(dec)});
  });
  return items.length?{id:id,items:items}:null;
}
function b64d(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return decodeURIComponent(escape(atob(s)))}
function parseV1(s){   // formato antigo, mantido para pedidos já enviados
  var o;try{o=JSON.parse(b64d(s))}catch(e){return null}
  if(!o||o.v!==1||!Array.isArray(o.it)||!o.it.length)return null;
  var items=[];
  o.it.forEach(function(it){
    if(!Array.isArray(it)||it.length<4)return;
    items.push({pid:String(it[0]),nm:String(it[1]||''),qty:Math.max(1,Math.round(+it[3])||1),price:isFinite(+it[4])?+it[4]:null,
      opts:(Array.isArray(it[2])?it[2]:[]).map(function(v){return{g:String(v[0]||''),o:String(v[1]||'')}})});
  });
  return items.length?{id:String(o.id||''),items:items}:null;
}
// aceita o código puro, a mensagem inteira ou o link do pedido
function readOrder(raw){
  var full=fullCode(raw);
  if(!full)return{e:'Código do pedido não encontrado. Copie a mensagem do cliente inteira — ela começa com ESTQ1.'};
  var s=full.slice(PCODE.length);
  var o=s.indexOf(':')>0?parseV2(s):parseV1(s);
  if(!o)return{e:'Não entendi este código. Confira se copiou a mensagem completa.'};
  return{o:o};
}
var lastCode='';
function codeMsg(t,warn){var el=$('saCodeMsg');el.hidden=false;el.className='sub cmsg'+(warn?' warn':'');el.textContent=t}
// preenche a venda com os produtos, variações, quantidades e valores do pedido
function fillFromOrder(raw){
  var rd=readOrder(raw);if(rd.e)return{e:rd.e};
  var o=rd.o;
  if(lastCode===o.id&&o.id&&sale.items.length)return{e:'O pedido '+o.id+' já foi preenchido nesta venda.'};
  var add=0,warn=[],total=0;
  o.items.forEach(function(it){
    var p=P.find(function(x){return x.id===it.pid});
    if(!p&&it.nm)p=P.find(function(x){return norm(x.name)===norm(it.nm)});
    if(!p){warn.push('• '+(it.nm||it.pid)+': produto não encontrado no catálogo.');return}
    var sel=[],vtxt=[],bad=false,picked={};
    it.opts.forEach(function(op){
      var gn=typeof op==='string'?'':String(op.g||''),on=typeof op==='string'?op:String(op.o||'');
      if(!on)return;
      var gi=-1,oi=-1,cands=optCands(on);
      p.vars.forEach(function(g,j){
        if(gi>=0||(gn&&norm(g.name)!==norm(gn)))return;
        var k=g.opts.findIndex(function(x){return cands.some(function(c){return norm(x.n)===norm(c)})});
        if(k>=0){gi=j;oi=k}
      });
      if(gi<0){bad=true;warn.push('• '+p.name+' — opção "'+(gn?gn+': ':'')+on.replace(/_/g,' ')+'" não existe no cadastro: escolha na venda.');return}
      picked[gi]=1;sel.push({gi:gi,oi:oi,g:p.vars[gi].name,o:p.vars[gi].opts[oi].n});vtxt.push(p.vars[gi].name+': '+p.vars[gi].opts[oi].n);
    });
    p.vars.forEach(function(g,j){if(!picked[j]&&needsPick(g)){bad=true;warn.push('• '+p.name+' — variação "'+g.name+'" não veio no pedido: escolha na venda.')}});
    var u=unitFor(p,sel),price=it.price==null?u.price:it.price,q=it.qty;
    if(it.price!=null&&Math.abs(price-u.price)>0.004)warn.push('• '+p.name+': no pedido '+brl(price)+', no catálogo '+brl(u.price)+' — mantido o valor do pedido.');
    var disp=Math.min.apply(null,[p.stock].concat(sel.map(function(v){return p.vars[v.gi].opts[v.oi].q})));
    if(q>disp)warn.push('• '+p.name+': pedido de '+q+' un., disponível '+disp+' un.');
    if(bad)warn.push('• '+p.name+': revise as variações antes de finalizar.');
    var varTxt=vtxt.join(', '),same=sale.items.find(function(x){return x.pid===p.id&&x.varTxt===varTxt&&x.price===price&&x.cost===u.cost});
    if(same)same.qty+=q;else sale.items.push({pid:p.id,name:p.name,varTxt:varTxt,vars:sel,qty:q,price:price,cost:u.cost});
    total+=q*price;add++;
  });
  if(!add)return{e:'Nenhum produto do pedido pôde ser preenchido.'+(warn.length?'\n'+warn.join('\n'):'')};
  lastCode=o.id;
  if(!$('saNote').value.trim())$('saNote').value='Pedido WhatsApp'+(o.id?' '+o.id:'');
  var msg='Pedido'+(o.id?' '+o.id:'')+': '+plural(add,'produto preenchido','produtos preenchidos')+(total>0?' · total do pedido '+brl(total):'')+'.';
  return{msg:msg,warn:warn};
}
function applyOrderCode(raw){
  var r=fillFromOrder(raw);
  if(r.e)return codeMsg(r.e,true);
  drawCart();saleInfo();
  codeMsg(r.msg+(r.warn.length?'\n'+r.warn.join('\n'):''),r.warn.length>0);
  toast(r.warn.length?'Pedido preenchido com avisos — confira os itens.':'Pedido preenchido. Confirme os itens com o cliente.');
}
$('saCodeGo').onclick=function(){var v=$('saCode').value.trim();if(!v)return codeMsg('Cole o código do pedido para preencher a venda.',true);applyOrderCode(v)};
$('saCodePaste').onclick=function(){
  if(!navigator.clipboard||!navigator.clipboard.readText)return codeMsg('Seu navegador não deixa colar automaticamente: toque no campo acima e cole com o dedo.',true);
  navigator.clipboard.readText().then(function(t){$('saCode').value=String(t||'').trim();applyOrderCode(t)},
    function(){codeMsg('Não consegui ler a área de transferência: toque no campo acima e cole com o dedo.',true)});
};
$('saCode').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();$('saCodeGo').onclick()}};
$('saCode').onpaste=function(){var el=this;setTimeout(function(){if(el.value.trim())applyOrderCode(el.value)},0)};
$('saLinkGo').onclick=function(){var v=$('saLink').value.trim();if(!v)return codeMsg('Cole o link do pedido (ele termina com ?p=…).',true);applyOrderCode(v)};
/* ===== tela do pedido: o link do WhatsApp abre aqui, com o código pronto para copiar ===== */
function orderItemInfo(p,it){
  var sel=[],vtxt=[],bad=false;
  (it.opts||[]).forEach(function(op){
    if(!p)return;
    var gn=typeof op==='string'?'':String(op.g||''),on=typeof op==='string'?op:String(op.o||'');
    if(!on)return;
    var gi=-1,oi=-1,cands=optCands(on);
    p.vars.forEach(function(g,j){
      if(gi>=0||(gn&&norm(g.name)!==norm(gn)))return;
      var k=g.opts.findIndex(function(x){return cands.some(function(c){return norm(x.n)===norm(c)})});
      if(k>=0){gi=j;oi=k}
    });
    if(gi<0){bad=true;vtxt.push((gn?gn+': ':'')+on.replace(/_/g,' '));return}
    sel.push({gi:gi,oi:oi,g:p.vars[gi].name,o:p.vars[gi].opts[oi].n});vtxt.push(p.vars[gi].name+': '+p.vars[gi].opts[oi].n);
  });
  return{sel:sel,vtxt:vtxt.join(', '),bad:bad};
}
function showPedidoDlg(raw){
  var full=fullCode(raw),rd=readOrder(full);
  if(rd.e)return toast(rd.e);
  var o=rd.o,nome=catName();
  $('pdId').textContent=o.id||'';
  $('pdCode').value=full;
  $('pdFrom').textContent='Enviado pelo cliente para o WhatsApp da loja. Confira antes de registrar.';
  var tot=0,ok=true,rows=[];
  o.items.forEach(function(it){
    var p=P.find(function(x){return x.id===it.pid});
    if(!p&&it.nm)p=P.find(function(x){return norm(x.name)===norm(it.nm)});
    var info=p?orderItemInfo(p,it):{vtxt:'',bad:false};
    var up=it.price!=null?it.price:(p&&!info.bad?unitFor(p,info.sel).price:null);
    if(up==null)ok=false;else tot+=up*it.qty;
    rows.push('<li><span class="pi-n"><b>'+esc(p?p.name:(it.nm||'Produto '+it.pid))+'</b>'+
      (info.vtxt?'<span class="pi-v">'+esc(info.vtxt)+'</span>':'')+
      (p?'':(it.nm?'':'<span class="pi-v">não está no seu catálogo</span>'))+
      (p&&info.bad?'<span class="pi-v">opção não encontrada no cadastro</span>':'')+'</span>'+
      '<span class="pi-p">'+it.qty+'x'+(up!=null?'<br>'+brl(up*it.qty):'')+'</span></li>');
  });
  $('pdItemsT').textContent=plural(o.items.length,'item no pedido','itens no pedido')+(ok?' · total '+brl(tot):'');
  $('pdItems').innerHTML=rows.join('');
  $('pdMsg').textContent='Copie o código e cole em Nova venda → Pedido do WhatsApp, ou toque em “Preencher venda” para lançar '+
    (P.length?'automaticamente.':'— antes disso, cadastre os produtos.');
  if(!$('pedidoDlg').open)$('pedidoDlg').showModal();
}
$('pdCopy').onclick=function(){
  var el=$('pdCode'),v=el.value;if(!v)return;
  var done=function(ok){toast(ok?'Código copiado. Cole em Nova venda → Pedido do WhatsApp.':'Selecione o código acima e copie manualmente.')};
  el.focus();el.select();
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(v).then(function(){done(true)},function(){try{done(document.execCommand('copy'))}catch(e){done(false)}});
  else{try{done(document.execCommand('copy'))}catch(e){done(false)}}
};
$('pdFill').onclick=function(){
  var v=$('pdCode').value.trim();if(!v)return;
  $('pedidoDlg').close();
  if(!P.length)return toast('Cadastre um produto antes de registrar uma venda.');
  show('sales');openSale();
  $('saCode').value=v;applyOrderCode(v);
};
// link ?p=… (curto, novo) mostra a tela do pedido; ?pedido=… (antigo) preenche a venda direto
function checkPedidoLink(raw){
  var p='',ped='';
  if(raw!=null){p=raw;ped=raw}
  else{
    var q=location.search||'',h=location.hash||'';
    var m=q.match(/[?&]p=([^&#\s]+)/i);if(m)p=dec(m[1]);
    if(!p){var a=q.match(/[?&]pedido=([^&#\s]+)/i);if(a)ped=dec(a[1])}
    if(!p&&!ped){var b=h.match(/[#&]p=([^&#\s]+)/i);if(b)p=dec(b[1])}
    if(!p&&!ped){var c=h.match(/[#&]pedido=([^&#\s]+)/i);if(c)ped=dec(c[1])}
  }
  if(!p&&!ped)return false;
  if(raw===undefined){try{history.replaceState(null,'',location.href.split('?')[0].split('#')[0])}catch(e){}}
  if(CATALOG)return false;   /* dentro do catálogo (cliente) não há venda a registrar */
  if(p){showPedidoDlg(p);return true}   /* a tela abre mesmo sem produtos: o código sempre pode ser copiado */
  if(!P.length)return false;
  show('sales');openSale();
  $('saCode').value=ped;applyOrderCode(ped);
  return true;
}
function openSale(){
  if(!P.length)return toast('Cadastre um produto antes de registrar uma venda.');
  sale={items:[]};lastCode='';
  $('saCode').value='';$('saLink').value='';$('saCodeMsg').hidden=true;$('saCodeMsg').textContent='';
  $('saP').innerHTML=P.slice().sort(function(a,b){return a.name.localeCompare(b.name,'pt-BR')}).map(function(p){return'<option value="'+p.id+'">'+esc(p.name)+' ('+p.stock+' un.)</option>'}).join('');
  $('saPay').innerHTML=PAYS.map(function(x){return'<option>'+x+'</option>'}).join('');
  $('clNames').innerHTML=CLI.map(function(c){return'<option value="'+esc(c.name)+'">'}).join('');
  $('saQ').value=1;$('saDesc').value='';$('saCli').value='';$('saNote').value='';$('saErr').hidden=true;
  drawSaleProd();drawCart();$('saleDlg').showModal();
}
$('saP').onchange=drawSaleProd;
$('saVars').onchange=recalcPrice;
$('saPrice').oninput=saleInfo;
$('saDesc').oninput=saleCalc;
$('saCart').onclick=function(e){var b=e.target.closest('button');if(!b)return;sale.items.splice(+b.dataset.i,1);drawCart();saleInfo()};
$('saAdd').onclick=function(){
  var p=saleProd();if(!p)return;
  var q=parseInt($('saQ').value)||0;if(q<1)return toast('Informe uma quantidade válida.');
  var avail=p.stock-cartQty(p.id);if(q>avail)return toast('Estoque insuficiente. Disponível: '+Math.max(0,avail)+' un.');
  var sel=saleSel(p),er='';
  p.vars.some(function(g,gi){
    var v=sel.find(function(x){return x.gi===gi});
    if(v){var o=g.opts[v.oi],left=o.q-cartQty(p.id,function(it){return it.vars.some(function(x){return x.gi===gi&&x.oi===v.oi})});
      if(q>left){er='A opção "'+o.n+'" de "'+g.name+'" tem só '+Math.max(0,left)+' un. disponíveis.';return true}}
    else{var free=p.stock-sum(g)-cartQty(p.id,function(it){return!it.vars.some(function(x){return x.gi===gi})});
      if(q>free){er='Escolha uma opção de "'+g.name+'" para registrar a venda.';return true}}
    return false;
  });
  if(er)return toast(er);
  var u=unitFor(p,sel),price=parseFloat($('saPrice').value);if(isNaN(price)||price<0)price=u.price;
  var varTxt=sel.map(function(v){return v.g+': '+v.o}).join(', ');
  var same=sale.items.find(function(it){return it.pid===p.id&&it.varTxt===varTxt&&it.price===price&&it.cost===u.cost});
  if(same)same.qty+=q;else sale.items.push({pid:p.id,name:p.name,varTxt:varTxt,vars:sel,qty:q,price:price,cost:u.cost});
  $('saQ').value=1;drawCart();saleInfo();
};
$('saOk').onclick=async function(){
  if(!sale.items.length){$('saErr').textContent='Adicione ao menos um produto à venda.';$('saErr').hidden=false;return}
  var desc=Math.max(0,+$('saDesc').value||0),pay=$('saPay').value,cli=$('saCli').value.trim(),note=$('saNote').value.trim();
  var subtotal=sale.items.reduce(function(a,it){return a+it.qty*it.price},0),cost=sale.items.reduce(function(a,it){return a+it.qty*it.cost},0);
  var byProd={};sale.items.forEach(function(it){(byProd[it.pid]=byProd[it.pid]||[]).push(it)});
  var er=desc>subtotal?'O desconto não pode ser maior que o valor da venda ('+brl(subtotal)+').':'',plan={};
  if(!er)Object.keys(byProd).some(function(pid){
    var p=P.find(function(x){return x.id===pid}),totalQ=byProd[pid].reduce(function(a,it){return a+it.qty},0);
    if(!p){er='Um dos produtos da venda não existe mais.';return true}
    if(totalQ>p.stock){er='Estoque insuficiente para "'+p.name+'": disponível '+p.stock+' un.';return true}
    var vars=cloneVars(p);
    var bad=byProd[pid].some(function(it){return it.vars.some(function(v){var o=locOpt(vars,v);if(!o)return false;o.q-=it.qty;return o.q<0})});
    if(bad){er='Uma das opções escolhidas para "'+p.name+'" não tem estoque suficiente.';return true}
    if(vars.some(function(g){return sum(g)>p.stock-totalQ})){er='Com essa venda, as quantidades de variação de "'+p.name+'" passariam do estoque. Escolha uma opção de cada variação.';return true}
    plan[pid]={p:p,stock:p.stock-totalQ,vars:vars,totalQ:totalQ};return false;
  });
  $('saErr').textContent=er;$('saErr').hidden=!er;if(er)return;
  var total=Math.max(0,subtotal-desc),num=S.reduce(function(a,x){return Math.max(a,x.n||0)},0)+1;
  var rec={id:Date.now().toString(36)+Math.random().toString(36).slice(2,4),n:num,t:Date.now(),items:sale.items,subtotal:subtotal,desconto:desc,total:total,cost:cost,pay:pay,cliente:cli,note:note,status:'ok'};
  S.unshift(rec);
  Object.keys(plan).forEach(function(pid){var pl=plan[pid],vt=byProd[pid].map(function(it){return it.varTxt}).filter(Boolean).join('; ');
    pl.p.stock=pl.stock;pl.p.vars=pl.vars;logMv(pl.p,-pl.totalQ,'out','Venda no balcão','Venda #'+num,vt);});
  await Promise.all([kvSet('products',P),kvSet('moves',M),kvSet('sales',S)]);
  syncStock();syncSales();render();drawStock();drawSales();drawReports();$('saleDlg').close();
  toast('Venda #'+num+' registrada: '+brl(total)+'.');
};
$('newSale').onclick=openSale;

/* ===== Clientes ===== */
var CLI=[],curClient=null;
function drawClients(){
  var q=$('clq').value.trim().toLowerCase();
  var qd=q.replace(/\D/g,'');
  var L=CLI.filter(function(c){return!q||(c.name+' '+(c.phone||'')+' '+(c.wpp||'')+' '+(c.email||'')+' '+(c.cpf||'')).toLowerCase().indexOf(q)>=0||(qd&&((c.phone||'')+' '+(c.wpp||'')+' '+(c.cpf||'')).replace(/\D/g,'').indexOf(qd)>=0)}).sort(function(a,b){return a.name.localeCompare(b.name,'pt-BR')});
  $('clsum').textContent=CLI.length+(CLI.length===1?' cliente cadastrado':' clientes cadastrados');
  $('clList').innerHTML=L.length?L.map(clientRow).join(''):'<div class="empty">'+(CLI.length?'Nenhum cliente encontrado para essa busca.':'Você ainda não tem clientes cadastrados. Clique em "Novo cliente" para começar.')+'</div>';
}
function clientRow(c){
  var det=[];
  if(c.phone)det.push('Telefone: '+esc(c.phone));
  if(c.wpp)det.push('WhatsApp: '+esc(c.wpp));
  if(c.email)det.push('E-mail: '+esc(c.email));
  if(c.cpf)det.push('CPF: '+esc(c.cpf));
  return'<div class="client"><div class="info"><strong>'+esc(c.name)+'</strong><p class="sub">'+(det.length?det.join(' · '):'Nenhum outro dado cadastrado.')+'</p></div>'+
    '<div class="row-ac"><button class="btn sm" data-a="edit" data-id="'+c.id+'">Editar</button><button class="btn sm danger" data-a="del" data-id="'+c.id+'">Excluir</button></div></div>';
}
function openClient(c){
  curClient=c||null;
  $('clT').textContent=c?'Editar cliente':'Novo cliente';
  $('cl-name').value=c?c.name:'';
  $('cl-phone').value=c&&c.phone||'';
  $('cl-wpp').value=c&&c.wpp||'';
  $('cl-email').value=c&&c.email||'';
  $('cl-cpf').value=c&&c.cpf||'';
  $('clDel').hidden=!c;delete $('clDel').dataset.sure;$('clDel').textContent='Excluir cliente';
  $('clErr').hidden=true;
  $('clientDlg').showModal();
}
function fmtCpf(v){var d=v.replace(/\D/g,'').slice(0,11);if(d.length<=3)return d;if(d.length<=6)return d.slice(0,3)+'.'+d.slice(3);if(d.length<=9)return d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6);return d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9)}
$('cl-cpf').oninput=function(){this.value=fmtCpf(this.value)};
$('newClient').onclick=function(){openClient()};
$('clq').oninput=drawClients;
$('clList').onclick=function(e){
  var b=e.target.closest('button');if(!b)return;
  var c=CLI.find(function(x){return x.id===b.dataset.id});if(!c)return;
  if(b.dataset.a==='edit')return openClient(c);
  if(b.dataset.a==='del'){
    if(!b.dataset.sure){b.dataset.sure='1';b.textContent='Confirmar exclusão';setTimeout(function(){if(b.isConnected){delete b.dataset.sure;b.textContent='Excluir'}},3500);return}
    CLI=CLI.filter(function(x){return x.id!==c.id});
    kvSet('customers',CLI).then(function(){drawClients();drawReports();toast('Cliente excluído.')});
  }
};
$('clOk').onclick=async function(){
  var name=$('cl-name').value.trim();
  if(!name){$('clErr').textContent='Informe o nome do cliente.';$('clErr').hidden=false;return}
  var email=$('cl-email').value.trim(),cpf=fmtCpf($('cl-cpf').value),er='';
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))er='Informe um e-mail válido (ex.: nome@email.com).';
  else if(cpf&&cpf.replace(/\D/g,'').length!==11)er='O CPF precisa ter 11 números.';
  else if(cpf&&CLI.some(function(x){return x.cpf===cpf&&(!curClient||x.id!==curClient.id)}))er='Já existe um cliente com esse CPF.';
  if(er){$('clErr').textContent=er;$('clErr').hidden=false;return}
  var c={id:curClient?curClient.id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),t:curClient?curClient.t:Date.now(),
    name:name,phone:$('cl-phone').value.trim(),wpp:$('cl-wpp').value.trim(),email:email,cpf:cpf};
  var i=CLI.findIndex(function(x){return x.id===c.id});if(i<0)CLI.unshift(c);else CLI[i]=c;
  await kvSet('customers',CLI);
  drawClients();drawReports();$('clientDlg').close();toast('Cliente salvo.');
};
$('clDel').onclick=function(){
  var b=$('clDel');
  if(!b.dataset.sure){b.dataset.sure='1';b.textContent='Confirmar exclusão';setTimeout(function(){delete b.dataset.sure;b.textContent='Excluir cliente'},3500);return}
  CLI=CLI.filter(function(x){return x.id!==curClient.id});
  kvSet('customers',CLI).then(function(){drawClients();drawReports();$('clientDlg').close();toast('Cliente excluído.')});
};

/* ===== Relatórios ===== */
var rpState={period:'month'},MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function periodRange(key){
  var now=new Date(),start,label,sub;
  if(key==='today'){start=new Date(now.getFullYear(),now.getMonth(),now.getDate());label='Hoje';sub=fmtDate(start.getTime(),'date')}
  else if(key==='week'){start=new Date(now.getTime()-6*86400000);start.setHours(0,0,0,0);label='Últimos 7 dias';sub=fmtDate(start.getTime(),'date')+' a '+fmtDate(now.getTime(),'date')}
  else if(key==='month'){start=new Date(now.getFullYear(),now.getMonth(),1);label='Mês atual';sub=MESES[now.getMonth()]+' de '+now.getFullYear()}
  else{start=new Date(now.getFullYear(),0,1);label='Ano atual';sub=String(now.getFullYear())}
  return{start:start.getTime(),label:label,sub:sub};
}
function reportData(key){
  var r=periodRange(key),start=r.start;
  var sales=S.filter(function(s){return s.t>=start}),ok=sales.filter(function(s){return s.status==='ok'}),can=sales.filter(function(s){return s.status==='cancel'});
  var rev=ok.reduce(function(a,s){return a+s.total},0),cost=ok.reduce(function(a,s){return a+s.cost},0);
  var moves=M.filter(function(m){return m.t>=start});
  var movIn=moves.filter(function(m){return m.type==='in'}),movOut=moves.filter(function(m){return m.type==='out'}),movAdj=moves.filter(function(m){return m.type==='adj'});
  var qIn=movIn.reduce(function(a,m){return a+m.d},0),qOut=movOut.reduce(function(a,m){return a+Math.abs(m.d)},0);
  var low=P.filter(function(p){return p.stock>0&&p.stock<=p.min}),out=P.filter(function(p){return p.stock<=0});
  var units=P.reduce(function(a,p){return a+p.stock},0),sCost=P.reduce(function(a,p){return a+stockVal(p,'cost')},0),sSale=P.reduce(function(a,p){return a+stockVal(p,'price')},0);
  var newCli=CLI.filter(function(c){return(c.t||0)>=start});
  var topP=topProducts(ok),topC=topClients(ok);
  return{range:r,sales:sales,ok:ok,can:can,rev:rev,cost:cost,profit:rev-cost,ticket:ok.length?rev/ok.length:0,
    moves:moves,movIn:movIn,movOut:movOut,movAdj:movAdj,qIn:qIn,qOut:qOut,
    low:low,out:out,units:units,sCost:sCost,sSale:sSale,newCli:newCli,
    chart:chartByDay(ok,r.start,key),topP:topP,topC:topC};
}
/* faturamento por dia do período (só vendas ok) — usado no gráfico SVG.
   Para "Ano", agrupa por mês para manter o gráfico enxuto (7–30 barras). */
var MES_ABBR=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function chartByDay(ok,start,key){
  var days=[],d=new Date(start);d.setHours(0,0,0,0);
  var today=new Date();today.setHours(0,0,0,0);
  var end=Math.min(Date.now(),today.getTime());
  if(key==='year'){
    var ym=new Date(d.getFullYear(),0,1).getTime();
    while(ym<=end){
      var m=new Date(ym),mnxt=new Date(m.getFullYear(),m.getMonth()+1,1).getTime();
      days.push({t:ym,label:MES_ABBR[m.getMonth()],total:ok.filter(function(s){return s.t>=ym&&s.t<mnxt}).reduce(function(a,s){return a+s.total},0)});
      ym=mnxt;
    }
    return days;
  }
  var cur=d.getTime();
  while(cur<=end){
    var nxt=cur+86400000;
    days.push({t:cur,label:dayLabel(cur),total:ok.filter(function(s){return s.t>=cur&&s.t<nxt}).reduce(function(a,s){return a+s.total},0)});
    cur=nxt;
  }
  return days;
}
function dayLabel(t){var d=new Date(t);return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')}
function topProducts(ok){
  var by={};ok.forEach(function(s){s.items.forEach(function(it){if(!it.pid)return;by[it.pid]=by[it.pid]||{pid:it.pid,name:it.name,total:0};by[it.pid].total+=it.qty*it.price})});
  return Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){return b.total-a.total}).slice(0,5);
}
function topClients(ok){
  var by={};ok.forEach(function(s){var c=(s.cliente||'').trim()||'Sem cliente';by[c]=by[c]||{nome:c,n:0,total:0};by[c].n++;by[c].total+=s.total});
  return Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){return b.n-a.n}).slice(0,5);
}
/* gráfico de barras em SVG inline — reflete rpState.period via d.chart */
function chartSvg(days){
  if(!days||!days.length)return '<p class="sub">Nenhum dado para este período.</p>';
  var W=Math.max(days.length*34,300),H=170,pad=24,inner=H-pad;
  var max=days.reduce(function(a,x){return Math.max(a,x.total)},0)||1;
  var bw=Math.min(26,Math.floor((W-pad)/days.length)-6);
  var bars=days.map(function(x,i){
    var h=Math.round((x.total/max)*inner);
    var x0=pad+i*((W-pad)/days.length)+((W-pad)/days.length-bw)/2;
    var y0=inner-h+4;
    return '<rect x="'+x0.toFixed(1)+'" y="'+y0.toFixed(1)+'" width="'+bw+'" height="'+Math.max(h,1)+'" rx="5"><title>'+x.label+' — '+brl(x.total)+'</title></rect>'+
      '<text x="'+(x0+bw/2).toFixed(1)+'" y="'+H+'" text-anchor="middle">'+x.label+'</text>';
  }).join('');
  return '<svg class="rpchart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMax meet" role="img" aria-label="Faturamento por dia">'+bars+'</svg>';
}
function drawReports(){
  $$('#rpPeriod button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.p===rpState.period)});
  var d=reportData(rpState.period);
  $('rpSub').textContent=d.range.label+' · '+d.range.sub;
  $('rpTiles').innerHTML=[['Vendas concluídas',d.ok.length],['Faturamento',brl(d.rev)],['Lucro',brl(d.profit)],['Ticket médio',d.ok.length?brl(d.ticket):brl(0)],['Canceladas',d.can.length],['Novos clientes',d.newCli.length]]
    .map(function(x){return'<div class="card"><h3>'+x[0]+'</h3><div class="num">'+x[1]+'</div></div>'}).join('');
  $('rpStock').innerHTML='<li><span>Entradas de estoque</span><span>'+d.movIn.length+'<small>+'+d.qIn+' un.</small></span></li>'+
    '<li><span>Saídas de estoque</span><span>'+d.movOut.length+'<small>-'+d.qOut+' un.</small></span></li>'+
    '<li><span>Ajustes de contagem</span><span>'+d.movAdj.length+'</span></li>';
  $('rpChart').innerHTML=chartSvg(d.chart);
  $('rpChartT').textContent=rpState.period==='year'?'Faturamento por mês':'Faturamento por dia';
  $('rpTopP').innerHTML=d.topP.length?d.topP.map(function(x,i){return '<li><span><strong>'+(i+1)+'. '+esc(x.name)+'</strong></span><span>'+brl(x.total)+'</span></li>'}).join(''):'<li><span>Nenhuma venda concluída no período.</span></li>';
  $('rpTopC').innerHTML=d.topC.length?d.topC.map(function(x,i){return '<li><span><strong>'+(i+1)+'. '+esc(x.nome)+'</strong><small>'+x.n+(x.n===1?' compra':' compras')+'</small></span><span>'+brl(x.total)+'</span></li>'}).join(''):'<li><span>Nenhuma venda concluída no período.</span></li>';
  $('rpProd').innerHTML='<li><span>Produtos cadastrados</span><span>'+P.length+'</span></li>'+
    '<li><span>Unidades em estoque</span><span>'+d.units.toLocaleString('pt-BR')+'</span></li>'+
    '<li><span>Custo do estoque</span><span>'+brl(d.sCost)+'</span></li>'+
    '<li><span>Valor de venda do estoque</span><span>'+brl(d.sSale)+'</span></li>'+
    '<li><span>Estoque baixo</span><span>'+d.low.length+'</span></li>'+
    '<li><span>Esgotados</span><span>'+d.out.length+'</span></li>';
  $('rpCli').innerHTML='<li><span>Clientes cadastrados</span><span>'+CLI.length+'</span></li>'+
    '<li><span>Novos no período</span><span>'+d.newCli.length+'</span></li>';
}
$('rpPeriod').onclick=function(e){var b=e.target.closest('button');if(b){rpState.period=b.dataset.p;drawReports()}};
/* download do relatório detalhado */
function kpi(label,val){return'<div class="kpi"><span>'+label+'</span><b>'+val+'</b></div>'}
function renderReportHTML(d){
  var r=d.range,gen=Date.now();
  var salesRows=d.sales.slice().sort(function(a,b){return b.t-a.t}).map(function(s){
    var items=s.items.map(function(it){return esc(it.name)+(it.varTxt?' ('+esc(it.varTxt)+')':'')+' — '+it.qty+' un. × '+brl(it.price)+' = '+brl(it.qty*it.price)}).join('<br>');
    return'<tr><td>'+fmtDate(s.t)+'</td><td>'+(s.status==='ok'?'Concluída':'Cancelada')+'</td><td>'+esc(s.cliente||'—')+'</td><td>'+esc(s.pay)+'</td><td>'+items+'</td><td style="text-align:right">'+brl(s.total)+'</td></tr>';
  }).join('');
  var movRows=d.moves.slice().sort(function(a,b){return b.t-a.t}).map(function(m){
    return'<tr><td>'+fmtDate(m.t)+'</td><td>'+esc(m.name)+'</td><td>'+TL[m.type]+'</td><td>'+esc(m.reason)+(m.note?' ('+esc(m.note)+')':'')+'</td><td style="text-align:right">'+(m.d>0?'+':'')+m.d+'</td><td style="text-align:right">'+m.after+'</td></tr>';
  }).join('');
  var prodRows=P.slice().sort(function(a,b){return a.name.localeCompare(b.name,'pt-BR')}).map(function(p){
    return'<tr><td>'+esc(p.name)+'</td><td>'+esc(p.cat||'—')+'</td><td style="text-align:right">'+p.stock+'</td><td style="text-align:right">'+brl(p.cost||0)+'</td><td style="text-align:right">'+brl(p.price)+'</td><td style="text-align:right">'+brl(stockVal(p,'cost'))+'</td></tr>';
  }).join('');
  var cliRows=CLI.slice().sort(function(a,b){return a.name.localeCompare(b.name,'pt-BR')}).map(function(c){
    return'<tr><td>'+esc(c.name)+'</td><td>'+esc(c.phone||'—')+'</td><td>'+esc(c.wpp||'—')+'</td><td>'+esc(c.email||'—')+'</td><td>'+esc(c.cpf||'—')+'</td></tr>';
  }).join('');
  var topPRows=d.topP.map(function(x,i){return '<tr><td>'+(i+1)+'. '+esc(x.name)+'</td><td style="text-align:right">'+brl(x.total)+'</td></tr>'}).join('');
  var topCRows=d.topC.map(function(x,i){return '<tr><td>'+(i+1)+'. '+esc(x.nome)+'</td><td style="text-align:right">'+x.n+'</td><td style="text-align:right">'+brl(x.total)+'</td></tr>'}).join('');
  return'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — '+r.label+'</title><style>'+
   'body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:920px;margin:32px auto;padding:0 20px;color:#12141D}'+
   'h1{font-size:1.4rem;margin:0 0 4px}h2{font-size:1.1rem;margin:32px 0 8px;border-bottom:2px solid #4F46E5;padding-bottom:6px}'+
   'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:.86rem}th,td{padding:6px 8px;border-bottom:1px solid #E4E7EF;text-align:left;vertical-align:top}'+
   'th{background:#F3F4F9}.muted{color:#646B7D}.kpis{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}'+
   '.kpi{background:#F3F4F9;border-radius:12px;padding:10px 16px;min-width:140px}.kpi span{display:block;font-size:.8rem;color:#646B7D}.kpi b{display:block;font-size:1.2rem}'+
   '@media print{body{margin:0}}</style></head><body>'+
   '<h1>Relatório — Estoque da Loja</h1><p class="muted">Período: '+r.label+' ('+r.sub+') · Gerado em '+fmtDate(gen)+'</p>'+
   '<h2>Vendas</h2><div class="kpis">'+kpi('Concluídas',d.ok.length)+kpi('Canceladas',d.can.length)+kpi('Faturamento',brl(d.rev))+kpi('Custo',brl(d.cost))+kpi('Lucro',brl(d.profit))+kpi('Ticket médio',d.ok.length?brl(d.ticket):brl(0))+'</div>'+
   (d.sales.length?'<table><thead><tr><th>Data</th><th>Status</th><th>Cliente</th><th>Pagamento</th><th>Itens</th><th>Total</th></tr></thead><tbody>'+salesRows+'</tbody></table>':'<p class="muted">Nenhuma venda neste período.</p>')+
   '<h2>Movimentações de estoque</h2><div class="kpis">'+kpi('Entradas',d.movIn.length+' (+'+d.qIn+' un.)')+kpi('Saídas',d.movOut.length+' (-'+d.qOut+' un.)')+kpi('Ajustes',d.movAdj.length)+'</div>'+
   (d.moves.length?'<table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Motivo</th><th>Qtd.</th><th>Saldo</th></tr></thead><tbody>'+movRows+'</tbody></table>':'<p class="muted">Nenhuma movimentação neste período.</p>')+
   '<h2>Top 5 produtos por faturamento</h2>'+(d.topP.length?'<table><thead><tr><th>Produto</th><th>Faturamento</th></tr></thead><tbody>'+topPRows+'</tbody></table>':'<p class="muted">Nenhuma venda concluída neste período.</p>')+
   '<h2>Top 5 clientes por compras</h2>'+(d.topC.length?'<table><thead><tr><th>Cliente</th><th>Compras</th><th>Total gasto</th></tr></thead><tbody>'+topCRows+'</tbody></table>':'<p class="muted">Nenhuma venda concluída neste período.</p>')+
   '<h2>Produtos e estoque (situação atual)</h2><div class="kpis">'+kpi('Produtos',P.length)+kpi('Unidades',d.units)+kpi('Custo do estoque',brl(d.sCost))+kpi('Valor de venda',brl(d.sSale))+kpi('Estoque baixo',d.low.length)+kpi('Esgotados',d.out.length)+'</div>'+
   (P.length?'<table><thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Custo</th><th>Preço</th><th>Valor em custo</th></tr></thead><tbody>'+prodRows+'</tbody></table>':'<p class="muted">Nenhum produto cadastrado.</p>')+
   '<h2>Clientes</h2><div class="kpis">'+kpi('Cadastrados',CLI.length)+kpi('Novos no período',d.newCli.length)+'</div>'+
   (CLI.length?'<table><thead><tr><th>Nome</th><th>Telefone</th><th>WhatsApp</th><th>E-mail</th><th>CPF</th></tr></thead><tbody>'+cliRows+'</tbody></table>':'<p class="muted">Nenhum cliente cadastrado.</p>')+
   '</body></html>';
}
function reportFilename(key){
  var now=new Date(),pad=function(n){return String(n).padStart(2,'0')},names={today:'dia',week:'semana',month:'mes',year:'ano'};
  return'relatorio-'+names[key]+'-'+now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+'.html';
}
function downloadReport(key){
  var html=renderReportHTML(reportData(key));
  var blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=reportFilename(key);document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url)},2000);
  toast('Relatório baixado.');
}
document.querySelectorAll('#v-reports [data-dl]').forEach(function(b){b.onclick=function(){downloadReport(b.dataset.dl)}});

/* ===== Catálogo ===== */
var CAT={store:'',title:'',desc:'',heroMode:'color',heroColor:null,heroImg:null,whats:'',email:'',tel:'',insta:'',face:'',tiktok:'',theme:null},CATALOG=/^\/c\//.test(location.pathname)||/[?&]catalogo(=|&|$)/.test(location.search),catT,DEBOUNCE=150;
var CAT_DEF={store:'',title:'',desc:'',heroMode:'color',heroColor:null,heroImg:null,whats:'',email:'',tel:'',insta:'',face:'',tiktok:'',theme:null};
/* canal para avisar o catálogo aberto em outra aba/na prévia que a aparência mudou */
var CAT_BC=null;try{if(window.BroadcastChannel)CAT_BC=new BroadcastChannel('meu-estoque-catalogo')}catch(e){CAT_BC=null}
var CATPREV=/[?&]previa=/.test(location.search); /* true quando está na prévia da aba Catálogo */
function catRevPing(mode){
  var rev=String(Date.now());
  try{localStorage.setItem('cat_rev',JSON.stringify({t:Date.now(),mode:mode||''}))}catch(e){try{localStorage.setItem('cat_rev',rev)}catch(e2){}}
  if(CAT_BC){try{CAT_BC.postMessage({cat:1,mode:mode||''})}catch(e){}}
}
/* ===== rascunho x publicado =====
   CAT = o que você edita (rascunho, salvo na nuvem como 'catalogDraft');
   CAT_PUB = o que está no ar ('catalog'). Só "Publicar" copia o rascunho para o ar. */
var CAT_PUB=null,CAT_DIRTY=false,CAT_PUBBING=false;
if(!CATALOG)window.__catDraft=function(){return CAT}; /* a prévia (iframe ou aba aberta daqui) lê o rascunho */
/* na prévia: pega o rascunho direto do painel que a abriu (mesmo site), sem passar pelo catálogo público */
function catDraftFromPanel(){
  if(!CATPREV)return null;
  try{
    var w=window.parent!==window?window.parent:window.opener;
    var d=w&&w.__catDraft&&w.__catDraft();
    if(!d||typeof d!=='object')return null;
    try{return structuredClone(d)}catch(e){return JSON.parse(JSON.stringify(d))}
  }catch(e){return null}
}
function updatePub(msg){
  var bar=$('catPub');if(!bar||CATALOG)return;
  bar.classList.toggle('dirty',CAT_DIRTY);
  $('catPubSt').textContent=msg||(CAT_DIRTY
    ?'Alterações não publicadas. Seus clientes ainda veem a versão anterior.'
    :'Tudo publicado. O catálogo online está igual à prévia.');
  $('catPublish').disabled=!CAT_DIRTY||CAT_PUBBING;
  $('catDiscard').hidden=!CAT_DIRTY||!CAT_PUB;
  $('catDiscard').disabled=CAT_PUBBING;
}
function catClone(o){
  if(o==null||typeof o!=='object'||o instanceof Blob)return o;
  if(Array.isArray(o))return o.map(catClone);
  var r={};Object.keys(o).forEach(function(k){r[k]=catClone(o[k])});return r;
}
function publishCat(){
  if(!CAT_DIRTY||CAT_PUBBING)return;
  clearTimeout(catT);CAT_PUBBING=true;updatePub('Publicando…');
  var snap=catClone(CAT);
  Promise.all([kvSet('catalogDraft',CAT),kvSet('catalog',CAT)]).then(function(){
    CAT_PUBBING=false;CAT_PUB=snap;
    CAT_DIRTY=JSON.stringify(CAT)!==JSON.stringify(snap); /* algo mudou durante a publicação? continua pendente */
    updatePub();catRevPing('');
    toast('Catálogo publicado. Seus clientes já veem as alterações.');
  });
}
function discardCat(){
  var b=$('catDiscard');if(!CAT_DIRTY||!CAT_PUB||CAT_PUBBING)return;
  if(!b.dataset.sure){b.dataset.sure=1;b.textContent='Confirmar descarte';setTimeout(function(){delete b.dataset.sure;b.textContent='Descartar alterações'},3500);return}
  delete b.dataset.sure;b.textContent='Descartar alterações';
  clearTimeout(catT);
  CAT=Object.assign({},CAT_DEF,catClone(CAT_PUB));CAT_DIRTY=false;
  kvSet('catalogDraft',null).then(function(){catRevPing('')});
  drawCatalogCfg();applyCatTheme();updatePub();
  toast('Alterações descartadas. Voltou para a versão publicada.');
}
function catalogUrl(){return window.SaaS.catalogUrl()}
function catName(){return(CAT.store||'').trim()||'Catálogo'}
function inkFor(c){var n=parseInt(c.slice(1),16),l=(0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255))/255;return l>0.62?'#10131C':'#fff'}
/* ícones das redes sociais do rodapé — mesmo traço dos ícones do cabeçalho */
var SN_ICONS={
  instagram:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4"/><circle cx="12" cy="12" r="4.2"/><path d="M17.4 6.6h.01"/></svg>',
  facebook:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.4"/><path d="M15.3 8.6h-1.8a2.6 2.6 0 0 0-2.6 2.6v9.1"/><path d="M9.3 13.9h5.4"/></svg>',
  tiktok:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.6" cy="16.4" r="3.5"/><path d="M12.1 16.4V4.9c.8 2.5 2.7 3.9 5.2 4"/></svg>',
  whatsapp:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 11.8a8.6 8.6 0 0 1-12.8 7.5l-4.3 1.4 1.4-4.3a8.6 8.6 0 1 1 15.7-4.6z"/><path d="M9.5 8.6l1.7.8-.6 1.6c.6 1.1 1.5 2 2.6 2.6l1.6-.6.8 1.7c-.8 1-2.3 1-3.8.2-1.9-1-3.4-2.5-4.3-4.4-.8-1.5-.8-3.1.1-3.9z"/></svg>'
};
function snUser(v,tipo){
  v=(v||'').trim();
  if(!v)return '';
  if(/^https?:\/\//i.test(v))return v;
  if(/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]{2,})+(\/|$)/i.test(v))return 'https://'+v;   // já é um link/domínio
  var d=tipo==='facebook'?'facebook.com':'instagram.com';if(tipo==='tiktok')d='tiktok.com';
  return 'https://'+d+'/'+v.replace(/^@/,'').replace(/\s+/g,'');
}
function snWhats(v){var n=(v||'').replace(/\D/g,'');if(!n)return '';if(n.length<=11)n='55'+n;return 'https://wa.me/'+n}
/* rodapé do catálogo: nome da loja, contatos, redes sociais e direitos reservados */
function drawCatFoot(){
  if(!$('catFoot'))return;
  var nome=(CAT.store||'').trim()||'Catálogo';
  $('cfName').textContent=nome;
  $('cfLegal').textContent='\u00a9 '+new Date().getFullYear()+' '+nome+'. Todos os direitos reservados.';
  var mail=(CAT.email||'').trim();
  $('cfMailItem').hidden=!mail;
  if(mail){$('cfMail').textContent=mail;$('cfMail').href='mailto:'+mail}
  var tel=(CAT.tel||'').trim()||(CAT.whats||'').trim(),telN=tel.replace(/\D/g,'');
  $('cfTelItem').hidden=!tel;
  if(tel){
    $('cfTel').textContent=tel;
    $('cfTel').href='tel:'+(telN.length<=11?'+55'+telN:'+'+telN);
  }
  var links=[['instagram',snUser(CAT.insta,'instagram'),'Instagram'],['facebook',snUser(CAT.face,'facebook'),'Facebook'],['tiktok',snUser(CAT.tiktok,'tiktok'),'TikTok'],['whatsapp',snWhats(CAT.whats),'WhatsApp']];
  $('cfSocial').innerHTML=links.filter(function(l){return l[1]}).map(function(l){
    return'<a class="ib cf-ic" href="'+l[1]+'" target="_blank" rel="noopener noreferrer" aria-label="'+l[2]+' da loja" title="'+l[2]+'">'+SN_ICONS[l[0]]+'</a>';
  }).join('');
}
function heroColor(){return CAT.heroColor||get('cor')||'#4F46E5'}
function markCatSw(){var c=heroColor().toLowerCase();document.querySelectorAll('#catSw button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.c.toLowerCase()===c)})}
function drawCatalogCfg(){
  $('catUrl').value=catalogUrl();$('cat-store').value=CAT.store||'';$('cat-title').value=CAT.title||'';$('cat-desc').value=CAT.desc||'';$('cat-whats').value=CAT.whats||'';
  $('cat-insta').value=CAT.insta||'';$('cat-face').value=CAT.face||'';$('cat-tiktok').value=CAT.tiktok||'';$('cat-email').value=CAT.email||'';$('cat-tel').value=CAT.tel||'';
  document.querySelectorAll('#catBgMode button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.m===CAT.heroMode)});
  $('catBgColor').hidden=CAT.heroMode==='image';$('catBgImage').hidden=CAT.heroMode!=='image';
  $('catSw').innerHTML=COLORS.map(function(c){return'<button type="button" data-c="'+c[0]+'" aria-label="'+c[1]+'" aria-pressed="false" style="background:'+c[0]+'"></button>'}).join('')+'<input type="color" id="catColor" aria-label="Escolher outra cor" value="'+heroColor()+'">';
  hexAttach($('catSw'));
  markCatSw();
  $('catImgPrev').hidden=!CAT.heroImg;$('catImgNone').hidden=!!CAT.heroImg;$('catImgDel').hidden=!CAT.heroImg;$('catImgEdit').hidden=!CAT.heroImg;
  if(CAT.heroImg)$('catImgPrev').src=blobUrl(CAT.heroImg);
  drawThemeCfg();
}
/* ===== prévia do catálogo dentro da aba Catálogo ===== */
function loadCatPrev(force){
  var f=$('ctPrev');if(!f||CATALOG)return;
  if(f.src&&!force)return;
  f.src=catalogUrl()+(catalogUrl().indexOf('?')>=0?'&':'?')+'previa='+Date.now();
}
$('ctPrevBtn').onclick=function(){loadCatPrev(true);toast('Prévia atualizada.')};
$('ctPrevOpen').onclick=function(){var url=catalogUrl();window.open(url+(url.indexOf('?')>=0?'&':'?')+'previa='+Date.now(),'_blank')};
$('catBgMode').onclick=function(e){var b=e.target.closest('button');if(!b)return;CAT.heroMode=b.dataset.m;saveCat();drawCatalogCfg()};
$('catSw').onclick=function(e){var b=e.target.closest('button');if(!b)return;CAT.heroColor=b.dataset.c;$('catColor').value=b.dataset.c;hexSync($('catColor'));markCatSw();saveCat()};
$('catSw').oninput=function(e){if(e.target.id==='catColor'){CAT.heroColor=e.target.value;markCatSw();saveCat()}};
$('catImgPick').onclick=function(){$('catImgFile').click()};
$('catImgFile').onchange=async function(e){
  var f=e.target.files[0];e.target.value='';if(!f)return;
  var b=await crop(f,2);if(!b)return;
  CAT.heroImg=b;CAT.heroMode='image';saveCat();drawCatalogCfg();toast('Imagem de fundo definida.');
};
$('catImgEdit').onclick=async function(){
  if(!CAT.heroImg)return;var b=await crop(CAT.heroImg,2);if(!b)return;
  CAT.heroImg=b;saveCat();drawCatalogCfg();
};
$('catImgDel').onclick=function(){CAT.heroImg=null;saveCat();drawCatalogCfg()};
/* ===== seções da aba Catálogo: expandir / recolher ===== */
var CAT_SECS=(function(){try{return JSON.parse(localStorage.getItem('cat_secs')||'{}')||{}}catch(e){return{}}})();
function catSecsSave(){try{localStorage.setItem('cat_secs',JSON.stringify(CAT_SECS))}catch(e){}}
function setCatSec(card,open,save){
  card.classList.toggle('open',!!open);
  var b=card.querySelector('.clp-h');
  if(b)b.setAttribute('aria-expanded',open?'true':'false');
  if(save!==false){CAT_SECS[card.dataset.clp]=!!open;catSecsSave()}
}
function initCatCollapse(){
  var view=$('v-catalog');if(!view)return;
  var cards=Array.prototype.slice.call(view.querySelectorAll('section.card'));
  cards.forEach(function(card,i){
    if(card.classList.contains('clp'))return;
    var h=card.querySelector('h3');if(!h)return;
    var key=i+':'+h.textContent.trim();
    var btn=document.createElement('button');
    btn.type='button';btn.className='clp-h';
    btn.innerHTML='<span class="clp-tt">'+esc(h.textContent.trim())+'</span>'+
      '<svg class="clp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    var body=document.createElement('div');body.className='clp-b';
    var inner=document.createElement('div');inner.className='clp-in';
    var pad=document.createElement('div');pad.className='clp-p';
    while(h.nextSibling)pad.appendChild(h.nextSibling);
    inner.appendChild(pad);body.appendChild(inner);
    h.remove();
    card.insertBefore(btn,card.firstChild);
    card.insertBefore(body,btn.nextSibling);
    card.classList.add('clp');card.dataset.clp=key;
    btn.addEventListener('click',function(){setCatSec(card,!card.classList.contains('open'))});
    setCatSec(card,CAT_SECS[key]!==false,false); /* padrão: aberta */
  });
  var all=function(o){cards.forEach(function(c){setCatSec(c,o)})};
  if($('catExpAll'))$('catExpAll').onclick=function(){all(true)};
  if($('catColAll'))$('catColAll').onclick=function(){all(false)};
}
initCatCollapse();
$('catTheme').onclick=function(){var t=root.getAttribute('data-theme')==='dark'?'light':'dark';root.setAttribute('data-theme',t);set('tema_cat',t);applyCatTheme(t)};
function saveCat(now,mode){
  clearTimeout(catT);
  CAT_DIRTY=true;updatePub(CAT_PUBBING?'Publicando…':'Salvando rascunho…');
  var go=function(){return kvSet('catalogDraft',CAT).then(function(){
    var s=$('catSaved');if(s)s.textContent='Rascunho salvo. Toque em Publicar para aparecer no catálogo.';
    if(!CAT_PUBBING)updatePub();
    catRevPing(mode); /* avisa a prévia (ela mostra o rascunho) */
  })};
  if(now)return go();
  return new Promise(function(r){catT=setTimeout(function(){go().then(function(){r()},function(){r()})},DEBOUNCE)});
}
['store','title','desc','whats','email','tel','insta','face','tiktok'].forEach(function(k){$('cat-'+k).oninput=function(){CAT[k]=this.value;$('catSaved').textContent='Salvando rascunho…';saveCat();if(k!=='title'&&k!=='desc')drawCatFoot()}});
$('catOpen').onclick=function(){
  if(CAT_DIRTY)toast('Abrindo a versão publicada. As alterações ainda não publicadas aparecem só na prévia.');
  window.open(catalogUrl(),'_blank','noopener');
};
if($('catPublish'))$('catPublish').onclick=publishCat;
if($('catDiscard'))$('catDiscard').onclick=discardCat;
function legacyCopy(){var i=$('catUrl');i.focus();i.select();try{return document.execCommand('copy')}catch(e){return false}}
$('catCopy').onclick=function(){
  var done=function(ok){toast(ok?'Link do catálogo copiado.':'Não foi possível copiar. Selecione o link e copie manualmente.')};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(catalogUrl()).then(function(){done(true)},function(){done(legacyCopy())});
  else done(legacyCopy());
};
$('catShare').onclick=function(){
  var url=catalogUrl(),msg='Conheça o catálogo de '+catName();
  if(navigator.share)navigator.share({title:catName(),text:msg,url:url}).catch(function(){});
  else window.open('https://wa.me/?text='+encodeURIComponent(msg+': '+url),'_blank','noopener');
};
/* página pública do catálogo: vitrine, favoritos, página do produto e carrinho lateral */
window.__loaded=false; /* B: flag de carregamento — true quando o IndexedDB responder */
var catSt={q:'',cq:'',cat:'',sort:''},pp={id:null,sel:{},qty:1,img:0},cdFocus=null;
var SORTS=[['low','Menor preço'],['high','Maior preço'],['sold','Mais vendidos'],['new','Mais recentes'],['old','Mais antigos']];
function jget(k,d){try{return JSON.parse(get(k))||d}catch(e){return d}}
var FAV=jget('cat_fav',[]),CART=jget('cat_cart',[]);
var ICON_HEART='<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
var ICON_CART='<svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
function saveFav(){set('cat_fav',JSON.stringify(FAV))}
function saveCart(){set('cat_cart',JSON.stringify(CART))}
function minPrice(p){var a=[p.price];p.vars.forEach(function(g){g.opts.forEach(function(o){if(o.p!=null)a.push(o.p)})});return Math.min.apply(null,a)}
function hasRange(p){var a=[p.price];p.vars.forEach(function(g){g.opts.forEach(function(o){if(o.p!=null)a.push(o.p)})});return Math.min.apply(null,a)<Math.max.apply(null,a)}
function needsPick(g){return g.opts.some(function(o){return o.q>0})}
function catPhoto(p,i,cls){return p.imgs[i||0]?'<img'+(cls?' class="'+cls+'"':'')+' alt="'+esc(p.name)+'" src="'+blobUrl(p.imgs[i||0])+'">':'<div class="noimg'+(cls?' '+cls:'')+'">'+NOIMG_SVG+'</div>'}
function favList(){return P.filter(function(p){return p.stock>0&&FAV.indexOf(p.id)>=0})}
function updateBadges(){
  var n=CART.reduce(function(a,l){return a+l.qty},0),f=favList().length;
  $('catCartN').textContent=n;$('catCartN').hidden=!n;$('catWishN').textContent=f;$('catWishN').hidden=!f;
  $('catCartN').setAttribute('aria-label',n?plural(n,'item no carrinho','itens no carrinho'):'Carrinho vazio');
  $('catWishN').setAttribute('aria-label',f?plural(f,'produto nos favoritos','produtos nos favoritos'):'Nenhum favorito');
  $('catWish').setAttribute('aria-pressed',location.hash==='#favoritos');
  var pb=$('catProd').querySelector('[data-a="view"] .badge');if(pb){pb.textContent=n;pb.hidden=!n}
}
/* miniatura (usada na vitrine e na página de favoritos) — I: overlay esgotado */
function cardHtml(p){
  var fav=FAV.indexOf(p.id)>=0,href='#produto/'+p.id,oos=p.stock<=0;
  return'<div class="card pc mc'+(oos?' mc-oos':'')+'"><a href="'+href+'">'+catPhoto(p)+'</a>'+(oos?'<span class="oos-badge">Esgotado</span>':'')+'<div class="b"><a href="'+href+'"><strong>'+esc(p.name)+'</strong></a>'+
    '<div class="row"><a class="price" href="'+href+'">'+(hasRange(p)?'<small>a partir de</small>':'')+'<b>'+brl(minPrice(p))+'</b></a>'+
    '<span class="acts2"><button type="button" class="ib sm" data-a="fav" data-id="'+p.id+'" aria-pressed="'+fav+'" aria-label="'+(fav?'Remover dos favoritos':'Adicionar aos favoritos')+'">'+ICON_HEART+'</button>'+
    (oos?'':'<button type="button" class="ib sm" data-a="cart" data-id="'+p.id+'" aria-label="Adicionar ao carrinho">'+ICON_CART+'</button>')+'</span></div></div></div>';
}
/* C: animação pop no favoritar; D: flash ao adicionar ao carrinho */
function animPop(btn){btn.classList.add('pop');setTimeout(function(){btn.classList.remove('pop')},320)}
function animFlash(btn){btn.classList.add('flash');setTimeout(function(){btn.classList.remove('flash')},300)}
function gridClick(e){
  var b=e.target.closest('button[data-a]');if(!b)return;var p=P.find(function(x){return x.id===b.dataset.id});if(!p)return;
  if(b.dataset.a==='fav'){animPop(b);toggleFav(p.id);redrawCat();drawCatFav()}
  else if(p.vars.some(needsPick)){toast('Escolha uma opção na página do produto.');location.hash='#produto/'+p.id}
  else if(addCart(p,[],1)){animFlash(b);drawCatCart();toast('Adicionado ao carrinho.')}
}
/* B: skeletons enquanto o IndexedDB carrega */
function skeletonHtml(n){let h='';for(let i=0;i<n;i++)h+='<div class="card pc skeleton"><div class="sk-img"></div><div class="sk-line"></div><div class="sk-line short"></div></div>';return h}
/* filtro/ordenação — só a ordenação escolhida no pop-up */
function catPushState(){
  if(!CATALOG)return;
  const params=new URLSearchParams();
  if(catSt.q)params.set('q',catSt.q);
  if(catSt.sort)params.set('sort',catSt.sort);
  const qs=params.toString();
  const base=location.hash.split('?')[0]||'';
  try{history.replaceState(null,'',location.pathname+location.search+(base||'#')+(qs?'?'+qs:''))}catch(e){}
}
function catReadState(){
  try{
    const m=location.hash.match(/\?(.+)$/);if(!m)return;
    const sp=new URLSearchParams(m[1]);
    if(sp.has('q')){catSt.q=sp.get('q');$('catQ').value=catSt.q}
    if(sp.has('sort')&&SORTS.some(function(s){return s[0]===sp.get('sort')}))catSt.sort=sp.get('sort');
  }catch(e){}
}
/* vitrine — inclui esgotados com overlay (I) */
function drawCatList(){
  /* B: se ainda não carregou, mostra skeletons */
  if(!window.__loaded){$('catGrid').innerHTML=skeletonHtml(6);return}
  var all=P.slice(); /* todos os produtos, incluindo esgotados */
  catSt.cats=Array.from(new Set(all.filter(function(p){return p.stock>0}).map(function(p){return(p.cat||'').trim()}).filter(Boolean))).sort(function(a,b){return a.localeCompare(b,'pt-BR')});
  const hasFilter=!!catSt.sort;
  $('catDot').hidden=!hasFilter;
  var q=catSt.q.trim().toLowerCase();
  var L=sortList(all.filter(function(p){return!q||(p.name+' '+(p.cat||'')+' '+(p.desc||'')).toLowerCase().indexOf(q)>=0}),catSt.sort);
  $('catCount').textContent=plural(L.length,'produto','produtos');
  $('catGrid').innerHTML=L.length?L.map(cardHtml).join(''):'<div class="card empty" style="grid-column:1/-1">'+(all.length?'Nenhum produto encontrado.':'Em breve, novos produtos por aqui.')+'</div>';
  updateBadges();catPushState();
}
/* aba da categoria: só os produtos dela, com busca e filtro próprios — K: estado vazio */
function drawCatPage(){
  var cat=catSt.cat,all=P.filter(function(p){return(p.cat||'').trim()===cat});
  $('catCatTitle').textContent=cat||'Categoria';
  const hasFilter=!!catSt.sort;
  $('catCdot').hidden=!hasFilter;
  var q=catSt.cq.trim().toLowerCase();
  var L=sortList(all.filter(function(p){return!q||(p.name+' '+(p.sku||'')+' '+(p.desc||'')).toLowerCase().indexOf(q)>=0}),catSt.sort);
  $('catCCount').textContent=plural(L.length,'produto','produtos');
  /* K: categoria vazia → mensagem + botão "Ver todos os produtos" */
  $('catCatGrid').innerHTML=L.length?L.map(cardHtml).join(''):'<div class="card empty" style="grid-column:1/-1">'+(all.length?'Nenhum produto encontrado.':'Nenhum produto nesta categoria.<br><br><button type="button" class="btn main" onclick="location.hash=\'\'">Ver todos os produtos</button>')+'</div>';
  updateBadges();
}
$('catQ').oninput=function(){catSt.q=this.value;drawCatList()};
$('catCq').oninput=function(){catSt.cq=this.value;drawCatPage()};
$('catCatGrid').onclick=gridClick;
$('catCatPage').onclick=function(e){if(e.target.closest('[data-a="back"]'))location.hash=''};
/* carrossel de categorias: capa = foto de um produto da categoria */
function catCover(cat){
  var L=P.filter(function(p){return(p.cat||'').trim()===cat});
  return L.filter(function(p){return p.imgs&&p.imgs.length})[0]||L[0]||null;
}
/* filtro/ordenação: um popup único usado pela vitrine e pela aba de categoria */
function soldUnits(){
  var m={};S.filter(function(s){return s.status==='ok'}).forEach(function(s){s.items.forEach(function(it){m[it.pid]=(m[it.pid]||0)+it.qty})});
  return m;
}
function regTime(p){var t=parseInt(p.id,36);return isFinite(t)&&t>1e11?t:0}   // o id é o Date.now() em base36
function sortList(L,sort){
  if(sort==='low')L.sort(function(a,b){return minPrice(a)-minPrice(b)});
  else if(sort==='high')L.sort(function(a,b){return minPrice(b)-minPrice(a)});
  else if(sort==='sold'){var m=soldUnits();L.sort(function(a,b){return(m[b.id]||0)-(m[a.id]||0)})}
  else if(sort==='new')L.sort(function(a,b){return regTime(b)-regTime(a)});
  else if(sort==='old')L.sort(function(a,b){return regTime(a)-regTime(b)});
  return L;
}
function redrawCat(){
  drawCatList();if(catSt.cat)drawCatPage();
  $('catDot').hidden=!catSt.sort;$('catCdot').hidden=!catSt.sort;
}
var filtFocus=null;
var ICON_CHECK='<svg viewBox="0 0 24 24"><path d="m5 13 4 4L19 7"/></svg>';
function openFilt(btn){
  filtFocus=btn||document.activeElement;
  if(filtFocus&&filtFocus.setAttribute)filtFocus.setAttribute('aria-expanded','true');
  $('catFiltOpts').innerHTML=SORTS.map(function(s){return'<button type="button" class="fopt" data-sort="'+s[0]+'" aria-pressed="'+(catSt.sort===s[0])+'"><span>'+s[1]+'</span>'+ICON_CHECK+'</button>'}).join('');
  $('catFiltDlg').showModal();
}
$('catFilterBtn').onclick=function(){openFilt(this)};
$('catCfilterBtn').onclick=function(){openFilt(this)};
/* escolher uma opção aplica na hora; tocar de novo nela desmarca */
$('catFiltOpts').onclick=function(e){
  var b=e.target.closest('[data-sort]');if(!b)return;
  catSt.sort=catSt.sort===b.dataset.sort?'':b.dataset.sort;
  $('catFiltDlg').close();redrawCat();
  if(catSt.sort)toast('Ordenado por '+b.querySelector('span').textContent.toLowerCase()+'.');
};
$('catFiltDlg').onclick=function(e){
  if(e.target.closest('[data-clear]')){
    catSt.sort='';
    this.close();redrawCat();toast('Filtro limpo.');
  }
};
$('catFiltDlg').addEventListener('close',function(){
  ['catFilterBtn','catCfilterBtn'].forEach(function(id){$(id).setAttribute('aria-expanded','false')});
  if(filtFocus&&filtFocus.focus)filtFocus.focus();
});
function drawCatCar(){
  var cats=catSt.cats||[],box=$('catCats');
  box.hidden=!cats.length;
  $('ccTrack').innerHTML=cats.map(function(c){
    var p=catCover(c),ph=p&&p.imgs&&p.imgs.length?'<img alt="" loading="lazy" src="'+blobUrl(p.imgs[0])+'">':'<span aria-hidden="true">'+esc((c.trim()[0]||'?').toUpperCase())+'</span>';
    return'<button type="button" class="cc-card" data-cat="'+esc(c)+'"><span class="cc-ph">'+ph+'</span><strong>'+esc(c)+'</strong></button>';
  }).join('');
  ccNav();
}
function ccNav(){
  var t=$('ccTrack'),over=t.scrollWidth-t.clientWidth>4;
  $('ccPrev').hidden=!over;$('ccNext').hidden=!over;
  var wrap=$('ccTrackWrap');
  if(wrap){wrap.classList.toggle('at-start',t.scrollLeft<=2);wrap.classList.toggle('at-end',!over||t.scrollLeft>=t.scrollWidth-t.clientWidth-2)}
  if(!over)return;
  $('ccPrev').disabled=t.scrollLeft<=2;$('ccNext').disabled=t.scrollLeft>=t.scrollWidth-t.clientWidth-2;
}
function ccGo(dir){$('ccTrack').scrollBy({left:dir*Math.max(180,$('ccTrack').clientWidth*.85),behavior:'smooth'})}
$('ccPrev').onclick=function(){ccGo(-1)};
$('ccNext').onclick=function(){ccGo(1)};
$('ccTrack').addEventListener('scroll',ccNav,{passive:true});
window.addEventListener('resize',function(){if(CATALOG)ccNav()});
$('ccTrack').onclick=function(e){
  var b=e.target.closest('[data-cat]');if(!b)return;
  location.hash='#categoria/'+encodeURIComponent(b.dataset.cat);   // abre a aba com os produtos da categoria
};
function toggleFav(id){var i=FAV.indexOf(id);if(i>=0)FAV.splice(i,1);else FAV.push(id);saveFav()}
$('catGrid').onclick=gridClick;
/* página de favoritos (isolada, rota #favoritos) */
function drawCatFav(){
  var L=favList();
  $('catFavCount').textContent=plural(L.length,'produto favoritado','produtos favoritados');
  $('catFavGrid').innerHTML=L.length?L.map(cardHtml).join(''):'<div class="card empty" style="grid-column:1/-1">Você ainda não favoritou nenhum produto.<br><br><button type="button" class="btn main" data-a="back">Ver produtos</button></div>';
  updateBadges();
}
$('catFavGrid').onclick=function(e){if(e.target.closest('[data-a="back"]')){location.hash='';return}gridClick(e)};
$('catFav').querySelector('.pp-top').onclick=function(e){if(e.target.closest('[data-a="back"]'))location.hash=''};
$('catWish').onclick=function(){location.hash=location.hash==='#favoritos'?'':'#favoritos'};
/* carrinho (aba lateral esquerda) */
function cartQtyP(pid,fn){return CART.filter(function(l){return l.pid===pid&&(!fn||fn(l))}).reduce(function(a,l){return a+l.qty},0)}
// valida se dá para adicionar; devolve {msg,avail} quando não dá (avail = falta de estoque)
function checkAdd(p,sel,q){
  var er='';
  p.vars.forEach(function(g,gi){if(!er&&needsPick(g)&&!sel.some(function(x){return x.gi===gi}))er='Escolha uma opção de "'+g.name+'".'});
  if(er)return{msg:er};
  var avail=p.stock-cartQtyP(p.id);
  sel.forEach(function(v){var o=p.vars[v.gi].opts[v.oi];avail=Math.min(avail,o.q-cartQtyP(p.id,function(l){return l.vars.some(function(x){return x.gi===v.gi&&x.oi===v.oi})}))});
  if(q>avail)return{avail:true,msg:avail>0?'Só há mais '+plural(avail,'unidade disponível','unidades disponíveis')+'.':'Você já adicionou todo o estoque disponível.'};
  return null;
}
function selKey(sel){return sel.map(function(v){return v.gi+':'+v.oi}).join('|')}
function addCart(p,sel,q){
  var er=checkAdd(p,sel,q);if(er){toast(er.msg);return false}
  var key=selKey(sel),line=CART.find(function(l){return l.pid===p.id&&l.key===key});
  if(line)line.qty+=q;else CART.push({pid:p.id,key:key,vars:sel,qty:q});
  saveCart();updateBadges();return true;
}
// soma 1 unidade em uma linha já existente do carrinho (usado nos botões + do carrinho)
function addCartToLine(i){
  var l=CART[i];if(!l)return false;
  var p=P.find(function(x){return x.id===l.pid});if(!p)return false;
  var tot=cartQtyP(p.id),max=Math.min.apply(null,[p.stock].concat(l.vars.map(function(v){var g=p.vars[v.gi],o=g&&g.opts[v.oi];return o?o.q:0})));
  if(tot>=p.stock||l.qty>=max){toast('Quantidade máxima disponível atingida.');return false}
  l.qty++;saveCart();drawCatCart();return true;
}
// diminui 1 unidade; ao chegar a zero a linha sai do carrinho
function decCartLine(i){
  var l=CART[i];if(!l)return;
  var p=P.find(function(x){return x.id===l.pid}),nome=p?p.name:'Produto';
  if(l.qty<=1){CART.splice(i,1);toast(nome+' removido do carrinho.')}else l.qty--;
  saveCart();drawCatCart();
}
// remove do carrinho o que não existe mais e limita a quantidade ao estoque atual
function cleanCart(){
  CART=CART.filter(function(l){
    var p=P.find(function(x){return x.id===l.pid});if(!p||p.stock<=0)return false;
    var ok=l.vars.every(function(v){var g=p.vars[v.gi],o=g&&g.opts[v.oi];return o&&o.n===v.o&&g.name===v.g&&o.q>0});
    if(!ok)return false;
    var max=Math.min.apply(null,[p.stock].concat(l.vars.map(function(v){return p.vars[v.gi].opts[v.oi].q})));l.qty=Math.min(l.qty,max);return l.qty>0;
  });saveCart();
}
function cartTotal(){return CART.reduce(function(a,l){var p=P.find(function(x){return x.id===l.pid});return a+unitFor(p,l.vars).price*l.qty},0)}
// carrinho (aba lateral esquerda) — o pedido fica salvo no navegador do cliente
function cartUnits(){return CART.reduce(function(a,l){return a+l.qty},0)}
function cartCount(){return plural(cartUnits(),'item','itens')}
/* [SaaS] foto da primeira opção escolhida que tem foto ligada (senão, a principal) */
function varImg(p,vars){for(var k=0;k<(vars||[]).length;k++){var g=p.vars[vars[k].gi],o=g&&g.opts[vars[k].oi];if(o&&o.img!=null&&o.img<p.imgs.length)return o.img}return 0}
function drawCatCart(){
  cleanCart();
  $('catCartCount').textContent=CART.length?'('+cartCount()+')':'';
  $('catCartList').innerHTML=CART.length?CART.map(function(l,i){
    var p=P.find(function(x){return x.id===l.pid}),u=unitFor(p,l.vars),vt=l.vars.map(function(v){return v.g+': '+v.o}).join(', ');
    var max=Math.min.apply(null,[p.stock].concat(l.vars.map(function(v){var g=p.vars[v.gi],o=g&&g.opts[v.oi];return o?o.q:0})));
    var noMax=cartQtyP(p.id)>=p.stock||l.qty>=max;   // estoque geral ou da opção esgotado
    return'<div class="cd-item">'+catPhoto(p,varImg(p,l.vars),'cd-img')+'<div class="cd-info"><strong>'+esc(p.name)+'</strong>'+(p.cat?'<small>'+esc(p.cat)+'</small>':'')+(vt?'<small>'+esc(vt)+'</small>':'')+'<small>'+brl(u.price)+' cada</small>'+
      '<div class="cd-ctl"><span class="qty"><button type="button" data-a="dec" data-i="'+i+'" aria-label="Diminuir quantidade de '+esc(p.name)+'">−</button><b>'+l.qty+'</b><button type="button" data-a="inc" data-i="'+i+'" aria-label="Aumentar quantidade de '+esc(p.name)+'"'+(noMax?' disabled title="Estoque máximo atingido"':'')+'>+</button></span>'+
      '<button type="button" class="linerm" data-a="rm" data-i="'+i+'" aria-label="Remover '+esc(p.name)+' do carrinho">Remover</button></div></div><b class="cd-line">'+brl(u.price*l.qty)+'</b></div>'}).join('')
    :'<div class="empty">Seu carrinho está vazio.<br><br><button type="button" class="btn main" data-a="close">Continuar comprando</button></div>';
  $('catCartTotal').textContent=brl(cartTotal());$('catCartFoot').hidden=!CART.length;
  $('catCartCount').textContent=CART.length?'('+cartCount()+')':'';
  var c=$('catCartClear');delete c.dataset.sure;c.textContent='Esvaziar carrinho';
  updateBadges();
}
function openCart(){
  drawCatCart();if(document.body.classList.contains('cart-open'))return;
  cdFocus=document.activeElement;document.body.classList.add('cart-open');
  $('catDrawer').setAttribute('aria-hidden','false');$('catPage').inert=true;$('catDrawerClose').focus();
}
function closeCart(){
  if(!document.body.classList.contains('cart-open'))return;
  document.body.classList.remove('cart-open');$('catDrawer').setAttribute('aria-hidden','true');$('catPage').inert=false;
  if(cdFocus&&cdFocus.focus)cdFocus.focus();
}
$('catCart').onclick=openCart;
$('catDrawerClose').onclick=closeCart;$('catScrim').onclick=closeCart;
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeCart()});
$('catCartClear').onclick=function(){
  var b=this;
  if(!b.dataset.sure){b.dataset.sure='1';b.textContent='Confirmar: esvaziar tudo';setTimeout(function(){if(b.dataset.sure){delete b.dataset.sure;b.textContent='Esvaziar carrinho'}},3500);return}
  CART=[];saveCart();drawCatCart();toast('Carrinho esvaziado.');
};
$('catCartList').onclick=function(e){
  var b=e.target.closest('button[data-a]');if(!b)return;
  var a=b.dataset.a;
  if(a==='close')return closeCart();
  var i=+b.dataset.i,l=CART[i];if(!l)return;
  if(a==='rm'){var p=P.find(function(x){return x.id===l.pid});CART.splice(i,1);saveCart();drawCatCart();toast((p?p.name:'Produto')+' removido do carrinho.');return}
  if(a==='inc')return addCartToLine(i);
  if(a==='dec')return decCartLine(i);
};
// finalizar compra: envia o resumo do pedido para o WhatsApp da loja (configurado na aba Catálogo)
$('catCheckout').onclick=function(){
  cleanCart();if(!CART.length)return drawCatCart();
  var num=(CAT.whats||'').replace(/\D/g,'');
  if(!num)return toast('Esta loja ainda não configurou o WhatsApp para receber pedidos.');
  if(num.length<=11)num='55'+num;
  var co=orderCode(CART);if(!co)return toast('Não foi possível gerar o código deste pedido.');
  var lk=pedidoLink(co.code);
  var itens=plural(cartUnits(),'item','itens');
  /* mensagem personalizada: cada item com nome, quantidade e valor; depois o total e o link de preenchimento automático */
  var linhas=CART.map(function(l){
    var p=P.find(function(x){return x.id===l.pid});if(!p)return'';
    var u=unitFor(p,l.vars),vt=(l.vars||[]).map(function(v){return v.o}).join(', ');
    return '• '+l.qty+'x '+p.name+(vt?' ('+vt+')':'')+' — '+brl(u.price)+' cada = '+brl(u.price*l.qty);
  }).filter(function(x){return !!x}).join('\n');
  var msg='Olá, '+catName()+'! Quero fazer este pedido:\n\n'+linhas+
    '\n\nTotal: '+brl(cartTotal())+' ('+itens+')'+
    '\nPedido '+co.id+'\nPreencher venda automaticamente: '+(lk||co.code);
  window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank','noopener');
  toast('Abrindo o WhatsApp da loja. O pedido '+co.id+' vai com o link do código.');
};
/* página do produto */
function selArr(p){var out=[];Object.keys(pp.sel).forEach(function(gi){var oi=pp.sel[gi];if(p.vars[gi]&&p.vars[gi].opts[oi])out.push({gi:+gi,oi:oi,g:p.vars[gi].name,o:p.vars[gi].opts[oi].n})});return out}
function drawProd(){
  var p=P.find(function(x){return x.id===pp.id}),box=$('catProd');
  if(!p||p.stock<=0){box.innerHTML='<div class="pp-top"><button class="btn sm" data-a="back" type="button">← Voltar</button></div>'+
    '<div class="card empty" style="margin-top:14px">Produto indisponível no momento.</div>';return}
  var sel=selArr(p),allPicked=p.vars.every(function(g,gi){return!needsPick(g)||pp.sel[gi]!=null});
  var price=allPicked?brl(unitFor(p,sel).price):(hasRange(p)?'a partir de '+brl(minPrice(p)):brl(p.price));
  var fav=FAV.indexOf(p.id)>=0,i=Math.min(pp.img,Math.max(0,p.imgs.length-1));
  var avail=p.stock;sel.forEach(function(v){avail=Math.min(avail,p.vars[v.gi].opts[v.oi].q)});
  pp.qty=Math.max(1,Math.min(pp.qty,avail));
  box.innerHTML='<div class="pp-top"><button class="btn sm" data-a="back" type="button">← Voltar</button></div>'+
    '<div class="pp"><div>'+catPhoto(p,i,'pp-main')+(p.imgs.length>1?'<div class="pp-th">'+p.imgs.map(function(_,k){return'<button type="button" data-a="th" data-i="'+k+'" aria-pressed="'+(k===i)+'" aria-label="Foto '+(k+1)+'"><img alt="" src="'+blobUrl(p.imgs[k])+'"></button>'}).join('')+'</div>':'')+'</div>'+
    '<div>'+(p.cat?'<span class="pill">'+esc(p.cat)+'</span>':'')+'<h1>'+esc(p.name)+'</h1><div class="pp-price">'+price+'</div>'+
    (p.desc?'<p class="pp-desc">'+esc(p.desc)+'</p>':'')+
    p.vars.map(function(g,gi){return'<span class="vlabel">'+esc(g.name)+(needsPick(g)?' *':'')+'</span><div class="chips">'+g.opts.map(function(o,oi){return'<button type="button" class="chip" data-a="opt" data-gi="'+gi+'" data-oi="'+oi+'" aria-pressed="'+(pp.sel[gi]===oi)+'"'+(o.q<=0?' disabled title="Esgotado"':'')+'>'+esc(o.n)+'</button>'}).join('')+'</div>'}).join('')+
    '<span class="vlabel">Quantidade <span style="font-weight:400">('+plural(avail,'disponível','disponíveis')+')</span></span><div class="qty"><button type="button" data-a="qm" aria-label="Diminuir">−</button><b>'+pp.qty+'</b><button type="button" data-a="qp" aria-label="Aumentar">+</button></div>'+
    '<div class="pp-acts"><button type="button" class="btn main" data-a="add">Adicionar ao carrinho</button></div></div></div>';
}
$('catProd').onclick=function(e){
  var b=e.target.closest('[data-a]');if(!b)return;var a=b.dataset.a,p=P.find(function(x){return x.id===pp.id});
  if(a==='back'){location.hash=ppFrom?'#categoria/'+encodeURIComponent(ppFrom):'';return}
  if(!p)return;
  if(a==='fav')toggleFav(p.id);
  else if(a==='view')return openCart();
  else if(a==='th')pp.img=+b.dataset.i;
  else if(a==='opt'){var gi=b.dataset.gi,oi=+b.dataset.oi;if(pp.sel[gi]===oi)delete pp.sel[gi];else{pp.sel[gi]=oi;var oo=p.vars[gi]&&p.vars[gi].opts[oi];if(oo&&oo.img!=null&&oo.img<p.imgs.length)pp.img=oo.img} /* [SaaS] foto da variação */}
  else if(a==='qm')pp.qty=Math.max(1,pp.qty-1);
  else if(a==='qp')pp.qty++;
  else if(a==='add'){
    var sel=selArr(p),er=checkAdd(p,sel,pp.qty);
    if(!er){addCart(p,sel,pp.qty);drawCatCart();toast('Adicionado ao carrinho.')}
    else toast(er.msg);
    return;
  }
  drawProd();updateBadges();
};
/* rotas: #produto/ID = página do produto, #categoria/NOME = aba da categoria, #favoritos = favoritos, sem hash = vitrine */
var ppFrom='';
function catRoute(){
  var prev=catRoute.prev||'';catRoute.prev=location.hash;
  var h=location.hash,m=/^#produto\/(.+)$/.exec(h),fav=h==='#favoritos',cm=/^#categoria\/(.+)$/.exec(h),cat=cm?decodeURIComponent(cm[1]):'',was=pp.id;
  if(m){
    var pm=/^#categoria\/(.+)$/.exec(prev);if(pm)ppFrom=decodeURIComponent(pm[1]);   // voltar do produto leva de volta à categoria
    var id=decodeURIComponent(m[1]);if(id!==pp.id)pp={id:id,sel:{},qty:1,img:0};drawProd();
  }else{pp.id=null;if(!fav&&!cm)ppFrom='';}
  if(fav)drawCatFav();
  if(cm){if(catSt.cat!==cat){catSt.cat=cat;catSt.cq='';$('catCq').value=''}drawCatPage();if(prev!==location.hash)$('catCatTitle').focus({preventScroll:true})}else catSt.cat='';
  $('catList').hidden=!!m||fav||!!cm;$('catProd').hidden=!m;$('catFav').hidden=!fav;$('catCatPage').hidden=!cm;
  $('catHero').hidden=!!m||fav||!!cm||!(CAT.title||CAT.desc);
  if(m||fav||cm||was)scrollTo(0,0);
  if(!$('catList').hidden)ccNav();
  updateBadges();
}
window.addEventListener('hashchange',function(){if(CATALOG){closeCart();catRoute();if(!$('catList').hidden)drawCatList()}});
function drawCatalogPage(){
  document.body.classList.add('cat-mode');$('catPage').hidden=false;
  $('catStore').textContent=catName();document.title=catName();
  $('catTitle').textContent=CAT.title||'';$('catDesc').textContent=CAT.desc||'';
  $('catTitle').hidden=!CAT.title;$('catDesc').hidden=!CAT.desc;
  var hero=$('catHero'),isImg=CAT.heroMode==='image'&&CAT.heroImg;
  hero.classList.toggle('has-img',!!isImg);
  if(isImg){hero.style.background='linear-gradient(var(--hero-overlay),var(--hero-overlay)),url('+blobUrl(CAT.heroImg)+') center/cover no-repeat';hero.style.color='var(--hero-title)'}
  else{hero.style.background='';hero.style.color=''} /* cores vindas do tema (Cabeçalho e Seção inicial) */
  drawCatList();drawCatCar();catRoute();drawCatFoot();applyCatTheme();
}

/* ===== Tema do catálogo ===== */
var FONTS=[
  ['','Sistema (padrão)'],
  ['Inter','Inter'],['Poppins','Poppins'],['Montserrat','Montserrat'],['DM Sans','DM Sans'],
  ['Space Grotesk','Space Grotesk'],['Outfit','Outfit'],['Nunito','Nunito'],['Raleway','Raleway'],
  ['Playfair Display','Playfair Display'],['Lora','Lora'],['Merriweather','Merriweather'],
  ['Cormorant Garamond','Cormorant Garamond'],['Bebas Neue','Bebas Neue']
];
var THEME_DEF={headFont:'',bodyFont:'',radius:'rounded',
  light:{bg:'#F3F4F9',surface:'#ffffff',ink:'#12141D',accent:'#4F46E5'},
  dark:{bg:'#0B0D13',surface:'#14171F',ink:'#ECEEF5',accent:'#4F46E5'},
  secs:{light:{},dark:{}}};
/* áreas de cor do catálogo — cada detalhe, por modo. Vazio/"auto" = segue a base (harmonia automática). */
var SECTS=[
 {k:'geral',n:'Geral',s:[
   ['bg','Cor de fundo da página'],
   ['btt-ink','Seta do botão “voltar ao início”'],
   ['btt-bg','Fundo do botão “voltar ao início”']]},
 {k:'base',n:'Base do catálogo (harmonia geral)',s:[
   ['surface','Cartões e painéis'],['ink','Texto'],['muted','Texto secundário'],
   ['accent','Destaque'],['line','Linhas e bordas'],['track','Fundos suaves (miniaturas)'],['sec-title','Títulos de página (Favoritos/Categoria)']]},
 {k:'header',n:'Cabeçalho',s:[
   ['head-bg','Fundo'],
   ['head-title','Título (e o nome da loja)'],
   ['head-icon','Ícones (carrinho, coração, lua/sol)'],
   ['head-icon-bg','Fundo de ícones'],
   ['head-icon-line','Bordas de ícones'],
   ['head-badge-ink','Texto de quantidade'],
   ['head-badge','Fundo de quantidade'],
   ['head-line','Linha inferior do cabeçalho']]},
 {k:'hero',n:'Seção inicial',s:[
   ['hero-overlay','Sombra sobre a imagem — cor'],
   ['hero-overlay-op','Sombra — opacidade','range',{min:0,max:100,step:1,def:50,unit:'%'}],
   ['hero-title','Título — cor'],
   ['hero-title-align','Título — alinhamento','align'],
   ['hero-title-size','Título — tamanho','range',{min:1.2,max:4.6,step:.05,def:2.9,unit:'rem'}],
   ['hero-desc','Descrição — cor'],
   ['hero-desc-align','Descrição — alinhamento','align'],
   ['hero-desc-size','Descrição — tamanho','range',{min:.7,max:2.2,step:.05,def:1.05,unit:'rem'}]]},
 {k:'search',n:'Pesquisa e filtro',s:[
   ['srch-bg','Barra — fundo'],
   ['srch-line','Barra — borda'],
   ['srch-ink','Barra — texto'],
   ['srch-ph','Barra — texto de exemplo'],
   ['srch-ic','Ícone de lupa'],
   ['filt-btn-ic','Ícone de filtro'],
   ['filt-btn-bg','Ícone de filtro — fundo'],
   ['filt-btn-line','Ícone de filtro — borda'],
   ['filt-dot','Ícone de filtro — ponto de aviso'],
   ['filt-bg','Opções — fundo da janela'],
   ['filt-ink','Opções — texto da janela'],
   ['filt-line','Opções — borda da janela'],
   ['filt-opt-bg','Opções — fundo'],
   ['filt-opt-ink','Opções — texto'],
   ['filt-opt-on-bg','Opção selecionada — fundo'],
   ['filt-opt-on-ink','Opção selecionada — texto']]},
 {k:'cats',n:'Seção Categorias',s:[
   ['cc-title','Título de seção (e o nome Categorias)'],
   ['cc-nav-ic','Ícones (setas de esquerda e direita)'],
   ['cc-nav-bg','Fundo de ícones (setas)'],
   ['cc-nav-line','Borda de ícones (setas)'],
   ['cc-card','Cards (foto e nome da categoria) — fundo'],
   ['cc-line','Cards — borda'],
   ['cc-ph-bg','Foto do card — fundo'],
   ['cc-ph-ink','Sigla (categoria sem foto)'],
   ['cc-name','Nome (da categoria)'],
   ['cc-fade','Gradientes (nas pontas do carrossel)']]},
 {k:'prods',n:'Todos os produtos',s:[
   ['prod-card','Fundo de card (foto, valor e nome do produto)'],
   ['prod-line','Card — borda'],
   ['prod-name','Nome do produto'],
   ['prod-ink','Texto'],
   ['prod-price','Preço'],
   ['prod-muted','Texto “a partir de” / sem foto'],
   ['prod-img-bg','Foto ausente — fundo'],
   ['prod-icon','Ícones dos cards (carrinho e coração)'],
   ['prod-icon-bg','Fundo de ícones'],
   ['prod-icon-line','Borda de ícones'],
   ['prod-icon-on','Cor de preenchimento (ícone usado)'],
   ['prod-icon-on-bg','Fundo do ícone usado'],
   ['prod-icon-on-line','Borda do ícone usado']]},
 {k:'pp',n:'Página do produto',s:[
   ['pp-title','Título'],['pp-price','Preço'],['pp-desc','Descrição'],['pp-img-bg','Fotos — fundo'],
   ['pp-icon','Ícones (carrinho/favorito)'],['pp-icon-bg','Ícones — fundo'],['pp-icon-line','Ícones — borda'],
   ['pp-btn','Botão adicionar — fundo'],['pp-btn-ink','Botão adicionar — texto'],
   ['pp-chip-bg','Opção — fundo'],['pp-chip-ink','Opção — texto'],['pp-chip-line','Opção — borda'],
   ['pp-chip-on-bg','Opção escolhida — fundo'],['pp-chip-on-ink','Opção escolhida — texto'],
   ['pp-qty-bg','Quantidade — fundo'],['pp-qty-ink','Quantidade — texto'],['pp-qty-line','Quantidade — borda']]},
 {k:'foot',n:'Rodapé',s:[
   ['foot-bg','Fundo'],
   ['foot-line','Linhas'],
   ['foot-name','Título (nome da loja)'],
   ['foot-text','Contatos (e-mail e telefone)'],
   ['foot-link','Contatos — links'],
   ['foot-ic','Ícones de contato (e-mail e telefone)'],
   ['foot-icon','Ícones das redes sociais'],
   ['foot-icon-bg','Fundo dos ícones sociais'],
   ['foot-icon-line','Borda dos ícones sociais'],
   ['foot-icon-on-bg','Ícone social tocado — fundo'],
   ['foot-icon-on-ink','Ícone social tocado — ícone'],
   ['foot-legal','Direitos reservados']]},
 {k:'cart',n:'Carrinho (aba lateral)',s:[
   ['cart-bg','Fundo (aba de carrinho)'],
   ['cart-ink','Texto'],
   ['cart-title','Título'],
   ['cart-line','Linhas e bordas'],
   ['cart-muted','Textos secundários'],
   ['cart-total','Total'],
   ['cart-img-bg','Foto ausente — fundo'],
   ['cart-qty-bg','Quantidade — fundo'],
   ['cart-qty-ink','Quantidade — texto'],
   ['cart-qty-line','Quantidade — borda'],
   ['cart-btn','Botão finalizar compra — fundo'],
   ['cart-btn-ink','Botão finalizar compra — texto'],
   ['cart-clear-bg','Botão esvaziar — fundo'],
   ['cart-clear-ink','Botão esvaziar — texto'],
   ['cart-clear-line','Botão esvaziar — borda'],
   ['cart-close-bg','Botão fechar (X) — fundo'],
   ['cart-close-ink','Botão fechar (X) — ícone'],
   ['cart-close-line','Botão fechar (X) — borda'],
   ['cart-rm','Botão remover (lixeira)'],
   ['cart-scrim','Fundo escurecido atrás']]},
 {k:'buttons',n:'Botões comuns (Voltar, Fechar, Esvaziar, Limpar filtro)',s:[
   ['btn-bg','Fundo'],['btn-ink','Texto e ícone'],['btn-line','Borda']]},
 {k:'toast',n:'Avisos (toast)',s:[['toast-bg','Fundo'],['toast-ink','Texto']]}
];
function thm(){return CAT.theme||THEME_DEF}
function thmPal(t){var th=thm();return(t||root.getAttribute('data-theme'))==='dark'?Object.assign({},THEME_DEF.dark,th.dark||{}):Object.assign({},THEME_DEF.light,th.light||{})}
function ensureTheme(){
  if(!CAT.theme)CAT.theme=JSON.parse(JSON.stringify(THEME_DEF));
  /* limpeza: "Gradiente — cor 1/2" saiu do painel (o fundo da seção inicial segue a cor de "Cabeçalho e seção inicial") */
  ['light','dark'].forEach(function(m){
    if(CAT.theme.secs&&CAT.theme.secs[m]){delete CAT.theme.secs[m]['hero-bg'];delete CAT.theme.secs[m]['hero-bg2']}
  });
}
/* utilitários de cor (usados pela paleta e pelas áreas do catálogo) */
function cLum(c){var n=parseInt(c.slice(1),16);return(0.299*(n>>16)+0.587*(n>>8&255)+0.114*(n&255))/255}
function cMix(a,b,w){var na=parseInt(a.slice(1),16),nb=parseInt(b.slice(1),16),r=Math.round,m=function(sa,sb){return r(sa+(sb-sa)*w)};return'#'+[16,8,0].map(function(sh){return m((na>>sh)&255,(nb>>sh)&255).toString(16).padStart(2,'0')}).join('')}
/* mantém a cor preferida quando ela tem contraste WCAG suficiente (>= 4.5); senão força preto/branco */
function cRatio(a,b){
  function lin(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)}
  function lum(h){var n=parseInt(h.slice(1),16),r=lin(n>>16),g=lin(n>>8&255),b=lin(n&255);return 0.2126*r+0.7152*g+0.0722*b}
  var l1=lum(a),l2=lum(b),hi=Math.max(l1,l2),lo=Math.min(l1,l2);return(hi+0.05)/(lo+0.05);
}
function autoInk(bg,pref){
  if(!/^#[0-9a-f]{6}$/i.test(bg||'')||!/^#[0-9a-f]{6}$/i.test(pref||''))return pref;
  if(cRatio(bg,pref)>=4.5)return pref;
  /* entre escuro e claro, escolhe o que dá mais contraste (ex.: fundo vermelho pede texto escuro) */
  var dark='#10131C',light='#ECEEF5';
  return cRatio(bg,light)>=cRatio(bg,dark)?light:dark;
}
/* derive secondary colors from palette */
function derivePal(p){
  var lum=cLum,mix=cMix,isDark=lum(p.bg)<0.4,aInk=lum(p.accent)>0.62?'#10131C':'#ffffff'; /* sempre 6 dígitos: o autoInk depende disso para corrigir o contraste */
  return{bg:p.bg,surface:p.surface,ink:p.ink,accent:p.accent,
    'accent-ink':aInk,
    muted:mix(p.ink,isDark?'#000000':'#ffffff',.38),
    line:mix(p.surface,p.ink,.12),
    track:mix(p.bg,p.ink,.08),
    bad:isDark?'#FF7A70':'#D92D20'};
}
/* converte #rrggbb em rgba() — usado na sombra sobre a imagem e no fundo escurecido do carrinho */
function cRgba(c,a){if(!/^#[0-9a-f]{6}$/i.test(c||''))return c;return'rgba('+parseInt(c.slice(1,3),16)+','+parseInt(c.slice(3,5),16)+','+parseInt(c.slice(5,7),16)+','+a+')'}
/* ajustes numéricos/listas da personalização (tamanho, opacidade, alinhamento) */
function tuneNum(v,def,min,max){var n=parseFloat(v);if(!isFinite(n))return def;if(min!=null&&n<min)n=min;if(max!=null&&n>max)n=max;return n}
function tuneOne(v,list,def){return list.indexOf(v)>=0?v:def}
function f2(n){return String(Math.round(n*1000)/1000)}
function heroAlign(v){return tuneOne(v,['left','center','right'],'center')}
/* o tamanho escolhido é a medida máxima (desktop) e o catálogo mantém a proporção no celular */
function heroTitleSizeCss(v){return'clamp('+f2(v*.5517)+'rem,'+f2(v*2.069)+'vw,'+f2(v)+'rem)'}
function heroDescSizeCss(v){return'clamp('+f2(v*.9333)+'rem,'+f2(v*3.238)+'vw,'+f2(v)+'rem)'}
/* cores resolvidas de cada área do catálogo ("auto" = segue a base e mantém a harmonia) */
function catVars(t){
  var pal=derivePal(thmPal(t)),sm=(thm().secs||{})[t]||{};
  function R(v,fb){var c=sm[v];return(c&&/^#[0-9a-f]{6}$/i.test(c))?c:fb}
  /* base */
  var bg=R('bg',pal.bg),surface=R('surface',pal.surface),ink=R('ink',pal.ink),accent=R('accent',pal.accent);
  var muted=R('muted',pal.muted),line=R('line',pal.line),track=R('track',pal.track);
  ink=autoInk(bg,ink); /* garante contraste do texto-base contra o fundo da página */
  var aInk=autoInk(accent,pal['accent-ink']);
  var o=Object.assign({},pal);
  o.bg=bg;o.surface=surface;o.ink=ink;o.accent=accent;o.muted=muted;o.line=line;o.track=track;o['accent-ink']=aInk;
  /* geral: fundo da página (acima) e botão "voltar ao início" */
  var bttBg=R('btt-bg',accent);
  o['btt-bg']=bttBg;o['btt-ink']=R('btt-ink',autoInk(bttBg,aInk));
  /* cabeçalho */
  var headBg=R('head-bg',surface),headLine=R('head-line',cMix(headBg,ink,.12));
  var headTitle=R('head-title',autoInk(headBg,ink)),headIcon=R('head-icon',headTitle);
  var headBadge=R('head-badge',accent);
  o['head-bg']=headBg;o['head-line']=headLine;o['head-title']=headTitle;o['head-icon']=headIcon;
  o['head-icon-bg']=R('head-icon-bg',headBg);o['head-icon-line']=R('head-icon-line',headLine);
  o['head-badge']=headBadge;o['head-badge-ink']=R('head-badge-ink',autoInk(headBadge,aInk));
  /* seção inicial — o fundo (gradiente) segue a cor de "Cabeçalho e seção inicial" */
  var heroBg=CAT.heroColor||accent,heroTitle=R('hero-title',autoInk(heroBg,'#fff'));
  o['hero-bg']=heroBg;o['hero-bg2']=cMix(heroBg,'#000000',.14);
  o['hero-ink']=autoInk(heroBg,aInk);o['hero-title']=heroTitle;o['hero-desc']=R('hero-desc',heroTitle);
  o['hero-overlay']=cRgba(R('hero-overlay','#0a0c14'),tuneNum(sm['hero-overlay-op'],50,0,100)/100);
  o['hero-title-align']=heroAlign(sm['hero-title-align']);o['hero-desc-align']=heroAlign(sm['hero-desc-align']);
  o['hero-title-size']=heroTitleSizeCss(tuneNum(sm['hero-title-size'],2.9,1.2,4.6));
  o['hero-desc-size']=heroDescSizeCss(tuneNum(sm['hero-desc-size'],1.05,.7,2.2));
  var da=o['hero-desc-align'],dm=da==='left'?['0','auto']:da==='right'?['auto','0']:['auto','auto'];
  o['hero-desc-ml']=dm[0];o['hero-desc-mr']=dm[1];
  /* busca e filtro */
  const srchBg=R('srch-bg',surface),filtBtnBg=R('filt-btn-bg',surface);
  o['srch-bg']=srchBg;o['srch-ink']=R('srch-ink',autoInk(srchBg,ink));o['srch-ph']=R('srch-ph',muted);
  o['srch-ic']=R('srch-ic',muted);o['srch-line']=R('srch-line',line);
  o['filt-btn-bg']=filtBtnBg;o['filt-btn-ic']=R('filt-btn-ic',autoInk(filtBtnBg,ink));o['filt-btn-line']=R('filt-btn-line',line);
  o['filt-dot']=R('filt-dot',accent);
  /* títulos de página */
  o['sec-title']=R('sec-title',autoInk(bg,ink));
  /* categorias */
  var ccCard=R('cc-card',surface),ccName=R('cc-name',autoInk(ccCard,ink));
  o['cc-title']=R('cc-title',autoInk(bg,ink));o['cc-card']=ccCard;o['cc-line']=R('cc-line',cMix(ccCard,ink,.12));
  o['cc-name']=ccName;o['cc-ph-bg']=R('cc-ph-bg',track);o['cc-ph-ink']=R('cc-ph-ink',cMix(ccName,ccCard,.45));
  o['cc-fade']=R('cc-fade',bg); /* gradiente das pontas do carrossel: cor → transparente */
  o['cc-nav-bg']=R('cc-nav-bg',ccCard);o['cc-nav-ic']=R('cc-nav-ic',ccName);o['cc-nav-line']=R('cc-nav-line',cMix(ccCard,ink,.12));
  /* produtos */
  var prodCard=R('prod-card',surface),prodName=R('prod-name',autoInk(prodCard,ink));
  o['prod-card']=prodCard;o['prod-line']=R('prod-line',cMix(prodCard,ink,.12));o['prod-name']=prodName;
  o['prod-ink']=R('prod-ink',prodName);o['prod-price']=R('prod-price',prodName);
  o['prod-muted']=R('prod-muted',cMix(prodName,prodCard,.45));o['prod-img-bg']=R('prod-img-bg',track);
  o['prod-icon']=R('prod-icon',prodName);o['prod-icon-bg']=R('prod-icon-bg',prodCard);o['prod-icon-line']=R('prod-icon-line',cMix(prodCard,ink,.12));
  /* ícone usado (carrinho/coração preenchido): cor de preenchimento, fundo e borda.
     padrões idênticos ao visual anterior (--accent-text / --soft / --accent) */
  var dk=(t||root.getAttribute('data-theme'))==='dark';
  var aText=dk?cMix(accent,'#ffffff',.42):cMix(accent,'#000000',.18),aSoft=cMix(accent,surface,.89);
  o['prod-icon-on']=R('prod-icon-on',aText);o['prod-icon-on-bg']=R('prod-icon-on-bg',aSoft);o['prod-icon-on-line']=R('prod-icon-on-line',accent);
  /* página do produto */
  o['pp-title']=R('pp-title',autoInk(bg,ink));o['pp-price']=R('pp-price',autoInk(bg,ink));o['pp-desc']=R('pp-desc',muted);
  o['pp-img-bg']=R('pp-img-bg',track);o['pp-img-line']=R('pp-img-line',line);
  const ppIconBg=R('pp-icon-bg',surface),ppChipBg=R('pp-chip-bg',surface),ppQtyBg=R('pp-qty-bg',surface);
  o['pp-icon']=R('pp-icon',autoInk(ppIconBg,ink));o['pp-icon-bg']=ppIconBg;o['pp-icon-line']=R('pp-icon-line',line);
  var ppBtn=R('pp-btn',accent);
  o['pp-btn']=ppBtn;o['pp-btn-ink']=R('pp-btn-ink',autoInk(ppBtn,aInk));
  o['pp-chip-bg']=ppChipBg;o['pp-chip-ink']=R('pp-chip-ink',autoInk(ppChipBg,ink));o['pp-chip-line']=R('pp-chip-line',line);
  var chipOn=R('pp-chip-on-bg',accent);
  o['pp-chip-on-bg']=chipOn;o['pp-chip-on-ink']=R('pp-chip-on-ink',autoInk(chipOn,aInk));
  o['pp-qty-bg']=ppQtyBg;o['pp-qty-ink']=R('pp-qty-ink',autoInk(ppQtyBg,ink));o['pp-qty-line']=R('pp-qty-line',line);
  /* rodapé */
  var footBg=R('foot-bg',surface),footName=R('foot-name',autoInk(footBg,ink)),footOnBg=R('foot-icon-on-bg',accent);
  o['foot-bg']=footBg;o['foot-line']=R('foot-line',cMix(footBg,ink,.12));o['foot-name']=footName;
  o['foot-text']=R('foot-text',cMix(footName,footBg,.45));o['foot-link']=R('foot-link',footName);
  o['foot-ic']=R('foot-ic',o['foot-text']); /* ícones de e-mail/telefone: padrão segue o texto dos contatos */
  o['foot-icon']=R('foot-icon',headIcon); /* padrão: segue a cor dos ícones do cabeçalho */
  o['foot-icon-bg']=R('foot-icon-bg',track);o['foot-icon-line']=R('foot-icon-line',line);
  o['foot-icon-on-bg']=footOnBg;o['foot-icon-on-ink']=R('foot-icon-on-ink',autoInk(footOnBg,aInk));
  o['foot-legal']=R('foot-legal',cMix(footName,footBg,.45));
  /* carrinho lateral */
  var cartBg=R('cart-bg',surface),cartInk=R('cart-ink',autoInk(cartBg,ink)),cartBtn=R('cart-btn',accent);
  o['cart-bg']=cartBg;o['cart-ink']=cartInk;o['cart-title']=R('cart-title',cartInk);
  o['cart-line']=R('cart-line',cMix(cartBg,cartInk,.12));o['cart-muted']=R('cart-muted',cMix(cartInk,cartBg,.42));
  o['cart-total']=R('cart-total',cartInk);o['cart-btn']=cartBtn;o['cart-btn-ink']=R('cart-btn-ink',autoInk(cartBtn,aInk));
  o['cart-qty-bg']=R('cart-qty-bg',cartBg);o['cart-qty-ink']=R('cart-qty-ink',autoInk(cartBg,ink));
  o['cart-qty-line']=R('cart-qty-line',cMix(cartBg,cartInk,.12));o['cart-rm']=R('cart-rm',pal.bad);
  o['cart-scrim']=cRgba(R('cart-scrim','#05070c'),.55);
  /* botões próprios do carrinho: fechar (X) e esvaziar; padrão segue os botões comuns de hoje */
  o['cart-img-bg']=R('cart-img-bg',track);
  var ctCloseBg=R('cart-close-bg',surface);
  o['cart-close-bg']=ctCloseBg;o['cart-close-ink']=R('cart-close-ink',autoInk(ctCloseBg,ink));o['cart-close-line']=R('cart-close-line',line);
  var ctClearBg=R('cart-clear-bg',R('btn-bg',surface));
  o['cart-clear-bg']=ctClearBg;o['cart-clear-ink']=R('cart-clear-ink',R('btn-ink',autoInk(surface,ink)));o['cart-clear-line']=R('cart-clear-line',R('btn-line',line));
  /* botões comuns */
  o['btn-bg']=R('btn-bg',surface);o['btn-ink']=R('btn-ink',autoInk(surface,ink));o['btn-line']=R('btn-line',line);
  /* janela de filtros */
  var filtBg=R('filt-bg',surface),filtInk=R('filt-ink',autoInk(filtBg,ink)),filtOn=R('filt-opt-on-bg',accent);
  o['filt-bg']=filtBg;o['filt-ink']=filtInk;o['filt-line']=R('filt-line',cMix(filtBg,filtInk,.12));
  o['filt-opt-bg']=R('filt-opt-bg',filtBg);o['filt-opt-ink']=R('filt-opt-ink',filtInk);
  o['filt-opt-on-bg']=filtOn;o['filt-opt-on-ink']=R('filt-opt-on-ink',autoInk(filtOn,aInk));
  /* avisos */
  o['toast-bg']=R('toast-bg',cartInk);o['toast-ink']=R('toast-ink',cartBg);
  return o;
}
/* load Google Fonts dynamically */
var loadedFonts={};
function loadFont(name){
  if(!name||loadedFonts[name])return;loadedFonts[name]=true;
  var w=name==='Bebas Neue'?'400':'400;500;700;800';
  var link=document.createElement('link');link.rel='stylesheet';
  link.href='https://fonts.googleapis.com/css2?family='+encodeURIComponent(name)+':wght@'+w+'&display=swap';
  document.head.appendChild(link);
}
/* apply theme to catalog page and cart drawer */
function applyCatTheme(darkOverride){
  var th=thm(),t=darkOverride||root.getAttribute('data-theme'),pal=catVars(t);
  var targets=[document.getElementById('catPage'),document.getElementById('catDrawer'),document.getElementById('catScrim'),document.getElementById('catFiltDlg')];
  /* no catálogo, o fundo da página, os avisos (toast) e o botão "voltar ao início" ficam fora da #catPage:
     aplicamos a paleta também no body para que recebam as cores escolhidas */
  if(CATALOG)targets.push(document.body);
  targets.forEach(function(el){
    if(!el)return;
    Object.keys(pal).forEach(function(k){el.style.setProperty('--'+k,pal[k])});
    el.style.setProperty('--soft','color-mix(in srgb,'+pal.accent+' 11%,'+pal.surface+')');
    el.style.setProperty('--accent-text','color-mix(in srgb,'+pal.accent+(t==='dark'?' 58%,#fff)':' 82%,#000)'));
    el.style.setProperty('--shadow',t==='dark'?'none':'0 1px 2px rgba(18,20,29,.04),0 12px 28px -16px rgba(18,20,29,.18)');
    el.style.colorScheme=t;
  });
  var cp=document.getElementById('catPage');
  if(!cp)return;
  var r=th.radius==='sharp'?'sharp':'rounded'; /* só reto ou arredondado */cp.style.setProperty('--cat-radius',r==='sharp'?'4px':'14px');
  if(th.headFont){loadFont(th.headFont);cp.style.setProperty('--cat-head-font','"'+th.headFont+'",system-ui,sans-serif')}else cp.style.removeProperty('--cat-head-font');
  if(th.bodyFont){loadFont(th.bodyFont);cp.style.setProperty('--cat-body-font','"'+th.bodyFont+'",system-ui,sans-serif')}else cp.style.removeProperty('--cat-body-font');
  /* also apply fonts to drawer */
  var dr=document.getElementById('catDrawer');
  if(dr){
    if(th.bodyFont)dr.style.setProperty('--cat-body-font','"'+th.bodyFont+'",system-ui,sans-serif');else dr.style.removeProperty('--cat-body-font');
    if(th.headFont)dr.style.setProperty('--cat-head-font','"'+th.headFont+'",system-ui,sans-serif');else dr.style.removeProperty('--cat-head-font');
    dr.style.setProperty('--cat-radius',cp.style.getPropertyValue('--cat-radius'));
  }
}
/* admin UI */
function fontOpts(){return FONTS.map(function(f){return'<option value="'+f[0]+'"'+(f[0]?'style="font-family:\''+f[0]+'\',sans-serif"':'')+ '>'+f[1]+'</option>'}).join('')}
/* ===== seletor de fontes com prévia (cada opção escrita na própria fonte) ===== */
function fontCss(v){return(v?'"'+v+'",':'')+'system-ui,-apple-system,"Segoe UI",sans-serif'}
function syncFontPickers(){
  document.querySelectorAll('#v-catalog .fpick').forEach(function(w){
    var sel=w.querySelector('.fp-sel');if(!sel)return;
    var v=sel.value||'',row=FONTS.filter(function(f){return f[0]===v})[0],ff=fontCss(v);
    var t=w.querySelector('.fp-txt');if(t){t.textContent=row?row[1]:'Sistema (padrão)';t.style.fontFamily=ff}
    var pv=w.parentElement&&w.parentElement.querySelector('.fp-prev .fp-t');if(pv)pv.style.fontFamily=ff;
    w.querySelectorAll('.fp-o').forEach(function(o){o.setAttribute('aria-selected',o.dataset.v===v)});
  });
}
function buildFontPickers(){
  function closeAll(){
    document.querySelectorAll('#v-catalog .fp-pop:not([hidden])').forEach(function(p){
      p.hidden=true;
      var b=p.parentElement.querySelector('.fp-btn');if(b)b.setAttribute('aria-expanded','false');
      var c=p.closest('.card');if(c)c.classList.remove('ov');
    });
  }
  document.querySelectorAll('#v-catalog .fpick').forEach(function(w){
    var sel=w.querySelector('.fp-sel'),btn=w.querySelector('.fp-btn'),pop=w.querySelector('.fp-pop');
    if(!sel||!btn||!pop)return;
    pop.innerHTML=FONTS.map(function(f){
      return '<button type="button" class="fp-o" role="option" data-v="'+esc(f[0])+'" aria-selected="false" style="font-family:'+fontCss(f[0])+'">'+
        '<span>'+esc(f[1])+'</span><svg class="fp-c" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.6 4.6 4.6L19 7.2"/></svg></button>';
    }).join('');
    btn.addEventListener('click',function(e){
      e.preventDefault();e.stopPropagation();
      if(!pop.hidden){closeAll();return}
      closeAll();
      FONTS.forEach(function(f){if(f[0])loadFont(f[0])}); /* pré-carrega p/ a lista exibir cada fonte */
      var card=w.closest('.card');if(card)card.classList.add('ov');
      pop.hidden=false;btn.setAttribute('aria-expanded','true');
      syncFontPickers();
    });
    pop.addEventListener('click',function(e){
      var o=e.target.closest('.fp-o');if(!o)return;
      var mudou=sel.value!==o.dataset.v;
      sel.value=o.dataset.v;
      sel.dispatchEvent(new Event('change',{bubbles:true}));
      syncFontPickers();closeAll();
      if(mudou)toast('Fonte selecionada: '+o.querySelector('span').textContent);
    });
  });
  document.addEventListener('click',function(e){if(!e.target.closest('.fpick'))closeAll()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll()});
}
buildFontPickers();
/* ===== [SaaS] código hexadecimal ao lado dos seletores de cor do catálogo ===== */
/* Aceita #RRGGBB, RRGGBB, #RGB ou RGB (com ou sem espaços). Devolve '' se inválido. */
function hexNorm(v){
  v=String(v||'').replace(/\s+/g,'').replace(/^#/,'');
  if(/^[0-9a-f]{3}$/i.test(v))v=v.replace(/./g,'$&$&');
  return /^[0-9a-f]{6}$/i.test(v)?'#'+v.toUpperCase():'';
}
/* põe um campo de texto com o código logo depois de cada <input type="color"> */
function hexAttach(box){
  if(!box)return;
  box.querySelectorAll('input[type=color]').forEach(function(c){
    var h=c.nextElementSibling;
    if(!(h&&h.classList.contains('hexin'))){
      h=document.createElement('input');
      h.type='text';h.className='hexin';h.maxLength=9;h.spellcheck=false;
      h.setAttribute('autocomplete','off');h.setAttribute('autocapitalize','characters');
      h.setAttribute('aria-label',(c.getAttribute('aria-label')||'Cor')+' — código hexadecimal');
      h.placeholder='#RRGGBB';
      c.insertAdjacentElement('afterend',h);
    }
    hexSync(c);
  });
}
/* atualiza o código depois que a cor muda por fora (amostra, automático, etc.) */
function hexSync(c){
  var h=c&&c.nextElementSibling;
  if(h&&h.classList.contains('hexin')&&document.activeElement!==h){h.value=String(c.value||'').toUpperCase();h.classList.remove('bad')}
}
/* aplica o código digitado/colado na cor, disparando os mesmos eventos do seletor */
function hexApply(h,commit){
  var c=h.previousElementSibling;if(!c||c.type!=='color')return;
  var raw=h.value.replace(/\s+/g,'').replace(/^#/,''),v=hexNorm(h.value);
  if(!commit){ /* enquanto digita: só aplica quando o código está completo (6 dígitos) */
    h.classList.remove('bad');
    if(v&&raw.length===6&&v.toLowerCase()!==String(c.value).toLowerCase()){c.value=v.toLowerCase();c.dispatchEvent(new Event('input',{bubbles:true}))}
    return;
  }
  if(!v){
    if(raw)toast('Código de cor inválido. Use o formato #RRGGBB (ex.: #4F46E5).');
    h.value=String(c.value||'').toUpperCase();h.classList.remove('bad');return;
  }
  h.value=v;
  if(v.toLowerCase()!==String(c.value).toLowerCase()){c.value=v.toLowerCase();c.dispatchEvent(new Event('input',{bubbles:true}))}
  c.dispatchEvent(new Event('change',{bubbles:true}));
}
document.addEventListener('input',function(e){
  var t=e.target;if(!t||t.tagName!=='INPUT')return;
  if(t.classList.contains('hexin')){hexApply(t,false);var r=t.value.replace(/\s+/g,'').replace(/^#/,'');t.classList.toggle('bad',r.length>=6&&!hexNorm(t.value))}
  else if(t.type==='color')hexSync(t);
});
document.addEventListener('change',function(e){var t=e.target;if(t&&t.classList&&t.classList.contains('hexin'))hexApply(t,true)});
document.addEventListener('keydown',function(e){var t=e.target;if(e.key==='Enter'&&t&&t.classList&&t.classList.contains('hexin')){e.preventDefault();t.blur()}});
(function(){
  var st=document.createElement('style');
  st.textContent=
    '.hexin{width:86px;flex:none;min-height:38px;padding:6px 8px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--ink);'+
    'font:600 .8rem/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-transform:uppercase;letter-spacing:.02em}'+
    '.hexin::placeholder{color:var(--muted);font-weight:500}'+
    '.hexin:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}'+
    '.hexin.bad{border-color:#dc2626;outline-color:#dc2626}'+
    '.sw .hexin{min-height:44px;width:96px}'+
    '.thm-f .hexin{order:1}.thm-f .thm-rst{order:2}';
  document.head.appendChild(st);
})();
/* ===== painel de cores: cada detalhe do catálogo, por área e por modo ===== */
var CAT_COL_SECS=(function(){try{return JSON.parse(localStorage.getItem('cat_col_secs')||'{}')||{}}catch(e){return{}}})();
function catColSave(){try{localStorage.setItem('cat_col_secs',JSON.stringify(CAT_COL_SECS))}catch(e){}}
function isCustom(v){return !(v==null||v===''||v==='auto')}
/* opções (3º/4º item) de um campo da personalização, achadas pela chave */
function fieldDef(k){for(var i=0;i<SECTS.length;i++){var s=SECTS[i].s;for(var j=0;j<s.length;j++){if(s[j][0]===k)return s[j]}}return null}
function fieldOpts(k){var d=fieldDef(k);return(d&&d[3])||{}}
function rangeLabel(inp){var op=fieldOpts(inp.dataset.k),n=parseFloat(inp.value);return(op.unit==='%'?Math.round(n)+'%':f2(n)+(op.unit?' '+op.unit:''))}
var ALIGNS=[['left','À esquerda'],['center','Ao centro'],['right','À direita']];
var ALIGN_ICON={left:'M4 6h16M4 11h9M4 16h13',center:'M4 6h16M7.5 11h9M5.5 16h13',right:'M4 6h16M11 11h9M7 16h13'};
function themeFieldHtml(mode,g,s,res,own){
  var k=s[0],lab=s[1],ty=s[2]||'color',op=s[3]||{},ar=esc(g.n+': '+lab),v=own[k];
  var rst='<button type="button" class="thm-rst" data-mode="'+mode+'" data-k="'+k+'" title="Voltar ao automático" aria-label="'+esc(lab)+': voltar ao automático">&#8635;</button>';
  if(ty==='range'){
    var cur=tuneNum(v,op.def,op.min,op.max);
    var out=op.unit==='%'?Math.round(cur)+'%':f2(cur)+(op.unit?' '+op.unit:'');
    return '<div class="thm-f wide"><span class="thm-fl">'+esc(lab)+'</span>'+
      '<input type="range" class="thm-rg" data-mode="'+mode+'" data-k="'+k+'" min="'+op.min+'" max="'+op.max+'" step="'+op.step+'" value="'+cur+'" aria-label="'+ar+'">'+
      '<output class="thm-val">'+out+'</output>'+rst+'</div>';
  }
  if(ty==='align'){
    var al=heroAlign(v);
    return '<div class="thm-f wide"><span class="thm-fl">'+esc(lab)+'</span><div class="thm-seg">'+
      ALIGNS.map(function(a){return '<button type="button" class="thm-a" data-mode="'+mode+'" data-k="'+k+'" data-v="'+a[0]+'" aria-pressed="'+(al===a[0]?'true':'false')+'" title="'+a[1]+'" aria-label="'+ar+' — '+a[1]+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+ALIGN_ICON[a[0]]+'"/></svg></button>'}).join('')+
      '</div>'+rst+'</div>';
  }
  return '<div class="thm-f"><input type="color" data-mode="'+mode+'" data-k="'+k+'" value="'+res[k]+'" aria-label="'+ar+'">'+
    '<span class="thm-fl">'+esc(lab)+'</span>'+rst+'</div>';
}
function themeGroupsHtml(){
  return ['light','dark'].map(function(mode){
    var res=catVars(mode); /* valores já resolvidos, para os campos abrirem na cor que está valendo */
    var own=(thm().secs||{})[mode]||{};
    var groups=SECTS.map(function(g){
      var kkey=mode+':'+g.k;
      var on=CAT_COL_SECS[kkey]!==undefined?CAT_COL_SECS[kkey]:(g.k==='base'); /* padrão: só "Base" aberta */
      var fields=g.s.map(function(s){return themeFieldHtml(mode,g,s,res,own)}).join('');
      return '<section class="thm-grp'+(on?' on':'')+'" data-sec="'+g.k+'">'+
        '<div class="thm-gh"><button type="button" class="thm-tgl" aria-expanded="'+(on?'true':'false')+'"><span class="lbl">'+esc(g.n)+'</span>'+
        '<svg class="thm-tg" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>'+
        '<button type="button" class="thm-auto" data-mode="'+mode+'" data-sec="'+g.k+'" title="Deixar toda esta área no automático">Automático</button></div>'+
        '<div class="thm-body"><div class="thm-grid">'+fields+'</div></div></section>';
    }).join('');
    return '<div class="thm-mode" id="ct'+(mode==='light'?'Light':'Dark')+'" data-mode="'+mode+'">'+
      '<span class="thm-mode-h">'+(mode==='light'?'Modo claro':'Modo escuro')+'</span>'+
      '<div class="thm-all"><button type="button" class="btn sm" data-all="1" data-mode="'+mode+'">Expandir tudo</button>'+
      '<button type="button" class="btn sm" data-all="0" data-mode="'+mode+'">Recolher tudo</button></div>'+groups+'</div>';
  }).join('');
}
function drawThemeCfg(){
  var th=thm();
  if($('ctGroups')){$('ctGroups').innerHTML=themeGroupsHtml();hexAttach($('ctGroups'))}
  $('ct-hf').innerHTML=fontOpts();$('ct-hf').value=th.headFont||'';
  $('ct-bf').innerHTML=fontOpts();$('ct-bf').value=th.bodyFont||'';
  document.querySelectorAll('#ctRadius button').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.r===(th.radius==='sharp'?'sharp':'rounded'))});
  syncThemeGroups();
  // preload selected fonts
  if(th.headFont)loadFont(th.headFont);
  if(th.bodyFont)loadFont(th.bodyFont);
  syncFontPickers();
}
/* marca em cada campo/área o que está personalizado e mostra o valor que está valendo */
function syncThemeGroups(){
  var box=$('ctGroups');if(!box)return;
  var sm=thm().secs||{};
  ['light','dark'].forEach(function(mode){
    var res=catVars(mode),own=sm[mode]||{},mEl=box.querySelector('#ct'+(mode==='light'?'Light':'Dark'));
    if(!mEl)return;
    mEl.querySelectorAll('.thm-f').forEach(function(f){
      var el=f.querySelector('[data-k]');if(!el)return;
      var k=el.dataset.k,v=own[k];
      if(el.type==='color'&&res[k]){el.value=res[k];hexSync(el)}
      else if(el.type==='range'){ /* tamanho / opacidade: volta ao valor guardado (ou ao padrão) */
        var op=fieldOpts(k);
        el.value=tuneNum(v,op.def,op.min,op.max);
        var out=f.querySelector('.thm-val');if(out)out.textContent=rangeLabel(el);
      }
      f.classList.toggle('own',isCustom(v));
      if(f.querySelector('.thm-seg')){ /* alinhamento: marca o botão ativo */
        var al=heroAlign(v);
        f.querySelectorAll('.thm-a').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.v===al?'true':'false')});
      }
    });
    mEl.querySelectorAll('.thm-grp').forEach(function(g){
      var sec=SECTS.filter(function(x){return x.k===g.dataset.sec})[0]||{s:[]};
      g.classList.toggle('own',sec.s.some(function(s){return isCustom(own[s[0]])}));
    });
  });
}
$('ctGroups').addEventListener('input',function(e){
  var inp=e.target;if(!inp||inp.tagName!=='INPUT')return;
  if(inp.type!=='color'&&inp.type!=='range')return;
  var mode=inp.dataset.mode,k=inp.dataset.k;if(!mode||!k)return;
  ensureTheme();
  CAT.theme.secs[mode]=CAT.theme.secs[mode]||{};
  CAT.theme.secs[mode][k]=inp.type==='range'?Number(inp.value):inp.value;
  var f=inp.closest('.thm-f');
  if(f){ /* feedback imediato, sem redesenhar o painel enquanto arrasta */
    var g=f.closest('.thm-grp');f.classList.add('own');if(g)g.classList.add('own');
    if(inp.type==='range'){var out=f.querySelector('.thm-val');if(out)out.textContent=rangeLabel(inp)}
  }
  saveCat(false,mode);applyCatTheme();
});
$('ctGroups').addEventListener('change',function(e){
  var inp=e.target.closest('input');if(!inp)return;
  if(inp.type==='color')toast('Cor atualizada.');
  else if(inp.type==='range')toast(rangeLabel(inp)+' aplicado.');
});
$('ctGroups').addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  var mode=b.dataset.mode;
  if(b.classList.contains('thm-rst')){ /* um detalhe volta ao automático */
    ensureTheme();if(CAT.theme.secs[mode])delete CAT.theme.secs[mode][b.dataset.k];
    saveCat(false,mode);applyCatTheme();syncThemeGroups();toast('Detalhe de volta ao automático.');
    return;
  }
  if(b.classList.contains('thm-a')){ /* alinhamento: escolhe ou volta ao automático tocando de novo */
    ensureTheme();CAT.theme.secs[mode]=CAT.theme.secs[mode]||{};
    var ak=b.dataset.k,ja=CAT.theme.secs[mode][ak]===b.dataset.v;
    if(ja)delete CAT.theme.secs[mode][ak];else CAT.theme.secs[mode][ak]=b.dataset.v;
    saveCat(false,mode);applyCatTheme();syncThemeGroups();
    toast(ja?'Alinhamento de volta ao automático.':'Alinhamento atualizado.');
    return;
  }
  if(b.classList.contains('thm-auto')){ /* a área inteira volta ao automático */
    ensureTheme();CAT.theme.secs[mode]=CAT.theme.secs[mode]||{};
    (SECTS.filter(function(g){return g.k===b.dataset.sec})[0]||{s:[]}).s.forEach(function(x){delete CAT.theme.secs[mode][x[0]]});
    saveCat(false,mode);applyCatTheme();syncThemeGroups();toast('Área restaurada para Automático.');
    return;
  }
  if(b.dataset.all!=null){ /* abrir/recolher todas as áreas de um modo */
    var want=b.dataset.all==='1',mEl=$('ctGroups').querySelector('#ct'+(mode==='light'?'Light':'Dark'));
    mEl.querySelectorAll('.thm-grp').forEach(function(g){
      g.classList.toggle('on',want);
      var t=g.querySelector('.thm-tgl');if(t)t.setAttribute('aria-expanded',want?'true':'false');
      CAT_COL_SECS[mode+':'+g.dataset.sec]=want;
    });
    catColSave();return;
  }
  if(b.classList.contains('thm-tgl')){ /* abre/fecha a área */
    var grp=b.closest('.thm-grp'),on=!grp.classList.contains('on');
    grp.classList.toggle('on',on);b.setAttribute('aria-expanded',on?'true':'false');
    CAT_COL_SECS[mode+':'+grp.dataset.sec]=on;catColSave();
  }
});
$('ct-hf').onchange=function(){ensureTheme();CAT.theme.headFont=this.value;loadFont(this.value);saveCat(false,'');applyCatTheme()};
$('ct-bf').onchange=function(){ensureTheme();CAT.theme.bodyFont=this.value;loadFont(this.value);saveCat(false,'');applyCatTheme()};
$('ctRadius').onclick=function(e){var b=e.target.closest('button');if(!b)return;ensureTheme();CAT.theme.radius=b.dataset.r;
  document.querySelectorAll('#ctRadius button').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.r===b.dataset.r)});saveCat(false,'');applyCatTheme()};
$('ctReset').onclick=function(){CAT.theme=null;saveCat();drawThemeCfg();applyCatTheme();toast('Aparência restaurada ao padrão.')};
(function(){
  const btt=$('btt');if(!btt)return;
  btt.onclick=function(){scrollTo({top:0,behavior:'smooth'})};
  let ticking=false;
  window.addEventListener('scroll',function(){
    if(ticking)return;ticking=true;
    requestAnimationFrame(function(){btt.classList.toggle('on',scrollY>400);ticking=false});
  },{passive:true});
})();
/* hook theme into catalog rendering and theme toggle */
if(CATALOG)drawCatalogPage();
/* catálogo aberto (aba, janela ou prévia): recarrega sozinho quando a aparência é salva no estoque */
if(CATALOG){
  var aplicarRev=function(mode){
    idb().then(function(){return catDraftFromPanel()||kvGet('catalog')}).then(function(c){
      if(!c||typeof c!=='object')return;
      if(JSON.stringify(c)===JSON.stringify(CAT)&&!mode)return; /* nada mudou */
      CAT=Object.assign({},CAT_DEF,c);
      drawCatalogPage(); /* redesenha com o tema novo */
      if(CATPREV&&mode){applyCatTheme(mode);toast('Vendo o modo '+(mode==='dark'?'escuro':'claro')+'.')} /* prévia segue o modo que você edita */
    }).catch(function(){});
  };
  if(CAT_BC)CAT_BC.onmessage=function(ev){var d=ev&&ev.data;aplicarRev(d&&d.mode||'')};
  window.addEventListener('storage',function(e){
    if(e.key!=='cat_rev')return;
    var m='';try{m=(JSON.parse(e.newValue)||{}).mode||''}catch(err){}
    aplicarRev(m);
  });
  window.addEventListener('focus',function(){aplicarRev('')});
}