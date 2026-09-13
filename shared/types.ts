export interface Stay {
  id: number;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  breakfastNotes: string | null;
  completedOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BreakfastStay {
  stayId: number;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  breakfastNotes: string | null;
  servedCount: number;
}

export interface BreakfastDay {
  date: string;
  stays: BreakfastStay[];
  totalServed: number;
  pendingRooms: number;
  canClose: boolean;
}

export interface InventoryItem {
  productId: number;
  name: string;
  unit: string | null;
  receivedQuantity: number | null;
  remainingQuantity: number | null;
}

export interface InventoryDay {
  date: string;
  items: InventoryItem[];
}

export interface DailyNote {
  date: string;
  content: string;
  updatedAt: string | null;
}

export interface Product {
  id: number;
  name: string;
  unit: string | null;
  active: boolean;
  displayOrder: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
