import {defineConfig} from '@playwright/test';
import {existsSync,readdirSync} from 'node:fs';
import {homedir} from 'node:os';
const cache=homedir()+'/.cache/ms-playwright';
const localBrowser=existsSync(cache)?readdirSync(cache).filter(p=>p.startsWith('chromium-')).sort().reverse().map(p=>`${cache}/${p}/chrome-linux64/chrome`).find(existsSync):undefined;
export default defineConfig({
 testDir:'tests/browser',workers:1,use:{baseURL:'http://127.0.0.1:4174',launchOptions:{executablePath:process.env.CHROMIUM_EXECUTABLE||localBrowser}},
 webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4174',env:{PORT:'4174',UTILITIES_TEST_DB:'1'},timeout:30000},
 reporter:'list',
});
