import {defineConfig} from '@playwright/test';
import config from './playwright.config.js';
export default defineConfig({...config,testDir:'./generated/raw',outputDir:'reports/playwright-raw-results',
 reporter:[['list'],['json',{outputFile:'reports/playwright-raw-results.json'}]],
});
