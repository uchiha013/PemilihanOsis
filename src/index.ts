import {Hono} from 'hono'; import {secureHeaders} from 'hono/secure-headers'; import type {AppEnv} from './types'; import {publicRoutes} from './routes/public'; import {adminRoutes} from './routes/admin';
const app=new Hono<AppEnv>();
app.use('*',secureHeaders({contentSecurityPolicy:{defaultSrc:["'self'"],scriptSrc:["'self'","'unsafe-inline'",'https://unpkg.com'],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','https:'],connectSrc:["'self'"],mediaSrc:["'self'",'blob:']},referrerPolicy:'no-referrer',xFrameOptions:'DENY'}));
app.onError((err,c)=>{console.error(JSON.stringify({event:'request_error',message:err.message,path:c.req.path}));return c.json({ok:false,error:'Terjadi gangguan server. Silakan coba kembali.'},500)});
app.route('/admin',adminRoutes);app.route('/',publicRoutes);app.notFound(c=>c.html('<h1>Halaman tidak ditemukan</h1>',404));
export default app;
