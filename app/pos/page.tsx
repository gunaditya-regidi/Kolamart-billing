"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitOrder } from '@/lib/sheetApi';
import {
  requestPrinterWithFallback,
  onDeviceChange,
  getPermittedDevices,
  getConnectedDevice,
  reconnectPrinter,
  printReceipt,
  buildReceipt,
  disconnectPrinter,
  isWebBluetoothAvailable,
} from '@/lib/bluetoothPrinter';
import { useToast } from '@/components/ToastProvider';

type ReceiptData = {
  orderId: string;
  workerId: string | null;
  customerName: string;
  customerPhone: string;
  item: string;
  quantity: number;
  price: number;
  total: number;
  paymentMode: string;
  date: string;
  companyName?: string;
};

type OrderPayload = {
  workerId: string | null;
  customerName: string;
  phone: string;
  item: string;
  price: number;
  quantity: number;
  paymentMode: string;
};

const ITEMS = {
  RICE_26KG: { label: 'Rice 26 KG', price: 1499 },
  TOOR_DAL_500G: { label: 'Toor Dal 1/2 KG', price: 65 },
  SUGAR_1KG: { label: 'Sugar 1 KG', price: 55 },
};

function formatOrderId(raw: any): string {
  // Backend already returns IDs like "KM-20251222-0001"
  // Use it as-is so each order stays unique.
  const s = String(raw ?? '').trim();
  return s || 'KM-0000001';
}

// Extract order ID from API response - ensures consistent extraction across all buttons
function extractOrderIdFromResponse(result: any): string {
  const rawOrderId =
    result?.orderId ??
    result?.order_id ??
    result?.orderID ??
    result?.id ??
    result?.data?.orderId ??
    result?.data?.order_id;
  return formatOrderId(rawOrderId);
}

// Validate customer name and phone number
function validateCustomerInputs(name: string, phone: string): { valid: boolean; error?: string } {
  // Check if customer name is provided
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Customer name is required' };
  }

  // Check if phone number is provided
  if (!phone || phone.trim().length === 0) {
    return { valid: false, error: 'Phone number is required' };
  }

  // Check if phone number contains only digits
  const phoneDigitsOnly = phone.replace(/\D/g, '');
  if (phoneDigitsOnly.length !== phone.length) {
    return { valid: false, error: 'Phone number must contain only numbers' };
  }

  // Check if phone number is exactly 10 digits
  if (phoneDigitsOnly.length !== 10) {
    return { valid: false, error: 'Phone number must be exactly 10 digits' };
  }

  return { valid: true };
}

export default function PosPage() {
  const router = useRouter();

  /* WORKER */
  const [workerId, setWorkerId] = useState<string | null>(null);

  /* ORDER DATA */
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [item, setItem] = useState<keyof typeof ITEMS>('RICE_26KG');
  const [price, setPrice] = useState(ITEMS.RICE_26KG.price);
  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [loading, setLoading] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState<any | null>(null);
  const [permittedDevices, setPermittedDevices] = useState<any[]>([]);
  const [bluetoothAvailable, setBluetoothAvailable] = useState<boolean>(true);
  const [secureContext, setSecureContext] = useState<boolean>(true);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const toast = useToast();

  /* LOAD WORKER */
  useEffect(() => {
    const id = localStorage.getItem('workerId');
    if (!id) router.push('/');
    else setWorkerId(id);
  }, [router]);

  useEffect(() => {
    // detect Web Bluetooth availability & secure context
    try {
      const ok = isWebBluetoothAvailable();
      setBluetoothAvailable(Boolean(ok));
      setSecureContext(typeof window !== 'undefined' ? !!(window as any).isSecureContext : true);
      if (!ok) toast && toast.show('Web Bluetooth not available (use Chrome/Edge on https or localhost)', 'error');
    } catch {
      setBluetoothAvailable(false);
      setSecureContext(typeof window !== 'undefined' ? !!(window as any).isSecureContext : true);
    }
  }, [toast]);

  /* AUTO PRICE */
  useEffect(() => {
    setPrice(ITEMS[item].price);
  }, [item]);

  const totalAmount = price * quantity;

  /* CHANGE WORKER */
  const changeWorker = () => {
    if (confirm('Change worker?')) {
      localStorage.removeItem('workerId');
      router.push('/');
    }
  };

  const buildReceiptFromPayload = (orderId: string, payload: OrderPayload, dateIso?: string): ReceiptData => ({
    orderId,
    workerId: payload.workerId,
    customerName: payload.customerName,
    customerPhone: payload.phone,
    item: payload.item,
    quantity: payload.quantity,
    price: payload.price,
    total: payload.price * payload.quantity,
    paymentMode: payload.paymentMode,
    date: dateIso || new Date().toISOString(),
  });

  const isSameDetails = (a?: ReceiptData | null, b?: ReceiptData | null) => {
    if (!a || !b) return false;
    return (
      a.workerId === b.workerId &&
      a.customerName === b.customerName &&
      a.customerPhone === b.customerPhone &&
      a.item === b.item &&
      a.quantity === b.quantity &&
      a.price === b.price &&
      a.paymentMode === b.paymentMode
    );
  };

  /* SAVE ORDER */
  const saveOrder = async () => {
    // Validate customer inputs
    const validation = validateCustomerInputs(customerName, phone);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }

    // Normalize phone number (remove any non-digits, should be 10 digits after validation)
    const normalizedPhone = phone.replace(/\D/g, '');

    setLoading(true);

    try {
      const payload: OrderPayload = {
        workerId,
        customerName: customerName.trim(),
        phone: normalizedPhone,
        item: ITEMS[item].label,
        price,
        quantity,
        paymentMode,
      };

      const result = await submitOrder(payload);

      if (result.success) {
        // Extract order ID using shared helper - ensures consistency with Print/Share button
        const displayId = extractOrderIdFromResponse(result);
        alert(`Order Saved\nOrder ID: ${displayId}`);

        // Print the saved order (use payload + server orderId)
        await tryPrintReceipt(displayId, payload);

        // Reset form after printing
        setCustomerName('');
        setPhone('');
        setQuantity(1);
        setItem('RICE_26KG');
        setPaymentMode('Cash');
      } else {
        const msg = result?.error || result?.message || JSON.stringify(result);
        alert(`Failed to save order: ${msg}`);
      }
    } catch (err) {
      console.error(err);
      alert(`Network error while saving: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  /* BLUETOOTH: subscribe and helpers */
  useEffect(() => {
    // subscribe to device changes
    const unsub = onDeviceChange((d) => {
      setConnectedPrinter(d as any || null);
    });
  
    // initial permitted devices (if browser supports)
    (async () => {
      try {
        const list = await getPermittedDevices();
        setPermittedDevices(list as any[]);
        const cd = getConnectedDevice();
        if (cd) {
          setConnectedPrinter(cd as any);
        } else if (list && list.length) {
          try {
            const d = await reconnectPrinter();
            if (d) {
              setConnectedPrinter(d as any);
              toast?.show(`Reconnected: ${d.name || d.id}`, 'success');
            }
          } catch {
            // ignore reconnect errors
          }
        }
      } catch {
        // ignore
      }
    })();
  
    return () => { unsub(); };
  }, []);

  const handleSelectPrinter = async () => {
    if (!bluetoothAvailable) {
      toast?.show('Web Bluetooth is not available on this device/browser', 'error');
      return;
    }

    try {
    
      const d = await requestPrinterWithFallback();
      setConnectedPrinter(d as any);
      const list = await getPermittedDevices();
      setPermittedDevices(list as any[]);
      toast?.show(`Connected to printer: ${d.name || d.id}`, 'success');
    } catch (e) {
      const err = e as any;
      if (err && (err.name === 'NotFoundError' || err.name === 'AbortError')) {
        console.info('User cancelled device selection');
        toast?.show('Printer selection was cancelled. No device chosen.', 'info');
      } else if (err && err.message) {
        console.error('Printer selection failed:', err);
        toast?.show('Printer selection failed: ' + err.message, 'error');
      } else {
        console.error('Printer selection failed:', err);
        toast?.show('Printer selection cancelled or failed', 'error');
      }
    }
  };

  const handleReconnectPrinter = async () => {
    try {
      const d = await reconnectPrinter();
      if (d) {
        setConnectedPrinter(d as any);
        toast?.show(`Reconnected: ${d.name || d.id}`, 'success');
      } else {
        toast?.show('No known printer to reconnect', 'info');
      }
    } catch (e) {
      console.error(e);
      toast?.show('Failed to reconnect', 'error');
    }
  };

  const handleDisconnectPrinter = async () => {
    try {
      await disconnectPrinter();
      setConnectedPrinter(null);
      toast?.show('Printer disconnected', 'info');
    } catch (e) {
      console.error(e);
      toast?.show('Failed to disconnect', 'error');
    }
  };

  async function tryPrintReceipt(orderId: string, payload: OrderPayload) {
    // Always capture a timestamp so Bluetooth print and PDF share show the same bill
    const orderObj = buildReceiptFromPayload(orderId, payload);
    setLastReceipt(orderObj);
    if (getConnectedDevice()) {
      try {
        const text = buildReceipt(orderObj as any);
        await printReceipt(text);
        toast?.show('Printed receipt', 'success');
        return;
      } catch (e) {
        console.error('Bluetooth print failed:', e);
        toast?.show('Failed to print via Bluetooth', 'error');
      }
    }

    await generatePrintableAndOpen(orderObj);
  }

  function buildPrintableReceiptText(orderObj: any) {
    const LINE_WIDTH = 32;

    const padRight = (text: string, length: number) =>
      text.length > length ? text.slice(0, length) : text + ' '.repeat(length - text.length);

    const padLeft = (text: string, length: number) =>
      text.length > length ? text.slice(0, length) : ' '.repeat(length - text.length) + text;

    const divider = '-'.repeat(LINE_WIDTH);

    const companyName = (orderObj.companyName || 'KOLAMART').toString();
    const gstNumber = '37AALCK4778K1ZQ';
    const orderIdLocal = (orderObj.orderId || '').toString();
    const workerIdLocal = (orderObj.workerId || '').toString();
    const customerNameLocal = (orderObj.customerName || '').toString();
    const customerPhoneLocal = (orderObj.customerPhone || '').toString();
    const itemName = (orderObj.item || '').toString();
    const quantity = (orderObj.quantity ?? '').toString();
    const price = (orderObj.price ?? '').toString();
    const total = (orderObj.total ?? '').toString();
    const paymentModeLocal = (orderObj.paymentMode || '').toString();

    const orderDate = orderObj.date ? new Date(orderObj.date) : new Date();
    const formattedDate = orderDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const formattedTime = orderDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const COL_ITEM = 16;
    const COL_QTY = 3;
    const COL_PRICE = 9;

    const headerBorder =
      '+' + '-'.repeat(COL_ITEM) + '+' + '-'.repeat(COL_QTY) + '+' + '-'.repeat(COL_PRICE) + '+';

    const tableHeader =
      '|' +
      padRight('ITEM', COL_ITEM) +
      '|' +
      padRight('QTY', COL_QTY) +
      '|' +
      padRight('PRICE', COL_PRICE) +
      '|';

    const itemRow =
      '|' +
      padRight(itemName, COL_ITEM) +
      '|' +
      padRight(quantity, COL_QTY) +
      '|' +
      padLeft(`Rs ${price}`, COL_PRICE) +
      '|';

    let text = '';
    text += companyName + '\n';
    text += `GST No: ${gstNumber}\n`;
    text +=
      '13/1, MIG Vuda Flats Pithapuram Colony, Visakhapatnam, Andhra Pradesh 530003\n';
    text += 'Customer Care: 9848418582\n';
    text += divider + '\n';
    text += `Date         : ${formattedDate}\n`;
    text += `Time         : ${formattedTime}\n`;
    if (orderIdLocal) {
      text += `Order ID    : ${orderIdLocal}\n`;
    }
    if (workerIdLocal) {
      text += `Worker ID    : ${workerIdLocal}\n`;
    }
    text += `Customer Name: ${customerNameLocal}\n`;
    text += `Phone        : ${customerPhoneLocal}\n`;
    text += divider + '\n';
    text += headerBorder + '\n';
    text += tableHeader + '\n';
    text += headerBorder + '\n';
    text += itemRow + '\n';
    text += headerBorder + '\n';
    text += `TOTAL AMOUNT: Rs ${total}\n`;
    text += `Payment Mode: ${paymentModeLocal}\n`;
    text += divider + '\n';
    text += 'You saved Rs 300/- per rice bag\n';
    text += 'Thank you\n';
    text += 'Visit Again\n';

    return text;
  }

  // Generate printable HTML and open print/share dialog (reusable for mobile)
  async function generatePrintableAndOpen(orderObj: any) {
    const escHtml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const receiptText = buildPrintableReceiptText(orderObj);

    try {
      const printable = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Receipt ${orderObj.orderId}</title>
            <style>
              body { font-family: monospace; padding:16px; color:#000; background:#fff }
              pre { font-size:12px; line-height:1.4; white-space:pre; }
            </style>
          </head>
          <body>
            <pre>${escHtml(receiptText)}</pre>
            <script>window.onload = function(){ setTimeout(()=>{ window.print(); }, 300); }</script>
          </body>
        </html>
      `;

      const w = window.open('', '_blank');
      if (!w) {
        const blob = new Blob([printable], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        if (navigator.share) {
          try {
            await navigator.share({ title: `Receipt ${orderObj.orderId}`, url });
            toast?.show('Shared receipt', 'success');
            return;
          } catch (e) {
            // ignore
          }
        }
        window.location.href = url;
        return;
      }

      w.document.open();
      w.document.write(printable);
      w.document.close();
      toast?.show('Opened printable receipt. Use browser print to save/send.', 'info');
      return;
    } catch (err) {
      console.error('Printable fallback failed', err);
      toast?.show('Failed to generate printable receipt', 'error');
    }
  }

  if (!workerId) return null;

  return (
    <div className="app-container" style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
      <div className="card" style={{width:'100%', maxWidth:380}}>

        {/* HEADER */}
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:16}}>
          <span className="worker-badge">{workerId}</span>
          <button onClick={changeWorker} className="btn btn-ghost">Change</button>
        </div>

        {!secureContext && (
          <div className="hint" style={{marginBottom:8}}>Web Bluetooth requires https or localhost. Please open in a secure context.</div>
        )}

        <label style={styles.label}>
          Customer Name <span style={{color: '#d32f2f'}}>*</span>
        </label>
        <input
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          style={styles.input}
          required
          placeholder="Enter customer name"
        />

        <label style={styles.label}>
          Phone Number <span style={{color: '#d32f2f'}}>*</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={e => {
            // Only allow digits, limit to 10 digits
            const value = e.target.value.replace(/\D/g, '').slice(0, 10);
            setPhone(value);
          }}
          style={styles.input}
          required
          placeholder="Enter 10-digit phone number"
          maxLength={10}
          pattern="[0-9]{10}"
        />

        <label style={styles.label}>Item</label>
        <select
          value={item}
          onChange={e => setItem(e.target.value as keyof typeof ITEMS)}
          style={styles.input}
        >
          {Object.entries(ITEMS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <label style={styles.label}>Price (₹)</label>
        <input value={price} readOnly style={{ ...styles.input, background: '#eee' }} />

        <label style={styles.label}>Quantity</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={e => setQuantity(Number(e.target.value))}
          style={styles.input}
        />

        <div style={styles.totalBox}>
          TOTAL: ₹ <strong>{totalAmount}</strong>
        </div>

        <label style={styles.label}>Payment Mode</label>
        <select
          value={paymentMode}
          onChange={e => setPaymentMode(e.target.value)}
          style={styles.input}
        >
          <option value="Cash">Cash</option>
          <option value="UPI">UPI</option>
        </select>

        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Printer:</strong>{' '}
            {connectedPrinter ? (connectedPrinter.name || connectedPrinter.id) : 'No printer connected'}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSelectPrinter} className="btn btn-primary" style={{padding:'8px 12px', fontSize:14}} disabled={!bluetoothAvailable}>
              Select Printer
            </button>
            <button onClick={handleReconnectPrinter} className="btn btn-primary" style={{padding:'8px 12px', fontSize:14}} disabled={!bluetoothAvailable}>
              Reconnect
            </button>
            <button onClick={handleDisconnectPrinter} className="btn btn-danger" style={{padding:'8px 12px', fontSize:14}} disabled={!connectedPrinter}>
              Disconnect
            </button>
          </div>

          {permittedDevices && permittedDevices.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: '#444' }}>
              Previously allowed devices: {permittedDevices.map(d => d.name || d.id).join(', ')}
            </div>
          )}

          {!bluetoothAvailable && (
            <div className="hint" style={{marginTop:8}}>Web Bluetooth is not available in this browser/device. Use Chrome on Android or desktop Chromium browsers.</div>
          )}
        </div>

        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-primary" style={{flex:1}} onClick={saveOrder} disabled={loading}>{loading ? 'Saving...' : 'PRINT & SAVE'}</button>
          <button
            className="btn btn-ghost"
            style={{padding:'12px 14px'}}
            onClick={async () => {
              // Validate customer inputs before proceeding
              const validation = validateCustomerInputs(customerName, phone);
              if (!validation.valid) {
                alert(validation.error);
                return;
              }

              // Normalize phone number (remove any non-digits, should be 10 digits after validation)
              const normalizedPhone = phone.replace(/\D/g, '');

              const payload: OrderPayload = {
                workerId,
                customerName: customerName.trim(),
                phone: normalizedPhone,
                item: ITEMS[item].label,
                price,
                quantity,
                paymentMode,
              };

              // If the form matches the last printed/saved receipt, reuse its real orderId/date.
              if (
                lastReceipt &&
                isSameDetails(
                  lastReceipt,
                  buildReceiptFromPayload(lastReceipt.orderId, payload, lastReceipt.date)
                )
              ) {
                await generatePrintableAndOpen(lastReceipt);
                return;
              }

              // Otherwise, save the order first so we get a real orderId from the backend,
              // then open the PDF using that returned ID.
              // Uses the same extraction logic as PRINT & SAVE to ensure identical order IDs.
              try {
                const result = await submitOrder(payload);

                if (result.success) {
                  // Extract order ID using shared helper - ensures same ID as Bluetooth receipt
                  const displayId = extractOrderIdFromResponse(result);
                  const orderObj = buildReceiptFromPayload(displayId, payload);
                  setLastReceipt(orderObj);
                  await generatePrintableAndOpen(orderObj);
                } else {
                  const msg = result?.error || result?.message || JSON.stringify(result);
                  alert(`Failed to save order for PDF: ${msg}`);
                }
              } catch (err) {
                console.error(err);
                alert(
                  `Network error while saving for PDF: ${
                    err instanceof Error ? err.message : String(err)
                  }`
                );
              }
            }}
          >
            Print / Share
          </button>
        </div>

      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f2f2f2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  workerBadge: {
    backgroundColor: '#1976d2',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: 20,
    fontWeight: 600,
  },
  changeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#1976d2',
    fontWeight: 600,
  },
  label: {
    color:'#333',
    fontWeight: 600,
    marginBottom: 6,
    display: 'block',
  },
  input: {
    color:'#333',
    width: '100%',
    padding: 12,
    marginBottom: 14,
    borderRadius: 4,
    border: '1px solid #ccc',
  },
  totalBox: {
    color:'#333',
    margin: '12px 0',
    padding: 12,
    background: '#f2ff00ff',
    textAlign: 'center' as const,
    fontSize: 18,
  },
  primaryBtn: {
    width: '100%',
    padding: 14,
    backgroundColor: '#4caf50',
    color: '#fff',
    fontWeight: 700,
    border: 'none',
    borderRadius: 4,
  },
};
