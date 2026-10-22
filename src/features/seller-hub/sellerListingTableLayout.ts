/** Column flex weights and fixed widths for the listings table. */
export const TABLE_COLUMNS = {
  check: 36,
  product: 2.2,
  brand: 1,
  price: 1,
  condition: 1,
  status: 0.7,
  actions: 88,
} as const;

export type TableDataColumnId = Exclude<keyof typeof TABLE_COLUMNS, 'check'>;

export const TABLE_COLUMN_LABELS: { id: TableDataColumnId; label: string }[] = [
  { id: 'product', label: 'Listing' },
  { id: 'brand', label: 'Brand' },
  { id: 'price', label: 'Price' },
  { id: 'condition', label: 'Condition' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: '' },
];
