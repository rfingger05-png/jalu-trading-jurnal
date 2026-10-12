import { format } from 'date-fns';

export function formatCurrency(val: number | null | undefined, currency: string = 'USD'): string {
  if (val == null || !isFinite(val)) return '-';
  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  
  let symbol = '$';
  if (currency === 'IDR') symbol = 'Rp ';
  if (currency === 'EUR') symbol = '€';
  if (currency === 'GBP') symbol = '£';
  if (currency === 'USC' || currency === 'Cent') symbol = '¢';
  if (currency === 'JPY') symbol = '¥';
  
  if (currency === 'IDR') {
    return `${sign}${symbol}${absVal.toLocaleString('id-ID')}`;
  }
  
  return `${sign}${symbol}${absVal.toFixed(2)}`;
}

export const resizeImage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // compress to 70% jpeg
      };
    };
  });
};


export const formatImageUrl = (url?: string | null): string => {
  if (!url) return '';
  if (url.includes('tradingview.com/x/')) {
    const id = url.split('/x/')[1].replace(/\//g, '');
    const firstChar = id.charAt(0).toLowerCase();
    return `https://s3.tradingview.com/snapshots/${firstChar}/${id}.png`;
  }
  return url;
};

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('journal_token');
  } catch (e) {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem('journal_token', token);
    } else {
      localStorage.removeItem('journal_token');
    }
  } catch (e) {}
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });
}

export function safeParseDate(val: any): Date {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  const str = String(val).trim();
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  
  // Normalize "YYYY-MM-DD HH:mm:ss" or "YYYY.MM.DD HH:mm:ss"
  const iso = str.replace(/\./g, '-').replace(' ', 'T');
  d = new Date(iso);
  if (!isNaN(d.getTime())) return d;

  d = new Date(iso + 'Z');
  if (!isNaN(d.getTime())) return d;

  return new Date();
}

export function safeFormatDate(val: any, formatPattern: string, fallback: string = '-'): string {
  try {
    const d = safeParseDate(val);
    if (isNaN(d.getTime())) return fallback;
    return format(d, formatPattern);
  } catch {
    return fallback;
  }
}


