export type Bindings={DB:D1Database; ENVIRONMENT:string; SESSION_SECRET:string; TURNSTILE_SITE_KEY?:string; TURNSTILE_SECRET_KEY?:string};
export type Variables={adminId:number;csrfToken:string};
export type AppEnv={Bindings:Bindings;Variables:Variables};
