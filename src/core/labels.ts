const LABELS: Record<string, string> = {
  FOOD: 'Food', DINING_OUT: 'Dining out', GROCERIES: 'Groceries', TRAVEL: 'Travel', SHOPPING: 'Shopping',
  BILLS: 'Bills', HEALTH: 'Health', ENTERTAINMENT: 'Entertainment', TRANSFER: 'Transfer',
  TRANSFERS_OUT: 'Sent to people', REFUND: 'Refund', SUBSCRIPTIONS: 'Subscriptions', SALARY: 'Salary',
  RENT: 'Rent', BNPL_EMI: 'EMI (Buy now, pay later)',
};
export function categoryLabel(c: string | null): string {
  if (!c) return 'Uncategorised';
  return LABELS[c] ?? c.toLowerCase().replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());
}
