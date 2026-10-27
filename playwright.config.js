import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
export default defineConfig({
 testDir:'./tests',workers:1,timeout:40000,
 use:{baseURL:'http://localhost:4174',headless:true,launchOptions:{
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:['--no-sandbox']
 }},
 webServer:{
  command:'npm run build -- --mode e2e && npm run preview -- --outDir dist-e2e --port 4174 --strictPort',
  url:'http://localhost:4174',reuseExistingServer:false,timeout:60000,
  env:{VITE_SUPABASE_URL:'https://study-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test-key'}
 }
});
