import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import './App.css';
import LiquidityLockABI from './contracts/LiquidityLock.json';
import SampleTokenABI from './contracts/SampleToken.json';
import localhostDeployment from './contracts/localhost.json';
import sepoliaDeployment from './contracts/sepolia.json';

const DEPLOYMENTS = {
  '0xaa36a7': sepoliaDeployment,
  '0x7a69':   localhostDeployment,
};

const LOCK_ABI    = LiquidityLockABI.abi;
const TOKEN_ABI   = SampleTokenABI.abi;

// ─── Color tokens ────────────────────────────────────────────────────────────
const BRONZE   = '#a0522d';   // deep bronze copper — primary action
const GREEN    = '#1a5c38';   // deep forest green — withdraw ready
const MAROON   = '#7b1d1d';   // emergency / error
const TEAL     = '#0f4c5c';   // headings / text
const SLATE    = '#64748b';   // muted text

const STATUS_COLORS = {
  lock:    { backgroundColor: '#5c3310', color: '#fff' },
  success: { backgroundColor: '#1a5c38', color: '#fff' },
  error:   { backgroundColor: MAROON,    color: '#fff' },
  default: { backgroundColor: 'rgba(255,255,255,0.5)', color: TEAL },
};

const parseError = (err) => {
  if (err.message.includes('user rejected'))       return 'Transaction rejected in MetaMask.';
  if (err.message.includes('insufficient funds'))  return 'Insufficient funds for this transaction.';
  if (err.message.includes('Already withdrawn'))   return 'These tokens have already been withdrawn.';
  if (err.message.includes('Tokens are still locked')) return 'Tokens are still locked — unlock time has not passed yet.';
  if (err.message.includes('Invalid lock index'))  return 'Invalid lock — please refresh and try again.';
  if (err.message.includes('Amount must be'))      return 'Amount must be greater than zero.';
  if (err.message.includes('Unlock time'))         return 'Unlock time must be in the future.';
  return 'Transaction failed. Please try again.';
};

function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: '16px', height: '16px',
      border: '2px solid rgba(255,255,255,0.4)',
      borderTop: '2px solid #fff',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      marginRight: '10px',
      verticalAlign: 'middle',
    }} />
  );
}

function CountdownTimer({ unlockTime, withdrawn }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [done, setDone]         = useState(false);

  useEffect(() => {
    const tick = () => {
      const now  = Math.floor(Date.now() / 1000);
      const diff = Number(unlockTime) - now;
      if (diff <= 0) { setDone(true); setTimeLeft('Unlocked'); return; }
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setTimeLeft(
        d > 0
          ? `${d}d ${h}h ${m}m ${s}s`
          : `${h}h ${m}m ${s}s`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [unlockTime]);

  if (withdrawn) return <span style={{ color: '#1a5c38', fontWeight: 700 }}>✓ Tokens have been Withdrawn</span>;
  return (
    <span style={{ color: done ? '#1a5c38' : BRONZE, fontWeight: 700 }}>
      {timeLeft}
    </span>
  );
}

function ProgressBar({ unlockTime, lockTime }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now     = Math.floor(Date.now() / 1000);
      const start   = Number(lockTime);
      const end     = Number(unlockTime);
      const elapsed = now - start;
      const total   = end - start;
      setPct(Math.min(100, Math.max(0, (elapsed / total) * 100)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [unlockTime, lockTime]);

  return (
    <div style={{ height: '8px', borderRadius: '9999px', backgroundColor: 'rgba(15,76,92,0.12)', overflow: 'hidden', marginBottom: '6px' }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        borderRadius: '9999px',
        background: pct >= 100
          ? `linear-gradient(90deg, ${GREEN}, #22c55e)`
          : `linear-gradient(90deg, ${BRONZE}, #cd7f32)`,
        transition: 'width 1s linear',
      }} />
    </div>
  );
}

function App() {
  const [lockContract,  setLockContract]  = useState(null);
  const [readLock,      setReadLock]      = useState(null);
  const [account,       setAccount]       = useState(null);
  const [chainId,       setChainId]       = useState(null);
  const [lockAddress,   setLockAddress]   = useState('');

  // stats
  const [totalLocked,   setTotalLocked]   = useState('0');
  const [lockCount,     setLockCount]     = useState(0);
  const [nextUnlock,    setNextUnlock]    = useState(null);

  // my locks
  const [myLocks,       setMyLocks]       = useState([]);

  // lock form
  const [tokenAddress,  setTokenAddress]  = useState('');
  const [lockAmount,    setLockAmount]    = useState('');
  const [unlockDate,    setUnlockDate]    = useState('');
  const [tokenSymbol,   setTokenSymbol]   = useState('');
  const [tokenName,     setTokenName]     = useState('');
  const [lockFilter,    setLockFilter]    = useState('active');

  // status
  const [status,        setStatus]        = useState('');
  const [statusStyle,   setStatusStyle]   = useState(STATUS_COLORS.default);
  const [isLoading,     setIsLoading]     = useState(false);
  const [txHash,        setTxHash]        = useState('');

  // ── load data ──────────────────────────────────────────────────────────────

  const loadDashboardData = useCallback(async (_readLock, _account) => {
    try {
      const locks = await _readLock.getLocks(_account);
      const now   = Math.floor(Date.now() / 1000);

      let total = ethers.BigNumber.from(0);
      let next  = null;

      const enriched = await Promise.all(locks.map(async (lock, index) => {
        if (!lock.withdrawn) {
          total = total.add(lock.amount);
          if (!next || Number(lock.unlockTime) < Number(next)) {
            next = lock.unlockTime.toString();
          }
        }

        // Try to get token name/symbol
        let sym  = 'TOKEN';
        let name = 'Unknown Token';
        try {
          const provider = _readLock.provider;
          const t = new ethers.Contract(lock.token, [
            'function symbol() view returns (string)',
            'function name() view returns (string)',
          ], provider);
          sym  = await t.symbol();
          name = await t.name();
        } catch (_) {}

        // Estimate lock time as (unlockTime - some duration). We don't store it on chain,
        // so we approximate with the block we have. For progress bar we use
        // (now vs unlockTime) treating lockTime as unlockTime - 1 year max or just use 0
        // We'll store a synthetic lockTime of (unlockTime - 365days) capped at 0 for display
        const syntheticStart = Math.max(0, Number(lock.unlockTime) - 365 * 24 * 3600);

        return {
          index,
          token:       lock.token,
          owner:       lock.owner,
          amount:      ethers.utils.formatUnits(lock.amount, 18),
          unlockTime:  lock.unlockTime.toString(),
          withdrawn:   lock.withdrawn,
          isUnlocked:  now >= Number(lock.unlockTime),
          symbol:      sym,
          tokenName:   name,
          lockTime:    syntheticStart,
        };
      }));

      setMyLocks(enriched);
      setTotalLocked(ethers.utils.formatUnits(total, 18));
      setLockCount(locks.filter(l => !l.withdrawn).length);
      setNextUnlock(next);
    } catch (err) {
      console.error('Error loading data:', err);
    }
  }, []);

  // ── connect wallet ─────────────────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) {
        setStatus('MetaMask not found. Please install it.');
        setStatusStyle(STATUS_COLORS.error);
        return;
      }

      const _chainId = await window.ethereum.request({ method: 'eth_chainId' });

      if (_chainId !== '0xaa36a7' && _chainId !== '0x7a69') {
        setStatus('Please switch MetaMask to Sepolia or Localhost 8545.');
        setStatusStyle(STATUS_COLORS.error);
        return;
      }

      const deployment  = DEPLOYMENTS[_chainId];
      const _lockAddress = deployment.LiquidityLock.address;

      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer   = provider.getSigner();
      const _account = await signer.getAddress();

      const isLocalhost = _chainId === '0x7a69';
      const rpc = isLocalhost
        ? new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545')
        : new ethers.providers.JsonRpcProvider(
            process.env.REACT_APP_ALCHEMY_URL,
            { name: 'sepolia', chainId: 11155111 }
          );

      const _lockContract = new ethers.Contract(_lockAddress, LOCK_ABI, signer);
      const _readLock     = new ethers.Contract(_lockAddress, LOCK_ABI, rpc);

      setLockContract(_lockContract);
      setReadLock(_readLock);
      setAccount(_account);
      setChainId(_chainId);
      setLockAddress(_lockAddress);

      await loadDashboardData(_readLock, _account);
    } catch (err) {
      setStatus('Error connecting wallet: ' + err.message);
      setStatusStyle(STATUS_COLORS.error);
    }
  }, [loadDashboardData]);

  // ── account change listener ────────────────────────────────────────────────

  useEffect(() => {
    if (!window.ethereum) return;
    const handle = async (accounts) => {
      setStatus(''); setTxHash('');
      if (accounts.length === 0) {
        setAccount(null); setLockContract(null); setReadLock(null);
        setMyLocks([]); setTotalLocked('0'); setLockCount(0); setNextUnlock(null);
      } else {
        await connectWallet();
      }
    };
    window.ethereum.on('accountsChanged', handle);
    return () => window.ethereum.removeListener('accountsChanged', handle);
  }, [connectWallet]);

  // ── token preview when address typed ──────────────────────────────────────

  useEffect(() => {
    if (!ethers.utils.isAddress(tokenAddress) || !readLock) {
      setTokenSymbol(''); setTokenName('');
      return;
    }
    (async () => {
      try {
        const t = new ethers.Contract(tokenAddress, [
          'function symbol() view returns (string)',
          'function name() view returns (string)',
        ], readLock.provider);
        setTokenSymbol(await t.symbol());
        setTokenName(await t.name());
      } catch (_) {
        setTokenSymbol('?'); setTokenName('Unknown Token');
      }
    })();
  }, [tokenAddress, readLock]);

  // ── lock tokens ───────────────────────────────────────────────────────────

  const handleLock = async () => {
    if (!ethers.utils.isAddress(tokenAddress)) {
      setStatus('Please enter a valid token address.'); setStatusStyle(STATUS_COLORS.error); return;
    }
    if (!lockAmount || Number(lockAmount) <= 0) {
      setStatus('Please enter an amount greater than zero.'); setStatusStyle(STATUS_COLORS.error); return;
    }
    if (!unlockDate) {
      setStatus('Please select an unlock date.'); setStatusStyle(STATUS_COLORS.error); return;
    }
    const unlockTimestamp = Math.floor(new Date(unlockDate).getTime() / 1000);
    if (unlockTimestamp <= Math.floor(Date.now() / 1000)) {
      setStatus('Unlock date must be in the future.'); setStatusStyle(STATUS_COLORS.error); return;
    }

    try {
      setStatus('Approving token transfer...'); setStatusStyle(STATUS_COLORS.lock); setIsLoading(true);

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer   = provider.getSigner();
      const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, signer);
      const amount = ethers.utils.parseUnits(lockAmount, 18);

      const approveTx = await tokenContract.approve(lockAddress, amount);
      await approveTx.wait();

      setStatus('Locking tokens...');
      const lockTx = await lockContract.lockTokens(tokenAddress, amount, unlockTimestamp);
      await lockTx.wait();
      await new Promise(r => setTimeout(r, 2000));

      setIsLoading(false);
      setTxHash(lockTx.hash);
      setStatus('Tokens locked successfully!');
      setStatusStyle(STATUS_COLORS.success);
      setTokenAddress(''); setLockAmount(''); setUnlockDate('');
      setTokenSymbol(''); setTokenName('');
      await loadDashboardData(readLock, account);
    } catch (err) {
      setIsLoading(false); setTxHash('');
      setStatus(parseError(err)); setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ── withdraw ──────────────────────────────────────────────────────────────

  const handleWithdraw = async (lockIndex) => {
    try {
      setStatus('Withdrawing tokens...'); setStatusStyle(STATUS_COLORS.success); setIsLoading(true);
      const tx = await lockContract.withdrawTokens(lockIndex);
      await tx.wait();
      await new Promise(r => setTimeout(r, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Tokens withdrawn successfully!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readLock, account);
    } catch (err) {
      setIsLoading(false); setTxHash('');
      setStatus(parseError(err)); setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ── refresh ───────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    if (!readLock || !account) return;
    setStatus('Refreshing...'); setStatusStyle(STATUS_COLORS.default);
    await loadDashboardData(readLock, account);
    setStatus('');
  };

  const fmt = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  const minDate = () => new Date(Date.now() + 60000).toISOString().slice(0, 16);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="shimmer-bg"></div>
      <div className="content min-h-screen p-8">
        <div className="max-w-4xl mx-auto" style={{ position: 'relative' }}>

          {/* TD LOGO */}
          <img src="/td-logo-justtd.png" alt="Tredway Development"
            style={{ position: 'absolute', top: '0', left: '-110px', height: '35px' }} />

          {/* HEADER */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-5xl font-bold tracking-tight" style={{ color: TEAL }}>
                Liquidity <span style={{ color: BRONZE }}>Lock</span> Dashboard
              </h1>
              <p className="text-sm mt-2 uppercase tracking-widest font-medium" style={{ color: SLATE }}>
                LP Token Vault — Trustless Liquidity Commitment
              </p>
            </div>
            {account && (
              <div className="text-right">
                <button onClick={handleRefresh} disabled={isLoading}
                  className="text-xs font-mono px-3 py-1 rounded-lg mb-2 transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.8)',
                    color: TEAL,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'block',
                    marginLeft: 'auto',
                  }}>
                  ↻ Refresh
                </button>
                <p className="text-xs font-mono" style={{ color: SLATE }}>Connected</p>
                <p className="text-sm font-mono font-semibold" style={{ color: TEAL }}>
                  {account.slice(0, 6)}...{account.slice(-4)}
                </p>
              </div>
            )}
          </div>
          <hr style={{ borderColor: 'rgba(15,76,92,0.2)', marginBottom: '2rem' }} />

          {/* STATUS BAR */}
          {status && (
            <div className="mb-6 p-4 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
              style={statusStyle}>
              {isLoading && <Spinner />}
              <span>{status}</span>
              {txHash && !isLoading && chainId === '0xaa36a7' && (
                <a href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: '#fff', textDecoration: 'underline', marginLeft: '8px', fontWeight: 'bold' }}>
                  View on Etherscan ↗
                </a>
              )}
            </div>
          )}

          {/* NOT CONNECTED */}
          {!account ? (
            <div className="text-center py-32">
              <div className="mb-6 text-6xl">🔒</div>
              <button onClick={connectWallet}
                className="px-8 py-4 rounded-xl font-semibold text-white text-lg transition-all hover:opacity-90 mb-6 btn-hover"
                style={{ backgroundColor: BRONZE }}>
                Connect Wallet
              </button>
              <p className="text-3xl font-bold mb-3 tracking-tight" style={{ color: TEAL }}>
                Connect your wallet to lock liquidity
              </p>
              <p className="text-sm uppercase tracking-widest" style={{ color: SLATE }}>
                Make sure you're on the Sepolia test network or Localhost 8545
              </p>
            </div>
          ) : (
            <>
              {/* STAT CARDS */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                {[
                  { label: 'Active Locks',   value: lockCount },
                  { label: 'Total Locked',   value: fmt(totalLocked) + ' Tokens' },                 
                  { label: 'Network',        value: chainId === '0xaa36a7' ? 'Sepolia' : 'Localhost' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl p-4 shadow-sm card-hover"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.55)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.8)',
                      borderLeft: `4px solid ${BRONZE}`,
                    }}>
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: SLATE }}>{stat.label}</p>
                    <p className="text-lg font-bold" style={{ color: TEAL }}>{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* LOCK TOKENS CARD */}
              <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: `4px solid ${BRONZE}`,
                }}>
                <h2 className="text-lg font-bold mb-4" style={{ color: TEAL }}>Lock Tokens</h2>

                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: SLATE }}>LP Token Address</p>
                <input type="text" placeholder="0x... LP token contract address"
                  value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-2"
                  style={{ borderColor: '#bae6fd', color: '#334155' }} />

                {tokenName && (
                  <p className="text-xs mb-3" style={{ color: GREEN, fontWeight: 600 }}>
                    ✓ {tokenName} ({tokenSymbol})
                  </p>
                )}

                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: SLATE }}>Amount</p>
                <input type="number" placeholder="e.g. 1000"
                  value={lockAmount} onChange={(e) => setLockAmount(e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-4"
                  style={{ borderColor: '#bae6fd', color: '#334155' }} />

                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: SLATE }}>Unlock Date & Time</p>
                <input type="datetime-local" min={minDate()}
                  value={unlockDate} onChange={(e) => setUnlockDate(e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-6"
                  style={{ borderColor: '#bae6fd', color: '#334155' }} />

                <button onClick={handleLock} disabled={isLoading}
                  className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover"
                  style={{
                    backgroundColor: BRONZE,
                    opacity: isLoading ? 0.6 : 1,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                  }}>
                  🔒 Lock Tokens
                </button>

                <p className="text-xs mt-3" style={{ color: SLATE }}>
                  Tokens will be held by the contract until the unlock date. No one — including the contract deployer — can access them before then.
                </p>
              </div>

              {/* MY LOCKS */}
              <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: `4px solid ${BRONZE}`,
                }}>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold" style={{ color: TEAL }}>
                    My Locks
                    {myLocks.length > 0 && (
                      <span style={{ color: SLATE, fontSize: '0.9rem', marginLeft: '8px' }}>
                        ({myLocks.length})
                      </span>
                    )}
                  </h2>
                  <div className="flex gap-2">
                    {['active', 'all'].map(f => (
                      <button key={f} onClick={() => setLockFilter(f)}
                        className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                        style={{
                          backgroundColor: lockFilter === f ? BRONZE : 'rgba(15,76,92,0.1)',
                          color: lockFilter === f ? '#fff' : TEAL,
                          border: '1px solid rgba(15,76,92,0.2)',
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {myLocks.length === 0 ? (
                  <p className="text-sm" style={{ color: SLATE }}>
                    No locks yet. Lock your first LP tokens above.
                  </p>
                ) : (
                  myLocks
                    .filter(lock => lockFilter === 'all' || !lock.withdrawn)
                    .map((lock) => {
                    const unlockDate = new Date(Number(lock.unlockTime) * 1000);
                    return (
                      <div key={lock.index} className="rounded-xl p-5 mb-4"
                        style={{
                          backgroundColor: lock.withdrawn
                            ? 'rgba(200,220,200,0.3)'
                            : 'rgba(255,255,255,0.6)',
                          border: `1px solid ${lock.withdrawn ? 'rgba(26,92,56,0.2)' : 'rgba(15,76,92,0.15)'}`,
                          opacity: lock.withdrawn ? 0.7 : 1,
                        }}>

                        {/* Lock header */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-sm font-bold" style={{ color: TEAL }}>
                              {lock.tokenName}
                              <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-mono"
                                style={{ backgroundColor: `${BRONZE}20`, color: BRONZE }}>
                                {lock.symbol}
                              </span>
                            </p>
                            <p className="text-xs font-mono mt-1" style={{ color: SLATE }}>
                              {lock.token.slice(0, 6)}...{lock.token.slice(-4)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold" style={{ color: TEAL }}>{fmt(lock.amount)}</p>
                            <p className="text-xs" style={{ color: SLATE }}>tokens locked</p>
                          </div>
                        </div>

                        <div className="text-center mb-4">
                          <p className="text-xs mb-1" style={{ color: SLATE }}>
                            Unlocks: {unlockDate.toLocaleDateString()} at {unlockDate.toLocaleTimeString()}
                          </p>
                          <p className="text-3xl font-bold">
                            <CountdownTimer unlockTime={lock.unlockTime} withdrawn={lock.withdrawn} />
                          </p>
                        </div>

                        {/* Withdraw button */}
                        {!lock.withdrawn && (
                          <button
                            onClick={() => lock.isUnlocked && handleWithdraw(lock.index)}
                            disabled={!lock.isUnlocked || isLoading}
                            className="w-full py-2 rounded-xl font-semibold text-white text-sm transition-all btn-hover"
                            style={{
                              backgroundColor: lock.isUnlocked ? GREEN : '#94a3b8',
                              cursor: lock.isUnlocked && !isLoading ? 'pointer' : 'not-allowed',
                              opacity: isLoading ? 0.6 : 1,
                            }}>
                            {lock.isUnlocked ? '✓ Withdraw Tokens' : '🔒 Locked'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;