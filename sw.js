// Copyright © 2026 noelgato-dll. All rights reserved.
const CACHE='diecast-archive-shell-v0405-stable';
const FILES=['./index.html','./style.css','./activation.js','./script.enc.json','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  // Cache all essential assets atomically. Do not activate an incomplete build.
  event.waitUntil((async () => {
    const cache=await caches.open(CACHE);
    try {
      for (const path of FILES) {
        const url=new URL(path,self.registration.scope).href;
        const response=await fetch(new Request(url,{cache:'reload'}));
        if (!response.ok || response.type==='opaque') throw Error('Cannot cache '+path);
        await cache.put(url,response);
      }
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // Keep older completed caches as fallback during PWA updates.
    const keys=await caches.keys();
    const old=keys.filter(k=>k.startsWith('diecast-archive-shell-')&&k!==CACHE);
    for(const k of old.slice(0,-2)) await caches.delete(k);
  })());
});
self.addEventListener('fetch', event => {
  const req=event.request;
  if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
  if(!new URL(req.url).pathname.startsWith(new URL(self.registration.scope).pathname))return;
  event.respondWith((async () => {
    const cache=await caches.open(CACHE);
    const url=new URL(req.url);
    // Immutable release assets must be served as a coherent version from
    // cache, even when iOS is offline or the PWA starts after a restart.
    if (/\/(?:activation\.js|script\.enc\.json|style\.css)$/.test(url.pathname)) {
      const hit=await cache.match(req,{ignoreSearch:true});
      if(hit)return hit;
    }
    try {
      const response=await fetch(req);
      if(response.ok)await cache.put(req,response.clone());
      return response;
    } catch (_) {
      const hit=await cache.match(req,{ignoreSearch:true}) ||
        await caches.match(req,{ignoreSearch:true});
      if(hit)return hit;
      if(req.mode==='navigate') {
        return await cache.match(new URL('./index.html',self.registration.scope).href) ||
          await caches.match(new URL('./index.html',self.registration.scope).href) ||
          Response.error();
      }
      return Response.error();
    }
  })());
});
