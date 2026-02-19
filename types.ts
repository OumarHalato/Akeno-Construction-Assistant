
export interface Product {
  name: string;
  nameAm: string;
  price: string;
  priceAm: string;
  description?: string;
}

export interface TranscriptionItem {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}
