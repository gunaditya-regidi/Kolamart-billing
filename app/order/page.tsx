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
  buildOrderReceipt,
  disconnectPrinter,
  isWebBluetoothAvailable,
  isNativeAndroidAvailable,
} from '@/lib/printerBridge';
import { requestAndroidBluetoothPermissions } from '@/lib/permissionHelper';
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
};

export default function OrderBookingPage() {
  const router = useRouter();
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [item, setItem] = useState('RICE 26 KG');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(1499);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [loading, setLoading] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState<any | null>(null);
  const [permittedDevices, setPermittedDevices] = useState<any[]>([]);
  const [bluetoothAvailable, setBluetoothAvailable] = useState<boolean>(true);
  const [nativeAvailable, setNativeAvailable] = useState<boolean>(false);
  const [secureContext, setSecureContext] = useState<boolean>(true);
  const toast = useToast();

  useEffect(() => {
    const id = localStorage.getItem('workerId');
    if (!id) router.push('/');
    else setWorkerId(id);
  }, [router]);

  const changeWorker = () => {
    if (confirm('Change worker?')) {
      localStorage.removeItem('workerId');
      router.push('/');
    }
  };

  useEffect(() => {
    try {
      const ok = isWebBluetoothAvailable();
      setBluetoothAvailable(Boolean(ok));
      setSecureContext(typeof window !== 'undefined' ? !!(window as any).isSecureContext : true);
      if (!ok) toast && toast.show('Web Bluetooth not available (use Chrome/Edge on https or localhost)', 'error');
      try { setNativeAvailable(isNativeAndroidAvailable()); } catch { setNativeAvailable(false); }
    } catch {
      setBluetoothAvailable(false);
      setSecureContext(typeof window !== 'undefined' ? !!(window as any).isSecureContext : true);
      try { setNativeAvailable(isNativeAndroidAvailable()); } catch { setNativeAvailable(false); }
    }
  }, [toast]);

  useEffect(() => {
    const unsub = onDeviceChange((d) => setConnectedPrinter(d as any || null));

    (async () => {
      try {
        const list = await getPermittedDevices();
        setPermittedDevices(list as any[]);
        const cd = getConnectedDevice();
        if (cd) setConnectedPrinter(cd as any);
        else if (list && list.length) {
          try {
            const d = await reconnectPrinter();
            if (d) {
              setConnectedPrinter(d as any);
              toast?.show(`Reconnected: ${d.name || d.id}`, 'success');
            }
          } catch {}
        }
      } catch {}
    })();

    return () => { unsub(); };
  }, [toast]);

  const handleSelectPrinter = async () => {
    if (!bluetoothAvailable) {
      toast?.show('Web Bluetooth is not available on this device/browser', 'error');
      return;
    }

    try {
      try {
        if (nativeAvailable) {
          const ok = await requestAndroidBluetoothPermissions();
          if (!ok) {
            toast?.show('Bluetooth permissions are required', 'error');
            return;
          }
        }
      } catch {}
      const d = await requestPrinterWithFallback();
      setConnectedPrinter(d as any);
      const list = await getPermittedDevices();
      setPermittedDevices(list as any[]);
      toast?.show(`Connected to printer: ${d.name || d.id}`, 'success');
    } catch (e) {
      const err = e as any;
      if (err && (err.name === 'NotFoundError' || err.name === 'AbortError')) {
        console.info('User cancelled device selection');
        // Don't show a toast for cancelled selection as it's expected behavior
      } else if (err && err.message) {
        console.error('Printer selection failed:', err);
        toast?.show('Printer selection failed: ' + err.message, 'error');
      } else {
        console.error('Printer selection failed:', err);
        toast?.show('Printer selection failed', 'error');
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

  function validateCustomerInputs(name: string, phone: string, quantity: number) {
    if (!name || name.trim().length === 0) return { valid: false, error: 'Customer name is required' };
    if (!phone || phone.trim().length === 0) return { valid: false, error: 'Phone number is required' };
    const phoneDigitsOnly = phone.replace(/\D/g, '');
    if (phoneDigitsOnly.length !== 10) return { valid: false, error: 'Phone number must be exactly 10 digits' };
    if (!quantity || quantity <= 0) return { valid: false, error: 'Quantity must be at least 1' };
    return { valid: true };
  }

  const handleBookOrder = async () => {
    const validation = validateCustomerInputs(customerName, phone, quantity);
    if (!validation.valid) return alert(validation.error);
    
    // Check if printer is connected before proceeding
    if (!getConnectedDevice() && !connectedPrinter) {
      toast?.show('Please connect a printer before booking the order', 'error');
      return;
    }

    // Show confirmation dialog before booking
    const confirmMessage = `Please confirm order details:

Customer Name: ${customerName.trim()}
Phone: ${phone.replace(/\D/g, '')}
Item: ${item}
Quantity: ${quantity}
Total: ₹${price * quantity}
Payment Mode: ${paymentMode}

Do you want to proceed with booking?`;
    
    if (!confirm(confirmMessage)) {
      return; // User cancelled, don't proceed
    }

    setLoading(true);
    try {
      const payload = {
        workerId,
        customerName: customerName.trim(),
        phone: phone.replace(/\D/g, ''),
        item,
        price,
        quantity,
        paymentMode,
      };

      // Submit via internal server proxy which updates the spreadsheet
      // Generate a client-side bookingId as a fallback if server doesn't return one
      const makeBookingId = () => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const y = now.getFullYear();
        const m = pad(now.getMonth() + 1);
        const d = pad(now.getDate());
        const hh = pad(now.getHours());
        const mm = pad(now.getMinutes());
        const ss = pad(now.getSeconds());
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `BK-${y}${m}${d}${hh}${mm}${ss}-${rand}`;
      };

      const clientBookingId = makeBookingId();

      const result = await submitOrder({
        workerId: payload.workerId,
        customerName: payload.customerName,
        phone: payload.phone,
        item: payload.item,
        quantity: payload.quantity,
        bookingId: clientBookingId,
        source: 'mobile-app',
        clientTimestamp: new Date().toISOString(),
      });

      // Extract booking/order id similar to POS flow
      const extractOrderIdFromResponse = (res: any) => {
        const rawOrderId = res?.orderId ?? res?.order_id ?? res?.orderID ?? res?.id ?? res?.data?.orderId ?? res?.data?.order_id;
        const s = String(rawOrderId ?? '').trim();
        return s || 'BK-UNKNOWN';
      };

      if (result && (result.success || result.ok)) {
        // Use the client-generated ID as the primary ID to ensure consistency between receipt and stored data
        const serverOrderId = extractOrderIdFromResponse(result);
        const orderId = serverOrderId !== 'BK-UNKNOWN' ? serverOrderId : clientBookingId;
        alert(`Order booked: ${orderId}`);
        const receipt = buildOrderReceipt({
          bookingId: orderId,
          workerId,
          customerName: payload.customerName,
          customerPhone: payload.phone,
          item: payload.item,
          quantity: payload.quantity,
          price: payload.price,
          total: payload.price * payload.quantity,
          paymentMode: payload.paymentMode,
          date: new Date().toISOString(),
        } as any);

        try {
          if (getConnectedDevice()) {
            await printReceipt(receipt);
            toast?.show('Printed booking receipt', 'success');
          } else {
            toast?.show('No printer connected - booking saved without printing', 'info');
          }
        } catch (e) {
          console.error('Print failed', e);
          toast?.show('Failed to print booking receipt', 'error');
        }

        setCustomerName('');
        setPhone('');
        setQuantity(1);
      } else {
        const msg = result?.error || result?.message || JSON.stringify(result);
        console.error('Booking failed:', msg);
        toast?.show('Failed to book order: ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)), 'error');
      }
    } catch (err) {
      console.error(err);
      toast?.show('Network error while booking order: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#f2f2f2', display:'flex', alignItems:'center', justifyContent:'center', padding:12}}>
      <div style={{width: '100%', maxWidth: 380, backgroundColor: '#ffffff', borderRadius: 8, padding: 20, boxShadow: '0 4px 10px rgba(0,0,0,0.1)'}}>
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:12, alignItems:'center'}}>
          <div>
            <div style={{fontWeight:700, fontSize:18}}>Order Booking</div>
            <div style={{fontSize:13, color:'#666'}}>Book orders and print booking receipts.</div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div style={{backgroundColor:'#1976d2', color:'#fff', padding:'6px 12px', borderRadius:20, fontWeight:600}}>{workerId}</div>
            <button onClick={changeWorker} style={{background:'transparent', border:'none', color:'#1976d2', fontWeight:600}}>Change</button>
          </div>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr', gap:12}}>
          <div>
            <label>Customer Name</label>
            <input style={{width:'100%'}} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <label>Phone</label>
            <input style={{width:'100%'}} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label>Item</label>
            <input style={{width:'100%'}} value={item} disabled />
          </div>
          <div>
            <label>Quantity</label>
            <input style={{width:'100%'}} type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Printer:</strong>{' '}
            {connectedPrinter ? (connectedPrinter.name || connectedPrinter.id) : 'No printer connected'}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
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

        <div style={{display:'flex', gap:8, marginTop:14}}>
          <button className="btn btn-primary" style={{flex:1}} onClick={handleBookOrder} disabled={loading}>{loading ? 'Booking...' : 'BOOK & PRINT'}</button>
          <button className="btn btn-ghost" style={{padding:'12px 14px'}} onClick={() => router.push('/select')}>Back</button>
        </div>
      </div>
    </div>
  );
}
