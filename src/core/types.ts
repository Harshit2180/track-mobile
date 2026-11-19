export type Direction = 'debit' | 'credit';
export type Status = 'POSTED' | 'PENDING';

export interface Txn {
  id: string;
  accountId: string;          // always "acc_XXXX"
  ts: number;                 // epoch ms
  direction: Direction;
  amountMinor: number;        // in `currency` minor units, always positive
  currency: string;
  /** INR value in paise for totals; null if the row is foreign-currency with no conversion supplied. */
  inrMinor: number | null;
  merchant: string;           // raw
  merchantDisplay: string;
  searchText: string;         // normalised haystack
  category: string | null;
  status: Status;
  isOwnTransfer: boolean;     // money moving between the user's own accounts / card bill payment
  counterpartyAccountId?: string;
  updatedAt: number;          // epoch ms; 0 for legacy rows that carry no timestamp
  source: 'modern' | 'legacy';
}

export interface Tomb {
  id: string;
  deleted: true;
  updatedAt: number;
}

export type Entry = Txn | Tomb;

export const isTomb = (e: Entry): e is Tomb => (e as Tomb).deleted === true;
