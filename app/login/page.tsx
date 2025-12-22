export default function LoginPage() {
	return (
		<div className="app-container" style={{display:'flex', alignItems:'center', justifyContent:'center'}}>
			<div className="card" style={{width: '100%', maxWidth: 420}}>
				<h1 style={{color:'var(--text-high)'}}>Login</h1>
				<p className="hint">Enter worker ID to continue.</p>
				<div style={{marginTop:12}}>
					<label>Worker ID</label>
					<input placeholder="SME-01" />
				</div>
				<div style={{marginTop:12}}>
					<button className="btn btn-primary">Enter</button>
				</div>
			</div>
		</div>
	);
}
