import type {Page} from 'playwright';
export const goals = {
  invoice:{text:'先月の請求書をPDFで保存したい',check:async(_page:Page,downloads:string[])=>downloads.includes('invoice-2026-08.pdf')},
  notifications:{text:'メール通知を停止したい',check:async(page:Page)=>page.getByRole('status').filter({hasText:'メール通知を停止しました'}).isVisible()},
};
export type GoalId=keyof typeof goals;
