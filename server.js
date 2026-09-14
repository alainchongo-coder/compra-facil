const express=require('express');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const helmet=require('helmet');
const morgan=require('morgan');
const cookieSession=require('cookie-session');
const bcrypt=require('bcryptjs');

const app=express();
const PORT=Number(process.env.PORT||3000);
const DATA=path.join(__dirname,'data');
const PRODUCTS=path.join(DATA,'products.json');
const ORDERS=path.join(DATA,'orders.json');
const ADMIN_EMAIL=process.env.ADMIN_EMAIL||'';
const ADMIN_PASSWORD_HASH=process.env.ADMIN_PASSWORD_HASH||'';
const ALLOWED_COUNTRIES=new Set(['Panamá','Cuba']);
const ALLOWED_PAYMENTS=new Set(['Transferencia','Tarjeta (configurar proveedor)','Pago disponible para Cuba']);

fs.mkdirSync(DATA,{recursive:true});
if(!fs.existsSync(PRODUCTS))fs.writeFileSync(PRODUCTS,'[]');
if(!fs.existsSync(ORDERS))fs.writeFileSync(ORDERS,'[]');
function read(file){return JSON.parse(fs.readFileSync(file,'utf8'))}
function writeAtomic(file,data){const tmp=file+'.tmp-'+process.pid+'-'+Date.now();fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file)}
function cleanText(v,max=300){return String(v??'').trim().slice(0,max)}
function orderId(){return 'CF-'+crypto.randomBytes(4).toString('hex').toUpperCase()}

app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(morgan('tiny'));
app.use(express.json({limit:'100kb'}));
app.use(cookieSession({name:'cf_session',keys:[process.env.SESSION_SECRET||'CHANGE-ME'],httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*24*60*60*1000}));

// Small in-process limiter for the public order endpoint and admin login.
const buckets=new Map();
function rateLimit(key,limit,windowMs){const now=Date.now();const b=buckets.get(key);if(!b||now-b.start>windowMs){buckets.set(key,{start:now,count:1});return true}b.count++;return b.count<=limit}
function admin(req,res,next){if(req.session?.admin===true)return next();res.status(401).json({error:'No autorizado'})}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Compra Fácil',version:'1.0.0'}));
app.get('/api/products',(req,res)=>res.json(read(PRODUCTS).filter(p=>p.active!==false)));
app.get('/api/categories',(req,res)=>res.json([...new Set(read(PRODUCTS).filter(p=>p.active!==false).map(p=>p.category))]));

app.post('/api/orders',(req,res)=>{
  if(!rateLimit('order:'+req.ip,30,15*60*1000))return res.status(429).json({error:'Demasiados intentos. Espera unos minutos.'});
  const body=req.body||{}; const c=body.customer||{}; const country=cleanText(body.country,30); const paymentMethod=cleanText(body.paymentMethod,80);
  const customer={name:cleanText(c.name,100),phone:cleanText(c.phone,40),address:cleanText(c.address,300)};
  if(!customer.name||!customer.phone||!customer.address||!ALLOWED_COUNTRIES.has(country)||!ALLOWED_PAYMENTS.has(paymentMethod)||!Array.isArray(body.items)||!body.items.length)return res.status(400).json({error:'Completa todos los datos del pedido.'});
  const products=read(PRODUCTS); const clean=[]; let total=0;
  for(const item of body.items){const p=products.find(x=>x.id===item.id&&x.active!==false);const q=Math.max(1,Math.min(99,Math.floor(Number(item.quantity)||0)));if(!p||q<1)return res.status(400).json({error:'Producto no válido.'});if(p.stock<q)return res.status(409).json({error:`Sin disponibilidad: ${p.name}`});clean.push({id:p.id,name:p.name,price:Number(p.price),quantity:q});total+=Number(p.price)*q}
  for(const x of clean){const p=products.find(p=>p.id===x.id);p.stock-=x.quantity}
  const order={id:orderId(),createdAt:new Date().toISOString(),status:'confirmed',country,paymentMethod,customer,items:clean,total:Number(total.toFixed(2))};
  const orders=read(ORDERS);orders.unshift(order);writeAtomic(PRODUCTS,products);writeAtomic(ORDERS,orders);
  res.status(201).json({orderId:order.id,status:order.status,total:order.total});
});

app.get('/api/orders/:id',(req,res)=>{
  const phone=cleanText(req.query.phone,40);const o=read(ORDERS).find(x=>x.id===req.params.id&&x.customer.phone===phone);if(!o)return res.status(404).json({error:'Pedido no encontrado'});
  res.json({id:o.id,createdAt:o.createdAt,status:o.status,country:o.country,items:o.items,total:o.total});
});

app.post('/api/admin/login',(req,res)=>{
  if(!rateLimit('login:'+req.ip,10,15*60*1000))return res.status(429).json({error:'Demasiados intentos. Espera unos minutos.'});
  const email=cleanText(req.body?.email,160).toLowerCase();const password=String(req.body?.password||'');
  if(!ADMIN_EMAIL||!ADMIN_PASSWORD_HASH||email!==ADMIN_EMAIL.toLowerCase()||!bcrypt.compareSync(password,ADMIN_PASSWORD_HASH))return res.status(401).json({error:'Credenciales inválidas'});
  req.session.admin=true;res.json({ok:true});
});
app.post('/api/admin/logout',admin,(req,res)=>{req.session=null;res.json({ok:true})});
app.get('/api/admin/products',admin,(req,res)=>res.json(read(PRODUCTS)));
app.get('/api/admin/orders',admin,(req,res)=>res.json(read(ORDERS)));
app.post('/api/admin/products',admin,(req,res)=>{const b=req.body||{};const name=cleanText(b.name,160);const price=Number(b.price);const stock=Math.max(0,Math.floor(Number(b.stock)||0));if(!name||!Number.isFinite(price)||price<0)return res.status(400).json({error:'Nombre y precio válidos son obligatorios'});const products=read(PRODUCTS);const p={id:'p_'+crypto.randomBytes(5).toString('hex'),name,price:Number(price.toFixed(2)),category:cleanText(b.category||'Otros',80),icon:cleanText(b.icon||'📦',8),stock,active:true};products.push(p);writeAtomic(PRODUCTS,products);res.status(201).json(p)});
app.patch('/api/admin/products/:id',admin,(req,res)=>{const products=read(PRODUCTS);const p=products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Producto no encontrado'});const b=req.body||{};if(b.name!==undefined)p.name=cleanText(b.name,160);if(b.category!==undefined)p.category=cleanText(b.category,80);if(b.icon!==undefined)p.icon=cleanText(b.icon,8);if(b.price!==undefined&&Number.isFinite(Number(b.price))&&Number(b.price)>=0)p.price=Number(Number(b.price).toFixed(2));if(b.stock!==undefined)p.stock=Math.max(0,Math.floor(Number(b.stock)||0));if(b.active!==undefined)p.active=!!b.active;writeAtomic(PRODUCTS,products);res.json(p)});
app.patch('/api/admin/orders/:id',admin,(req,res)=>{const allowed=new Set(['confirmed','processing','shipped','delivered','cancelled']);const status=cleanText(req.body?.status,30);if(!allowed.has(status))return res.status(400).json({error:'Estado no válido'});const orders=read(ORDERS);const o=orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});o.status=status;writeAtomic(ORDERS,orders);res.json(o)});

app.use(express.static(path.join(__dirname,'public'),{extensions:['html'],maxAge:'1h'}));
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT,()=>console.log(`Compra Fácil v1.0.0 — http://localhost:${PORT}`));
