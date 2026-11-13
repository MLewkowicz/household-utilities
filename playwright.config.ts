import {defineConfig} from '@playwright/test';
import {existsSync,readdirSync} from 'node:fs';
import {homedir} from 'node:os';
const cache=homedir()+'/.cache/ms-playwright';
const localBrowser=existsSync(cache)?readdirSync(cache).filter(p=>p.startsWith('chromium-')).sort().reverse().map(p=>`${cache}/${p}/chrome-linux64/chrome`).find(existsSync):undefined;
const port=process.env.UTILITIES_BROWSER_PORT||'4174',baseURL=`http://127.0.0.1:${port}`;
export default defineConfig({
 testDir:'tests/browser',workers:1,use:{baseURL,launchOptions:{executablePath:process.env.CHROMIUM_EXECUTABLE||localBrowser,args:['--enable-unsafe-swiftshader']}},
 webServer:{command:'node scripts/serve.mjs',url:baseURL,env:{PORT:port,UTILITIES_TEST_DB:'1'},timeout:30000,reuseExistingServer:process.env.UTILITIES_BROWSER_REUSE_SERVER==='1'},
 reporter:'list',
});
