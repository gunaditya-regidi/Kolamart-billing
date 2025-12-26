"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';

export default function SelectionPage() {
  const router = useRouter();

  useEffect(() => {
    const id = localStorage.getItem('workerId');
    if (!id) router.push('/');
  }, [router]);

  return (
    <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:16}}>
      <div style={{width:'100%', maxWidth:480, background:'#fff', padding:24, borderRadius:8}}>

        <div style={{display:'flex', justifyContent:'center', marginBottom:12}}>
          <Image src="/logo.png" alt="Company Logo" width={220} height={80} priority />
        </div>

        <h2 style={{marginTop:0, fontSize:20, fontWeight:700}}>Select Action</h2>
        <p className="hint" style={{fontSize:14, fontWeight:600}}>Choose whether to book orders or print bills.</p>

        <div style={{display:'flex', flexDirection:'column', gap:12, marginTop:20}}>
          <button
            className="btn btn-primary"
            style={{width:'100%', padding:14, fontSize:16, fontWeight:700}}
            onClick={() => router.push('/order')}
          >
            Order Booking
          </button>

          <button
            className="btn btn-primary"
            style={{width:'100%', padding:14, fontSize:16, fontWeight:700}}
            onClick={() => router.push('/pos')}
          >
            Bill Printing
          </button>
        </div>

      </div>
    </div>
  );
}
