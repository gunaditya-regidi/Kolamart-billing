'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

const ALLOWED_WORKERS = [
  'SME-01','SME-02','SME-03','SME-04','SME-05',
  'SME-06','SME-07','SME-08','SME-09','SME-10'
];

export default function HomePage() {
  const router = useRouter();
  const [workerId, setWorkerId] = useState('');

  useEffect(() => {
    const savedId = localStorage.getItem('workerId');
    if (savedId && ALLOWED_WORKERS.includes(savedId)) {
      router.push('/select');
    } else {
      localStorage.removeItem('workerId'); // clean invalid data
    }
  }, [router]);

  const handleContinue = () => {
    const id = workerId.trim().toUpperCase();

    if (!ALLOWED_WORKERS.includes(id)) {
      alert('Invalid Worker ID.\n\nAllowed IDs:\nSME-01 to SME-10');
      return;
    }

    localStorage.setItem('workerId', id);
    router.push('/select');
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* LOGO */}
        <div style={styles.logoWrap}>
          <Image
            src="/logo.png"
            alt="Company Logo"
            width={220}
            height={80}
            priority
          />
        </div>

        <h2 style={styles.title}>Sales Executive Login</h2>

        <label style={styles.label}>Worker ID</label>
        <input
          type="text"
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          placeholder="Enter your Work ID"
          style={styles.input}
        />

        <button onClick={handleContinue} style={styles.button}>
          CONTINUE
        </button>

        <div style={styles.footer}>
          <p style={styles.footerText}>
           For Technical Assistance Contact : <strong>+91 8374522989</strong>
          </p>
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
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 24,
    boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    color:'#333',
    textAlign: 'center' as const,
    marginBottom: 20,
    fontSize: 18,
    fontWeight: 600,
  },
  label: {
    color:'#333',
    fontWeight: 600,
    marginBottom: 6,
    display: 'block',
  },
  input: {
    color:'#000',
    width: '100%',
    padding: 12,
    fontSize: 18,
    marginBottom: 20,
    borderRadius: 4,
    border: '1px solid #ccc',
    textTransform: 'uppercase' as const,
  },
  button: {
    width: '100%',
    padding: 14,
    fontSize: 16,
    fontWeight: 700,
    backgroundColor: '#1976d2',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  footer: {
    marginTop: 24,
    paddingTop: 12,
    borderTop: '1px solid #eee',
    textAlign: 'center' as const,
  },
  footerText: {
    fontSize: 12,
    color: '#555',
  },
};
