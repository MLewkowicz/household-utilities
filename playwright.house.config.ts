import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
 ...base,testMatch:'house-entry.spec.ts',timeout:60000,
 use:{...base.use,baseURL:'http://127.0.0.1:4192',viewport:{width:1440,height:900},launchOptions:{...base.use?.launchOptions,args:['--enable-unsafe-swiftshader']},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'node scripts/serve.mjs',url:'http://127.0.0.1:4192',env:{PORT:'4192',UTILITIES_TEST_DB:'1'},timeout:30000},
 reporter:[['list'],['json',{outputFile:'.local/house-review/test-results.json'}]],
});
