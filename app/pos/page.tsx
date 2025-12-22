"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitOrder } from '@/lib/sheetApi';
import {
  requestAndSelectPrinter,
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

/* ======================
   ITEM MASTER
   ====================== */
const ITEMS = {
  RICE_26KG: { label: 'Rice 26 KG', price: 1499 },
  TOOR_DAL_500G: { label: 'Toor Dal 1/2 KG', price: 65 },
  SUGAR_1KG: { label: 'Sugar 1 KG', price: 55 },
};

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

  /* SAVE ORDER */
  const saveOrder = async () => {
    if (!customerName || !phone) {
      alert('Customer name and phone are required');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        workerId,
        customerName,
        phone,
        item: ITEMS[item].label,
        price,
        quantity,
        paymentMode,
      };

      const result = await submitOrder(payload);

      if (result.success) {
        alert(`Order Saved\nOrder ID: ${result.orderId}`);

        // Print the saved order (use payload + server orderId)
        await tryPrintReceipt(result.orderId as string, payload);

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
        if (cd) setConnectedPrinter(cd as any);
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
      toast?.show(`Selected printer: ${d.name || d.id}`, 'success');
    } catch (e) {
      console.error('Printer selection error:', e);
      try {
        const err = e as any;
        if (err && (err.name === 'NotFoundError' || err.name === 'AbortError')) {
          toast?.show('Printer selection was cancelled. No device chosen.', 'info');
        } else if (err && err.message) {
          toast?.show('Printer selection failed: ' + err.message, 'error');
        } else {
          toast?.show('Printer selection cancelled or failed', 'error');
        }
      } catch {
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

  async function tryPrintReceipt(orderId: string, payload: any) {
    const orderObj = {
      orderId,
      workerId: payload.workerId,
      item: payload.item,
      quantity: payload.quantity,
      price: payload.price,
      total: payload.price * payload.quantity,
      paymentMode: payload.paymentMode,
    };
    // If printer is connected (BLE) try to print via Bluetooth
    if (getConnectedDevice()) {
      try {
        const text = buildReceipt(orderObj as any);
        await printReceipt(text);
        toast?.show('Printed receipt', 'success');
        return;
      } catch (e) {
        console.error('Bluetooth print failed:', e);
        toast?.show('Failed to print via Bluetooth', 'error');
        // fallthrough to printable fallback
      }
    }

    // Mobile/other fallback: generate a printable HTML receipt and open print dialog
  
    try {
      const printable = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Receipt ${orderObj.orderId}</title>
            <style>
              body { font-family: Arial, sans-serif; padding:20px; color: #01342b; background: #fff }
              h1 { text-align:center }
              .box { max-width:420px; margin:0 auto }
              .row { display:flex; justify-content:space-between; margin:8px 0 }
              hr { border:none; border-top:1px dashed #ccc }
            </style>
          </head>
          <body>
            <div class="box">
              <h1>KOLAMART</h1>
              <hr />
              <div class="row"><strong>Order</strong><span>${orderObj.orderId}</span></div>
              <div class="row"><strong>SME</strong><span>${orderObj.workerId}</span></div>
              <hr />
              <div>${orderObj.item}</div>
              <div class="row"><span>Qty: ${orderObj.quantity}</span><span>₹ ${orderObj.price}</span></div>
              <hr />
              <div class="row"><strong>TOTAL</strong><strong>₹ ${orderObj.total}</strong></div>
              <div class="row"><span>Payment</span><span>${orderObj.paymentMode}</span></div>
              <hr />
              <p style="text-align:center">Thank you! Visit Again</p>
            </div>
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

  // Generate printable HTML and open print/share dialog (reusable for mobile)
  async function generatePrintableAndOpen(orderObj: any) {
    try {
      const printable = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Receipt ${orderObj.orderId}</title>
            <style>
              body { font-family: Arial, sans-serif; padding:20px; color: #01342b; background: #fff }
              h1 { text-align:center }
              .box { max-width:420px; margin:0 auto }
              .row { display:flex; justify-content:space-between; margin:8px 0 }
              hr { border:none; border-top:1px dashed #ccc }
            </style>
          </head>
          <body>
            <div class="box">
              <h1>KOLAMART</h1>
              <hr />
              <div class="row"><strong>Order</strong><span>${orderObj.orderId}</span></div>
              <div class="row"><strong>SME</strong><span>${orderObj.workerId}</span></div>
              <hr />
              <div>${orderObj.item}</div>
              <div class="row"><span>Qty: ${orderObj.quantity}</span><span>₹ ${orderObj.price}</span></div>
              <hr />
              <div class="row"><strong>TOTAL</strong><strong>₹ ${orderObj.total}</strong></div>
              <div class="row"><span>Payment</span><span>${orderObj.paymentMode}</span></div>
              <hr />
              <p style="text-align:center">Thank you! Visit Again</p>
            </div>
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

        <label style={styles.label}>Customer Name</label>
        <input
          value={customerName}
          onChange={e => setCustomerName(e.target.value)}
          style={styles.input}
        />

        <label style={styles.label}>Phone Number</label>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          style={styles.input}
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
            onClick={() => {
              const orderObj = {
                orderId: 'DRAFT-' + Date.now(),
                workerId,
                item: ITEMS[item].label,
                quantity,
                price,
                total: price * quantity,
                paymentMode,
              };
              generatePrintableAndOpen(orderObj);
            }}
          >
            Print / Share
          </button>
        </div>

      </div>
    </div>
  );
}

/* ======================
   STYLES
   ====================== */
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
