import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';

// The replay runner owns the local fixture server. Credentials are removed from
// the child process and raw tests restrict browser traffic to this local origin.
export default defineConfig({...base,testDir:'./generated/vision',globalSetup:undefined,
 use:{...base.use,baseURL:process.env.VISION_REPLAY_BASE_URL},
 outputDir:process.env.VISION_REPLAY_OUTPUT_DIR,
 reporter:[['list'],['json',{outputFile:process.env.VISION_REPLAY_RESULT_FILE}]],
});
