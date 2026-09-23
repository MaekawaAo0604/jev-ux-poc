import {defineConfig} from '@playwright/test';

export default defineConfig({
 testDir:'./tests/regression',
 testMatch:'**/*.spec.ts',
 fullyParallel:false,workers:1,retries:0,timeout:30_000,
 expect:{timeout:5000},
 outputDir:'reports/playwright-results',
 reporter:[['list'],['json',{outputFile:'reports/playwright-results.json'}]],
 use:{baseURL:'http://127.0.0.1:5188',viewport:{width:1280,height:900},locale:'ja-JP',
  serviceWorkers:'block',actionTimeout:5000,navigationTimeout:10_000,trace:'on'},
 globalSetup:'./tests/regression/global-setup.ts',
});
