const CACHE='shattered-warden-stage2-v3';
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    const html=await fetch('/Moonlight-playground/games/boss-model-comparison/play/sol-stage2/index.html',{cache:'reload'});
    if(!html.ok)throw new Error('shell unavailable');
    const text=await html.clone().text();
    const assets=[...text.matchAll(/(?:src|href)="(\/Moonlight-playground\/games\/boss-model-comparison\/play\/sol-stage2\/assets\/[^\"]+)"/g)].map(match=>match[1]);
    await cache.put('/Moonlight-playground/games/boss-model-comparison/play/sol-stage2/index.html',html);
    await cache.addAll(['/Moonlight-playground/games/boss-model-comparison/play/sol-stage2/', '/Moonlight-playground/games/boss-model-comparison/play/sol-stage2/manifest.webmanifest','/Moonlight-playground/games/boss-model-comparison/play/sol-stage2/icon.svg',...assets]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key.startsWith('shattered-warden-stage2-')&&key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(req);
    if(cached)return cached;
    try{const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response}
    catch{if(req.mode==='navigate')return await cache.match('/Moonlight-playground/games/boss-model-comparison/play/sol-stage2/index.html')||Response.error();return Response.error()}
  })());
});
