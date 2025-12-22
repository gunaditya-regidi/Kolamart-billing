'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitOrder } from '@/lib/sheetApi';
import {
  requestAndSelectPrinter,
  onDeviceChange,
  getPermittedDevices,
  getConnectedDevice,
  printReceipt,
  buildReceipt,
  disconnectPrinter,
} from '@/lib/bluetoothPrinter';

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

  /* LOAD WORKER */
  useEffect(() => {
    const id = localStorage.getItem('workerId');
    if (!id) router.push('/');
    else setWorkerId(id);
  }, [router]);

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

    return () => unsub();
  }, []);

  const handleSelectPrinter = async () => {
    try {
      const d = await requestAndSelectPrinter();
      setConnectedPrinter(d as any);
      const list = await getPermittedDevices();
      setPermittedDevices(list as any[]);
      alert(`Selected printer: ${d.name || d.id}`);
    } catch (e) {
      console.error(e);
      alert('Printer selection cancelled or failed');
    }
  };

  const handleDisconnectPrinter = async () => {
    try {
      await disconnectPrinter();
      setConnectedPrinter(null);
      alert('Printer disconnected');
    } catch (e) {
      console.error(e);
      alert('Failed to disconnect');
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

    if (!getConnectedDevice()) {
      const ok = confirm('No printer connected. Select a printer now?');
      if (!ok) return;
      try {
        await requestAndSelectPrinter();
      } catch {
        return;
      }
    }

    try {
      const text = buildReceipt(orderObj as any);
      await printReceipt(text);
      alert('Printed receipt');
    } catch (e) {
      console.error(e);
      alert('Failed to print receipt');
    }
  }

  if (!workerId) return null;

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* HEADER */}
        <div style={styles.header}>
          <span style={styles.workerBadge}>{workerId}</span>
          <button onClick={changeWorker} style={styles.changeBtn}>
            Change
          </button>
        </div>

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
            <button onClick={handleSelectPrinter} style={{ ...styles.primaryBtn, backgroundColor: '#1976d2', padding: '8px 12px', fontSize: 14 }}>
              Select Printer
            </button>
            <button onClick={handleDisconnectPrinter} style={{ ...styles.primaryBtn, backgroundColor: '#e53935', padding: '8px 12px', fontSize: 14 }} disabled={!connectedPrinter}>
              Disconnect
            </button>
          </div>

          {permittedDevices && permittedDevices.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: '#444' }}>
              Previously allowed devices: {permittedDevices.map(d => d.name || d.id).join(', ')}
            </div>
          )}
        </div>

        <button
          style={styles.primaryBtn}
          onClick={saveOrder}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'PRINT & SAVE'}
        </button>

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
