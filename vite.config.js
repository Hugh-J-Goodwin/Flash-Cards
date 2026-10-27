import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode})=>({
 build:{outDir:mode==='e2e'?'dist-e2e':'dist'},
 plugins:[VitePWA({
  registerType:'prompt', injectRegister:null,
  includeAssets:['icon-192.png','icon-512.png','apple-touch-icon.png'],
  manifest:{
   id:'/',name:'Study Space',short_name:'Study Space',description:'Flashcards, quizzes and progress for your school study.',
   start_url:'/',scope:'/',display:'standalone',background_color:'#0e111a',theme_color:'#141824',
   icons:[
    {src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
    {src:'/icon-maskable.png',sizes:'512x512',type:'image/png',purpose:'maskable'}
   ]
  },
  workbox:{
   globPatterns:['**/*.{js,css,html,png,webmanifest}'],
   navigateFallback:'/index.html',navigateFallbackDenylist:[/^\/auth\//],
   // Precache only the public app shell. Never cache Supabase requests or auth responses.
   runtimeCaching:[],cleanupOutdatedCaches:true,
   maximumFileSizeToCacheInBytes:3*1024*1024
  }
 })]
}));
