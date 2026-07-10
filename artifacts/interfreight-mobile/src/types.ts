export type User = {
  id: number;
  email: string;
  fullName?: string | null;
  companyName?: string | null;
  role: string;
};

export type Shipment = {
  id: number;
  ifsRef?: string | null;
  mraRef?: string | null;
  blNumber?: string | null;
  manifestNumber?: string | null;
  containerNumber?: string | null;
  consignee?: string | null;
  shipper?: string | null;
  cargoDescription?: string | null;
  invoiceNo?: string | null;
  status?: string | null;
  type?: string | null;
  eta?: string | null;
  extraFields?: Record<string, string | undefined> | null;
};
