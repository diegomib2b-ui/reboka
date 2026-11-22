import worker, { valorDo, assinaturaValida } from '../../.wrangler-teste/index.js';
import { createHmac } from 'node:crypto';
const CL='11111111-2222-3333-4444-555555555555';
const env={ASSETS:{fetch:async()=>new Response('site')},SUPABASE_URL:'https://sb.test',SUPABASE_PUBLISHABLE_KEY:'pub',SUPABASE_SECRET_KEY:'sec',MP_ACCESS_TOKEN:'TEST-abc',MP_WEBHOOK_SECRET:'segredo'};
let estado={papel:'dono',loja:{nome:'C',assinatura:'teste',mp_assinatura_id:null},mpStatus:'authorized',patches:[],eventos:[],mpPosts:[],mapa:[],ref:`${CL}|equipe|anual`,prox:new Date(Date.now()+20*864e5).toISOString()};
globalThis.fetch=async(u,init={})=>{u=String(u);const m=init.method??'GET';
  if(u.endsWith('/auth/v1/user')) return init.headers.authorization==='Bearer ok'?Response.json({id:'u1',email:'dona@x.com'}):new Response('',{status:401});
  if(u.includes('/rest/v1/reboka_membros')) return Response.json([{loja_id:CL,papel:estado.papel,reboka_lojas:estado.loja}]);
  if(u.includes('/rest/v1/reboka_cobranca_eventos')){estado.eventos.push(JSON.parse(init.body));return Response.json([{}],{status:201});}
  if(u.includes('/rest/v1/reboka_lojas')&&m==='GET') return Response.json([{mp_assinatura_id:estado.loja.mp_assinatura_id,assinatura:estado.loja.assinatura}]);
  if(u.includes('/rest/v1/reboka_lojas')&&m==='PATCH'){const b=JSON.parse(init.body);estado.patches.push(b);Object.assign(estado.loja,b);return Response.json([b]);}
  if(u==='https://api.mercadopago.com/preapproval'&&m==='POST'){estado.mpPosts.push(JSON.parse(init.body));return Response.json({id:'pa1',init_point:'https://mp/checkout/pa1'});}
  if(u.startsWith('https://api.mercadopago.com/preapproval/')&&m==='PUT'){estado.mpStatus=JSON.parse(init.body).status;return Response.json({});}
  if(u.startsWith('https://api.mercadopago.com/preapproval/')) return Response.json({id:u.split('/').pop(),status:estado.mpStatus,external_reference:estado.ref,next_payment_date:estado.prox});
  if(u.startsWith('https://api.mercadopago.com/authorized_payments/')) return Response.json({preapproval_id:'pa1'});
  if(u.startsWith('https://maps.googleapis.com/maps/api/geocode/json')){estado.mapa.push(u);return Response.json({status:'OK',results:[{formatted_address:'R. Francisco Derosso, 1200 - Xaxim, Curitiba - PR, Brasil',geometry:{location:{lat:-25.5,lng:-49.25}}}]});}
  if(u==='https://routes.googleapis.com/directions/v2:computeRoutes'){const b=JSON.parse(init.body);estado.rota=b;estado.mascara=init.headers['x-goog-fieldmask'];return Response.json({routes:[{legs:[{distanceMeters:4230,duration:'610s'},{distanceMeters:9870,duration:'1250s'},{distanceMeters:7110,duration:'840s'}]}]});}
  if(u.startsWith('https://api.openrouteservice.org/geocode/search')) return Response.json({features:[{properties:{label:'Rua X, Curitiba, Brazil'},geometry:{coordinates:[-49.27,-25.43]}}]});
  if(u==='https://api.openrouteservice.org/v2/directions/driving-car') return Response.json({routes:[{segments:[{distance:5000,duration:600},{distance:12345,duration:1500}]}]});
  throw new Error('fetch inesperado '+m+' '+u);};
const req=(p,{body,token='ok',headers={},method='POST'}={})=>new Request('https://reboka.test'+p,{method,headers:{authorization:'Bearer '+token,...headers},body:body?JSON.stringify(body):undefined});
const ok=(c,m)=>console.log(c?'ok  ':'FALHA',m);
ok(valorDo('essencial','mensal')===97&&valorDo('essencial','anual')===931.2&&valorDo('equipe','anual')===1891.2,'valores');
let r=await worker.fetch(req('/sobre',{method:'GET'}),env); ok(await r.text()==='site','fora de /api serve o site');
r=await worker.fetch(req('/api/saude',{method:'GET'}),env); ok((await r.json()).modoTeste===true,'saude');
r=await worker.fetch(req('/api/assinar',{body:{plano:'equipe',ciclo:'anual'}}),{...env,MP_ACCESS_TOKEN:undefined}); ok(r.status===503,'sem segredo: 503');
r=await worker.fetch(req('/api/assinar',{body:{plano:'equipe',ciclo:'anual'},token:'ruim'}),env); ok(r.status===401,'sem login: 401');
estado.papel='recepcao'; r=await worker.fetch(req('/api/assinar',{body:{plano:'equipe',ciclo:'anual'}}),env); ok(r.status===403,'recepção não assina'); estado.papel='dono';
r=await worker.fetch(req('/api/assinar',{body:{plano:'ouro',ciclo:'anual'}}),env); ok(r.status===400,'plano inválido');
r=await worker.fetch(req('/api/assinar',{body:{plano:'equipe',ciclo:'anual',email:'Pagadora@MP.com '}}),env); const j=await r.json();
const p=estado.mpPosts[0];  ok(estado.loja.mp_assinatura_id==='pa1'&&j.url==='https://mp/checkout/pa1'&&p.payer_email==='pagadora@mp.com'&&p.auto_recurring.frequency===12&&p.auto_recurring.transaction_amount===1891.2&&p.external_reference===estado.ref&&p.status==='pending'&&p.back_url==='https://reboka.test/app/','assinar cria preapproval certo');
// webhook
const assina=(id,rid,ts='1700000000')=>({ 'x-request-id':rid,'x-signature':`ts=${ts},v1=`+createHmac('sha256','segredo').update(`id:${id};request-id:${rid};ts:${ts};`).digest('hex')});
r=await worker.fetch(req('/api/mp-webhook?data.id=pa1&type=subscription_preapproval',{body:{type:'subscription_preapproval',data:{id:'pa1'}},headers:{'x-request-id':'r','x-signature':'ts=1,v1=00'}}),env); ok(r.status===401,'aviso com assinatura falsa: 401');
r=await worker.fetch(req('/api/mp-webhook?data.id=pa1&type=subscription_preapproval',{body:{type:'subscription_preapproval',data:{id:'pa1'}},headers:assina('pa1','r1')}),env);
ok(r.status===200&&estado.loja.assinatura==='ativa'&&estado.loja.plano==='equipe'&&estado.loja.periodicidade==='anual'&&estado.loja.mp_assinatura_id==='pa1','aviso ativa a empresa no plano certo');
r=await worker.fetch(req('/api/assinar',{body:{plano:'essencial',ciclo:'mensal'}}),env); ok(r.status===400,'já ativa: não assina de novo');
r=await worker.fetch(req('/api/mp-webhook?data.id=77&type=subscription_authorized_payment',{body:{type:'subscription_authorized_payment',data:{id:'77'}},headers:assina('77','r2')}),env); ok(r.status===200&&(await r.json()).situacao==='ativa','aviso de pagamento ressincroniza');
// aviso atrasado de assinatura antiga cancelada não derruba a atual
estado.mpStatus='cancelled'; r=await worker.fetch(req('/api/mp-webhook?data.id=velha&type=subscription_preapproval',{body:{type:'subscription_preapproval',data:{id:'velha'}},headers:assina('velha','r3')}),env); ok(estado.loja.assinatura==='ativa','assinatura antiga cancelada é ignorada'); estado.mpStatus='authorized';
// outra empresa via sincronizar
estado.ref='99999999-2222-3333-4444-555555555555|equipe|anual'; r=await worker.fetch(req('/api/sincronizar?id=pa9'),env); ok((await r.json()).ignorado==='assinatura de outra empresa','não sincroniza assinatura de outra empresa'); estado.ref=`${CL}|equipe|anual`;
r=await worker.fetch(req('/api/cancelar'),env); ok(r.status===200&&estado.loja.assinatura==='cancelada'&&estado.loja.acesso_ate===estado.prox,'cancelar mantém acesso até o fim do período');
ok(estado.eventos.length>=4,'eventos registrados: '+estado.eventos.length);

// mapa
r=await worker.fetch(req('/api/mapa/endereco?q=derosso 1200',{method:'GET'}),env); ok(r.status===503&&(await r.json()).semMapa===true,'mapa sem chave: 503 (tela volta ao km digitado)');
const envG={...env,GOOGLE_MAPS_KEY:'g-key'};
r=await worker.fetch(req('/api/mapa/endereco?q=derosso 1200',{method:'GET',token:'ruim'}),envG); ok(r.status===401,'mapa sem login: 401');
r=await worker.fetch(req('/api/mapa/endereco?q=derosso 1200&lat=-25.47&lng=-49.29',{method:'GET'}),envG); let jm=await r.json();
ok(r.status===200&&jm.enderecos[0].texto==='R. Francisco Derosso, 1200 - Xaxim, Curitiba - PR'&&estado.mapa[0].includes('components=country%3ABR')&&estado.mapa[0].includes('bounds='),'google: busca endereço no Brasil, perto da base');
r=await worker.fetch(req('/api/mapa/rota',{body:{pontos:[{lat:-25.47,lng:-49.29},{lat:-25.5,lng:-49.25},{lat:-25.45,lng:-49.3},{lat:-25.47,lng:-49.29}]}}),envG); jm=await r.json();
ok(jm.trechos.length===3&&jm.trechos[0].km===4.2&&jm.trechos[1].min===21&&estado.rota.intermediates.length===2&&estado.rota.routingPreference==='TRAFFIC_UNAWARE'&&estado.mascara==='routes.legs.distanceMeters,routes.legs.duration','google: rota de 3 trechos, só distância e tempo');
r=await worker.fetch(req('/api/mapa/rota',{body:{pontos:[{lat:-25.47,lng:-49.29}]}}),envG); ok(r.status===400,'rota com 1 ponto: 400');
r=await worker.fetch(req('/api/mapa/rota',{body:{pontos:[{lat:'x',lng:1},{lat:1,lng:1}]}}),envG); ok(r.status===400,'rota com ponto inválido: 400');
const envO={...env,ORS_KEY:'o-key'};
r=await worker.fetch(req('/api/mapa/rota',{body:{pontos:[{lat:-25.47,lng:-49.29},{lat:-25.5,lng:-49.25},{lat:-25.45,lng:-49.3}]}}),envO); jm=await r.json(); ok(jm.trechos[1].km===12.3&&jm.trechos[0].min===10,'openrouteservice: rota');
r=await worker.fetch(req('/api/mapa/endereco?q=rua x curitiba',{method:'GET'}),envO); jm=await r.json(); ok(jm.enderecos[0].texto==='Rua X, Curitiba'&&jm.enderecos[0].lat===-25.43,'openrouteservice: endereço');
r=await worker.fetch(req('/api/saude',{method:'GET'}),envG); ok((await r.json()).mapa==='google','saude mostra o mapa ligado');
