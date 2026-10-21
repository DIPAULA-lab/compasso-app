// Sem cache de páginas, sessões ou dados pessoais. Atualizações vêm da rede.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()||{}}catch{}
  const title=typeof data.title==='string'?data.title:'Compasso';
  let url='/#hoje';
  try{const target=new URL(data.url,self.location.origin);if(target.origin===self.location.origin)url=target.href}catch{}
  event.waitUntil(self.registration.showNotification(title,{
    body:typeof data.body==='string'?data.body:'Você tem um lembrete no Compasso.',
    icon:'/icon-192.png',badge:'/favicon-32.png',tag:data.tag||'compasso',
    data:{url},
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification.data?.url||'/#hoje';
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows)if(new URL(client.url).origin===self.location.origin) {
      await client.navigate(url);return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});
