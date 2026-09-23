import {test,expect} from './fixtures.js';
import {goals} from '../goals.js';

// Translated from generated/raw/2026-09-22T16-25-46-427Z-634ef882-81b7-4d7a-a265-5523cb8669b4.spec.ts.
// Preserve both recorded clicks and both observed route checks; no Jev at replay time.
test(goals.notifications.text,async({page,good,baseURL})=>{
 await page.goto('/good/');
 await good.control('link','通知設定').click();
 await expect(page).toHaveURL(new URL('/good/#notifications',baseURL!).href);
 await good.control('button','メール通知を停止する').click();
 await expect(page).toHaveURL(new URL('/good/#notifications',baseURL!).href);
 await expect.poll(()=>goals.notifications.check(page)).toBe(true);
});
